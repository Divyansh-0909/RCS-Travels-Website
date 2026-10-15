import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from './database.js';
import {createScheduledScenario} from './scheduledScenario.js';
import {createTestClock} from './testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {cancelCustomerWithEvidenceInTransaction,requestLateDriverRecoveryInTransaction} from '../../services/customerLifecycleIncidents.js';
import {consequenceState} from './phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_AT,EXPORT_TEST_KEY} from './phase9dExportFixture.js';
import {transportProcess} from './phase9dTransportProcesses.js';
import {brokerProcess} from './phase9dBrokerProcesses.js';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
import {issueOfflineUsage} from '../../../tools/phase9d/recovery-receipt.mjs';
export async function recoveryFixture(count=3){
  const source=await createTestDatabase(),receiver=await createTestDatabase({migrations:false}),clients=[],children=[];
  const target=name=>{const u=new URL(testDatabaseUrl());u.pathname='/'+name;return u;};
  const a=new pg.Client({connectionString:target(source.name).toString()}),b=new pg.Client({connectionString:target(receiver.name).toString()});a.on('error',()=>{});b.on('error',()=>{});await a.connect();await b.connect();
  const passwords=new Map(),issuerKey=randomUUID()+randomUUID();
  const close=async()=>{for(const child of children)await child.kill();await Promise.allSettled(clients.map(client=>client.end()));await a.end();await b.end();await receiver.close();await source.close();};
  try{
    const asset=name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8'),permissions=await asset('permissions.sql');
    await a.query(permissions);await a.query(await asset('outbox.sql'));await a.query(await asset('transport-sender.sql'));
    await b.query(permissions.replace(/^CREATE ROLE .*;\r?\n/gm,''));for(const name of ['transport-receiver.sql','broker.sql','broker-recovery.sql'])await b.query(await asset(name));
    await b.query('CREATE EXTENSION plpgsql_check');
    for(const [client,name]of [[a,source.name],[b,receiver.name]])await client.query('REVOKE TEMPORARY ON DATABASE "'+name+'" FROM PUBLIC');
    for(const role of ['shadow9d_exporter','shadow9d_capture','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler']){
      const password=randomUUID();passwords.set(role,password);await a.query((await a.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
    }
    const uri=(name,role)=>{const u=target(name);u.username=role;u.password=passwords.get(role);return u.toString();};
    const connect=async(role='broker9d_exec')=>{const client=new pg.Client({connectionString:uri(receiver.name,role)});client.on('error',()=>{});await client.connect();clients.push(client);return client;};
    const exec=await connect(),guard=await connect('broker9d_guard'),ops=await connect('broker9d_ops'),reconciler=await connect('broker9d_reconciler');
    const serviceId=randomUUID(),requestKey='synthetic-recovery-request-key-at-least-thirty-two',receiptKey='synthetic-recovery-receipt-key-at-least-thirty-two';
    await a.query('INSERT INTO outbox9d.transport_configuration(service_id,receipt_key) VALUES($1,$2)',[serviceId,receiptKey]);
    await b.query('INSERT INTO transport9d.configuration(service_id,receipt_key) VALUES($1,$2)',[serviceId,receiptKey]);
    await a.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
    for(const owner of [a,b])await owner.query('UPDATE shadow9d.control SET stopped=false,now_at=$1',[EXPORT_TEST_AT]);
    await b.query('INSERT INTO broker9d.usage_authority VALUES($1,$2)',['offline-issuer-v1',issuerKey]);
    const scenario=createScheduledScenario({now:EXPORT_TEST_AT});await scenario.persist(source.client);const clock=createTestClock(EXPORT_TEST_AT);
    let incidents=0;
    for(let i=0;i<count;i++){
      const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'RECOVERY-'+randomUUID(),...(i%4===3?{expectedPickupAt:new Date(Date.parse(EXPORT_TEST_AT)-601000)}:{})};await source.client.booking.create({data:booking});
      if(i%4===2)assert.equal(await source.client.$transaction(tx=>cancelCustomerWithEvidenceInTransaction(tx,{booking:{...booking,driver:scenario.driversByGroup.rcs},cancellationCharge:0,cancellationReason:'synthetic'},{clock})),true);
      else if(i%4===3)assert.equal(await source.client.$transaction(tx=>requestLateDriverRecoveryInTransaction(tx,{...booking,driver:scenario.driversByGroup.rcs},{clock})),true);
      else{
        await source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,scenario.driversByGroup.rcs,{reason:'rider_unreachable'},{clock}));
        if(i===0){const current=await source.client.booking.findUnique({where:{id:booking.id}});assert.equal(await source.client.$transaction(tx=>cancelCustomerWithEvidenceInTransaction(tx,{booking:current,cancellationCharge:0,cancellationReason:'synthetic'},{clock})),true);incidents++;}
      }
      incidents++;
    }
    const baseline=await consequenceState(source.client);
    const service=await transportProcess({mode:'receiver',connectionString:uri(receiver.name,'shadow9d_capture'),requestKey});children.push(service);
    for(let i=0;i<incidents;i++){
      const sender=await transportProcess({mode:'sender',connectionString:uri(source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint:`http://127.0.0.1:${service.result.port}/v1/shadow/deliveries`});children.push(sender);assert.equal(sender.result.status,'ACKED');await sender.exited;
    }
    const payloads=(await a.query('SELECT d.payload,r.receipt FROM outbox9d.deliveries d JOIN outbox9d.remote_receipts r ON r.delivery_id=d.id ORDER BY d.id')).rows;
    const message=i=>({protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:payloads[i].receipt.body.receipt,payload:payloads[i].payload});
    const register=(i=0,client=exec)=>brokerCall(client,'register',[JSON.stringify(message(i))]);
    const row=async(id)=>(await b.query('SELECT to_jsonb(a) attempt,to_jsonb(q) request FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id WHERE a.id=$1',[id])).rows[0];
    const receipt=async(id,usage={outcome:'BILLED_FAILURE',input:128,output:32,minor:2},receiptId=randomUUID(),changes={})=>{
      const {attempt,request}=await row(id);return issueOfflineUsage({receiptId,requestId:request.id,attemptId:attempt.id,dispatchId:attempt.dispatch_id,configurationHash:request.configuration_hash,generation:String(attempt.generation),responseHash:attempt.response_hash,...changes},usage,issuerKey);
    };
    const reset=async()=>{await b.query('TRUNCATE broker9d.usage_receipts,broker9d.operations,broker9d.results,broker9d.events,broker9d.attempts,broker9d.requests');await b.query('UPDATE broker9d.control SET stopped=false,generation=generation+1,now_at=$1',[EXPORT_TEST_AT]);for(const payload of payloads)await b.query("UPDATE shadow9d.work SET snapshot=$1,status='PENDING' WHERE id=$2",[payload.payload.snapshot,payload.receipt.body.workId]);};
    const run=async(config)=>{const child=await brokerProcess({...config,connectionString:uri(receiver.name,config.mode==='guard'?'broker9d_guard':'broker9d_exec')});children.push(child);return child;};
    return {source,receiver,a,b,exec,guard,ops,reconciler,connect,uri,message,register,row,receipt,reset,run,close,baseline,payloads,
      unchanged:async()=>assert.deepEqual(await consequenceState(source.client),baseline),
      advance:seconds=>b.query('UPDATE broker9d.control SET now_at=now_at+make_interval(secs=>$1)',[seconds]),
      control:async(action)=>{const c=(await b.query('SELECT generation FROM broker9d.control')).rows[0];return brokerCall(ops,'operate',[randomUUID(),null,action,c.generation,action==='STOP'?'OPERATOR_STOP':'OPERATOR_RESUME']);}};
  }catch(error){await close();throw error;}
}
