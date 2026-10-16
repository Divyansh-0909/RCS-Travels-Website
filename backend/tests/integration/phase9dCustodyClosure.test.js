import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {custodyClosureFixture} from '../helpers/phase9dCustodyClosureFixture.js';
import {keyIdentity,commitment,sourceMac} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {custodyStatus,sourceCaptureStatus} from '../../../tools/phase9d/closure-status.mjs';
import {verifyAndAcknowledge} from '../../../tools/phase9d/custody-delivery.mjs';
import {appendDenialObservations} from '../../../tools/phase9d/closure-observer.mjs';
test('isolated custody epochs and independently detected compromised verifier',async t=>{
  const f=await custodyClosureFixture();let first,second;const pairs=new Map([[f.keyId,f.keys.privateKey]]);
  const accept=async event=>(await f.ingest.query('SELECT custody.ingest($1) receipt',[{event,mac:sourceMac(event,f.sourceKey)}])).rows[0].receipt;
  try{
    await t.test('source journal consistency and compromised-verifier false ACK are independently visible',async()=>{
      assert.ok(await f.register(0));const frame=await f.frame(1);assert.equal((await sourceCaptureStatus(f.sourceInspector)).status,'CAPTURE_CONSISTENT');
      const fake={body:{schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:frame.event.source,sequence:'1',hash:commitment(frame.event),custodySequence:'1',receipt:randomUUID(),keyId:f.keyId,outcome:'COMMITTED'},signature:'A'.repeat(86)+'=='};
      assert.equal((await f.verifier.query('SELECT custody_export.ack(1,$1,$2) accepted',[commitment(frame.event),fake])).rows[0].accepted,true);
      assert.equal((await custodyStatus(f.sourceInspector,f.inspector,1,await f.registry())).status,'FALSE_ACKNOWLEDGEMENT');
      await f.unchanged();
      // Explicit trusted-fixture remediation of injected corruption; no automatic repair route.
      assert.equal((await f.b.query("UPDATE custody_export.events SET status='PENDING',receipt=NULL WHERE seq=1 AND receipt=$1",[fake])).rowCount,1);
      const body=await accept(frame.event);first=await durableReceipt(f.signer,body,pairs);
      assert.equal(await verifyAndAcknowledge(f.verifier,first,frame.event,(await f.registry()).keys),true);
      assert.equal((await custodyStatus(f.sourceInspector,f.inspector,1,await f.registry())).remotelyVerified,true);
    });
    await t.test('rotation preserves old durable signature and rejects arbitrary new key selection',async()=>{
      const key=generateKeyPairSync('ed25519'),id=keyIdentity(key.publicKey),pem=key.publicKey.export({type:'spki',format:'pem'});pairs.set(id,key.privateKey);
      const before=(await f.inspector.query('SELECT key_id,public_key,epoch,status FROM custody.keys ORDER BY epoch')).rows;
      assert.equal((await f.audit.query('SELECT custody.rotate($1,$2,1) rotated',[id,f.publicKey])).rows[0].rotated,false);
      assert.deepEqual((await f.inspector.query('SELECT key_id,public_key,epoch,status FROM custody.keys ORDER BY epoch')).rows,before);
      assert.equal((await f.audit.query('SELECT custody.rotate($1,$2,1) rotated',[id,pem])).rows[0].rotated,true);
      const oldEvent=(await f.frame(1)).event,duplicateBody=await accept(oldEvent);
      assert.equal(duplicateBody.keyId,f.keyId);assert.deepEqual(await durableReceipt(f.signer,duplicateBody,new Map([[id,key.privateKey]])),first);
      assert.equal(historicalVerification(first,oldEvent,await f.registry()).signerStatus,'RETIRED');
      await f.control('STOP');const next=(await f.frame(2)).event;
      for(const invalid of [f.keyId,'f'.repeat(64)])await assert.rejects(f.ingest.query('SELECT custody.accept($1,$2,$3)',[next,commitment(next),invalid]),{code:'42501'});
      const body=await accept(next);assert.equal(body.keyId,id);await assert.rejects(durableReceipt(f.signer,body,new Map()),/SIGNER_EPOCH_UNAVAILABLE/);
      second=await durableReceipt(f.signer,body,pairs);
      // A new remote epoch is not accepted by the source until its independent trusted registry is updated.
      assert.equal(await verifyAndAcknowledge(f.verifier,second,next,(await f.registry()).keys),false);
      assert.equal((await custodyStatus(f.sourceInspector,f.inspector,2,await f.registry())).status,'COMMITTED_ACKNOWLEDGEMENT_MISSING');
      await f.b.query("UPDATE custody_export.keys SET status='RETIRED' WHERE status='ACTIVE'");await f.b.query("INSERT INTO custody_export.keys VALUES($1,$2,2,'ACTIVE')",[id,pem]);
      assert.equal(await verifyAndAcknowledge(f.verifier,second,next,(await f.registry()).keys),true);
    });
    await t.test('signer connection replacement reuses historical receipts without retired private keys',async()=>{
      await f.signer.end();const replacement=await f.connect('custody_signer');
      const event=(await f.frame(1)).event,body=await accept(event,second.body.keyId);
      assert.deepEqual(await durableReceipt(replacement,body,new Map()),first);
      const event2=(await f.frame(2)).event;assert.deepEqual(await durableReceipt(replacement,await accept(event2,second.body.keyId),new Map()),second);
    });
    await t.test('compromised historical signer is distinct from cryptographically valid signature',async()=>{
      await f.audit.query("UPDATE custody.keys SET status='COMPROMISED' WHERE key_id=$1",[f.keyId]);
      await f.b.query("UPDATE custody_export.keys SET status='COMPROMISED' WHERE key_id=$1",[f.keyId]);
      const result=historicalVerification(first,(await f.frame(1)).event,await f.registry());assert.equal(result.signatureValid,true);assert.equal(result.currentlyTrusted,false);
      assert.equal((await custodyStatus(f.sourceInspector,f.inspector,1,await f.registry())).status,'SIGNER_COMPROMISED');
      assert.equal((await f.verifier.query('SELECT custody_export.ack(1,$1,$2) accepted',[first.body.hash,first])).rows[0].accepted,false);
    });
    await t.test('key material and signature history deny unrelated principals',async()=>{
      const before=(await f.inspector.query('SELECT to_jsonb(e) FROM custody.events e ORDER BY custody_seq')).rows;
      for(const client of [f.ingest,f.inspector])for(const statement of ['UPDATE custody.keys SET status=\'ACTIVE\'','DELETE FROM custody.signatures','TRUNCATE custody.events','SET ROLE custody_owner'])await assert.rejects(client.query(statement),{code:'42501'});
      for(const statement of ['UPDATE custody_export.keys SET status=\'ACTIVE\'','UPDATE custody_export.limits SET max_unacknowledged=9999','SELECT secret FROM custody_export.control'])await assert.rejects(f.verifier.query(statement),{code:'42501'});
      for(const client of [f.ingest,f.inspector])await assert.rejects(client.query('SELECT verification_secret FROM custody.sources'),{code:'42501'});
      assert.deepEqual((await f.inspector.query('SELECT to_jsonb(e) FROM custody.events e ORDER BY custody_seq')).rows,before);await f.unchanged();
    });
    await t.test('compromised ingress credential cannot forge or rebind a signed source event',async()=>{
      const e=(await f.frame(2)).event,before=(await f.inspector.query('SELECT source,seq,head FROM custody.sources')).rows;
      await assert.rejects(f.ingest.query('SELECT custody.accept($1,$2,$3)',[e,commitment(e),second.body.keyId]),{code:'42501'});
      for(const frame of [{event:e,mac:'0'.repeat(64)},{event:e},{event:e,mac:sourceMac(e,f.sourceKey),extra:true},null])await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[frame]),{code:'23514'});
      for(const change of [{service:'source-lineage-v2'},{frozen:'0'.repeat(64)},{extra:true},{actor:'owner'},{sequence:'0'},{observed:'2026-02-30T00:00:00.000Z'},{observed:'2026-10-15T24:00:00.000Z'},{receipt:{private:'excluded'}},{source:randomUUID()}]){
        const event={...e,...change};await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[{event,mac:sourceMac(event,f.sourceKey)}]),{code:'23514'});
      }
      assert.deepEqual((await f.inspector.query('SELECT source,seq,head FROM custody.sources')).rows,before);
    });
    await t.test('closed denial protocol survives independent SQL admission and rejects altered classifications',async()=>{
      const source=randomUUID(),key=randomUUID()+randomUUID();
      await f.audit.query('INSERT INTO custody.sources(source,verification_secret,service) VALUES($1,$2,$3)',[source,key,'denial-observer-v2']);
      const metadata={serverIdentity:'a'.repeat(64),authenticatedRole:'custody_sender',actorTrust:'AUTHENTICATED',sqlstate:'42501',logSessionHash:'b'.repeat(64),logLine:'1',denialClass:'SIGNING_SECRET',observed:'2026-10-15T12:00:00.000Z'};
      const frame=appendDenialObservations({frames:[]},[metadata],{source,key}).frames[0];
      for(const change of [{actorTrust:'CLAIMED_UNAUTHENTICATED'},{sqlstate:'00000'},{denialClass:'UNKNOWN'},{ownerHash:'f'.repeat(64)},{authenticatedRole:'private@person'},{logLine:'0'},{serverIdentity:null}]){
        const event={...frame.event,...change};await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[{event,mac:sourceMac(event,key)}]),{code:'23514'});
      }
      const body=(await f.ingest.query('SELECT custody.ingest($1) receipt',[frame])).rows[0].receipt;
      const signer=await f.connect('custody_signer'),receipt=await durableReceipt(signer,body,pairs);
      assert.equal(historicalVerification(receipt,frame.event,await f.registry()).currentlyTrusted,true);
      assert.deepEqual((await f.ingest.query('SELECT custody.ingest($1) receipt',[frame])).rows[0].receipt,body);
    });
    await t.test('unacknowledged saturation rejects actual broker admission while STOP remains legal',async()=>{
      await f.control('RESUME');await f.b.query('UPDATE custody_export.limits SET max_unacknowledged=1');
      await assert.rejects(f.register(1),{code:'54000'});
      // The first request predates pressure; it cannot start analysis either.
      const q=(await f.b.query('SELECT id FROM broker9d.requests ORDER BY id LIMIT 1')).rows[0].id;
      await assert.rejects(f.exec.query('SELECT broker9d.reserve($1)',[q]),{code:'54000'});
      assert.ok(await f.control('STOP'));assert.equal((await f.b.query('SELECT stopped FROM broker9d.control')).rows[0].stopped,true);
      assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.attempts')).rows[0].n,0);
      assert.equal((await sourceCaptureStatus(f.sourceInspector)).status,'CAPTURE_CONSISTENT');await f.unchanged();
    });
  }finally{await f.close();}
});
