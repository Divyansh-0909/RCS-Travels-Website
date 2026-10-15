import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {recoveryFixture} from '../helpers/phase9dRecoveryFixture.js';
import {brokerCall,executeBrokerAttempt} from '../../../tools/phase9d/broker-execution.mjs';
import {commitGuardedBrokerResult,independentlyGuardBroker} from '../../../tools/phase9d/broker-guard.mjs';
import {recoveryOperation} from '../../../tools/phase9d/recovery-operations.mjs';
import {brokerSqlMutations} from '../helpers/phase9dBrokerMutations.js';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';
import {testDatabaseUrl} from '../helpers/database.js';
import {issueOfflineUsage} from '../../../tools/phase9d/recovery-receipt.mjs';
let restartPayload;
test('isolated authenticated usage, operations and real database failure recovery',async t=>{
  const f=await recoveryFixture(4);restartPayload=f.message(0).payload;const witness={groups:[],faults:[],liveCalls:0,productionCalls:0};
  const call=(name,args,client=f.exec)=>brokerCall(client,name,args);
  const counts=async()=>({requests:(await f.b.query('SELECT count(*) n FROM broker9d.requests')).rows[0].n,attempts:(await f.b.query('SELECT count(*) n FROM broker9d.attempts')).rows[0].n,results:(await f.b.query('SELECT count(*) n FROM broker9d.results')).rows[0].n});
  const work=async(i=0)=>{const requestId=await f.register(i),a=await call('reserve',[requestId]);return {...a,requestId};};
  const sent=async(i=0)=>{const a=await work(i);assert.equal(await call('admit',[a.id,a.token]),true);assert.equal(await call('begin_send',[a.id,a.token]),true);return a;};
  const reconcile=(receipt,client=f.reconciler)=>call('reconcile',[JSON.stringify(receipt)],client);
  const terminal=async(id,action='TERMINATE')=>{const q=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[id])).rows[0];return recoveryOperation(f.ops,{action,id:randomUUID(),target:id,expected:Number(q.revision),reason:action==='CLEAN'?'RETENTION_MINIMIZATION':'UNRESOLVED_PROVIDER'});};
  const group=async(name,body)=>t.test(name,async()=>{await f.reset();await body();await f.unchanged();witness.groups.push(name);});
  const wait=async predicate=>{const until=Date.now()+5000;while(!await predicate()){assert.ok(Date.now()<until,'real database barrier deadline');await new Promise(ok=>setTimeout(ok,10));}};
  // Uses an actual backend connection and actual transactions. After-commit
  // variant withholds query completion while an independent observer kills it.
  const disconnect=async(role,expression,timing)=>{
    const client=await f.connect(role),pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const query=`BEGIN; SELECT ${expression}; ${timing==='committed'?'COMMIT; ':''}SELECT pg_sleep(30) /* recovery-fault */`;
    const pending=client.query(query).then(()=>{throw Error('fault was not injected');},error=>error.code);
    await wait(async()=>{const row=(await f.b.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];return row?.wait_event==='PgSleep';});
    assert.equal((await f.b.query('SELECT pg_terminate_backend($1) killed',[pid])).rows[0].killed,true);assert.equal(await pending,'57P01');
    witness.faults.push({role,timing,method:'pg_terminate_backend',providerCancellationClaimed:false});
  };
  const expression=async(name,args)=>{
    const literals=[];for(const arg of args)literals.push((await f.b.query("SELECT quote_nullable($1::text) literal",[arg===null?null:typeof arg==='object'?JSON.stringify(arg):String(arg)])).rows[0].literal);
    return `broker9d.${name}(${literals.join(',')})`;
  };
  try{
    await group('model usage is not authority; authenticated exact receipt permits independent review only',async()=>{
      const requestId=await f.register(),observed=await executeBrokerAttempt(f.exec,requestId,'valid');assert.equal(observed.calls,1);
      assert.equal((await f.row(observed.id)).attempt.usage_state,'UNKNOWN');assert.equal(await call('guard_input',[observed.id,observed.token],f.guard),null);
      const receipt=await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2});
      assert.equal(await reconcile(receipt),'ACCEPTED');assert.equal(await reconcile(receipt),'DUPLICATE');
      assert.equal((await commitGuardedBrokerResult(f.guard,observed.id,observed.token)).status,'GUARDED_RESULT_COMMITTED');
      assert.equal((await counts()).results,'1');assert.equal((await recoveryOperation(f.ops,{action:'ACCOUNTING'})).heldMinor,5);
    });
    await group('forged, partial, substituted, overflow and cross-configuration receipts preserve uncertainty',async()=>{
      const a=await sent(),good=await f.receipt(a.id);
      const invalid=[{...good,mac:'0'.repeat(64)}, {...good,body:{...good.body,attemptId:randomUUID()}}, {...good,body:{...good.body,configurationHash:'0'.repeat(64)}}, {...good,body:{...good.body,provider:'other'}}, {...good,body:{...good.body,input:-1}}, {...good,body:{...good.body,input:1.2}}, {...good,body:{...good.body,minor:1e30}}, {...good,body:{...good.body,minor:undefined}}, {...good,extra:true}];
      for(const receipt of invalid)assert.equal(await reconcile(receipt),'INVALID');
      assert.equal(await reconcile(await f.receipt(a.id,{outcome:'BILLED_FAILURE',input:1025,output:32,minor:2})),'INVALID');
      assert.equal((await f.row(a.id)).attempt.usage_state,'UNKNOWN');assert.equal((await counts()).attempts,'1');
      assert.equal(await call('reserve',[a.requestId]),null);
    });
    await group('conflicting authenticated receipt is immutable and blocks guard; concurrent exact receipts deduplicate',async()=>{
      const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid'),receipt=await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2});
      const other=await f.connect('broker9d_reconciler');assert.deepEqual((await Promise.all([reconcile(receipt),reconcile(receipt,other)])).sort(),['ACCEPTED','DUPLICATE']);
      assert.equal(await reconcile(await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:3},receipt.body.receiptId)),'CONFLICT');
      assert.equal((await f.row(observed.id)).attempt.minor_used,2);assert.equal((await f.row(observed.id)).attempt.usage_conflict,true);
      assert.equal(await call('guard_input',[observed.id,observed.token],f.guard),null);assert.equal((await f.b.query('SELECT count(*) n FROM broker9d.usage_receipts')).rows[0].n,'2');
      const accounting=await call('accounting',[],f.ops);assert.equal(accounting.disputedMinor,5);assert.equal(accounting.externalReconciliation,1);assert.equal(accounting.heldMinor,5);
    });
    await group('zero charge is not no-dispatch; maximal receipt retains lifetime ceilings',async()=>{
      const a=await sent();assert.equal(await reconcile(await f.receipt(a.id,{outcome:'NO_DISPATCH',input:0,output:0,minor:0})),'INVALID');
      assert.equal(await reconcile(await f.receipt(a.id,{outcome:'BILLED_FAILURE',input:0,output:0,minor:0})),'ACCEPTED');
      let accounting=await call('accounting',[],f.ops);assert.equal(accounting.heldMinor,5);assert.equal(accounting.confirmedMinor,0);assert.equal(accounting.active,0);
      const second=await sent(1);assert.equal(await reconcile(await f.receipt(second.id,{outcome:'BILLED_FAILURE',input:1024,output:256,minor:5})),'ACCEPTED');
      accounting=await call('accounting',[],f.ops);assert.equal(accounting.lifetimeMinorReserved,10);assert.equal(accounting.heldMinor,10);assert.equal(accounting.confirmedMinor,5);
    });
    await group('only authenticated no-send confirmation releases an admitted unspent reservation',async()=>{
      const a=await work();await call('admit',[a.id,a.token]);await f.advance(61);
      assert.equal(await reconcile(await f.receipt(a.id,{outcome:'NO_DISPATCH',input:0,output:0,minor:0})),'ACCEPTED');
      assert.equal((await f.row(a.id)).attempt.usage_state,'RELEASED');assert.equal(await call('reserve',[a.requestId]),null);
      const accounting=await call('accounting',[],f.ops);assert.equal(accounting.heldMinor,0);assert.equal(accounting.attempts,1);assert.equal(accounting.lifetimeMinorReserved,5);
    });
    await group('terminal never-admitted reservation releases only after expiry without reopening its tombstone',async()=>{
      const a=await work();await terminal(a.requestId);assert.equal(await call('recover',[a.id]),false);await f.advance(61);
      assert.equal(await call('recover',[a.id]),true);const row=await f.row(a.id);assert.equal(row.request.status,'TERMINAL');assert.equal(row.attempt.usage_state,'RELEASED');assert.equal(row.attempt.admitted_at,null);assert.equal(await call('reserve',[a.requestId]),null);
      const accounting=await call('accounting',[],f.ops);assert.equal(accounting.heldMinor,0);assert.equal(accounting.attempts,1);assert.equal(accounting.lifetimeMinorReserved,5);
    });
    await group('manual terminal and payload cleanup preserve unknown costs, tombstone and late reconciliation',async()=>{
      const a=await sent(),original=f.message(0),receipt=await f.receipt(a.id);await call('unknown',[a.id,a.token]);
      assert.equal((await terminal(a.requestId)).status,'APPLIED');assert.equal((await terminal(a.requestId,'CLEAN')).status,'APPLIED');
      const state=await f.row(a.id);assert.equal(state.request.payload,null);assert.equal(state.attempt.usage_state,'UNKNOWN');assert.equal(await f.register(),a.requestId);
      assert.equal((await f.b.query('SELECT snapshot FROM shadow9d.work WHERE id=$1',[state.request.work_id])).rows[0].snapshot,null);
      assert.equal(await call('reserve',[a.requestId]),null);assert.equal(await call('begin_send',[a.id,a.token]),false);
      assert.equal(await reconcile(receipt),'ACCEPTED');assert.equal((await f.row(a.id)).request.status,'TERMINAL');assert.equal((await f.row(a.id)).attempt.usage_state,'CONFIRMED');
      assert.equal(await call('register',[JSON.stringify({...original,payload:{...original.payload,key:'0'.repeat(64)}})]),null);
      assert.equal((await counts()).attempts,'1');assert.equal((await counts()).results,'0');
    });
    await group('operations compare state/version, idempotency and actor; unauthorized roles cannot resolve',async()=>{
      const id=await f.register(),command={action:'TERMINATE',id:randomUUID(),target:id,expected:0,reason:'UNRESOLVED_PROVIDER'};
      const applied=await recoveryOperation(f.ops,command);assert.equal(applied.status,'APPLIED');assert.deepEqual(await recoveryOperation(f.ops,command),applied);
      assert.equal((await recoveryOperation(f.ops,{...command,reason:'EXHAUSTED'})).status,'CONFLICT');assert.equal((await recoveryOperation(f.ops,{...command,id:randomUUID()})).status,'STALE');
      for(const client of [f.exec,f.guard,f.reconciler])await assert.rejects(recoveryOperation(client,{...command,id:randomUUID()}),error=>error.code==='42501');
      for(const table of ['usage_authority','operations','attempts','configuration'])await assert.rejects(f.ops.query('SELECT * FROM broker9d.'+table),error=>error.code==='42501');
      await assert.rejects(call('reconcile',[JSON.stringify({})],f.exec),error=>error.code==='42501');
    });
    await group('actual operations CLI authenticates its isolated login and returns minimized inspection',async()=>{
      const a=await sent(),receipt=await f.receipt(a.id),receiptFile=join(process.env.PHASE9D_BROKER_OUTPUT,'cli-usage-'+randomUUID()+'.json');await writeFile(receiptFile,JSON.stringify(receipt),{flag:'wx'});
      const invoke=async(command,role='broker9d_ops')=>{
        const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
        const child=spawn(process.execPath,[resolve('../tools/phase9d/recovery-cli.mjs')],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
        child.stdin.end(JSON.stringify({connectionString:f.uri(f.receiver.name,role),command}));const code=await new Promise((ok,fail)=>{child.once('close',ok);child.once('error',fail);});return {code,stdout,stderr};
      };
      const inspected=await invoke({action:'INSPECT',target:a.requestId});assert.equal(inspected.code,0);const value=JSON.parse(inspected.stdout);assert.equal(value.request.id,a.requestId);assert.equal(value.request.payload,undefined);assert.equal(value.attempts[0].token,undefined);
      assert.equal((await invoke({action:'ACCOUNTING'})).code,0);const reconciled=await invoke({action:'RECONCILE',receiptFile});assert.equal(reconciled.code,0);assert.equal(JSON.parse(reconciled.stdout),'ACCEPTED');
      const denied=await invoke({action:'ACCOUNTING'},'broker9d_exec');assert.equal(denied.code,1);assert.equal(denied.stdout,'');assert.equal(denied.stderr.trim(),'RECOVERY_OPERATION_FAILED_CLOSED');
    });
    await group('late stale-generation receipt accounts for cost but cannot authorize a current result',async()=>{
      const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid'),receipt=await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2});
      await f.control('STOP');await f.control('RESUME');assert.equal(await reconcile(receipt),'ACCEPTED');assert.equal(await call('guard_input',[observed.id,observed.token],f.guard),null);
      assert.equal((await f.row(observed.id)).attempt.usage_state,'CONFIRMED');assert.equal((await counts()).results,'0');
    });
    await group('actual registration and reservation transaction disconnects distinguish rollback from lost ACK',async()=>{
      for(const timing of ['uncommitted','committed']){
        await f.reset();await disconnect('broker9d_exec',await expression('register',[f.message(0)]),timing);
        assert.equal((await counts()).requests,timing==='committed'?'1':'0');const id=await f.register();assert.equal((await counts()).requests,'1');
        await disconnect('broker9d_exec',await expression('reserve',[id]),timing);assert.equal((await counts()).attempts,timing==='committed'?'1':'0');
        if(timing==='committed'){assert.equal(await call('reserve',[id]),null);await f.advance(61);const a=(await f.b.query('SELECT id FROM broker9d.attempts')).rows[0];assert.equal(await call('recover',[a.id]),true);}
      }
    });
    await group('actual disconnections before registration, reservation and guard calculation cannot enter writers',async()=>{
      const killed=async role=>{const client=await f.connect(role),pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;await f.b.query('SELECT pg_terminate_backend($1)',[pid]);await new Promise(ok=>setTimeout(ok,20));return client;};
      await assert.rejects(call('register',[JSON.stringify(f.message(0))],await killed('broker9d_exec')));assert.equal((await counts()).requests,'0');
      const id=await f.register();await assert.rejects(call('reserve',[id],await killed('broker9d_exec')));assert.equal((await counts()).attempts,'0');
      const observed=await executeBrokerAttempt(f.exec,id,'valid');await reconcile(await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2}));
      await assert.rejects(commitGuardedBrokerResult(await killed('broker9d_guard'),observed.id,observed.token));assert.equal((await counts()).results,'0');assert.equal((await f.row(observed.id)).attempt.usage_state,'CONFIRMED');
    });
    await group('database termination after dispatch and provider process death preserve durable ambiguity',async()=>{
      const requestId=await f.register(),child=await f.run({mode:'execute',requestId,fixture:'valid',pauseAt:'provider'});assert.equal(child.result.status,'PAUSED');
      const a=await f.row(child.result.id);assert.equal(a.attempt.may_have_escaped,true);assert.equal(a.attempt.usage_state,'UNKNOWN');
      await child.kill();await f.advance(61);assert.equal(await call('recover',[child.result.id]),true);
      const replacement=await f.run({mode:'execute',requestId,fixture:'valid'});assert.equal(replacement.result.status,'NOT_RESERVED');await replacement.exited;
      assert.equal((await counts()).attempts,'1');assert.equal((await counts()).results,'0');
      assert.equal(await reconcile(await f.receipt(child.result.id)),'ACCEPTED');assert.equal((await terminal(requestId)).status,'APPLIED');
    });
    await group('admission and send transaction outages preserve the exact durable dispatch boundary',async()=>{
      for(const timing of ['uncommitted','committed']){
        await f.reset();const a=await work();
        await disconnect('broker9d_exec',await expression('admit',[a.id,a.token]),timing);
        let row=(await f.row(a.id)).attempt;assert.equal(row.usage_state,timing==='committed'?'UNKNOWN':'RESERVED');assert.equal(row.send_at,null);
        if(timing==='uncommitted')assert.equal(await call('admit',[a.id,a.token]),true);
        await disconnect('broker9d_exec',await expression('begin_send',[a.id,a.token]),timing);
        row=(await f.row(a.id)).attempt;assert.equal(row.may_have_escaped,timing==='committed');assert.equal(row.usage_state,'UNKNOWN');
        assert.equal(await call('begin_send',[a.id,a.token]),timing!=='committed');
        assert.equal((await counts()).attempts,'1');
      }
    });
    await group('real connection failure during offline execution leaves send history and blocks unsafe retry',async()=>{
      for(const fault of ['send','provider']){
        await f.reset();const client=await f.connect(),requestId=await f.register(),pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await assert.rejects(executeBrokerAttempt(client,requestId,'valid',async phase=>{if(phase===fault)await f.b.query('SELECT pg_terminate_backend($1)',[pid]);}));
        const a=(await f.b.query('SELECT * FROM broker9d.attempts')).rows[0];assert.equal(a.usage_state,'UNKNOWN');assert.equal(a.may_have_escaped,true);assert.equal(await call('reserve',[requestId]),null);
      }
    });
    await group('real observation, receipt and guarded-result disconnects are atomically recoverable',async()=>{
      for(const timing of ['uncommitted','committed']){
        await f.reset();const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid'),row=await f.row(observed.id),response=row.attempt.response;
        // Preserve the independently obtained provider response while reverting
        // only fixture state to the pre-observation boundary.
        await f.b.query("UPDATE broker9d.attempts SET response=NULL,response_hash=NULL,status='DISPATCH_ADMITTED' WHERE id=$1",[observed.id]);
        await disconnect('broker9d_exec',await expression('observe',[observed.id,observed.token,response]),timing);
        assert.equal((await f.row(observed.id)).attempt.response!==null,timing==='committed');
        assert.equal(await call('observe',[observed.id,observed.token,response]),true);
        const receipt=await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2});
        await disconnect('broker9d_reconciler',await expression('reconcile',[receipt]),timing);
        assert.equal((await f.row(observed.id)).attempt.usage_state,timing==='committed'?'CONFIRMED':'UNKNOWN');
        assert.equal(await reconcile(receipt),timing==='committed'?'DUPLICATE':'ACCEPTED');
        const input=await call('guard_input',[observed.id,observed.token],f.guard),result=independentlyGuardBroker(input);
        await disconnect('broker9d_guard',await expression('commit_result',[observed.id,observed.token,result]),timing);
        assert.equal((await counts()).results,timing==='committed'?'1':'0');assert.equal(await call('commit_result',[observed.id,observed.token,result],f.guard),true);assert.equal((await counts()).results,'1');
      }
    });
    await group('stop and terminal operations survive transaction disconnects without deleting spending',async()=>{
      for(const timing of ['uncommitted','committed']){
        await f.reset();const a=await sent(),q=(await f.row(a.id)).request;
        await disconnect('broker9d_ops',await expression('operate',[randomUUID(),a.requestId,'TERMINATE',q.revision,'UNRESOLVED_PROVIDER']),timing);
        assert.equal((await f.row(a.id)).request.status,timing==='committed'?'TERMINAL':'DISPATCH_ADMITTED');assert.equal((await f.row(a.id)).attempt.usage_state,'UNKNOWN');
        if(timing==='uncommitted')await terminal(a.requestId);
        const revision=(await f.row(a.id)).request.revision;await disconnect('broker9d_ops',await expression('operate',[randomUUID(),a.requestId,'CLEAN',revision,'RETENTION_MINIMIZATION']),timing);
        assert.equal((await f.row(a.id)).request.cleaned,timing==='committed');assert.equal((await counts()).attempts,'1');
      }
    });
    await group('stop commit lost acknowledgement and ABA cannot revive a paused old process',async()=>{
      for(const timing of ['uncommitted','committed']){
        await f.reset();const a=await work(),c=(await f.b.query('SELECT generation FROM broker9d.control')).rows[0],operation=randomUUID();
        await disconnect('broker9d_ops',await expression('operate',[operation,null,'STOP',c.generation,'OPERATOR_STOP']),timing);
        assert.equal((await f.b.query('SELECT stopped FROM broker9d.control')).rows[0].stopped,timing==='committed');
        const outcome=await call('operate',[operation,null,'STOP',c.generation,'OPERATOR_STOP'],f.ops);assert.equal(outcome.status,'APPLIED');
        await f.control('RESUME');await f.control('STOP');await f.control('RESUME');assert.equal(await call('admit',[a.id,a.token]),false);
        const replacement=await f.run({mode:'execute',requestId:a.requestId,fixture:'valid'});assert.equal(replacement.result.status,'NOT_RESERVED');await replacement.exited;
      }
    });
    await group('real lock ordering: stop versus reconciliation; termination versus result and reservation',async()=>{
      const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid'),receipt=await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2});
      await f.b.query('BEGIN');await f.b.query('SELECT * FROM broker9d.control FOR UPDATE');
      const stopped=f.control('STOP'),accounted=reconcile(receipt);await new Promise(ok=>setTimeout(ok,50));await f.b.query('COMMIT');
      assert.equal((await stopped).status,'APPLIED');assert.equal(await accounted,'ACCEPTED');assert.equal(await call('guard_input',[observed.id,observed.token],f.guard),null);
      await f.reset();const second=await executeBrokerAttempt(f.exec,await f.register(),'valid');await reconcile(await f.receipt(second.id,{outcome:'SUCCESS',input:128,output:32,minor:2}));
      const input=await call('guard_input',[second.id,second.token],f.guard),result=independentlyGuardBroker(input);
      assert.equal((await terminal(input.requestId)).status,'APPLIED');assert.equal(await call('commit_result',[second.id,second.token,result],f.guard),false);
    });
    await group('actual guard connection loss after calculation preserves confirmed costs and permits one fresh guard',async()=>{
      const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid');await reconcile(await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2}));
      const prior=(await f.b.query("SELECT pid FROM pg_stat_activity WHERE usename='broker9d_guard'")).rows.map(row=>row.pid);
      const child=await f.run({mode:'guard',id:observed.id,token:observed.token,pauseAt:'guarded'});assert.equal(child.result.status,'PAUSED');
      const added=(await f.b.query("SELECT pid FROM pg_stat_activity WHERE usename='broker9d_guard'")).rows.filter(row=>!prior.includes(row.pid));assert.equal(added.length,1);
      assert.equal((await f.b.query('SELECT pg_terminate_backend($1) killed',[added[0].pid])).rows[0].killed,true);await child.kill();assert.equal((await counts()).results,'0');
      const restarted=await f.run({mode:'guard',id:observed.id,token:observed.token});assert.equal(restarted.result.status,'GUARDED_RESULT_COMMITTED');await restarted.exited;assert.equal((await counts()).results,'1');
    });
    await group('stop during an actual pending offline call preserves unknown cost and never claims cancellation',async()=>{
      for(const fault of ['STOP','CONNECTION_LOSS']){
        await f.reset();const client=await f.connect(),id=await f.register();let entered;const sending=new Promise(ok=>{entered=ok;});
        const pending=executeBrokerAttempt(client,id,'timeout',async phase=>{if(phase==='send')entered();});await sending;
        const pid=(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        assert.equal((await f.b.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].state,'idle');
        if(fault==='STOP'){await f.control('STOP');assert.equal((await pending).status,'OUTCOME_UNKNOWN');}
        else{await f.b.query('SELECT pg_terminate_backend($1)',[pid]);await assert.rejects(pending);}
        assert.equal((await counts()).results,'0');const attempt=(await f.b.query('SELECT * FROM broker9d.attempts')).rows[0];assert.equal(attempt.usage_state,'UNKNOWN');assert.equal(attempt.may_have_escaped,true);assert.equal(await call('reserve',[id]),null);
      }
    });
    await group('actual control lock barriers prove both stop/result commit linearization orders',async()=>{
      const gate=async(stopFirst)=>{
        await f.reset();const observed=await executeBrokerAttempt(f.exec,await f.register(),'valid');await reconcile(await f.receipt(observed.id,{outcome:'SUCCESS',input:128,output:32,minor:2}));
        const input=await call('guard_input',[observed.id,observed.token],f.guard),result=independentlyGuardBroker(input),ops=await f.connect('broker9d_ops'),guard=await f.connect('broker9d_guard');
        const opPid=(await ops.query('SELECT pg_backend_pid() pid')).rows[0].pid,guardPid=(await guard.query('SELECT pg_backend_pid() pid')).rows[0].pid,c=(await f.b.query('SELECT generation FROM broker9d.control')).rows[0];
        await f.b.query('BEGIN');await f.b.query('SELECT * FROM broker9d.control FOR UPDATE');
        const stop=()=>call('operate',[randomUUID(),null,'STOP',c.generation,'OPERATOR_STOP'],ops),commit=()=>call('commit_result',[observed.id,observed.token,result],guard);
        const first=stopFirst?stop():commit();await wait(async()=>(await f.b.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[stopFirst?opPid:guardPid])).rows[0]?.wait_event_type==='Lock');
        const second=stopFirst?commit():stop();await wait(async()=>(await f.b.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[stopFirst?guardPid:opPid])).rows[0]?.wait_event_type==='Lock');await f.b.query('COMMIT');
        const outcomes=await Promise.all([first,second]);assert.equal(stopFirst?outcomes[1]:outcomes[0],!stopFirst);assert.equal((await counts()).results,stopFirst?'0':'1');
      };
      await gate(true);await gate(false);
    });
    await group('real reservation/manual terminal races preserve compare-and-set and retained spending',async()=>{
      for(const terminateFirst of [true,false]){
        await f.reset();const id=await f.register(),exec=await f.connect(),ops=await f.connect('broker9d_ops'),ep=(await exec.query('SELECT pg_backend_pid() pid')).rows[0].pid,op=(await ops.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await f.b.query('BEGIN');await f.b.query('SELECT * FROM broker9d.control FOR UPDATE');
        const terminate=()=>call('operate',[randomUUID(),id,'TERMINATE',0,'UNRESOLVED_PROVIDER'],ops),reserve=()=>call('reserve',[id],exec);
        const first=terminateFirst?terminate():reserve();await wait(async()=>(await f.b.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[terminateFirst?op:ep])).rows[0]?.wait_event_type==='Lock');
        const second=terminateFirst?reserve():terminate();await wait(async()=>(await f.b.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[terminateFirst?ep:op])).rows[0]?.wait_event_type==='Lock');await f.b.query('COMMIT');
        const results=await Promise.all([first,second]);assert.equal(terminateFirst?results[0].status:results[1].status,terminateFirst?'APPLIED':'STALE');assert.equal((await counts()).attempts,terminateFirst?'0':'1');
        if(terminateFirst)assert.equal(results[1],null);else assert.equal((await f.row(results[0].id)).attempt.usage_state,'RESERVED');
      }
    });
    await group('two operations sessions serialize conflicting dispositions; stale lease cannot become current result',async()=>{
      const a=await sent(),other=await f.connect('broker9d_ops'),q=(await f.row(a.id)).request;
      const args=[randomUUID(),a.requestId,'TERMINATE',q.revision,'UNRESOLVED_PROVIDER'];
      const result=await Promise.all([call('operate',args,f.ops),call('operate',[randomUUID(),...args.slice(1)],other)]);assert.deepEqual(result.map(row=>row.status).sort(),['APPLIED','STALE']);
      assert.equal((await f.row(a.id)).attempt.usage_state,'UNKNOWN');await f.advance(61);
      assert.equal(await call('recover',[a.id]),false);assert.equal((await f.row(a.id)).request.status,'TERMINAL');assert.equal((await f.row(a.id)).attempt.usage_state,'UNKNOWN');
      const before=(await f.b.query('SELECT * FROM broker9d.configuration')).rows[0];await f.b.query('UPDATE broker9d.configuration SET minor_limit=minor_limit+5');
      assert.equal(await call('begin_send',[a.id,a.token]),false);assert.equal(await call('reserve',[a.requestId]),null);await f.b.query('UPDATE broker9d.configuration SET minor_limit=$1',[before.minor_limit]);
      await assert.rejects(f.b.query("UPDATE broker9d.control SET now_at='infinity'"),error=>error.code==='23514');
    });
    await group('multi-incident backlog retains unknown spending and progresses independently reconciled work',async()=>{
      assert.deepEqual([...new Set(f.payloads.map(row=>row.payload.snapshot.caseType))].sort(),['DRIVER_CANCELLATION','DRIVER_LATE','RIDER_CANCELLATION']);
      assert.equal(new Set(f.payloads.map(row=>row.payload.snapshot.bookingId)).size,4);assert.equal(f.payloads.length,5);
      const start=performance.now(),ids=await Promise.all([0,1,2,3].map(i=>f.register(i))),first=await sent();await call('unknown',[first.id,first.token]);
      const second=await call('reserve',[ids[1]]);assert.equal(await call('admit',[second.id,second.token]),false);
      assert.equal(await call('reserve',[ids[2]]),null);assert.equal((await f.row(second.id)).attempt.status,'RESERVED');
      await reconcile(await f.receipt(first.id));assert.equal(await call('admit',[second.id,second.token]),true);
      await call('begin_send',[second.id,second.token]);await reconcile(await f.receipt(second.id));
      const fourth=await executeBrokerAttempt(f.exec,ids[3],'valid');await reconcile(await f.receipt(fourth.id,{outcome:'SUCCESS',input:128,output:32,minor:2}));
      assert.equal((await commitGuardedBrokerResult(f.guard,fourth.id,fourth.token)).status,'GUARDED_RESULT_COMMITTED');
      const accounting=await call('accounting',[],f.ops);assert.equal(accounting.attempts,3);assert.equal(accounting.heldMinor,15);assert.equal(accounting.confirmedMinor,6);assert.equal(accounting.unknownMinor,0);
      witness.backlog={elapsedMs:performance.now()-start,registered:4,providerCalls:1,policy:'caller-selected; no fairness guarantee; budget denial is manual'};
    });
    const catalog=(await f.b.query("SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='broker9d' ORDER BY name")).rows;
    witness.catalog=catalog;witness.native=[];
    for(const routine of catalog){
      assert.equal(routine.owner,'broker9d_owner');assert.ok(routine.proconfig.includes('search_path=pg_catalog, broker9d, pg_temp'));
      const language=(await f.b.query('SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=$1::regprocedure',[routine.name])).rows[0].lanname;
      if(language==='plpgsql')witness.native.push({name:routine.name,metrics:(await f.b.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.name])).rows[0],statements:(await f.b.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.name])).rows});
    }
    await group('seeded SQL omissions break authenticated accounting and manual fences; exact catalog restored',async()=>{
      const probeReceipt=async(change)=>{await f.reset();const a=await sent();return reconcile(await change(a));};
      const signed=async(a,changes={},usage={outcome:'BILLED_FAILURE',input:128,output:32,minor:2})=>f.receipt(a.id,usage,randomUUID(),changes);
      witness.sqlMutations=await brokerSqlMutations(f.b,[
        {name:'receipt MAC omitted',routine:'reconcile',from:"receipt->>'mac' IS DISTINCT FROM encode(transport9d.hmac('offline-usage-v1'||chr(10)||transport9d.serialize(b),key,'sha256'),'hex')",to:'false',probe:async()=>await probeReceipt(async a=>({...await signed(a),mac:'0'.repeat(64)}))==='ACCEPTED'},
        {name:'pinned configuration omitted',routine:'reconcile',from:"b->>'configurationHash' IS DISTINCT FROM q.configuration_hash",to:'false',probe:async()=>await probeReceipt(a=>signed(a,{configurationHash:'0'.repeat(64)}))==='ACCEPTED'},
        {name:'dispatch identity omitted',routine:'reconcile',from:"b->>'dispatchId' IS DISTINCT FROM a.dispatch_id::text",to:'false',probe:async()=>await probeReceipt(a=>signed(a,{dispatchId:randomUUID()}))==='ACCEPTED'},
        {name:'request ownership omitted',routine:'reconcile',from:"b->>'requestId' IS DISTINCT FROM a.request_id::text",to:'false',probe:async()=>await probeReceipt(a=>signed(a,{requestId:randomUUID()}))==='ACCEPTED'},
        {name:'zero usage cannot erase physical dispatch',routine:'reconcile',from:"a.send_at IS NOT NULL OR (b->>'input')::bigint<>0",to:"(b->>'input')::bigint<>0",probe:async()=>await probeReceipt(a=>signed(a,{}, {outcome:'NO_DISPATCH',input:0,output:0,minor:0}))==='ACCEPTED'},
        {name:'manual expected version omitted',routine:'operate',from:'q.revision<>expected',to:'false',probe:async()=>{await f.reset();const id=await f.register();return (await call('operate',[randomUUID(),id,'TERMINATE',999,'UNRESOLVED_PROVIDER'],f.ops)).status==='APPLIED';}},
        {name:'terminal unsent lease expiry omitted',routine:'recover',from:'a.lease_until>c.now_at OR',to:'false OR',probe:async()=>{await f.reset();const a=await work();await terminal(a.requestId);return await call('recover',[a.id]);}},
        {name:'terminal admitted ambiguity fence omitted',routine:'recover',from:"a.status<>'RESERVED' OR a.admitted_at IS NOT NULL OR a.send_at IS NOT NULL",to:'false',probe:async()=>{await f.reset();const a=await sent();await terminal(a.requestId);await f.advance(61);return await call('recover',[a.id]);}},
        {name:'duplicate observation actor/token fence omitted',routine:'observe',from:'a.owner IS DISTINCT FROM session_user OR a.token IS DISTINCT FROM token',to:'false',probe:async()=>{await f.reset();const a=await executeBrokerAttempt(f.exec,await f.register(),'valid'),row=await f.row(a.id);return await call('observe',[a.id,randomUUID(),row.attempt.response]);}},
        {name:'manual immutable arguments omitted',routine:'operate',from:'o.arguments_hash=h',to:'true',probe:async()=>{await f.reset();const id=await f.register(),op=randomUUID();await call('operate',[op,id,'TERMINATE',0,'UNRESOLVED_PROVIDER'],f.ops);return (await call('operate',[op,id,'TERMINATE',0,'EXHAUSTED'],f.ops)).status==='APPLIED';}}
      ]);
    });
    witness.accountingSemantics='full worst-case hold retained for confirmed consumption; only proven unsent reservations released';

  }finally{await f.close();await writeFile(join(process.env.PHASE9D_BROKER_OUTPUT,'recovery-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});}
});
test('actual owned PostgreSQL restart retains unknown work and forbids a second dispatch',async()=>{
  assert.ok(restartPayload);const database='rcs_verify_'+randomUUID().replaceAll('-',''),base=testDatabaseUrl(),owner=new pg.Client({connectionString:base.toString()}),clients=[];
  const uri=(role,password)=>{const url=new URL(base);url.pathname='/'+database;if(role){url.username=role;url.password=password;}return url.toString();};
  let created=false;await owner.connect();
  try{
    assert.match(database,/^rcs_verify_[a-f0-9]{32}$/);await owner.query('CREATE DATABASE "'+database+'" TEMPLATE template0');created=true;
    const admin=new pg.Client({connectionString:uri()});await admin.connect();clients.push(admin);
    for(const name of ['permissions.sql','transport-receiver.sql','broker.sql','broker-recovery.sql'])await admin.query((await readFile(new URL('../../../tools/phase9d/'+name,import.meta.url),'utf8')).replace(/^CREATE ROLE .*;\r?\n/gm,''));
    await admin.query('INSERT INTO transport9d.configuration VALUES(true,$1,$2)',[randomUUID(),'synthetic-restart-receipt-secret-at-least-32']);
    const usageKey=randomUUID()+randomUUID();await admin.query('INSERT INTO broker9d.usage_authority VALUES($1,$2)',['offline-issuer-v1',usageKey]);
    await admin.query('UPDATE shadow9d.control SET stopped=false');await admin.query('UPDATE broker9d.control SET stopped=false');
    const received=(await admin.query('SELECT transport9d.receive($1) value',[restartPayload])).rows[0].value;
    const requestId=(await admin.query('SELECT broker9d.register($1) value',[{protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:received.body.receipt,payload:restartPayload}])).rows[0].value;
    const passwords={};for(const role of ['broker9d_exec','broker9d_ops','broker9d_reconciler']){passwords[role]=randomUUID();await admin.query((await admin.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,passwords[role]])).rows[0].command);}
    const exec=new pg.Client({connectionString:uri('broker9d_exec',passwords.broker9d_exec)});await exec.connect();clients.push(exec);
    const work=await brokerCall(exec,'reserve',[requestId]);assert.ok(work);await brokerCall(exec,'admit',[work.id,work.token]);await brokerCall(exec,'begin_send',[work.id,work.token]);await brokerCall(exec,'unknown',[work.id,work.token]);
    const before=(await admin.query('SELECT to_jsonb(a) attempt,to_jsonb(q) request FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id')).rows;
    // Close all fixture/control connections before restarting the actual server.
    await Promise.all(clients.map(client=>client.end()));clients.length=0;await owner.end();
    assert.equal(typeof process.send,'function');const restarted=new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('owned restart deadline')),30000);const receive=message=>{if(message?.type==='OWNED_RECOVERY_DATABASE_RESTARTED'){clearTimeout(timer);process.off('message',receive);ok(message);}};process.on('message',receive);});
    process.send({type:'OWNED_RECOVERY_DATABASE_RESTART'});const restart=await restarted;assert.equal(restart.code,0);base.port=String(restart.port);
    const inspector=new pg.Client({connectionString:uri()});await inspector.connect();clients.push(inspector);
    assert.deepEqual((await inspector.query('SELECT to_jsonb(a) attempt,to_jsonb(q) request FROM broker9d.attempts a JOIN broker9d.requests q ON q.id=a.request_id')).rows,before);
    const replacement=new pg.Client({connectionString:uri('broker9d_exec',passwords.broker9d_exec)});await replacement.connect();clients.push(replacement);assert.equal(await brokerCall(replacement,'reserve',[requestId]),null);
    const reconciler=new pg.Client({connectionString:uri('broker9d_reconciler',passwords.broker9d_reconciler)});await reconciler.connect();clients.push(reconciler);
    const old=before[0],receipt=issueOfflineUsage({receiptId:randomUUID(),requestId,attemptId:old.attempt.id,dispatchId:old.attempt.dispatch_id,configurationHash:old.request.configuration_hash,generation:String(old.attempt.generation),responseHash:null},{outcome:'BILLED_FAILURE',input:128,output:32,minor:2},usageKey);
    assert.equal(await brokerCall(reconciler,'reconcile',[JSON.stringify(receipt)]),'ACCEPTED');assert.equal(await brokerCall(reconciler,'reconcile',[JSON.stringify(receipt)]),'DUPLICATE');
    assert.equal((await inspector.query('SELECT usage_state FROM broker9d.attempts')).rows[0].usage_state,'CONFIRMED');assert.equal(await brokerCall(replacement,'reserve',[requestId]),null);
    assert.equal((await inspector.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,0);
    await writeFile(join(process.env.PHASE9D_BROKER_OUTPUT,'database-restart-'+randomUUID()+'.json'),JSON.stringify({status:'PASS',method:'parent-owned Docker PostgreSQL restart',before,after:before,unknownPreserved:true,lateAuthenticatedReceiptAccepted:true,usageAfterReconciliation:'CONFIRMED',unsafeRetryDenied:true,providerCancellationClaimed:false,applicationTables:'absent from this bare receiver database'},null,2),{flag:'wx'});
  }finally{
    await Promise.allSettled(clients.map(client=>client.end()));await owner.end();
    if(created){assert.match(database,/^rcs_verify_[a-f0-9]{32}$/);const cleanup=new pg.Client({connectionString:base.toString()});await cleanup.connect();try{await cleanup.query('DROP DATABASE "'+database+'" WITH (FORCE)');}finally{await cleanup.end();}}
    if(process.connected)process.disconnect();
  }
});
