import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {validateClosureFrame} from '../../../tools/phase9d/closure-contract.mjs';
import {closureIngress} from '../../../tools/phase9d/closure-ingress.mjs';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_AT,EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {custodyStatus} from '../../../tools/phase9d/closure-status.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
test('committed source lineage and actual outbox/receiver transitions reach independent custody',async t=>{
  const f=await custodyLineageFixture();let transport,server;const keys=new Map([[f.keyId,f.keys.privateKey]]),receipts=[];
  const witness={schema:'custody-closure-lineage-witness-v1',groups:[]};
  try{
    await t.test('fresh real cancellation commits before deferred source observation',async()=>{
      const scenario=createScheduledScenario({now:EXPORT_TEST_AT}),driver=await f.source.client.driver.findFirst({where:{group:'rcs'}}),existing=await f.source.client.booking.findFirst();
      const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'CLOSURE-'+randomUUID(),userId:existing.userId,driverId:driver.id,vehicleNumber:driver.vehicleNumber,vehicleModel:driver.vehicleModel};
      await f.source.client.booking.create({data:booking});
      await f.source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,driver,{reason:'rider_unreachable'},{clock:createTestClock(EXPORT_TEST_AT)}));
      witness.financialBefore=await consequenceState(f.source.client);
      assert.ok((await f.a.query('SELECT custody_lineage.capture_committed() captured')).rows[0].captured>=3);
      const source=f.streams[0],expected=(await source.inspector.query('SELECT custody_lineage.expected_sources() expected')).rows[0].expected;
      const events=(await source.inspector.query("SELECT event FROM custody_lineage.events WHERE event->>'action'='SOURCE_LINEAGE'")).rows.map(r=>r.event);
      assert.equal(events.length,expected.length);for(const row of expected)assert.ok(events.some(e=>e.identityHash===row.identityHash&&e.evidenceHash===row.evidenceHash&&e.evidenceVersion===row.evidenceVersion));
      assert.ok(events.every(e=>/^[a-f0-9]{64}$/.test(e.ownerHash)));witness.groups.push('committed-source-lineage');
    });
    await t.test('protected real export and transport persist new receiver work and receipt',async()=>{
      const requestKey='synthetic-recovery-request-key-at-least-thirty-two';
      transport=await transportProcess({mode:'receiver',connectionString:f.uri(f.receiver.name,'shadow9d_capture'),requestKey});
      const sender=await transportProcess({mode:'sender',connectionString:f.uri(f.source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint:`http://127.0.0.1:${transport.result.port}/v1/shadow/deliveries`});
      assert.equal(sender.result.status,'ACKED');await sender.exited;
      const last=(await f.a.query('SELECT payload FROM outbox9d.deliveries ORDER BY id DESC LIMIT 1')).rows[0].payload,conflict={...last,originalCommitment:'f'.repeat(64)};
      await assert.rejects(sendShadowDelivery(`http://127.0.0.1:${transport.result.port}/v1/shadow/deliveries`,requestKey,conflict));
      assert.equal((await f.b.query("SELECT count(*)::int n FROM audit9d.events WHERE action='TRANSPORT_BINDING_REJECTED'")).rows[0].n,1);
      const rejection=(await f.b.query("SELECT encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') hash FROM audit9d.events e WHERE action='TRANSPORT_BINDING_REJECTED'")).rows[0].hash;
      assert.equal((await f.b.query("SELECT count(*)::int n FROM custody_lineage.events WHERE event->>'sourceHash'=$1",[rejection])).rows[0].n,1);
      const capture=new (await import('pg')).Client({connectionString:f.uri(f.receiver.name,'shadow9d_capture')});await capture.connect();
      try{await assert.rejects(capture.query('SELECT transport9d.receive_committed($1)',[conflict]),{code:'42501'});}finally{await capture.end();}
      const actions=[];for(const stream of f.streams)actions.push(...(await stream.inspector.query('SELECT event FROM custody_lineage.events ORDER BY seq')).rows.map(r=>r.event.action));
      for(const action of ['SOURCE_LINEAGE','OUTBOX_CREATED','OUTBOX_CHANGED','WORK_ADMITTED','RECEIPT_ACCEPTED','LOCAL_AUDIT'])assert.ok(actions.includes(action),action);
      witness.groups.push('actual-outbox-transport-receiver');
    });
    await t.test('offline analyst, authenticated usage and independent guard retain advisory authority',async()=>{
      const row=(await f.a.query('SELECT d.payload,r.receipt FROM outbox9d.deliveries d JOIN outbox9d.remote_receipts r ON r.delivery_id=d.id ORDER BY d.id DESC LIMIT 1')).rows[0];
      const requestId=await brokerCall(f.exec,'register',[JSON.stringify({protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:row.receipt.body.receipt,payload:row.payload})]);assert.ok(requestId);
      const execution=await f.run({mode:'execute',requestId,fixture:'valid'});assert.equal(execution.result.status,'RESPONSE_OBSERVED');assert.equal(execution.result.calls,1);await execution.exited;
      const work=execution.result;assert.equal(await brokerCall(f.reconciler,'reconcile',[JSON.stringify(await f.receipt(work.id,{outcome:'SUCCESS',input:128,output:32,minor:2}))]),'ACCEPTED');
      const guard=await f.run({mode:'guard',id:work.id,token:work.token});assert.equal(guard.result.status,'GUARDED_RESULT_COMMITTED');assert.equal(guard.result.route,'NEEDS_ADMIN_REVIEW');await guard.exited;
      assert.equal((await f.control('STOP')).status,'APPLIED');const revision=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[requestId])).rows[0].revision;
      assert.equal((await brokerCall(f.ops,'operate',[randomUUID(),requestId,'CLEAN',revision,'RETENTION_MINIMIZATION'])).status,'APPLIED');
      assert.equal((await f.b.query('SELECT payload FROM broker9d.requests WHERE id=$1',[requestId])).rows[0].payload,null);
      witness.accounting=await brokerCall(f.ops,'accounting',[]);witness.groups.push('offline-broker-guard-usage-stop-cleanup');
    });
    await t.test('independent ingress verifies sealed multi-source frames and commits public receipts',async()=>{
      const publicSources=new Map([...f.sources].map(([id,s])=>[id,{id,service:s.service}]));
      server=closureIngress(f.ingest,{sources:publicSources,ingressKey:f.ingressKey,signer:body=>durableReceipt(f.signer,body,keys)});
      await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const endpoint=`http://127.0.0.1:${server.address().port}/v1/shadow/deliveries`;
      for(const stream of [...f.streams.map(s=>({...s,schema:'custody_lineage',lineage:true})),{sender:f.sender,inspector:f.sourceInspector,verifier:f.verifier,schema:'custody_export',lineage:false}]){
        const rows=(await stream.inspector.query('SELECT seq,event,hash FROM '+stream.schema+'.events ORDER BY seq')).rows;let previous='0'.repeat(64);
        for(const row of rows){
          assert.equal(row.event.previous,previous);assert.equal(row.hash,commitment(row.event));previous=row.hash;
          const frame=(await stream.sender.query('SELECT '+stream.schema+'.frame($1) frame',[row.seq])).rows[0].frame;validateClosureFrame(frame,f.sources);
          const receipt=await sendShadowDelivery(endpoint,f.ingressKey,frame);historicalVerification(receipt,frame.event,await f.registry());
          assert.equal((await stream.verifier.query('SELECT '+stream.schema+'.ack($1,$2,$3) accepted',[row.seq,row.hash,receipt])).rows[0].accepted,true);
          assert.equal((await custodyStatus(stream.inspector,f.inspector,row.seq,await f.registry(),{lineage:stream.lineage})).remotelyVerified,true);
          receipts.push({event:frame.event,receipt});
        }
      }
      witness.groups.push('independent-lineage-custody');
    });
    await t.test('capture forgery and history changes are denied to actual senders',async()=>{
      for(const stream of f.streams)for(const statement of ["SELECT custody_lineage.emit('SOURCE_LINEAGE','fake',NULL,'{}','application_transaction')",'SELECT secret FROM custody_lineage.control','UPDATE custody_lineage.events SET hash=repeat(\'0\',64)','DELETE FROM custody_lineage.events','TRUNCATE custody_lineage.events'])await assert.rejects(stream.sender.query(statement),{code:'42501'});
      assert.deepEqual(await consequenceState(f.source.client),witness.financialBefore);witness.groups.push('producer-and-financial-isolation');
    });
    await t.test('independent committed-row comparison detects omission without inventing a missing business event',async()=>{
      for(const stream of f.streams){
        assert.equal((await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state.status,'CONSISTENCY_SNAPSHOT_REQUIRED');
        await stream.inspector.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try{assert.equal((await stream.inspector.query('SELECT custody_lineage.capture_status() state')).rows[0].state.status,'CAPTURE_CONSISTENT');}
        finally{await stream.inspector.query('ROLLBACK');}
        const before=(await stream.inspector.query('SELECT count(*)::int n FROM custody_lineage.events')).rows[0].n;
        await stream.owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        try{
          await stream.owner.query('DELETE FROM custody_lineage.events WHERE seq=(SELECT min(seq) FROM custody_lineage.events)');
          assert.equal((await stream.owner.query('SELECT custody_lineage.capture_status() state')).rows[0].state.status,'CAPTURE_GAP');
        }finally{await stream.owner.query('ROLLBACK');}
        assert.equal((await stream.inspector.query('SELECT count(*)::int n FROM custody_lineage.events')).rows[0].n,before);
      }
    });
    assert.deepEqual(witness.groups,['committed-source-lineage','actual-outbox-transport-receiver','offline-broker-guard-usage-stop-cleanup','independent-lineage-custody','producer-and-financial-isolation']);
    witness.receipts=receipts;witness.verificationKeys=(await f.inspector.query('SELECT key_id,public_key,status,epoch FROM custody.keys ORDER BY epoch')).rows;
    witness.sourceHeads=[];for(const stream of f.streams)witness.sourceHeads.push((await stream.inspector.query('SELECT source::text,seq::text,head,deferred FROM custody_lineage.control')).rows[0]);
    witness.remoteEvents=(await f.inspector.query('SELECT source::text,seq::text,event,hash,key_id,receipt::text FROM custody.events ORDER BY custody_seq')).rows;
    witness.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,'lineage-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{
    if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
    await transport?.close();await f.close();
  }
});
