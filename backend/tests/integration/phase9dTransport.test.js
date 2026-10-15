import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from '../helpers/database.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_AT,EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
import {transportMac,TRANSPORT_PATH} from '../../../tools/phase9d/transport-protocol.mjs';
import {verifyTransportMutations} from '../helpers/phase9dTransportMutations.js';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('separate source/receiver databases and actual HTTP processes',async t=>{
  const source=await createTestDatabase(),receiver=await createTestDatabase({migrations:false});
  const url=testDatabaseUrl(),target=name=>{const value=new URL(url);value.pathname='/'+name;return value;};
  const sourceOwner=new pg.Client({connectionString:target(source.name).toString()}),receiverOwner=new pg.Client({connectionString:target(receiver.name).toString()});
  const clients=[],processes=[],witness={groups:[],liveCalls:0,productionCalls:0,distinctDatabases:source.name!==receiver.name};
  await sourceOwner.connect();await receiverOwner.connect();
  const asset=async name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8');
  try{
    const permissions=await asset('permissions.sql');
    await sourceOwner.query(permissions);await sourceOwner.query(await asset('outbox.sql'));await sourceOwner.query(await asset('transport-sender.sql'));
    // Roles are cluster identities: create once, install independently in each DB.
    await receiverOwner.query(permissions.replace(/^CREATE ROLE .*;\r?\n/gm,''));await receiverOwner.query(await asset('transport-receiver.sql'));
    for(const [admin,name] of [[sourceOwner,source.name],[receiverOwner,receiver.name]])await admin.query('REVOKE TEMPORARY ON DATABASE "'+name+'" FROM PUBLIC');
    const passwords=new Map();
    for(const role of ['shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_inspector']){
      const password=randomUUID();passwords.set(role,password);
      const command=(await sourceOwner.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command;await sourceOwner.query(command);
    }
    const login=(name,role)=>{const value=target(name);value.username=role;value.password=passwords.get(role);return value.toString();};
    const connect=async(name,role)=>{const client=new pg.Client({connectionString:login(name,role)});await client.connect();clients.push(client);return client;};
    const exporter=await connect(source.name,'shadow9d_exporter'),inspector=await connect(receiver.name,'shadow9d_inspector'),ops=await connect(source.name,'shadow9d_ops');
    const requestKey='synthetic-transport-authentication-at-least-thirty-two',receiptKey='synthetic-receipt-authentication-at-least-thirty-two',serviceId=randomUUID();
    await sourceOwner.query('INSERT INTO outbox9d.transport_configuration(service_id,receipt_key) VALUES($1,$2)',[serviceId,receiptKey]);
    await receiverOwner.query('INSERT INTO transport9d.configuration(service_id,receipt_key) VALUES($1,$2)',[serviceId,receiptKey]);
    await sourceOwner.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
    const scenario=createScheduledScenario({now:EXPORT_TEST_AT});await scenario.persist(source.client);
    const clock=createTestClock(EXPORT_TEST_AT);
    let businessBaseline;
    async function incident(){
      const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'TRANSPORT-'+randomUUID()};
      await source.client.booking.create({data:booking});
      await source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,scenario.driversByGroup.rcs,{reason:'rider_unreachable'},{clock}));
      businessBaseline=await consequenceState(source.client);
    }
    let service;
    async function start(fault){service=await transportProcess({mode:'receiver',connectionString:login(receiver.name,'shadow9d_capture'),requestKey,fault});processes.push(service);return endpoint();}
    const endpoint=()=>`http://127.0.0.1:${service.result.port}${TRANSPORT_PATH}`;
    async function sender(options={}){
      const child=await transportProcess({mode:'sender',connectionString:login(source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint:endpoint(),...options});processes.push(child);
      if(options.crashAfterStage){await child.kill();}else assert.equal((await child.exited).code,0);
      return child.result;
    }
    async function reset(fault){
      if(service)await service.close();
      await sourceOwner.query('TRUNCATE outbox9d.remote_receipts,outbox9d.deliveries RESTART IDENTITY');
      await sourceOwner.query('DELETE FROM public.responsibility_adjudication_work');
      await receiverOwner.query('TRUNCATE transport9d.receipts,shadow9d.work RESTART IDENTITY');
      for(const admin of [sourceOwner,receiverOwner])await admin.query('UPDATE shadow9d.control SET stopped=false,epoch=epoch+1,now_at=$1,queue_limit=100,max_concurrent=2,used_requests=0',[EXPORT_TEST_AT]);
      await incident();await start(fault);
    }
    const advance=seconds=>sourceOwner.query("UPDATE shadow9d.control SET now_at=now_at+make_interval(secs=>$1)",[seconds]);
    const delivery=async()=>(await sourceOwner.query('SELECT * FROM outbox9d.deliveries ORDER BY id LIMIT 1')).rows[0];
    const count=async()=>(await receiverOwner.query('SELECT count(*)::int value FROM shadow9d.work')).rows[0].value;
    async function group(name,body){await t.test(name,async()=>{await body();assert.deepEqual(await consequenceState(source.client),businessBaseline);witness.groups.push(name);});}

    await group('durable independent receipt, actual sender/receiver processes and unchanged financial state',async()=>{
      await reset();const before=await consequenceState(source.client);assert.equal((await sender()).status,'ACKED');
      const row=await delivery(),receipt=(await sourceOwner.query('SELECT receipt FROM outbox9d.remote_receipts')).rows[0].receipt;
      assert.equal(row.receiver_id,null);assert.equal(await count(),1);assert.equal(receipt.body.service,serviceId);
      assert.deepEqual(await consequenceState(source.client),before);assert.equal((await sourceOwner.query('SELECT count(*)::int n FROM shadow9d.work')).rows[0].n,0);
      const observed=(await inspector.query('SELECT logical_key,payload_binding,receipt,work_id FROM transport9d.receipts')).rows[0];assert.equal(observed.receipt,receipt.body.receipt);
      witness.guarantee={senderDatabase:source.name,receiverDatabase:receiver.name,receiverCommitIndependent:true,senderProcess:true,receiverProcess:true};
    });
    for(const fault of ['before-receipt-crash','after-receipt-crash','lost-ack'])await group(fault+' recovers through stable idempotent receipt',async()=>{
      await reset(fault);assert.equal((await sender()).status,'RETRYABLE');
      assert.equal(await count(),fault==='before-receipt-crash'?0:1);
      await service.close();await start();await advance(31);assert.equal((await sender()).status,'ACKED');assert.equal(await count(),1);assert.equal((await delivery()).attempts,2);
    });
    await group('sender dies after staging before transmission; fresh process reclaims expired lease',async()=>{
      await reset();assert.equal((await sender({crashAfterStage:true})).status,'STAGED');assert.equal(await count(),0);
      assert.equal((await sender()).status,'EMPTY');await advance(121);assert.equal((await sender()).status,'ACKED');assert.equal(await count(),1);
    });
    await group('duplicates and reordered delivery preserve two independent identities',async()=>{
      await reset();assert.equal((await sender()).status,'ACKED');const a=(await delivery()).payload;
      await incident();assert.equal((await sender()).status,'ACKED');const b=(await sourceOwner.query('SELECT payload FROM outbox9d.deliveries ORDER BY id DESC LIMIT 1')).rows[0].payload;
      const first=await sendShadowDelivery(endpoint(),requestKey,a),second=await sendShadowDelivery(endpoint(),requestKey,b);
      assert.equal((await sendShadowDelivery(endpoint(),requestKey,b)).body.receipt,second.body.receipt);assert.equal((await sendShadowDelivery(endpoint(),requestKey,a)).body.receipt,first.body.receipt);assert.equal(await count(),2);
      const changed=structuredClone(a);changed.originalCommitment='f'.repeat(64);await assert.rejects(sendShadowDelivery(endpoint(),requestKey,changed));assert.equal(await count(),2);
    });
    await group('network failure, independent restart and receiver capacity recovery',async()=>{
      await reset();await service.close();assert.equal((await sender()).status,'RETRYABLE');await start();await advance(31);
      await receiverOwner.query('UPDATE shadow9d.control SET queue_limit=1');
      assert.equal((await sender()).status,'ACKED');await incident();assert.equal((await sender()).status,'RETRYABLE');assert.equal(await count(),1);
      await receiverOwner.query("UPDATE shadow9d.work SET status='COMPLETED'");await advance(31);assert.equal((await sender()).status,'ACKED');assert.equal(await count(),2);
    });
    await group('invalid credentials, schema, privacy, hashes, bytes and unknown fields do not enqueue',async()=>{
      await reset();assert.equal((await sender({crashAfterStage:true})).status,'STAGED');const payload=(await delivery()).payload;
      await assert.rejects(sendShadowDelivery(endpoint(),'wrong-authentication-at-least-thirty-two',payload),error=>error.permanent===true);
      for(const change of [p=>p.schema='other',p=>p.lineage.caseId='a'.repeat(64),p=>p.evidenceHash='b'.repeat(64),p=>p.extra='adversarial',p=>p.snapshot.caseType='FAILED_PICKUP']){
        const changed=structuredClone(payload);change(changed);await assert.rejects(sendShadowDelivery(endpoint(),requestKey,changed));
      }
      const direct=await connect(receiver.name,'shadow9d_capture');
      const privatePayload=structuredClone(payload);privatePayload.snapshot.timeline[0].value={phone:'synthetic-private'};
      assert.equal((await direct.query('SELECT transport9d.receive($1) value',[JSON.stringify(privatePayload)])).rows[0].value,null);
      const badHash=structuredClone(payload);badHash.evidenceHash='d'.repeat(64);assert.equal((await direct.query('SELECT transport9d.receive($1) value',[JSON.stringify(badHash)])).rows[0].value,null);
      const raw=Buffer.from('{"schema":');
      const result=await new Promise((done,reject)=>{const req=http.request(endpoint(),{method:'POST',headers:{'content-type':'application/json','x-shadow-mac':transportMac(raw,requestKey)}},res=>{res.resume();res.once('end',()=>done(res.statusCode));});req.on('error',reject);req.end(raw);});assert.equal(result,400);assert.equal(await count(),0);
    });
    await group('forged/stale acknowledgements, expiry, generation and altered source fail closed',async()=>{
      await reset();await sender({crashAfterStage:true});const row=await delivery(),receipt=await sendShadowDelivery(endpoint(),requestKey,row.payload);
      const ack=r=>exporter.query('SELECT outbox9d.remote_ack($1,$2,$3) value',[row.id,row.token,JSON.stringify(r)]).then(r=>r.rows[0].value);
      const forged=structuredClone(receipt);forged.body.workId='999';assert.equal(await ack(forged),false);
      const unknown=structuredClone(receipt);unknown.extra=true;assert.equal(await ack(unknown),false);
      await sourceOwner.query('UPDATE shadow9d.control SET stopped=true,epoch=epoch+1');assert.equal(await ack(receipt),false);
      await sourceOwner.query('UPDATE shadow9d.control SET stopped=false,epoch=epoch-1');await advance(121);assert.equal(await ack(receipt),false);
      await sourceOwner.query('UPDATE shadow9d.control SET now_at=$1',[EXPORT_TEST_AT]);
      await sourceOwner.query("UPDATE public.responsibility_adjudication_work SET policy_version='corrupt' WHERE id=$1",[row.source_work_id]);assert.equal(await ack(receipt),false);assert.equal((await delivery()).status,'PROCESSING');assert.equal(await count(),1);
    });
    await group('cleanup preserves receipt tombstones and duplicate identity after restart/stop',async()=>{
      await reset();await sender();const row=await delivery();
      const pending=await sendShadowDelivery(endpoint(),requestKey,row.payload);
      assert.equal((await ops.query('SELECT outbox9d.remote_delete_payload($1,$2) value',[row.id,JSON.stringify(pending)])).rows[0].value,false);
      await receiverOwner.query("UPDATE shadow9d.work SET status='COMPLETED'");
      const completed=await sendShadowDelivery(endpoint(),requestKey,row.payload);
      assert.equal((await ops.query('SELECT outbox9d.remote_delete_payload($1,$2) value',[row.id,JSON.stringify(completed)])).rows[0].value,true);
      await receiverOwner.query('SELECT shadow9d.delete_payload(1)');await receiverOwner.query('UPDATE shadow9d.control SET stopped=true');
      await service.close();await start();assert.equal((await sendShadowDelivery(endpoint(),requestKey,row.payload)).body.receipt,completed.body.receipt);
      assert.equal((await delivery()).payload,null);assert.equal(await count(),1);assert.equal((await sender()).status,'EMPTY');
    });
    await group('concurrent stop versus transmission admission and acknowledgement uses actual lock ordering',async()=>{
      await reset();await sender({crashAfterStage:true});const row=await delivery();
      const receipt=await sendShadowDelivery(endpoint(),requestKey,row.payload);
      const peer=await connect(source.name,'shadow9d_exporter'),stopper=await connect(source.name,'shadow9d_ops');
      await peer.query("SET application_name='transport-admission-race'");await stopper.query("SET application_name='transport-stop-race'");
      async function waiting(name){
        for(let i=0;i<100;i++){
          const observed=(await sourceOwner.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[name])).rows[0].n;
          if(observed===1)return;await new Promise(done=>setTimeout(done,5));
        }
        throw Error('RACE_NOT_WAITING');
      }
      await sourceOwner.query('BEGIN;SELECT * FROM shadow9d.control FOR UPDATE');
      const stop=stopper.query('SELECT shadow9d.set_stop(true)');await waiting('transport-stop-race');
      const admit=peer.query('SELECT outbox9d.remote_payload($1,$2) value',[row.id,row.token]);await waiting('transport-admission-race');
      await sourceOwner.query('COMMIT');await stop;assert.equal((await admit).rows[0].value,null);
      // Explicit owned clock/epoch reset recreates the opposite legal interleaving.
      await sourceOwner.query('UPDATE shadow9d.control SET stopped=false,epoch=$1',[row.epoch]);
      await sourceOwner.query('BEGIN;SELECT * FROM shadow9d.control FOR UPDATE');
      const commit=peer.query('SELECT outbox9d.remote_ack($1,$2,$3) value',[row.id,row.token,JSON.stringify(receipt)]);await waiting('transport-admission-race');
      const laterStop=stopper.query('SELECT shadow9d.set_stop(true)');await waiting('transport-stop-race');
      await sourceOwner.query('COMMIT');assert.equal((await commit).rows[0].value,true);await laterStop;
      assert.equal((await delivery()).status,'ACKED');
      witness.stopRaces=['committed-stop-before-transmission-admission:denied','ack-commit-before-stop:retained'];
    });
    await group('stopped receiver retains backlog and bounded retry exhaustion never recreates work',async()=>{
      await reset();await receiverOwner.query('SELECT shadow9d.set_stop(true)');
      for(let attempt=1;attempt<=4;attempt++){
        assert.equal((await sender()).status,attempt===4?'MANUAL_REVIEW':'RETRYABLE');await advance(31);
      }
      assert.equal((await delivery()).status,'MANUAL_REVIEW');assert.equal((await delivery()).attempts,4);assert.equal(await count(),0);
      await receiverOwner.query('SELECT shadow9d.set_stop(false)');assert.equal((await sender()).status,'EMPTY');assert.equal(await count(),0);
    });
    await group('least privilege including wrong-database service identity and restricted inspection',async()=>{
      await reset();
      await assert.rejects(transportProcess({mode:'receiver',connectionString:login(source.name,'shadow9d_capture'),requestKey}),e=>e.code==='ERR_ASSERTION');
      for(const [client,sql] of [[exporter,'SELECT * FROM outbox9d.transport_configuration'],[exporter,'SELECT * FROM public.bookings'],[exporter,'SELECT outbox9d.deliver(1,gen_random_uuid())'],
        [inspector,'SELECT * FROM transport9d.configuration'],[inspector,'DELETE FROM transport9d.receipts'],[inspector,'SELECT transport9d.receive(null)']])await assert.rejects(client.query(sql),e=>e.code==='42501');
      const capture=await connect(receiver.name,'shadow9d_capture');
      for(const sql of ['SELECT shadow9d.set_stop(true)','SELECT shadow9d.enqueue(null,null,null,null)','TRUNCATE transport9d.receipts',"SET ROLE shadow9d_owner","SELECT pg_read_file('/etc/passwd')"])
        await assert.rejects(capture.query(sql),e=>e.code==='42501');
      assert.equal((await inspector.query('SELECT count(*)::int n FROM transport9d.receipts')).rows[0].n,0);
      assert.equal((await receiverOwner.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    });
    await group('independent SQL guard mutations are killed and exact catalogs restored',async()=>{
      const capture=await connect(receiver.name,'shadow9d_capture');
      witness.sqlMutations=await verifyTransportMutations({sourceOwner,receiverOwner,exporter,capture,reset,delivery,requestKey:EXPORT_TEST_KEY,receiptKey});
    });
    const output=resolve(process.env.PHASE9D_TRANSPORT_OUTPUT);await writeFile(join(output,'transport-witness-'+Date.now()+'.json'),JSON.stringify({...witness,digest:sha(witness)},null,2),{flag:'wx'});
  }finally{
    await Promise.allSettled(processes.map(child=>child.close()));await Promise.allSettled(clients.map(client=>client.end()));
    await sourceOwner.end();await receiverOwner.end();await receiver.close();await source.close();
  }
});
