import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import http from 'node:http';
import pg from 'pg';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {p4Catalog,p4Native} from '../helpers/phase9dP4Profile.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_AT,EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
import {deriveShadowExport} from '../../../tools/phase9d/export-projection.mjs';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
import {transportMac} from '../../../tools/phase9d/transport-protocol.mjs';
const copy=value=>structuredClone(value);
const scalar=async(client,sql,args=[])=>(await client.query(sql,args)).rows[0].value;
test('P4 actual closure transport and source receipt acceptance',async t=>{
  const f=await custodyLineageFixture(),clients=[],children=[],profiling=process.env.CUSTODY_SQL_MODE==='p4-profile';let baseline,work,payload,receipt,endpoint;
  const witness={schema:'phase9d-p4-transport-acceptance-v1',profiling,groups:[],cases:[],installations:[],routineReplacementOperations:0,analystCalls:0,liveCalls:0};
  const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();if(baseline)assert.deepEqual(await consequenceState(f.source.client),baseline);witness.groups.push(name);}catch(error){failure=error;throw error;}});if(failure)throw failure;};
  const connect=async(db,role)=>{const c=new pg.Client({connectionString:f.uri(db,role),connectionTimeoutMillis:3000,statement_timeout:5000});c.on('error',()=>{});await c.connect();clients.push(c);return c;};
  const queue=async()=>({source:(await f.a.query('SELECT to_jsonb(d) row FROM outbox9d.deliveries d ORDER BY id')).rows,receipts:(await f.a.query('SELECT to_jsonb(r) row FROM outbox9d.remote_receipts r ORDER BY delivery_id')).rows,receiver:(await f.b.query('SELECT to_jsonb(w) row FROM shadow9d.work w ORDER BY id')).rows,remote:(await f.b.query('SELECT to_jsonb(r) row FROM transport9d.receipts r ORDER BY logical_key')).rows});
  const local=async()=>({queue:await queue(),audit:(await f.a.query('SELECT to_jsonb(e) row FROM audit9d.events e ORDER BY id')).rows,lineage:(await f.a.query('SELECT to_jsonb(e) row FROM custody_lineage.events e ORDER BY seq')).rows});
  try{
    const exporter=await connect(f.source.name,'shadow9d_exporter'),capture=await connect(f.receiver.name,'shadow9d_capture');
    const password=randomUUID();await f.a.query((await f.a.query("SELECT format('ALTER ROLE shadow9d_ops PASSWORD %L',$1::text) sql",[password])).rows[0].sql);
    const opsUri=new URL(f.uri(f.source.name,'shadow9d_exporter'));opsUri.username='shadow9d_ops';opsUri.password=password;
    const ops=new pg.Client({connectionString:opsUri.toString()});await ops.connect();clients.push(ops);
    for(const [name,client]of [['source',f.a],['receiver',f.b]]){
      await client.query('CREATE EXTENSION IF NOT EXISTS plpgsql_check');assert.equal(await scalar(client,"SELECT current_setting('plpgsql_check.profiler') value"),profiling?'on':'off');
      witness.installations.push({name,catalogBefore:await p4Catalog(client,name),runtime:(await client.query("SELECT current_setting('server_version') version,(SELECT extversion FROM pg_extension WHERE extname='plpgsql_check') profiler_version")).rows[0]});
    }
    const brokerBefore=(await f.b.query('SELECT to_jsonb(c) row FROM broker9d.control c')).rows;
    witness.accountingBefore=await scalar(f.b,'SELECT broker9d.accounting() value');
    await check('restricted identities, closure wrapper and private alias catalogs',async()=>{
      assert.equal(await scalar(exporter,'SELECT session_user value'),'shadow9d_exporter');assert.equal(await scalar(capture,'SELECT session_user value'),'shadow9d_capture');
      for(const sql of ['SELECT transport9d.receive_committed(null)','SELECT shadow9d.enqueue(null,null,null,null)','UPDATE transport9d.configuration SET service_id=gen_random_uuid()','DELETE FROM transport9d.receipts'])await assert.rejects(capture.query(sql),{code:'42501'});
      for(const sql of ['SELECT outbox9d.deliver(1,gen_random_uuid())','SELECT * FROM outbox9d.transport_configuration','SELECT outbox9d.valid_remote_receipt(null,null)','SELECT * FROM public.bookings'])await assert.rejects(exporter.query(sql),{code:'42501'});
      for(const install of witness.installations)for(const r of install.catalogBefore){assert.equal(r.owner,'shadow9d_owner');assert.ok(r.proconfig[0].startsWith('search_path=pg_catalog, '));assert.equal(r.prosecdef,r.signature!=='transport9d.serialize(jsonb)');}
      witness.wrapperAccess=(await f.b.query("SELECT has_function_privilege('shadow9d_capture','transport9d.receive(jsonb)','EXECUTE') wrapper,has_function_privilege('shadow9d_capture','transport9d.receive_committed(jsonb)','EXECUTE') private")).rows[0];assert.deepEqual(witness.wrapperAccess,{wrapper:true,private:false});
    });
    await check('fresh real committed cancellation and exact protected source staging',async()=>{
      const scenario=createScheduledScenario({now:EXPORT_TEST_AT}),driver=await f.source.client.driver.findFirst({where:{group:'rcs'}}),existing=await f.source.client.booking.findFirst();
      const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'P4-'+randomUUID(),userId:existing.userId,driverId:driver.id,vehicleNumber:driver.vehicleNumber,vehicleModel:driver.vehicleModel};
      await f.source.client.booking.create({data:booking});await f.source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,driver,{reason:'rider_unreachable'},{clock:createTestClock(EXPORT_TEST_AT)}));baseline=await consequenceState(f.source.client);
      await f.a.query('SELECT custody_lineage.capture_committed()');
      for(const c of [f.a,f.b])if(profiling)await c.query('SELECT plpgsql_profiler_reset_all()');
      assert.ok(await scalar(exporter,'SELECT outbox9d.scan() value'));work=await scalar(exporter,'SELECT outbox9d.claim() value');assert.ok(work);payload=deriveShadowExport(work.source,EXPORT_TEST_KEY);
      for(const [name,mutate]of [['source-key',p=>p.key='a'.repeat(64)],['owner',p=>p.lineage.actorId='b'.repeat(64)],['event',p=>p.lineage.sourceEvent='c'.repeat(64)],['source-work',p=>p.lineage.sourceWorkId='d'.repeat(64)],['evidence-version',p=>p.lineage.evidenceVersion='other'],['original-commitment',p=>p.originalCommitment='e'.repeat(64)],['snapshot',p=>p.snapshot.caseId='f'.repeat(64)],['configuration',p=>p.config='other']]){
        const changed=copy(payload);mutate(changed);const before=await local();assert.equal(await scalar(exporter,'SELECT outbox9d.stage($1,$2,$3) value',[work.id,work.token,changed]),false,name);assert.deepEqual(await local(),before);witness.cases.push('stage:'+name);
      }
      assert.equal(await scalar(exporter,'SELECT outbox9d.stage($1,$2,$3) value',[work.id,work.token,payload]),true);assert.deepEqual(await scalar(exporter,'SELECT outbox9d.remote_payload($1,$2) value',[work.id,work.token]),payload);
      const changed=copy(payload);changed.originalCommitment='d'.repeat(64);assert.equal(await scalar(exporter,'SELECT outbox9d.stage($1,$2,$3) value',[work.id,work.token,changed]),false);
    });
    await check('native canonical serializer handles object array scalar and null',async()=>{
      for(const [v,expected]of [[{z:[1,true,null],a:{}},'{"a":{},"z":[1,true,null]}'],[[], '[]'],[{},'{}'],['value','"value"'],[null,'null']])assert.equal(await scalar(f.b,'SELECT transport9d.serialize($1::jsonb) value',[JSON.stringify(v)]),expected);
      assert.equal(await scalar(f.b,'SELECT transport9d.serialize(NULL::jsonb) value'),null);
    });
    const receive=p=>scalar(capture,'SELECT transport9d.receive($1::jsonb) value',[p===undefined?null:JSON.stringify(p)]);
    await check('receiver scalar malformed closed contract hash and privacy rejections',async()=>{
      for(const invalid of [undefined,null,[],true,1,'text',{}, {...payload,extra:true},{...payload,schema:'other'},{...payload,projection:'other'},{...payload,collector:'other'},{...payload,config:'other'},{...payload,frozenV5:'0'.repeat(64)},{...payload,key:'bad'},{...payload,evidenceHash:'0'.repeat(64)},{...payload,lineage:{...payload.lineage,extra:true}},{...payload,lineage:{...payload.lineage,evidenceVersion:'other'}},{...payload,lineage:{...payload.lineage,caseId:'a'.repeat(64)}},{...payload,snapshot:{...payload.snapshot,caseType:'FAILED_PICKUP'}},{...payload,padding:'x'.repeat(65536)}]){
        const before=await queue();assert.equal(await receive(invalid),null);assert.deepEqual(await queue(),before);
      }
      const privatePayload=copy(payload);privatePayload.snapshot.timeline[0].value={phone:'synthetic-private'};assert.equal(await receive(privatePayload),null);
      witness.cases.push('receiver:selected-invalid-contracts-and-private-value');
    });
    await check('missing receiver configuration stopped admission and capacity preserve work',async()=>{
      const cfg=(await f.b.query('SELECT * FROM transport9d.configuration')).rows[0];await f.b.query('DELETE FROM transport9d.configuration');try{assert.equal(await receive(payload),null);}finally{await f.b.query('INSERT INTO transport9d.configuration(service_id,receipt_key) VALUES($1,$2)',[cfg.service_id,cfg.receipt_key]);}
      const control=(await f.b.query('SELECT * FROM shadow9d.control')).rows[0];
      try{await f.b.query('UPDATE shadow9d.control SET stopped=true');assert.equal(await receive(payload),null);await f.b.query('UPDATE shadow9d.control SET stopped=false,queue_limit=1');assert.equal(await receive(payload),null);}
      finally{await f.b.query('UPDATE shadow9d.control SET stopped=$1,queue_limit=$2',[control.stopped,control.queue_limit]);}
    });
    const requestKey='synthetic-recovery-request-key-at-least-thirty-two';
    await check('actual HTTP authentication malformed and oversized bodies reject before SQL',async()=>{
      const service=await transportProcess({mode:'receiver',connectionString:f.uri(f.receiver.name,'shadow9d_capture'),requestKey});children.push(service);endpoint=`http://127.0.0.1:${service.result.port}/v1/shadow/deliveries`;
      const raw=async bytes=>new Promise((ok,fail)=>{const req=http.request(endpoint,{method:'POST',headers:{'content-type':'application/json','content-length':bytes.length,'x-shadow-mac':transportMac(bytes,requestKey)},agent:false},res=>{res.resume();res.once('end',()=>ok(res.statusCode));});req.on('error',fail);req.setTimeout(4000,()=>req.destroy(Error('P4_HTTP_DEADLINE')));req.end(bytes);});
      const before=await queue();await assert.rejects(sendShadowDelivery(endpoint,'wrong-request-key-at-least-thirty-two',payload));assert.equal(await raw(Buffer.from('{"schema":')),400);assert.equal(await raw(Buffer.alloc(65537,32)),413);assert.deepEqual(await queue(),before);
    });
    await check('authenticated original admission exact duplicate and conflict audit binding',async()=>{
      const before=await queue();receipt=await sendShadowDelivery(endpoint,requestKey,payload);assert.equal((await queue()).receiver.length,before.receiver.length+1);
      const duplicate=await sendShadowDelivery(endpoint,requestKey,payload);assert.deepEqual(duplicate,receipt);const q=await queue();
      const conflict={...payload,originalCommitment:'f'.repeat(64)};await assert.rejects(sendShadowDelivery(endpoint,requestKey,conflict));assert.deepEqual(await queue(),q);
      const audit=(await f.b.query("SELECT e.id,encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') hash FROM audit9d.events e WHERE action='TRANSPORT_BINDING_REJECTED' ORDER BY id DESC LIMIT 1")).rows[0];assert.ok(audit);assert.equal(await scalar(f.b,"SELECT count(*)::int value FROM custody_lineage.events WHERE event->>'sourceHash'=$1",[audit.hash]),1);
      witness.accepted={payload,receipt,sourceWork:work.source.workId};
    });
    const valid=r=>scalar(f.a,'SELECT outbox9d.valid_remote_receipt($1,$2) value',[payload,JSON.stringify(r)]);
    const signed=async body=>({body,mac:await scalar(f.a,"SELECT encode(outbox9d.hmac($1::jsonb::text,receipt_key,'sha256'),'hex') value FROM outbox9d.transport_configuration",[body])});
    await check('SQL receipt expression independent closed fields binding and boundary cases',async()=>{
      assert.equal(await valid(receipt),true);
      for(const invalid of [null,{}, {...receipt,extra:true},{body:receipt.body},{mac:receipt.mac},{...receipt,mac:'0'.repeat(64)}])assert.equal(await valid(invalid),false);
      for(const field of Object.keys(receipt.body)){const body=copy(receipt.body);delete body[field];assert.equal(await valid(await signed(body)),false,'missing:'+field);assert.equal(await valid(await signed({...receipt.body,[field]:null})),false,'null:'+field);}
      for(const [field,value]of [['workId',{}],['workId',[]],['workId',true],['schema',1],['status',false],['service',{}],['receipt',[]]])assert.equal(await valid(await signed({...receipt.body,[field]:value})),false,'type:'+field);
      assert.equal(await scalar(f.a,'SELECT outbox9d.valid_remote_receipt($1,NULL::jsonb) value',[payload]),false);
      for(const [field,value]of [['schema','other'],['service',randomUUID()],['key','a'.repeat(64)],['payloadBinding','b'.repeat(64)],['receipt','not-a-uuid'],['workId','0'],['workId','-1'],['workId','1.5'],['workId','1'.repeat(20)],['status','REJECTED'],['extra',true]])assert.equal(await valid(await signed({...receipt.body,[field]:value})),false,field+':'+value);
      for(const status of ['PENDING','PROCESSING','RETRYABLE','COMPLETED','MANUAL_REVIEW'])assert.equal(await valid(await signed({...receipt.body,status})),true,status);
      for(const id of ['1','9'.repeat(19)])assert.equal(await valid(await signed({...receipt.body,workId:id})),true);
      // #>> is a text extraction contract, not a JSON scalar-type guard.
      const numeric=await signed({...receipt.body,workId:1});assert.equal(await valid(numeric),true);witness.receiptExpressionLimit='Authenticated numeric workId 1 is accepted by existing text extraction; no JSON string-only or bigint-range rule is claimed.';
    });
    const ack=(token,r=receipt)=>scalar(exporter,'SELECT outbox9d.remote_ack($1,$2,$3) value',[work.id,token,r]);
    await check('invalid acknowledgements and missing delivery preserve local persisted state',async()=>{
      for(const [token,r]of [[randomUUID(),receipt],[null,receipt],[work.token,{...receipt,extra:true}],[work.token,{...receipt,body:{...receipt.body,receipt:randomUUID()}}]]){const before=await local();assert.equal(await ack(token,r),false);assert.deepEqual(await local(),before);}
      assert.equal(await scalar(exporter,'SELECT outbox9d.remote_ack($1,$2,$3) value',['9223372036854775807',work.token,receipt]),false);
    });
    await check('source lease epoch owner stop and original journal changes deny acknowledgement',async()=>{
      const original=(await f.a.query('SELECT * FROM outbox9d.deliveries WHERE id=$1',[work.id])).rows[0];
      for(const [name,sql,args]of [['owner','UPDATE outbox9d.deliveries SET lease_owner=$2 WHERE id=$1',[work.id,'shadow9d_capture']],['epoch','UPDATE outbox9d.deliveries SET epoch=epoch+1 WHERE id=$1',[work.id]],['expiry',"UPDATE outbox9d.deliveries SET lease_until='2000-01-01' WHERE id=$1",[work.id]],['payload','UPDATE outbox9d.deliveries SET payload=NULL WHERE id=$1',[work.id]]]){
        await f.a.query(sql,args);try{const before=await local();assert.equal(await ack(work.token),false,name);assert.deepEqual(await local(),before);}finally{await f.a.query('UPDATE outbox9d.deliveries SET lease_owner=$2,epoch=$3,lease_until=$4,payload=$5 WHERE id=$1',[work.id,original.lease_owner,original.epoch,original.lease_until,original.payload]);}witness.cases.push('lease:'+name);
      }
      await f.a.query('UPDATE shadow9d.control SET stopped=true');try{assert.equal(await ack(work.token),false);}finally{await f.a.query('UPDATE shadow9d.control SET stopped=false');}
      const old=await scalar(f.a,'SELECT policy_version value FROM public.responsibility_adjudication_work WHERE id=$1',[work.source_work_id]);await f.a.query("UPDATE public.responsibility_adjudication_work SET policy_version='synthetic-corrupt' WHERE id=$1",[work.source_work_id]);
      try{const before=await local();assert.equal(await ack(work.token),false);assert.deepEqual(await local(),before);}finally{await f.a.query('UPDATE public.responsibility_adjudication_work SET policy_version=$2 WHERE id=$1',[work.source_work_id,old]);}
    });
    await check('fresh sender reclaims lost local acknowledgement and original remote receipt',async()=>{
      const before=await queue();await f.a.query("UPDATE shadow9d.control SET now_at=now_at+interval '121 seconds'");
      const sender=await transportProcess({mode:'sender',connectionString:f.uri(f.source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint});children.push(sender);assert.equal(sender.result.status,'ACKED');assert.equal((await sender.exited).code,0);
      const after=await queue();assert.deepEqual(after.receiver,before.receiver);assert.deepEqual(after.remote,before.remote);const row=(await f.a.query('SELECT * FROM outbox9d.deliveries WHERE id=$1',[work.id])).rows[0];assert.equal(row.status,'ACKED');assert.equal(row.attempts,2);assert.notEqual(row.token,work.token);assert.deepEqual(await scalar(f.a,'SELECT receipt value FROM outbox9d.remote_receipts WHERE delivery_id=$1',[work.id]),receipt);
      const snapshot=await local();assert.equal(await ack(work.token),false);assert.deepEqual(await local(),snapshot);
    });
    const cleanup=(id,r)=>scalar(ops,'SELECT outbox9d.remote_delete_payload($1,$2) value',[id,r]);
    await check('terminal cleanup requires original signed receipt relationship and retains tombstones',async()=>{
      assert.equal(await cleanup(work.id,receipt),false);assert.equal(await cleanup('9223372036854775807',receipt),false);
      await f.b.query("UPDATE shadow9d.work SET status='COMPLETED' WHERE id=$1",[receipt.body.workId]);const terminal=await sendShadowDelivery(endpoint,requestKey,payload);
      assert.equal(terminal.body.receipt,receipt.body.receipt);assert.equal(terminal.body.status,'COMPLETED');
      const foreign=await signed({...terminal.body,receipt:randomUUID()});const before=await local();assert.equal(await cleanup(work.id,foreign),false);assert.deepEqual(await local(),before);
      assert.equal(await cleanup(work.id,terminal),true);assert.equal(await cleanup(work.id,terminal),false);assert.equal(await scalar(f.a,'SELECT payload value FROM outbox9d.deliveries WHERE id=$1',[work.id]),null);
      await f.b.query('SELECT shadow9d.delete_payload($1)',[receipt.body.workId]);await f.b.query('UPDATE shadow9d.control SET stopped=true');const q=await queue();assert.deepEqual(await sendShadowDelivery(endpoint,requestKey,payload),terminal);assert.deepEqual(await queue(),q);
      witness.terminalReceipt=terminal;
    });
    await check('definition ACL restoration and independent accounting preservation',async()=>{
      assert.deepEqual((await f.b.query('SELECT to_jsonb(c) row FROM broker9d.control c')).rows,brokerBefore);
      for(const install of witness.installations){const c=install.name==='source'?f.a:f.b;install.catalogAfter=await p4Catalog(c,install.name);assert.deepEqual(install.catalogAfter,install.catalogBefore);if(profiling)install.native=await p4Native(c,install.catalogBefore);}
      witness.accountingAfter=await scalar(f.b,'SELECT broker9d.accounting() value');assert.deepEqual(witness.accountingAfter,witness.accountingBefore);
      witness.finalQueue=await queue();assert.deepEqual(await consequenceState(f.source.client),baseline);
    });
    witness.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,(profiling?'p4-native-witness-':'p4-witness-')+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{await Promise.allSettled(children.map(c=>c.close()));await Promise.allSettled(clients.map(c=>c.end()));await f.close();}
});
