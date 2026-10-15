import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from '../helpers/database.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_AT,EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {brokerProcess} from '../helpers/phase9dBrokerProcesses.js';
import {brokerSqlMutations} from '../helpers/phase9dBrokerMutations.js';
import {brokerCall} from '../../../tools/phase9d/broker-execution.mjs';
import {commitGuardedBrokerResult,independentlyGuardBroker} from '../../../tools/phase9d/broker-guard.mjs';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('independent broker budgets and current-generation advisory authority',async t=>{
  const source=await createTestDatabase(),receiver=await createTestDatabase({migrations:false}),clients=[],processes=[];
  const url=testDatabaseUrl(),target=name=>{const u=new URL(url);u.pathname='/'+name;return u;};
  const a=new pg.Client({connectionString:target(source.name).toString()}),b=new pg.Client({connectionString:target(receiver.name).toString()});await a.connect();await b.connect();
  const asset=name=>readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8');
  const witness={groups:[],liveCalls:0,productionCalls:0,providerCalls:[],SQLdenials:[]};
  try {
    const permissions=await asset('permissions.sql');await a.query(permissions);await a.query(await asset('outbox.sql'));await a.query(await asset('transport-sender.sql'));
    await b.query(permissions.replace(/^CREATE ROLE .*;\r?\n/gm,''));await b.query(await asset('transport-receiver.sql'));await b.query(await asset('broker.sql'));
    await b.query('CREATE EXTENSION plpgsql_check');
    for(const [client,name]of [[a,source.name],[b,receiver.name]])await client.query('REVOKE TEMPORARY ON DATABASE "'+name+'" FROM PUBLIC');
    const passwords=new Map();
    for(const role of ['shadow9d_exporter','shadow9d_capture','broker9d_exec','broker9d_guard','broker9d_ops']){
      const password=randomUUID();passwords.set(role,password);await a.query((await a.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password])).rows[0].command);
    }
    const login=(name,role)=>{const u=target(name);u.username=role;u.password=passwords.get(role);return u.toString();};
    const connect=async(name,role)=>{const client=new pg.Client({connectionString:login(name,role)});await client.connect();clients.push(client);return client;};
    const exec=await connect(receiver.name,'broker9d_exec'),exec2=await connect(receiver.name,'broker9d_exec'),guard=await connect(receiver.name,'broker9d_guard'),guard2=await connect(receiver.name,'broker9d_guard'),ops=await connect(receiver.name,'broker9d_ops');
    const serviceId=randomUUID(),requestKey='synthetic-broker-transport-request-at-least-thirty-two',receiptKey='synthetic-broker-transport-receipt-at-least-thirty-two';
    await a.query('INSERT INTO outbox9d.transport_configuration(service_id,receipt_key) VALUES($1,$2)',[serviceId,receiptKey]);
    await b.query('INSERT INTO transport9d.configuration(service_id,receipt_key) VALUES($1,$2)',[serviceId,receiptKey]);
    await a.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
    for(const owner of [a,b])await owner.query('UPDATE shadow9d.control SET stopped=false,now_at=$1',[EXPORT_TEST_AT]);
    const scenario=createScheduledScenario({now:EXPORT_TEST_AT});await scenario.persist(source.client);const clock=createTestClock(EXPORT_TEST_AT);
    for(let i=0;i<2;i++){
      const booking={...scenario.bookingStates.current,id:randomUUID(),reference:'BROKER-'+randomUUID()};await source.client.booking.create({data:booking});
      await source.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,scenario.driversByGroup.rcs,{reason:'rider_unreachable'},{clock}));
    }
    const financialBaseline=await consequenceState(source.client);
    const receiverProcess=await transportProcess({mode:'receiver',connectionString:login(receiver.name,'shadow9d_capture'),requestKey});processes.push(receiverProcess);
    for(let i=0;i<2;i++){
      const sender=await transportProcess({mode:'sender',connectionString:login(source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint:`http://127.0.0.1:${receiverProcess.result.port}/v1/shadow/deliveries`});processes.push(sender);
      assert.equal(sender.result.status,'ACKED');await sender.exited;
    }
    const payloads=(await a.query('SELECT d.payload,r.receipt FROM outbox9d.deliveries d JOIN outbox9d.remote_receipts r ON r.delivery_id=d.id ORDER BY d.id')).rows;
    const message=i=>({protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:payloads[i].receipt.body.receipt,payload:payloads[i].payload});
    const register=i=>brokerCall(exec,'register',[JSON.stringify(message(i))]);
    const reserve=id=>brokerCall(exec,'reserve',[id]);
    const advance=seconds=>b.query("UPDATE broker9d.control SET now_at=now_at+make_interval(secs=>$1)",[seconds]);
    const stop=value=>brokerCall(ops,'set_stop',[value]);
    const reset=async()=>{
      await b.query('TRUNCATE broker9d.results,broker9d.events,broker9d.attempts,broker9d.requests');
      await b.query('UPDATE broker9d.control SET stopped=false,generation=generation+1,now_at=$1',[EXPORT_TEST_AT]);
      await b.query('UPDATE broker9d.configuration SET max_attempts=2,max_requests=20,max_concurrent=2,max_inflight=1,input_limit=20480,output_limit=5120,minor_limit=100');
      for(const row of payloads)await b.query('UPDATE shadow9d.work SET evidence_hash=$1 WHERE id=$2',[row.payload.evidenceHash,row.receipt.body.workId]);
    };
    const rows=async table=>(await b.query('SELECT * FROM broker9d.'+table+' ORDER BY '+(table==='requests'?'logical_key':table==='results'?'request_id':'id'))).rows;
    const run=async(configuration)=>{const child=await brokerProcess(configuration);processes.push(child);if(child.result.status!=='PAUSED')assert.equal((await child.exited).code,0);return child;};
    const execute=id=>run({mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture:'valid'});
    const group=async(name,body)=>t.test(name,async()=>{await reset();await body();assert.deepEqual(await consequenceState(source.client),financialBaseline);witness.groups.push(name);});
    await group('actual transport, broker process and separate guard commit one review-only result',async()=>{
      const id=await register(0);assert.equal(await register(0),id);
      const child=await execute(id);assert.equal(child.result.status,'RESPONSE_OBSERVED');witness.providerCalls.push({fixture:'valid',calls:child.result.calls});
      const final=await run({mode:'guard',connectionString:login(receiver.name,'broker9d_guard'),id:child.result.id,token:child.result.token});assert.equal(final.result.status,'GUARDED_RESULT_COMMITTED');
      const attempt=(await rows('attempts'))[0];assert.equal(attempt.input_used,'128');assert.equal(attempt.output_used,'32');assert.equal(attempt.minor_used,'2');assert.equal(attempt.input_reserved,'1024');
      const result=(await rows('results'))[0].result;assert.equal(result.mode,'SHADOW');assert.equal(result.route,'NEEDS_ADMIN_REVIEW');assert.equal(result.output.suggestedClassification,'DRIVER_CAUSED');
      assert.equal((await execute(id)).result.status,'NOT_RESERVED');assert.equal((await rows('results')).length,1);
    });
    await group('foreign receipt, source hash, versions, fields and authority are rejected before reservation',async()=>{
      for(const change of [m=>({...m,protocol:'unknown'}),m=>({...m,configuration:'new'}),m=>({...m,receipt:randomUUID()}),m=>({...m,extra:true}),m=>({...m,payload:{...m.payload,evidenceHash:'0'.repeat(64)}}),m=>({...m,payload:{...m.payload,lineage:{...m.payload.lineage,actorId:'0'.repeat(64)}}})])assert.equal(await brokerCall(exec,'register',[JSON.stringify(change(message(0)))]),null);
      assert.equal((await rows('requests')).length,0);assert.equal((await rows('attempts')).length,0);
    });
    await group('atomic final token/currency/request capacity permits one of two real connections',async()=>{
      for(const [column,value]of [['input_limit',1024],['output_limit',256],['minor_limit',5],['max_requests',1],['max_concurrent',1]]){
        await reset();await b.query('UPDATE broker9d.configuration SET '+column+'=$1',[value]);const one=await register(0),two=await register(1);
        const got=await Promise.all([brokerCall(exec,'reserve',[one]),brokerCall(exec2,'reserve',[two])]);assert.equal(got.filter(Boolean).length,1);assert.equal((await rows('attempts')).length,1);
      }
    });
    await group('dispatch and physical-send authorization cannot be duplicated across replicas',async()=>{
      const id=await register(0),work=await reserve(id);
      assert.deepEqual((await Promise.all([brokerCall(exec,'admit',[work.id,work.token]),brokerCall(exec2,'admit',[work.id,work.token])])).sort(),[false,true]);
      assert.deepEqual((await Promise.all([brokerCall(exec,'begin_send',[work.id,work.token]),brokerCall(exec2,'begin_send',[work.id,work.token])])).sort(),[false,true]);
      const other=await reserve(await register(1));assert.equal(await brokerCall(exec2,'admit',[other.id,other.token]),false);
    });
    await group('configuration changes cannot revive denied work or existing dispatch authority',async()=>{
      await b.query('UPDATE broker9d.configuration SET minor_limit=5');const one=await register(0),two=await register(1);const first=await reserve(one);assert.equal(await reserve(two),null);
      await b.query('UPDATE broker9d.configuration SET minor_limit=100');assert.equal(await reserve(two),null);assert.equal(await brokerCall(exec,'admit',[first.id,first.token]),false);assert.equal(await register(0),null);
      assert.equal((await rows('requests')).find(r=>r.id===two).status,'MANUAL_REVIEW');
    });
    await group('stop before create/reserve/admit/send and repeated generations deny old authority',async()=>{
      await stop(true);assert.equal(await register(0),null);await stop(false);const id=await register(0);await stop(true);assert.equal(await reserve(id),null);
      await reset();const work=await reserve(await register(0));await stop(true);assert.equal(await brokerCall(exec,'admit',[work.id,work.token]),false);await stop(false);assert.equal(await brokerCall(exec,'admit',[work.id,work.token]),false);
      await reset();const admitted=await reserve(await register(0));assert.equal(await brokerCall(exec,'admit',[admitted.id,admitted.token]),true);await stop(true);assert.equal(await brokerCall(exec,'begin_send',[admitted.id,admitted.token]),false);
      await stop(false);await stop(true);await stop(false);assert.equal(await brokerCall(exec,'begin_send',[admitted.id,admitted.token]),false);
    });
    await group('lease expiry denies dispatch and result; replacement process reclaims only unsent reservation',async()=>{
      const id=await register(0),paused=await run({mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture:'valid',pauseAt:'reserved'});
      assert.equal(paused.result.status,'PAUSED');await paused.kill();await advance(61);assert.equal(await brokerCall(exec,'admit',[paused.result.id,paused.result.token]),false);
      assert.equal(await brokerCall(exec2,'recover',[paused.result.id]),true);assert.equal((await rows('attempts'))[0].usage_state,'RELEASED');
      const child=await execute(id);assert.equal(child.result.status,'RESPONSE_OBSERVED');await advance(61);assert.equal((await commitGuardedBrokerResult(guard,child.result.id,child.result.token)).status,'FENCED');
      assert.equal((await rows('attempts')).length,2);assert.equal((await rows('results')).length,0);
    });
    await group('crash after dispatch admission retains UNKNOWN capacity even before observed send',async()=>{
      const id=await register(0),paused=await run({mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture:'valid',pauseAt:'admitted'});await paused.kill();await advance(61);
      assert.equal(await brokerCall(exec2,'recover',[paused.result.id]),true);const attempt=(await rows('attempts'))[0];assert.equal(attempt.usage_state,'UNKNOWN');assert.equal(attempt.may_have_escaped,false);
      assert.equal(attempt.input_reserved,'1024');assert.equal(await reserve(id),null);const next=await reserve(await register(1));assert.equal(await brokerCall(exec2,'admit',[next.id,next.token]),false);
    });
    await group('provider timeout/errors/malformed output and missing usage preserve all spending',async()=>{
      for(const fixture of ['timeout','429','5xx','malformed','oversized','unknown-usage']){
        await reset();const id=await register(0),child=await run({mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture});
        assert.equal(child.result.status,'OUTCOME_UNKNOWN');assert.equal(child.result.calls,1);witness.providerCalls.push({fixture,calls:1});
        const attempt=(await rows('attempts'))[0];assert.equal(attempt.usage_state,'UNKNOWN');assert.equal(attempt.minor_reserved,'5');assert.equal(attempt.minor_used,null);assert.equal(attempt.may_have_escaped,true);assert.equal(await reserve(id),null);
        assert.equal((await commitGuardedBrokerResult(guard,child.result.id,child.result.token)).status,'FENCED');
      }
    });
    await group('stop after response forbids commit; late accounting never grants fresh result authority',async()=>{
      const child=await execute(await register(0));await stop(true);assert.equal((await commitGuardedBrokerResult(guard,child.result.id,child.result.token)).status,'FENCED');
      await stop(false);assert.equal((await commitGuardedBrokerResult(guard,child.result.id,child.result.token)).status,'FENCED');assert.equal((await rows('attempts'))[0].usage_state,'CONFIRMED');assert.equal((await rows('results')).length,0);
    });
    await group('independent concurrent guard commits one immutable result and denies conflicting duplicates',async()=>{
      const child=await execute(await register(0)),input=await brokerCall(guard,'guard_input',[child.result.id,child.result.token]),result=independentlyGuardBroker(input);
      assert.deepEqual(await Promise.all([brokerCall(guard,'commit_result',[child.result.id,child.result.token,JSON.stringify(result)]),brokerCall(guard2,'commit_result',[child.result.id,child.result.token,JSON.stringify(result)])]),[true,true]);
      assert.equal((await rows('results')).length,1);assert.equal(await brokerCall(guard,'commit_result',[child.result.id,child.result.token,JSON.stringify({...result,mode:'HUMAN_FINAL'})]),false);
      await stop(true);assert.equal(await brokerCall(guard,'commit_result',[child.result.id,child.result.token,JSON.stringify(result)]),true);
    });
    await group('response identity and confirmed usage are immutable and bounded',async()=>{
      const child=await execute(await register(0)),attempt=(await rows('attempts'))[0];
      assert.equal(await brokerCall(exec2,'observe',[child.result.id,child.result.token,JSON.stringify(attempt.response)]),true);
      assert.equal(await brokerCall(exec2,'observe',[child.result.id,child.result.token,JSON.stringify({...attempt.response,usage:{...attempt.response.usage,minor:4}})]),false);
      assert.equal(await brokerCall(exec2,'observe',[child.result.id,randomUUID(),JSON.stringify(attempt.response)]),false);
      assert.equal((await rows('attempts'))[0].minor_used,'2');
    });
    await group('SQL identities independently deny operative writes, control, history and secret reads',async()=>{
      const sourceExec=await connect(source.name,'broker9d_exec');
      for(const table of ['bookings','payments','drivers','driver_cancellations','responsibility_cases'])for(const operation of ['DELETE FROM','TRUNCATE']){
        await assert.rejects(sourceExec.query(operation+' public.'+table+(operation==='DELETE FROM'?' WHERE false':'')),error=>error.code==='42501');witness.SQLdenials.push(operation+' public.'+table);
      }
      for(const [client,sql]of [[exec,'UPDATE broker9d.configuration SET minor_limit=100000'],[exec,'DELETE FROM broker9d.attempts'],[exec,'DELETE FROM broker9d.events'],[exec,'SELECT * FROM transport9d.configuration'],[exec,'SET ROLE broker9d_owner'],[exec,'SELECT broker9d.set_stop(false)'],[exec,'SELECT broker9d.commit_result(NULL,NULL,NULL)'],[guard,'SELECT broker9d.reserve(NULL)'],[guard,'UPDATE broker9d.attempts SET status=\'RELEASED\''],[ops,'UPDATE broker9d.configuration SET max_requests=100']]){
        await assert.rejects(client.query(sql),error=>error.code==='42501');witness.SQLdenials.push(sql);
      }
    });
    await group('actual lock ordering stop-before-admission and admission-before-stop',async()=>{
      for(const stopFirst of [true,false]){
        await reset();const id=await register(0);
        const holder=stopFirst?ops:exec,waiter=stopFirst?exec:ops;
        const pid=(await waiter.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await holder.query('BEGIN');
        const work=stopFirst?await reserve(id):await brokerCall(holder,'reserve',[id]);
        if(stopFirst)await brokerCall(holder,'set_stop',[true]);else assert.equal(await brokerCall(holder,'admit',[work.id,work.token]),true);
        const pending=stopFirst?brokerCall(waiter,'admit',[work.id,work.token]):brokerCall(waiter,'set_stop',[true]);
        let locked=false;
        for(let i=0;i<100;i++){locked=(await b.query("SELECT wait_event_type='Lock' locked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0].locked;if(locked)break;await new Promise(done=>setTimeout(done,10));}
        assert.equal(locked,true);await holder.query('COMMIT');const outcome=await pending;
        if(stopFirst)assert.equal(outcome,false);else{assert.equal(typeof outcome,'string');assert.equal((await rows('attempts'))[0].status,'DISPATCH_ADMITTED');}
      }
    });
    await group('crashes after fake response and immediately after guard commit preserve accounting/history',async()=>{
      const id=await register(0),provider=await run({mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture:'valid',pauseAt:'provider'});
      await provider.kill();await advance(61);assert.equal(await brokerCall(exec2,'recover',[provider.result.id]),true);
      assert.equal((await rows('attempts'))[0].usage_state,'UNKNOWN');assert.equal((await rows('results')).length,0);
      await reset();const response=await execute(await register(0)),committed=await run({mode:'guard',connectionString:login(receiver.name,'broker9d_guard'),id:response.result.id,token:response.result.token,pauseAt:'committed'});
      await committed.kill();assert.equal((await rows('results')).length,1);assert.equal((await execute((await rows('requests'))[0].id)).result.calls,0);
    });
    await group('guard compute versus stop uses fresh result admission; unknown usage cannot authorize valid output',async()=>{
      const response=await execute(await register(0)),paused=await run({mode:'guard',connectionString:login(receiver.name,'broker9d_guard'),id:response.result.id,token:response.result.token,pauseAt:'guarded'});
      await stop(true);await paused.kill();assert.equal((await commitGuardedBrokerResult(guard2,response.result.id,response.result.token)).status,'FENCED');assert.equal((await rows('results')).length,0);
    });
    await group('wrong database and unauthenticated execution protocol fail before model calls',async()=>{
      const id=await register(0);
      for(const configuration of [{mode:'execute',connectionString:login(source.name,'broker9d_exec'),requestId:id,fixture:'valid'},
        {mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture:'valid',foreign:true},
        {mode:'execute',connectionString:login(receiver.name,'broker9d_exec'),requestId:id,fixture:'live-provider'}])assert.equal((await run(configuration)).result.status,'FAILED_CLOSED');
      assert.equal((await rows('attempts')).length,0);
    });
    witness.nativeSql=[];
    const catalog=(await b.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,l.lanname language,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='broker9d' ORDER BY 1")).rows;
    for(const routine of catalog){
      assert.equal(routine.owner,'broker9d_owner');assert.ok(routine.proconfig.includes('search_path=pg_catalog, broker9d, pg_temp'));
      if(routine.language==='plpgsql')witness.nativeSql.push({signature:routine.signature,definitionSha256:sha(routine.definition),
        metrics:(await b.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.signature])).rows[0],
        statements:(await b.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.signature])).rows});
    }
    witness.catalog=catalog;
    await group('seeded SQL authorization omissions produce independent real counterexamples',async()=>{
      const deniedAdmission=async(change,tokenChange=false)=>{await reset();const work=await reserve(await register(0));if(change)await b.query(change);return brokerCall(exec,'admit',[work.id,tokenChange?randomUUID():work.token]);};
      witness.sqlMutations=await brokerSqlMutations(b,[
        {name:'stop',routine:'allowed',from:'NOT c.stopped AND ',to:'',probe:()=>deniedAdmission('UPDATE broker9d.control SET stopped=true')},
        {name:'generation',routine:'allowed',from:'a.generation=c.generation AND q.generation=c.generation AND',to:'',probe:()=>deniedAdmission('UPDATE broker9d.control SET generation=generation+1')},
        {name:'lease-token',routine:'allowed',from:'a.token=allowed.token AND ',to:'',probe:()=>deniedAdmission(null,true)},
        {name:'lease-expiry',routine:'allowed',from:'a.lease_until>c.now_at AND ',to:'',probe:()=>deniedAdmission("UPDATE broker9d.control SET now_at=now_at+interval '61 seconds'")},
        {name:'source-hash',routine:'allowed',from:'q.evidence_hash=w.evidence_hash AND ',to:'',probe:()=>deniedAdmission("UPDATE shadow9d.work SET evidence_hash=repeat('0',64)")},
        {name:'duplicate-send',routine:'begin_send',from:' OR a.send_at IS NOT NULL',to:'',probe:async()=>{
          await reset();const work=await reserve(await register(0));assert.equal(await brokerCall(exec,'admit',[work.id,work.token]),true);assert.equal(await brokerCall(exec,'begin_send',[work.id,work.token]),true);return brokerCall(exec,'begin_send',[work.id,work.token]);}},
      ]);
    });
    witness.state={requests:await rows('requests'),attempts:await rows('attempts'),results:await rows('results')};
    await writeFile(join(resolve(process.env.PHASE9D_BROKER_OUTPUT),'broker-witness-'+Date.now()+'.json'),JSON.stringify({...witness,digest:sha(witness)},null,2),{flag:'wx'});
  }finally{await Promise.allSettled(processes.map(child=>child.kill?.()??child.close()));await Promise.allSettled(clients.map(client=>client.end()));await a.end();await b.end();await receiver.close();await source.close();}
});
