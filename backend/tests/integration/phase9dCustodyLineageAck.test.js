import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {commitment,keyIdentity} from '../../../tools/phase9d/custody-protocol.mjs';
import {custodyStatus} from '../../../tools/phase9d/closure-status.mjs';
import {rotateCustodyKey} from '../../../tools/phase9d/closure-rotation.mjs';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const acknowledge=async(stream,row,receipt,n=row.seq,h=row.hash)=>(await stream.verifier.query('SELECT custody_lineage.ack($1,$2,$3) accepted',[n,h,receipt===undefined?null:JSON.stringify(receipt)])).rows[0].accepted;
const current=async(stream,n)=>(await stream.inspector.query('SELECT seq,event,hash,status,attempts,receipt FROM custody_lineage.events WHERE seq=$1',[n])).rows[0];
const inspect=async(f,data)=>custodyStatus(data.stream.inspector,f.inspector,data.row.seq,f.registryValue,{lineage:true});
function invalidReceipts(receipt){
  const rows=[['unexpected-root-field',{...receipt,extra:'synthetic-untrusted'}],['missing-body',{signature:receipt.signature}],['missing-signature',{body:receipt.body}],['SQL-null',undefined],['JSON-null',null],['root-array',[]],['root-string','untrusted']];
  for(const value of [null,0,false,[],{}])rows.push(['signature-type-'+JSON.stringify(value),{...receipt,signature:value}]);
  for(const value of [null,0,false,[]])rows.push(['body-type-'+JSON.stringify(value),{...receipt,body:value}]);
  rows.push(['unexpected-body-field',{...receipt,body:{...receipt.body,extra:'untrusted'}}]);
  for(const key of Object.keys(receipt.body)){
    const missing=structuredClone(receipt);delete missing.body[key];rows.push(['missing-'+key,missing]);
    for(const value of [null,7,false,{},[]])rows.push(['type-'+key+'-'+JSON.stringify(value),{...receipt,body:{...receipt.body,[key]:value}}]);
  }
  for(const [key,value]of [['schema','invented'],['custodian','foreign'],['outcome','REJECTED'],['source',randomUUID()],['sequence',String(Number(receipt.body.sequence)+1)],['hash','f'.repeat(64)],['keyId','unknown'],['receipt','not-a-uuid'],['custodySequence','0'],['custodySequence','01'],['custodySequence','1'.repeat(16)],['custodySequence','-1']])rows.push(['value-'+key+'-'+value,{...receipt,body:{...receipt.body,[key]:value}}]);
  rows.push(['signature-shape',{...receipt,signature:'invalid'}]);return rows;
}
test('lineage ACK enforces the existing receipt contract and preserves independent trust',async t=>{
  const f=await custodyLineageFixture(),pairs=new Map([[f.keyId,f.keys.privateKey]]),datasets=[];
  const witness={schema:'phase9d-icr1-lineage-ack-v1',groups:[],completedGroups:[],installations:[],publicProofs:[],liveProviderCalls:0,authorityChanges:0};
  const check=async(name,fn)=>t.test(name,async()=>{await fn();witness.completedGroups.push(name);});
  const business=hash(JSON.stringify(await consequenceState(f.source.client)));f.registryValue=await f.registry();
  const sealed=async(stream,row)=>(await stream.sender.query('SELECT custody_lineage.frame($1) frame',[row.seq])).rows[0].frame;
  const receive=async(stream,row)=>{const frame=await sealed(stream,row);assert.equal(commitment(frame.event),row.hash);const body=(await f.ingest.query('SELECT custody.ingest($1) body',[frame])).rows[0].body;return durableReceipt(f.signer,body,pairs);};
  const emit=async stream=>{await stream.owner.query("SELECT custody_lineage.emit('LOCAL_AUDIT',$1,NULL,$2,'trusted_observer')",['icr1-'+randomUUID(),{id:randomUUID(),action:'SYNTHETIC_ACK_FIXTURE'}]);return (await stream.inspector.query('SELECT seq,event,hash FROM custody_lineage.events ORDER BY seq DESC LIMIT 1')).rows[0];};
  try{
    for(const stream of f.streams){
      const absent=await emit(stream),rows=(await stream.inspector.query('SELECT seq,event,hash FROM custody_lineage.events WHERE seq<$1 ORDER BY seq',[absent.seq])).rows;assert.ok(rows.length);
      const receipts=[];for(const row of rows)receipts.push(await receive(stream,row));
      const data={stream,row:rows[0],receipt:receipts[0],absent};datasets.push(data);
      const record={service:stream.service,denials:[],source:stream.id};witness.installations.push(record);
      await check(stream.service+' uses actual restricted verifier and unchanged catalog authority',async()=>{
        const identity=(await stream.verifier.query('SELECT session_user actor,current_user effective,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=session_user')).rows[0];
        assert.equal(identity.actor,'custody_lineage_verifier');assert.equal(identity.effective,identity.actor);for(const field of ['rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolbypassrls'])assert.equal(identity[field],false);
        const catalog=(await stream.inspector.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl::text acl,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid='custody_lineage.ack(bigint,text,jsonb)'::regprocedure")).rows[0];
        assert.equal(catalog.owner,'shadow9d_owner');assert.equal(catalog.prosecdef,true);assert.ok(catalog.proconfig.includes('search_path=pg_catalog, custody_lineage, pg_temp'));
        assert.equal((await stream.verifier.query("SELECT has_table_privilege(current_user,'custody_lineage.events','UPDATE') writable")).rows[0].writable,false);
        assert.equal((await stream.inspector.query("SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='custody_lineage.ack(bigint,text,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') public_execute")).rows[0].public_execute,false);
        await assert.rejects(stream.sender.query('SELECT custody_lineage.ack($1,$2,$3)',[data.row.seq,data.row.hash,data.receipt]),{code:'42501'});
        record.identity=identity;record.catalog={...catalog,definitionSha256:hash(catalog.definition)};
      });
      await check(stream.service+' rejects closed-shape, missing, type and identity violations without writes',async()=>{
        const before=await current(stream,data.row.seq);
        for(const [label,invalid]of invalidReceipts(data.receipt)){assert.equal(await acknowledge(stream,data.row,invalid),false,label);record.denials.push(label);}
        for(const [label,n,h]of [['wrong-row',String(Number(data.row.seq)+100000),data.row.hash],['wrong-argument-hash',data.row.seq,'e'.repeat(64)],['null-row',null,data.row.hash],['null-hash',data.row.seq,null]]){assert.equal(await acknowledge(stream,data.row,data.receipt,n,h),false,label);record.denials.push(label);}
        assert.deepEqual(await current(stream,data.row.seq),before);
      });
      await check(stream.service+' accepts signed receipt and exact duplicates with stable identity',async()=>{
        assert.equal(historicalVerification(data.receipt,data.row.event,f.registryValue).currentlyTrusted,true);
        assert.equal(await acknowledge(stream,data.row,data.receipt),true);const before=await current(stream,data.row.seq);
        assert.equal(await acknowledge(stream,data.row,structuredClone(data.receipt)),true);assert.deepEqual(await current(stream,data.row.seq),before);
        assert.equal((await inspect(f,data)).status,'INDEPENDENTLY_VERIFIED');
        for(const [key,value]of [['keyId','f'.repeat(64)],['receipt',randomUUID()],['custodySequence',String(Number(data.receipt.body.custodySequence)+1)]])assert.equal(await acknowledge(stream,data.row,{...data.receipt,body:{...data.receipt.body,[key]:value}}),false,key+' immutable');
        assert.deepEqual(await current(stream,data.row.seq),before);witness.publicProofs.push({event:data.row.event,receipt:data.receipt});
      });
      await check(stream.service+' detects an authorized but false local ACK without independent commit',async()=>{
        const fake={body:{...data.receipt.body,sequence:String(absent.seq),hash:absent.hash,custodySequence:'999999',receipt:randomUUID()},signature:'A'.repeat(86)+'=='};
        assert.equal((await f.inspector.query('SELECT count(*)::int n FROM custody.events WHERE source=$1 AND seq=$2',[stream.id,absent.seq])).rows[0].n,0);
        // This is an explicit compromised-verifier simulation, not a signature verifier.
        assert.equal(await acknowledge(stream,absent,fake),true);
        const status=await custodyStatus(stream.inspector,f.inspector,absent.seq,f.registryValue,{lineage:true});assert.equal(status.status,'FALSE_ACKNOWLEDGEMENT');assert.equal(status.remotelyVerified,false);
        record.falseAcknowledgement={status,remoteRows:0,localReceipt:fake};data.falseReceipt=fake;
      });
      witness.groups.push(stream.service);
    }
    const rotated=generateKeyPairSync('ed25519'),next=keyIdentity(rotated.publicKey),publicKey=rotated.publicKey.export({type:'spki',format:'pem'});pairs.set(next,rotated.privateKey);
    await check('retired historical key receipts retain their original signature and duplicate identity',async()=>{
      await rotateCustodyKey(f.audit,{keyId:next,publicKey,expectedEpoch:1});f.registryValue=await f.registry();
      for(const data of datasets){
        const receipt=await receive(data.stream,data.row);assert.deepEqual(receipt,data.receipt);
        const verification=historicalVerification(receipt,data.row.event,f.registryValue);assert.equal(verification.signerStatus,'RETIRED');assert.equal(verification.currentlyTrusted,true);assert.equal(verification.currentlyIssuing,false);
        assert.equal(await acknowledge(data.stream,data.row,receipt),true);assert.equal((await inspect(f,data)).status,'INDEPENDENTLY_VERIFIED');
      }
    });
    await check('new signing-key identities are verified independently and cannot overwrite false accepted history',async()=>{
      for(const data of datasets){
        const real=await receive(data.stream,data.absent);assert.equal(real.body.keyId,next);assert.equal(historicalVerification(real,data.absent.event,f.registryValue).currentlyIssuing,true);
        assert.equal(await acknowledge(data.stream,data.absent,real),false);assert.equal((await current(data.stream,data.absent.seq)).receipt.body.receipt,data.falseReceipt.body.receipt);
        assert.equal((await custodyStatus(data.stream.inspector,f.inspector,data.absent.seq,f.registryValue,{lineage:true})).status,'FALSE_ACKNOWLEDGEMENT');
        const row=await emit(data.stream),receipt=await receive(data.stream,row);assert.equal(receipt.body.keyId,next);assert.equal(await acknowledge(data.stream,row,receipt),true);
        assert.equal((await custodyStatus(data.stream.inspector,f.inspector,row.seq,f.registryValue,{lineage:true})).status,'INDEPENDENTLY_VERIFIED');
        data.newRow=row;data.newReceipt=receipt;
      }
    });
    await check('compromised historical signer remains cryptographically valid but independently untrusted',async()=>{
      await f.audit.query("UPDATE custody.keys SET status='COMPROMISED' WHERE key_id=$1",[f.keyId]);f.registryValue=await f.registry();
      for(const data of datasets){
        const verification=historicalVerification(data.receipt,data.row.event,f.registryValue);assert.equal(verification.signatureValid,true);assert.equal(verification.currentlyTrusted,false);
        assert.equal(await acknowledge(data.stream,data.row,data.receipt),true);
        const status=await inspect(f,data);assert.equal(status.status,'SIGNER_COMPROMISED');assert.equal(status.remotelyVerified,false);
        assert.equal((await custodyStatus(data.stream.inspector,f.inspector,data.newRow.seq,f.registryValue,{lineage:true})).status,'INDEPENDENTLY_VERIFIED');
      }
    });
    await check('ACK leaves application finance, final authority and privilege grants unchanged',async()=>{
      assert.equal(hash(JSON.stringify(await consequenceState(f.source.client))),business);await f.unchanged();
      assert.equal(witness.installations[0].catalog.definitionSha256,witness.installations[1].catalog.definitionSha256);
      for(const {stream}of datasets)assert.equal((await stream.verifier.query("SELECT has_table_privilege(current_user,'custody_lineage.events','UPDATE') writable")).rows[0].writable,false);
    });
    assert.equal(witness.completedGroups.length,12,'Every assertion group must complete before selecting witness');
    witness.sqlSourceSha256=hash(await readFile(new URL('../../../tools/phase9d/closure-lineage.sql',import.meta.url)));witness.businessSnapshotSha256=business;
    witness.verificationKeys=(await f.inspector.query('SELECT key_id,public_key,epoch,status FROM custody.keys ORDER BY epoch')).rows;
    witness.status='PASS';witness.limitations=['SQL validates shape, scalar types, keyId syntax and immutable event/accepted-receipt identity; it has no trusted key registry or signature verification.','The authorized verifier remains a trust root; a well-shaped false ACK can suppress local delivery, but is not independently verified.','No new repair, key-propagation or result-promotion policy.'];
    await writeFile(join(process.env.CUSTODY_OUTPUT,'icr1-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{await f.close();}
});
