import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPairSync,randomUUID,createHash} from 'node:crypto';
import {custodyReplayFixture} from '../helpers/phase9dCustodyReplayFixture.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {brokerProcess} from '../helpers/phase9dBrokerProcesses.js';
import {EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
import {issueOfflineUsage} from '../../../tools/phase9d/recovery-receipt.mjs';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
import {closureIngress} from '../../../tools/phase9d/closure-ingress.mjs';
import {durableReceipt,historicalVerification} from '../../../tools/phase9d/closure-keys.mjs';
import {custodyStatus,sourceCaptureStatus} from '../../../tools/phase9d/closure-status.mjs';
import {commitment,keyIdentity,sourceMac} from '../../../tools/phase9d/custody-protocol.mjs';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
import {appendDenialObservations,minimizeServerDenials} from '../../../tools/phase9d/closure-observer.mjs';
const exec=promisify(execFile),hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
test('saved custody inputs reconstruct committed lineage, rotation, sender death and denial delivery',async()=>{
  const inputBytes=await readFile(process.env.CUSTODY_REPLAY_INPUT,'utf8'),recipe=JSON.parse(inputBytes),f=await custodyReplayFixture(recipe),processes=[];
  const timeline=[],receipts=[],keys=new Map([[f.keyId,f.keys.privateKey]]);let transport,server,lost=false;
  const sourceMap=new Map([...f.sources].map(([id,s])=>[id,{id,service:s.service}]));
  const connect=async(role)=>{const {Client}=await import('pg');const client=new Client({connectionString:f.uri(f.receiver.name,role)});await client.connect();processes.push({close:()=>client.end()});return client;};
  const deliver=async(frame)=>sendShadowDelivery(`http://127.0.0.1:${server.address().port}/v1/shadow/deliveries`,f.ingressKey,frame);
  try{
    const initial=await consequenceState(f.source.client);
    await f.source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,f.scenario.bookingStates.current,f.scenario.driversByGroup.rcs,{reason:'rider_unreachable'},{clock:createTestClock(recipe.at)}));
    const committed=await consequenceState(f.source.client);timeline.push('commit-incident');
    assert.equal((await f.a.query('SELECT custody_lineage.capture_committed() captured')).rows[0].captured,1);timeline.push('scan-committed-lineage');
    transport=await transportProcess({mode:'receiver',connectionString:f.uri(f.receiver.name,'shadow9d_capture'),requestKey:'synthetic-custody-replay-request-key-at-least-32'});
    const sent=await transportProcess({mode:'sender',connectionString:f.uri(f.source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey:'synthetic-custody-replay-request-key-at-least-32',endpoint:`http://127.0.0.1:${transport.result.port}/v1/shadow/deliveries`});
    await sent.exited;assert.equal(sent.result.status,'ACKED');timeline.push('outbox-transport');
    const delivery=(await f.a.query('SELECT d.payload,r.receipt FROM outbox9d.deliveries d JOIN outbox9d.remote_receipts r ON r.delivery_id=d.id')).rows[0];
    const broker=await connect('broker9d_exec'),ops=await connect('broker9d_ops'),reconciler=await connect('broker9d_reconciler');
    const requestId=await brokerCall(broker,'register',[JSON.stringify({protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:delivery.receipt.body.receipt,payload:delivery.payload})]);
    const worker=await brokerProcess({mode:'execute',connectionString:f.uri(f.receiver.name,'broker9d_exec'),requestId,fixture:recipe.provider.fixture});processes.push(worker);await worker.exited;
    assert.equal(worker.result.calls,1);assert.equal(worker.result.status,'RESPONSE_OBSERVED');timeline.push('offline-broker');
    const attempt=(await f.b.query('SELECT * FROM broker9d.attempts WHERE id=$1',[worker.result.id])).rows[0],request=(await f.b.query('SELECT * FROM broker9d.requests WHERE id=$1',[requestId])).rows[0];
    const usage=issueOfflineUsage({receiptId:recipe.journalIds[0],requestId,attemptId:attempt.id,dispatchId:attempt.dispatch_id,configurationHash:request.configuration_hash,generation:String(attempt.generation),responseHash:attempt.response_hash},{outcome:'SUCCESS',input:recipe.provider.input,output:recipe.provider.output,minor:recipe.provider.minor},'synthetic-custody-replay-usage-issuer-key');
    assert.equal(await brokerCall(reconciler,'reconcile',[JSON.stringify(usage)]),'ACCEPTED');
    const guard=await brokerProcess({mode:'guard',connectionString:f.uri(f.receiver.name,'broker9d_guard'),id:attempt.id,token:attempt.token});processes.push(guard);await guard.exited;
    assert.equal(guard.result.route,'NEEDS_ADMIN_REVIEW');timeline.push('guard-and-usage');
    server=closureIngress(f.ingest,{sources:sourceMap,ingressKey:f.ingressKey,signer:body=>durableReceipt(f.signer,body,keys)},()=>lost?'lost-ack':null);
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    const first=(await f.frame(1)),firstReceipt=await deliver(first);
    assert.equal((await f.verifier.query('SELECT custody_export.ack(1,$1,$2) ok',[commitment(first.event),firstReceipt])).rows[0].ok,true);receipts.push({event:first.event,receipt:firstReceipt});timeline.push('deliver-first');
    const epoch2=generateKeyPairSync('ed25519'),id2=keyIdentity(epoch2.publicKey),pem=epoch2.publicKey.export({type:'spki',format:'pem'});keys.set(id2,epoch2.privateKey);
    assert.equal((await f.audit.query('SELECT custody.rotate($1,$2,1) ok',[id2,pem])).rows[0].ok,true);
    await f.b.query("UPDATE custody_export.keys SET status='RETIRED'");await f.b.query("INSERT INTO custody_export.keys VALUES($1,$2,2,'ACTIVE')",[id2,pem]);timeline.push('rotate-key');
    const launch=async pause=>{
      const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
      const child=fork(new URL('../helpers/phase9dCustodyReplaySender.mjs',import.meta.url),[],{env,execArgv:[],stdio:['ignore','ignore','ignore','ipc']});
      const exited=new Promise(ok=>child.once('exit',ok));
      const result=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('REPLAY_SENDER_DEADLINE'));},10000);child.once('message',value=>{clearTimeout(timer);ok(value);});child.once('error',fail);child.once('exit',()=>{clearTimeout(timer);fail(Error('REPLAY_SENDER_EXITED'));});child.send({uri:f.sandboxUri('custody_sender'),endpoint:`http://127.0.0.1:${server.address().port}/v1/shadow/deliveries`,ingressKey:f.ingressKey,pause});});
      return {child,result,exited};
    };
    lost=true;const interrupted=await launch(true);assert.equal(interrupted.result.status,'PENDING');
    assert.equal((await custodyStatus(f.sourceInspector,f.inspector,2,await f.registry())).status,'COMMITTED_ACKNOWLEDGEMENT_MISSING');timeline.push('remote-commit-lost-ack');
    interrupted.child.kill('SIGKILL');await interrupted.exited;timeline.push('kill-sender');
    lost=false;const replacement=await launch(false);assert.equal(replacement.result.status,'RECEIVED');await replacement.exited;
    const second=replacement.result;
    assert.equal((await f.verifier.query('SELECT custody_export.ack(2,$1,$2) ok',[commitment(second.frame.event),second.receipt])).rows[0].ok,true);
    assert.equal((await custodyStatus(f.sourceInspector,f.inspector,2,await f.registry())).remotelyVerified,true);receipts.push({event:second.frame.event,receipt:second.receipt});timeline.push('replace-and-reconcile');
    const forged={...second.receipt,signature:'A'.repeat(86)+'=='};
    const registry=await f.registry();assert.throws(()=>historicalVerification(forged,second.frame.event,registry));
    assert.equal((await f.verifier.query('SELECT custody_export.ack(2,$1,$2) ok',[commitment(second.frame.event),forged])).rows[0].ok,false);
    const conflicting={...second.frame.event,actor:'broker9d_ops'};
    await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[{event:conflicting,mac:sourceMac(conflicting,f.sourceKey)}]),{code:'23514'});timeline.push('forged-and-conflicting-ack');
    const pid=(await f.sender.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await assert.rejects(f.sender.query('SELECT secret FROM custody_export.control'),{code:'42501'});timeline.push('server-permission-denial');
    assert.match(process.env.CUSTODY_SOURCE_CONTAINER,/^[a-f0-9]{64}$/);
    const {stdout}=await exec('docker',['exec',process.env.CUSTODY_SOURCE_CONTAINER,'cat','/tmp/custody-logs/custody.json'],{maxBuffer:1048576});
    const selected=stdout.split('\n').filter(line=>{if(!line)return false;const row=JSON.parse(line);return row.pid===pid&&row.state_code==='42501';}).join('\n');
    const observations=minimizeServerDenials(selected,{serverIdentity:hash(process.env.CUSTODY_SOURCE_CONTAINER),roles:['custody_sender'],correlations:[{pid,role:'custody_sender',sqlstate:'42501',denialClass:'SIGNING_SECRET'}]});assert.equal(observations.length,1);
    const observer=randomUUID(),observerKey=randomUUID()+randomUUID();await f.audit.query('INSERT INTO custody.sources(source,verification_secret,service) VALUES($1,$2,$3)',[observer,observerKey,'denial-observer-v2']);sourceMap.set(observer,{id:observer,service:'denial-observer-v2'});
    const denial=appendDenialObservations({frames:[]},observations,{source:observer,key:observerKey}).frames[0],denialReceipt=await deliver(denial);historicalVerification(denialReceipt,denial.event,await f.registry());receipts.push({event:denial.event,receipt:denialReceipt});timeline.push('independent-denial-delivery');
    const generation=(await f.b.query('SELECT generation FROM broker9d.control')).rows[0].generation;
    assert.equal((await brokerCall(ops,'operate',[randomUUID(),null,'STOP',generation,'OPERATOR_STOP'])).status,'APPLIED');timeline.push('stop');
    const revision=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[requestId])).rows[0].revision;
    assert.equal((await brokerCall(ops,'operate',[randomUUID(),requestId,'CLEAN',revision,'RETENTION_MINIMIZATION'])).status,'APPLIED');timeline.push('terminal-cleanup');
    const streams=[...f.streams.map(s=>({...s,schema:'custody_lineage',lineage:true})),{sender:f.sender,verifier:f.verifier,inspector:f.sourceInspector,schema:'custody_export',lineage:false}];
    const canonical=[];
    for(const stream of streams){
      const rows=(await stream.inspector.query('SELECT seq,event,hash FROM '+stream.schema+'.events ORDER BY seq')).rows;let previous='0'.repeat(64);
      for(const row of rows){
        assert.equal(row.event.previous,previous);assert.equal(row.hash,commitment(row.event));previous=row.hash;
        const frame=(await stream.sender.query('SELECT '+stream.schema+'.frame($1) frame',[row.seq])).rows[0].frame,receipt=await deliver(frame);
        historicalVerification(receipt,frame.event,await f.registry());
        assert.equal((await stream.verifier.query('SELECT '+stream.schema+'.ack($1,$2,$3) ok',[row.seq,row.hash,receipt])).rows[0].ok,true);
        assert.equal((await custodyStatus(stream.inspector,f.inspector,row.seq,await f.registry(),{lineage:stream.lineage})).remotelyVerified,true);
        if(row.event.service==='broker-receiver-v1'){
          assert.ok(row.event.request===null||row.event.request===requestId);assert.ok(row.event.attempt===null||row.event.attempt===attempt.id);
          assert.ok(row.event.receipt===null||row.event.receipt===delivery.receipt.body.receipt);
        }
        canonical.push({service:row.event.service,sequence:row.event.sequence,action:row.event.action,actor:row.event.actor,generation:row.event.generation,evidenceVersion:row.event.evidenceVersion,evidenceHash:row.event.evidenceHash,configuration:row.event.configuration,observed:row.event.observed,ownerBound:row.event.ownerHash!==null&&row.event.ownerHash!==undefined,requestBound:row.event.request!==null,attemptBound:row.event.attempt!==null,transportReceiptBound:row.event.receipt!==null,epoch:receipt.body.keyId===f.keyId?1:2,previousSequence:Number(row.seq)-1});
        if(!receipts.some(r=>r.receipt.body.receipt===receipt.body.receipt))receipts.push({event:row.event,receipt});
      }
    }
    assert.equal((await sourceCaptureStatus(f.sourceInspector)).status,'CAPTURE_CONSISTENT');
    assert.deepEqual(await consequenceState(f.source.client),committed);timeline.push('reconcile-retained-commitments');assert.deepEqual(timeline,recipe.chronology);
    const accounting=await brokerCall(ops,'accounting',[]),journal=(await f.b.query('SELECT id,action,actor,at FROM broker9d.events ORDER BY id')).rows;
    for(const {event}of receipts.filter(r=>r.event.service==='broker-receiver-v1')){
      const original=(await f.b.query('SELECT to_jsonb(e) row FROM broker9d.events e WHERE id=$1',[event.localId])).rows[0].row;
      // PostgreSQL JSON timestamp serialization is part of the accepted source hash.
      const sourceHash=(await f.b.query("SELECT encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') hash FROM broker9d.events e WHERE id=$1",[event.localId])).rows[0].hash;
      assert.equal(event.sourceHash,sourceHash);assert.ok(original);
    }
    const outcome={timeline,initial,committed,final:await consequenceState(f.source.client),canonical,journal,accounting,fakeProviderCalls:worker.result.calls,guardRoute:guard.result.route,denialClasses:observations.map(o=>({sqlstate:o.sqlstate,denialClass:o.denialClass,actorTrust:o.actorTrust})),operativeConsequences:0};
    await writeFile(join(process.env.CUSTODY_OUTPUT,'custody-replay-outcome-'+recipe.id+'-'+randomUUID()+'.json'),JSON.stringify({schema:'custody-reconstruction-v1',inputSha256:hash(inputBytes),outcome,outcomeSha256:hash(outcome),receipts,keys:(await f.inspector.query('SELECT key_id,epoch,public_key,status FROM custody.keys ORDER BY epoch')).rows,status:'PASS'},null,2),{flag:'wx'});
  }finally{
    if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}await transport?.close();
    await Promise.allSettled(processes.map(p=>p.close?.()??p.kill()));await f.close();
  }
});
