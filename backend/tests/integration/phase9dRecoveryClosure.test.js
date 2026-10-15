import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {recoveryFixture} from '../helpers/phase9dRecoveryFixture.js';
import {recoveryAction} from '../helpers/phase9dRecoveryActions.js';
import {brokerCall,executeBrokerAttempt} from '../../../tools/phase9d/broker-execution.mjs';
import {commitGuardedBrokerResult,independentlyGuardBroker} from '../../../tools/phase9d/broker-guard.mjs';
import {enqueueResponsibilityShadowEvidence} from '../../services/responsibilityShadowRepository.js';
import {transportProcess} from '../helpers/phase9dTransportProcesses.js';
import {EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';

test('complete isolated recovery acceptance: controlled races, terminal matrix and backlog',async t=>{
  const f=await recoveryFixture(6),actions=[],witness={schema:'recovery-acceptance-closure-v1',groups:[],races:[],terminal:[],backlog:null};
  const originalRegister=f.register;f.register=(index=0,client=f.exec)=>originalRegister(index,client);
  const call=(name,args,client=f.exec)=>brokerCall(client,name,args);
  const config=(await f.b.query('SELECT * FROM broker9d.configuration')).rows[0];
  const reset=async()=>{for(const action of actions.splice(0))await action.stop();await f.reset();await f.b.query('UPDATE broker9d.configuration SET max_attempts=$1,max_requests=$2,max_concurrent=$3,max_inflight=$4,input_reserve=$5,output_reserve=$6,minor_reserve=$7,input_limit=$8,output_limit=$9,minor_limit=$10',[config.max_attempts,config.max_requests,config.max_concurrent,config.max_inflight,config.input_reserve,config.output_reserve,config.minor_reserve,config.input_limit,config.output_limit,config.minor_limit]);};
  const group=(name,body)=>t.test(name,async()=>{await reset();await body();await f.unchanged();witness.groups.push(name);});
  const processAction=async(role,routine,args)=>{const action=await recoveryAction(f,role,routine,args);actions.push(action);return action;};
  const work=async(i=0)=>{const id=await f.register(i),a=await call('reserve',[id]);assert.ok(a);return {...a,requestId:id};};
  const sent=async(i=0)=>{const a=await work(i);assert.equal(await call('admit',[a.id,a.token]),true);assert.equal(await call('begin_send',[a.id,a.token]),true);return a;};
  const observed=async(i=0)=>{const result=await executeBrokerAttempt(f.exec,await f.register(i),'valid');assert.equal(result.status,'RESPONSE_OBSERVED');return result;};
  const account=(a,usage={outcome:'SUCCESS',input:128,output:32,minor:2})=>f.receipt(a.id,usage);
  const reconcile=async receipt=>call('reconcile',[JSON.stringify(receipt)],f.reconciler);
  const operation=async(action,target=null,reason)=>{const c=(await f.b.query('SELECT generation FROM broker9d.control')).rows[0],q=target?(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[target])).rows[0]:null;return [randomUUID(),target,action,q?.revision??c.generation,reason??({STOP:'OPERATOR_STOP',RESUME:'OPERATOR_RESUME',TERMINATE:'UNRESOLVED_PROVIDER',CLEAN:'RETENTION_MINIMIZATION'})[action]];};
  const wait=async predicate=>{const deadline=Date.now()+10000;while(!await predicate()){assert.ok(Date.now()<deadline,'actual PostgreSQL lock barrier');await new Promise(ok=>setTimeout(ok,10));}};
  const locked=pid=>wait(async()=>(await f.b.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock');
  const race=async(label,first,second)=>{
    await f.b.query('BEGIN');await f.b.query('SELECT * FROM broker9d.control FOR UPDATE');
    try{first.start();await locked(first.pid);second.start();await locked(second.pid);await f.b.query('COMMIT');}
    catch(error){await f.b.query('ROLLBACK');throw error;}
    const replies=await Promise.all([first.finished,second.finished]);for(const reply of replies)assert.equal(reply.status,'DONE');
    for(const p of [first,second])assert.equal((await p.exited).code,0);
    witness.races.push({label,pids:[first.pid,second.pid],processIds:[first.child.pid,second.child.pid],values:replies.map(reply=>reply.value)});return replies.map(reply=>reply.value);
  };
  try{
    await group('two independently connected reconciler processes deduplicate exact signed receipts',async()=>{
      const a=await observed(),receipt=await account(a),one=await processAction('broker9d_reconciler','reconcile',[JSON.stringify(receipt)]),two=await processAction('broker9d_reconciler','reconcile',[JSON.stringify(receipt)]);
      assert.notEqual(one.pid,two.pid);assert.deepEqual((await race('receipt / duplicate receipt',one,two)).sort(),['ACCEPTED','DUPLICATE']);
      assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.usage_receipts')).rows[0].n,1);
    });
    for(const name of ['reserve','begin_send','observe'])for(const stopFirst of [true,false])await group(`stop versus ${name}: ${stopFirst?'stop':'action'} commits first`,async()=>{
      let args;if(name==='reserve')args=[await f.register()];
      else if(name==='begin_send'){const a=await work();await call('admit',[a.id,a.token]);args=[a.id,a.token];}
      else{const a=await observed();const row=await f.row(a.id);await f.b.query("UPDATE broker9d.attempts SET response=NULL,response_hash=NULL,status='DISPATCH_ADMITTED' WHERE id=$1",[a.id]);args=[a.id,a.token,row.attempt.response];}
      const stop=await processAction('broker9d_ops','operate',await operation('STOP')),act=await processAction('broker9d_exec',name,args);
      const values=await race(`stop / ${name} / ${stopFirst}`,stopFirst?stop:act,stopFirst?act:stop),value=values[stopFirst?1:0];
      if(name==='reserve')assert.equal(Boolean(value),!stopFirst);else if(name==='begin_send')assert.equal(value,!stopFirst);else assert.equal(value,true);
      assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,0);
    });
    for(const stopFirst of [true,false])await group(`stop versus signed accounting: ${stopFirst?'stop':'receipt'} commits first`,async()=>{
      const a=await observed(),stop=await processAction('broker9d_ops','operate',await operation('STOP')),receipt=await processAction('broker9d_reconciler','reconcile',[JSON.stringify(await account(a))]);
      const values=await race(`stop / reconcile / ${stopFirst}`,stopFirst?stop:receipt,stopFirst?receipt:stop);assert.equal(values[stopFirst?1:0],'ACCEPTED');
      assert.equal((await f.row(a.id)).attempt.usage_state,'CONFIRMED');assert.equal(await call('guard_input',[a.id,a.token],f.guard),null);
    });
    for(const receiptFirst of [true,false])await group(`conflicting receipt versus result: ${receiptFirst?'receipt':'result'} commits first`,async()=>{
      const a=await observed();await reconcile(await account(a));const input=await call('guard_input',[a.id,a.token],f.guard),result=independentlyGuardBroker(input);
      const receipt=await processAction('broker9d_reconciler','reconcile',[JSON.stringify(await account(a,{outcome:'SUCCESS',input:128,output:32,minor:3}))]),guard=await processAction('broker9d_guard','commit_result',[a.id,a.token,result]);
      const values=await race(`conflict / result / ${receiptFirst}`,receiptFirst?receipt:guard,receiptFirst?guard:receipt);
      assert.equal(values[receiptFirst?0:1],'CONFLICT');assert.equal(values[receiptFirst?1:0],!receiptFirst);
      assert.equal((await f.row(a.id)).attempt.usage_conflict,true);assert.equal((await call('accounting',[],f.ops)).disputedMinor,5);
    });
    for(const terminalFirst of [true,false])await group(`manual terminal versus pending result: ${terminalFirst?'terminal':'result'} commits first`,async()=>{
      const a=await observed();await reconcile(await account(a));const input=await call('guard_input',[a.id,a.token],f.guard),result=independentlyGuardBroker(input);
      const terminal=await processAction('broker9d_ops','operate',await operation('TERMINATE',input.requestId)),guard=await processAction('broker9d_guard','commit_result',[a.id,a.token,result]);
      const values=await race(`terminal / result / ${terminalFirst}`,terminalFirst?terminal:guard,terminalFirst?guard:terminal);
      assert.equal(values[terminalFirst?1:0],!terminalFirst);assert.equal(values[terminalFirst?0:1].status,terminalFirst?'APPLIED':'STALE');
    });
    for(const terminalFirst of [true,false])await group(`manual terminal versus expired unsent recovery: ${terminalFirst?'terminal':'recovery'} commits first`,async()=>{
      const a=await work();await f.advance(61);const terminal=await processAction('broker9d_ops','operate',await operation('TERMINATE',a.requestId)),recover=await processAction('broker9d_exec','recover',[a.id]);
      const values=await race(`terminal / recovery / ${terminalFirst}`,terminalFirst?terminal:recover,terminalFirst?recover:terminal);assert.equal(values[terminalFirst?1:0],true);
      assert.equal(values[terminalFirst?0:1].status,terminalFirst?'APPLIED':'STALE');assert.equal((await f.row(a.id)).attempt.usage_state,'RELEASED');
    });
    for(const expiryFirst of [true,false])await group(`lease expiry versus late observation: ${expiryFirst?'expiry':'observation'} commits first`,async()=>{
      const a=await observed(),row=await f.row(a.id);await f.b.query("UPDATE broker9d.attempts SET response=NULL,response_hash=NULL,status='DISPATCH_ADMITTED' WHERE id=$1",[a.id]);
      const act=await processAction('broker9d_exec','observe',[a.id,a.token,row.attempt.response]);
      await f.b.query('BEGIN');await f.b.query('SELECT * FROM broker9d.control FOR UPDATE');act.start();await locked(act.pid);
      if(expiryFirst)await f.b.query("UPDATE broker9d.control SET now_at=now_at+interval '61 seconds'");await f.b.query('COMMIT');
      assert.equal((await act.finished).value,true);await act.exited;if(!expiryFirst)await f.advance(61);
      await reconcile(await account(a));assert.equal(await call('guard_input',[a.id,a.token],f.guard),null);assert.equal((await f.row(a.id)).attempt.usage_state,'CONFIRMED');
      witness.races.push({label:`expiry / observation / ${expiryFirst}`,pid:act.pid});
    });
    await group('a late old-generation receipt cannot borrow a new-generation result authority',async()=>{
      const old=await observed();await f.control('STOP');await f.control('RESUME');
      const current=await observed(1);await reconcile(await account(current));assert.equal((await commitGuardedBrokerResult(f.guard,current.id,current.token)).status,'GUARDED_RESULT_COMMITTED');
      assert.equal(await reconcile(await account(old)),'ACCEPTED');assert.equal(await call('guard_input',[old.id,old.token],f.guard),null);
      assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,1);assert.equal((await f.row(old.id)).attempt.usage_state,'CONFIRMED');
    });
    await group('a new broker process immediately after committed stop makes no provider call',async()=>{
      const id=await f.register(),child=await f.run({mode:'execute',requestId:id,fixture:'valid',pauseAt:'reserved'});assert.equal(child.result.status,'PAUSED');
      await f.control('STOP');await child.kill();const replacement=await f.run({mode:'execute',requestId:id,fixture:'valid'});assert.equal(replacement.result.status,'NOT_RESERVED');assert.equal(replacement.result.calls,0);await replacement.exited;
      assert.equal((await f.row(child.result.id)).attempt.send_at,null);witness.races.push({label:'stop commit / actual broker replacement',providerCalls:0});
    });
    for(const kind of ['GUARDED_RESULT_COMMITTED','MANUAL_REVIEW','EXHAUSTED','STOPPED','UNKNOWN'])await group(`terminal retention: ${kind}, stale process and late duplicate after cleanup`,async()=>{
      let a;if(kind==='GUARDED_RESULT_COMMITTED'){a=await observed();await reconcile(await account(a));assert.equal((await commitGuardedBrokerResult(f.guard,a.id,a.token)).status,'GUARDED_RESULT_COMMITTED');a.requestId=(await f.row(a.id)).request.id;}
      else if(kind==='EXHAUSTED'){a=await work();await f.advance(61);await call('recover',[a.id]);a=await work();await f.advance(61);await call('recover',[a.id]);assert.equal((await f.row(a.id)).request.status,'MANUAL_REVIEW');}
      else if(kind==='MANUAL_REVIEW'){await f.b.query('UPDATE broker9d.configuration SET minor_limit=minor_reserve');const id=await f.register();await sent(1);assert.equal(await call('reserve',[id]),null);assert.equal((await f.b.query('SELECT status FROM broker9d.requests WHERE id=$1',[id])).rows[0].status,'MANUAL_REVIEW');a={requestId:id};}
      else{a=await sent();if(kind==='STOPPED')await f.control('STOP');}
      const before=(await call('accounting',[],f.ops)).heldMinor;if(kind!=='GUARDED_RESULT_COMMITTED')assert.equal((await call('operate',await operation('TERMINATE',a.requestId),f.ops)).status,'APPLIED');
      assert.equal((await call('operate',await operation('CLEAN',a.requestId),f.ops)).status,'APPLIED');
      const child=await f.run({mode:'execute',requestId:a.requestId,fixture:'valid'});assert.equal(child.result.status,'NOT_RESERVED');assert.equal(child.result.calls,0);await child.exited;
      assert.equal(await f.register(),a.requestId);assert.equal((await call('accounting',[],f.ops)).heldMinor,before);
      if(['STOPPED','UNKNOWN'].includes(kind)){const receipt=await account(a,{outcome:'BILLED_FAILURE',input:128,output:32,minor:2});assert.equal(await reconcile(receipt),'ACCEPTED');assert.equal(await reconcile(receipt),'DUPLICATE');}
      witness.terminal.push({kind,staleProcessCalls:0,heldMinor:before});
    });
    await group('competing broker processes and varied fast/slow reservations recover a mixed backlog',async()=>{
      await f.b.query('UPDATE broker9d.configuration SET max_concurrent=2,max_inflight=2,max_requests=20');
      const ids=await Promise.all([0,1,2,3].map(i=>f.register(i))),start=performance.now(),initialQueue=await call('accounting',[],f.ops);assert.equal(initialQueue.backlog,4);assert.ok(initialQueue.oldestPending);
      const children=await Promise.all(ids.map(requestId=>f.run({mode:'execute',requestId,fixture:'valid',pauseAt:'admitted'})));
      const admitted=children.filter(child=>child.result.status==='PAUSED');assert.equal(admitted.length,2);assert.equal(children.filter(child=>child.result.status==='NOT_RESERVED').length,2);
      for(const child of admitted)await child.kill();await f.advance(61);
      const lostPid=(await f.exec.query('SELECT pg_backend_pid() pid')).rows[0].pid;await f.b.query('SELECT pg_terminate_backend($1)',[lostPid]);
      await assert.rejects(f.exec.query('SELECT 1'));f.exec=await f.connect('broker9d_exec');
      for(const child of admitted){await call('recover',[child.result.id]);assert.equal(await call('reserve',[(await f.row(child.result.id)).request.id]),null);await reconcile(await account(child.result,{outcome:'NO_DISPATCH',input:0,output:0,minor:0}));}
      // New future requests bind their own complete configuration; old attempts
      // retain their own reservation values and configuration hash.
      await f.b.query('UPDATE broker9d.configuration SET input_reserve=512,output_reserve=128,minor_reserve=3');
      const fast=await executeBrokerAttempt(f.exec,await f.register(4),'valid');await reconcile(await account(fast));await commitGuardedBrokerResult(f.guard,fast.id,fast.token);
      const slowStart=performance.now(),slow=await executeBrokerAttempt(f.exec,await f.register(5),'valid',async phase=>{if(phase==='send')await new Promise(ok=>setTimeout(ok,160));});await reconcile(await account(slow));await commitGuardedBrokerResult(f.guard,slow.id,slow.token);
      const accounting=await call('accounting',[],f.ops),attempts=(await f.b.query('SELECT minor_reserved,usage_state FROM broker9d.attempts ORDER BY minor_reserved')).rows;
      assert.deepEqual(attempts.map(a=>Number(a.minor_reserved)),[3,3,5,5]);assert.equal(accounting.confirmedMinor,4);assert.equal(accounting.heldMinor,6);assert.ok(performance.now()-slowStart>=150);
      const elapsedMs=performance.now()-start;
      witness.backlog={elapsedMs,slowMs:performance.now()-slowStart,completedPerSecond:2/(elapsedMs/1000),registered:6,physicalProcesses:children.length,providerCalls:2,connectionOutageRecovered:true,initialQueue,accounting,attempts,policy:'caller-selected; budget denial becomes MANUAL_REVIEW; no ordering or starvation bound; operators must address denied work'};
    });
    await group('different immutable evidence versions and unsupported-family source share an isolated export backlog',async()=>{
      const source=(await f.source.client.responsibilityAdjudicationWork.findFirst({include:{evidenceVersion:true}})),snapshot=structuredClone(source.evidenceVersion.snapshot);
      snapshot.generatedAt='2026-10-13T00:01:00.000Z';snapshot.timeline.push({...snapshot.timeline[0],id:'ev_9999',category:'notification',kind:'synthetic_later_observation',value:{unavailable:true},availability:'unknown'});
      const version=await enqueueResponsibilityShadowEvidence(snapshot,{db:f.source.client});assert.notEqual(version.work.id,source.id);
      // Unsupported family is an explicitly synthetic stored fixture, not a
      // fabricated production detector or financial disposition.
      const other=(await f.source.client.responsibilityAdjudicationWork.findFirst({where:{caseId:{not:source.caseId}},include:{evidenceVersion:true}}));await f.source.client.responsibilityCase.update({where:{id:other.caseId},data:{caseType:'FAILED_PICKUP'}});
      const unsupported=structuredClone(other.evidenceVersion.snapshot);unsupported.caseType='FAILED_PICKUP';unsupported.generatedAt='2026-10-13T00:01:01.000Z';await enqueueResponsibilityShadowEvidence(unsupported,{db:f.source.client});
      const requestKey='synthetic-recovery-request-key-at-least-thirty-two',receiver=await transportProcess({mode:'receiver',connectionString:f.uri(f.receiver.name,'shadow9d_capture'),requestKey});
      try{const sender=await transportProcess({mode:'sender',connectionString:f.uri(f.source.name,'shadow9d_exporter'),privacyKey:EXPORT_TEST_KEY,requestKey,endpoint:`http://127.0.0.1:${receiver.result.port}/v1/shadow/deliveries`});assert.equal(sender.result.status,'ACKED');await sender.exited;}
      finally{await receiver.kill();}
      const rejected=(await f.a.query("SELECT failure FROM outbox9d.deliveries WHERE failure='UNSUPPORTED_FAMILY'")).rows;assert.ok(rejected.length>=1);
      const delivered=(await f.a.query('SELECT d.payload,r.receipt FROM outbox9d.deliveries d JOIN outbox9d.remote_receipts r ON r.delivery_id=d.id WHERE d.source_work_id=$1',[version.work.id])).rows[0];assert.ok(delivered);
      const message={protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:delivered.receipt.body.receipt,payload:delivered.payload};const id=await call('register',[message]);assert.ok(id);assert.equal(await call('register',[message]),id);assert.notEqual(id,await f.register());
      const prior=(await f.a.query('SELECT d.payload,r.receipt FROM outbox9d.deliveries d JOIN outbox9d.remote_receipts r ON r.delivery_id=d.id WHERE d.source_work_id=$1',[source.id])).rows[0];
      assert.equal(prior.payload.snapshot.caseId,delivered.payload.snapshot.caseId);assert.notEqual(prior.payload.evidenceHash,delivered.payload.evidenceHash);
      const priorId=await call('register',[{protocol:'broker-request-v1',configuration:'offline-broker-v1',receipt:prior.receipt.body.receipt,payload:prior.payload}]);assert.notEqual(priorId,id);
      for(const requestId of [priorId,id]){const result=await executeBrokerAttempt(f.exec,requestId,'valid');assert.equal(result.status,'RESPONSE_OBSERVED');await reconcile(await account(result));assert.equal((await commitGuardedBrokerResult(f.guard,result.id,result.token)).status,'GUARDED_RESULT_COMMITTED');}
      assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,2);
      witness.versions={sameCaseDifferentHash:true,unsupportedSourceHeld:true,newVersionRegistered:true,distinctGuardedResults:2};
    });
  }finally{for(const action of actions)await action.stop();await f.close();await writeFile(join(process.env.PHASE9D_BROKER_OUTPUT,'recovery-closure-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});}
});
