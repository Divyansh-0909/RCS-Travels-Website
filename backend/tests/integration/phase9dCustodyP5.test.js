import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {recoveryFixture} from '../helpers/phase9dRecoveryFixture.js';
import {recoveryAction} from '../helpers/phase9dRecoveryActions.js';
import {p5Catalog,p5Native} from '../helpers/phase9dP5Profile.js';
import {brokerCall,executeBrokerAttempt} from '../../../tools/phase9d/broker-execution.mjs';
import {independentlyGuardBroker} from '../../../tools/phase9d/broker-guard.mjs';
import {createJevV5ResponsibilityAnalyst} from '../../services/responsibilityJevV5.js';
import {offlineResponse,offlineUsage} from '../../../tools/phase9d/broker-offline.mjs';
test('P5 composed broker lease generation and durable accounting',async t=>{
  const f=await recoveryFixture(3),actions=[],profiling=process.env.CUSTODY_SQL_MODE==='p5-profile';
  const witness={schema:'phase9d-p5-state-accounting-v1',profiling,groups:[],accounting:[],races:[],fakeAnalystCalls:0,liveCalls:0,routineReplacementOperations:0};
  const call=(name,args=[],client=f.exec)=>brokerCall(client,name,args);
  const state=async()=>{const result={};for(const table of ['control','requests','attempts','results','events','usage_receipts','operations'])result[table]=(await f.b.query('SELECT to_jsonb(t) row FROM broker9d.'+table+' t ORDER BY to_jsonb(t)::text')).rows;return result;};
  const cfg=(await f.b.query('SELECT * FROM broker9d.configuration')).rows[0];
  const restore=()=>f.b.query('UPDATE broker9d.configuration SET max_requests=$1,max_concurrent=$2,input_limit=$3,output_limit=$4,minor_limit=$5',[cfg.max_requests,cfg.max_concurrent,cfg.input_limit,cfg.output_limit,cfg.minor_limit]);
  const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await restore();await f.reset();await fn();await f.unchanged();witness.groups.push(name);}catch(error){failure=error;throw error;}finally{await restore();}});if(failure)throw failure;};
  const reserve=async(index=0)=>{const requestId=await f.register(index),a=await call('reserve',[requestId]);assert.ok(a);return {...a,requestId};};
  const sent=async(index=0)=>{const a=await reserve(index);assert.equal(await call('admit',[a.id,a.token]),true);assert.equal(await call('begin_send',[a.id,a.token]),true);return a;};
  const observed=async(index=0)=>{const a=await executeBrokerAttempt(f.exec,await f.register(index),'valid');witness.fakeAnalystCalls+=a.calls;assert.equal(a.status,'RESPONSE_OBSERVED');return {...a,requestId:(await f.row(a.id)).request.id};};
  const reconcile=async receipt=>call('reconcile',[JSON.stringify(receipt)],f.reconciler);
  const usage=(a,values={outcome:'SUCCESS',input:128,output:32,minor:2},changes={})=>f.receipt(a.id,values,randomUUID(),changes);
  const accounting=async label=>{const value=await call('accounting',[],f.ops);witness.accounting.push({label,value});return value;};
  const operate=async(action,target=null,reason)=>{const expected=target?(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[target])).rows[0].revision:(await f.b.query('SELECT generation FROM broker9d.control')).rows[0].generation;return call('operate',[randomUUID(),target,action,expected,reason??({STOP:'OPERATOR_STOP',RESUME:'OPERATOR_RESUME',TERMINATE:'UNRESOLVED_PROVIDER',CLEAN:'RETENTION_MINIMIZATION'}[action])],f.ops);};
  try{
    witness.catalogBefore=await p5Catalog(f.b);witness.configurationBefore=cfg;
    assert.equal((await f.b.query("SELECT current_setting('plpgsql_check.profiler') enabled")).rows[0].enabled,profiling?'on':'off');
    witness.runtime=(await f.b.query("SELECT current_setting('server_version') version,(SELECT extversion FROM pg_extension WHERE extname='plpgsql_check') profiler_version")).rows[0];
    if(profiling)await f.b.query('SELECT plpgsql_profiler_reset_all()');
    await check('composed catalog private aliases and retired service stop entry point',async()=>{
      for(const [client,sql]of [[f.ops,'SELECT broker9d.set_stop(true)'],[f.exec,'SELECT broker9d.register_before_recovery(null)'],[f.exec,'SELECT broker9d.observe_before_recovery(null,null,null)'],[f.exec,'SELECT broker9d.recover_before_recovery(null)'],[f.exec,'SELECT broker9d.allowed_before_recovery(null,null,null)']])await assert.rejects(client.query(sql),{code:'42501'});
      assert.equal((await f.exec.query('SELECT session_user actor')).rows[0].actor,'broker9d_exec');assert.equal((await f.reconciler.query('SELECT session_user actor')).rows[0].actor,'broker9d_reconciler');
      // Explicit owner-only legacy witness; does not expose a service API.
      await f.b.query('BEGIN');try{await f.b.query('SELECT broker9d.set_stop(true)');await f.b.query('SELECT broker9d.set_stop(false)');}finally{await f.b.query('ROLLBACK');}
    });
    await check('registration shape binding exact duplicate and immutable conflict',async()=>{
      for(const m of [null,{}, {...f.message(0),protocol:'other'},{...f.message(0),receipt:randomUUID()}])assert.equal(await call('register',[JSON.stringify(m)]),null);
      const id=await f.register();assert.equal(await f.register(),id);
      const before=await state();assert.equal(await call('register',[JSON.stringify({...f.message(0),payload:{...f.message(0).payload,evidenceHash:'0'.repeat(64)}})]),null);assert.deepEqual(await state(),before);
      // An owner-created inconsistent retained binding independently reaches the
      // existing-key conflict arm, without modifying the approved configuration.
      await f.b.query("UPDATE broker9d.requests SET binding=repeat('0',64) WHERE id=$1",[id]);assert.equal(await f.register(),null);
    });
    await check('current tokens expired unsent leases and maximum attempt count',async()=>{
      const a=await reserve();for(const token of [randomUUID(),null]){const before=await state();assert.equal(await call('admit',[a.id,token]),false);assert.deepEqual(await state(),before);}
      assert.equal(await call('recover',[a.id]),false);assert.equal(await call('recover',[randomUUID()]),false);await f.advance(61);assert.equal(await call('admit',[a.id,a.token]),false);assert.equal(await call('recover',[a.id]),true);
      const b=await call('reserve',[a.requestId]);assert.ok(b);assert.notEqual(b.token,a.token);assert.equal(await call('begin_send',[a.id,a.token]),false);await f.advance(61);assert.equal(await call('recover',[b.id]),true);assert.equal(await call('reserve',[a.requestId]),null);
      const q=(await f.row(b.id)).request;assert.equal(q.status,'MANUAL_REVIEW');const costs=await accounting('released-unsent-attempt-limit');assert.equal(costs.attempts,2);assert.equal(costs.heldMinor,0);assert.equal(costs.lifetimeMinorReserved,10);
    });
    await check('stop before admission after admission and resume never revives old generation',async()=>{
      const a=await reserve();await operate('STOP');assert.equal(await call('admit',[a.id,a.token]),false);await operate('RESUME');assert.equal(await call('admit',[a.id,a.token]),false);
      const b=await reserve(1);assert.equal(await call('admit',[b.id,b.token]),true);await operate('STOP');assert.equal(await call('begin_send',[b.id,b.token]),false);await operate('RESUME');assert.equal(await call('begin_send',[b.id,b.token]),false);
      assert.equal((await f.row(b.id)).attempt.usage_state,'UNKNOWN');assert.equal((await accounting('stopped-admitted-hold')).unknownMinor,5);
    });
    await check('unknown dispatched outcome is retained spending and cannot be retried',async()=>{
      const a=await sent();assert.equal(await call('begin_send',[a.id,a.token]),false);assert.equal(await call('unknown',[a.id,randomUUID()]),false);assert.equal(await call('unknown',[a.id,a.token]),true);assert.equal(await call('unknown',[a.id,a.token]),false);
      await f.advance(61);assert.equal(await call('recover',[a.id]),false);assert.equal(await call('reserve',[a.requestId]),null);const costs=await accounting('unknown-is-not-zero');assert.equal(costs.unknownMinor,5);assert.equal(costs.heldMinor,5);assert.equal(costs.confirmedMinor,0);assert.equal((await f.row(a.id)).attempt.minor_used,null);
      await f.reset();const b=await reserve(1);assert.equal(await call('admit',[b.id,b.token]),true);await f.advance(61);assert.equal(await call('recover',[b.id]),true);assert.equal((await f.row(b.id)).request.status,'OUTCOME_UNKNOWN');
    });
    await check('competing real execution processes share final request token and currency capacity',async()=>{
      // The same bounded disposable recipes as the accepted broker suite; all
      // original configuration values are restored and never written to source.
      for(const [column,value]of [['input_limit',1024],['output_limit',256],['minor_limit',5],['max_requests',1],['max_concurrent',1]]){
        await restore();await f.reset();await f.b.query('UPDATE broker9d.configuration SET '+column+'=$1',[value]);const ids=[await f.register(0),await f.register(1)];
        const one=await recoveryAction(f,'broker9d_exec','reserve',[ids[0]]),two=await recoveryAction(f,'broker9d_exec','reserve',[ids[1]]);actions.push(one,two);assert.notEqual(one.child.pid,two.child.pid);
        await f.b.query('BEGIN;SELECT * FROM broker9d.control FOR UPDATE');one.start();two.start();
        try{const deadline=Date.now()+10000;while((await f.b.query("SELECT count(*)::int n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'",[[one.pid,two.pid]])).rows[0].n!==2){assert.ok(Date.now()<deadline);await new Promise(ok=>setTimeout(ok,10));}await f.b.query('COMMIT');}catch(e){await f.b.query('ROLLBACK');throw e;}
        const replies=await Promise.all([one.finished,two.finished]);for(const p of [one,two])assert.equal((await p.exited).code,0);for(const r of replies)assert.equal(r.status,'DONE');assert.equal(replies.filter(r=>r.value!==null).length,1);assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.attempts')).rows[0].n,1);
        witness.races.push({dimension:column,processIds:[one.child.pid,two.child.pid],backendPids:[one.pid,two.pid],winnerCount:1,accounting:await call('accounting',[],f.ops)});
      }
    });
    await check('untrusted observation remains unknown duplicate and malformed response outcomes',async()=>{
      const a=await observed(),row=await f.row(a.id),response=row.attempt.response;assert.equal(row.attempt.usage_state,'UNKNOWN');assert.equal(await call('guard_input',[a.id,a.token],f.guard),null);
      assert.equal(await call('observe',[a.id,randomUUID(),response]),false);assert.equal(await call('observe',[a.id,a.token,response]),true);assert.equal(await call('observe',[a.id,a.token,{...response,extra:true}]),false);
      const b=await reserve(1),before=await state();assert.equal(await call('observe',[b.id,b.token,{}]),false);assert.deepEqual(await state(),before);assert.equal(await call('admit',[b.id,b.token]),true);assert.equal(await call('begin_send',[b.id,b.token]),true);assert.equal(await call('observe',[b.id,b.token,{}]),false);assert.equal((await f.row(b.id)).attempt.usage_state,'UNKNOWN');assert.equal((await accounting('worker-usage-not-authority')).heldMinor,10);
    });
    await check('signed usage before response confirms only the exact later observation',async()=>{
      const a=await sent();const analyst=createJevV5ResponsibilityAnalyst({client:{async systemOne(request,options){witness.fakeAnalystCalls++;return offlineResponse(request,options,'valid');}}});
      const envelope=await analyst.analyzeResponsibilityCase(a.payload.snapshot),response={envelope,usage:offlineUsage(envelope)};
      const responseHash=(await f.b.query("SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') h",[response])).rows[0].h;
      assert.equal(await reconcile(await usage(a,{outcome:'SUCCESS',input:128,output:32,minor:2},{responseHash})),'ACCEPTED');assert.equal(await call('observe',[a.id,a.token,{...response,extra:true}]),false);assert.equal(await call('observe',[a.id,a.token,response]),true);assert.equal((await f.row(a.id)).attempt.usage_state,'CONFIRMED');
      const input=await call('guard_input',[a.id,a.token],f.guard),result=independentlyGuardBroker(input);assert.equal(await call('commit_result',[a.id,randomUUID(),result],f.guard),false);assert.equal(await call('commit_result',[a.id,a.token,{...result,route:'AUTO_UPHOLD'}],f.guard),false);
      assert.equal(await call('commit_result',[a.id,a.token,result],f.guard),true);assert.equal(await call('commit_result',[a.id,a.token,result],f.guard),true);assert.equal(await call('commit_result',[a.id,a.token,{...result,analysisId:'0'.repeat(64)}],f.guard),false);assert.equal((await accounting('confirmed-retains-reservation')).heldMinor,5);
    });
    await check('closed usage receipt scalar identity and MAC cases preserve uncertainty',async()=>{
      const a=await sent(),valid=await usage(a,{outcome:'BILLED_FAILURE',input:128,output:32,minor:2});
      for(const receipt of [null,{}, {...valid,extra:true},{...valid,body:{}},{...valid,body:{...valid.body,schema:'other'}},{...valid,body:{...valid.body,receiptId:'invalid'}},{...valid,body:{...valid.body,input:'128'}},{...valid,mac:'0'.repeat(64)}]){const before=await state();assert.equal(await reconcile(receipt),'INVALID');assert.deepEqual(await state(),before);}
      for(const change of [{requestId:randomUUID()},{dispatchId:randomUUID()},{configurationHash:'0'.repeat(64)},{generation:'999'}])assert.equal(await reconcile(await usage(a,{outcome:'BILLED_FAILURE',input:128,output:32,minor:2},change)),'INVALID');
      assert.equal(await reconcile(await usage(a,{outcome:'NO_DISPATCH',input:0,output:0,minor:0})),'INVALID');assert.equal(await reconcile(await usage(a,{outcome:'BILLED_FAILURE',input:1025,output:32,minor:2})),'INVALID');
      assert.equal((await accounting('invalid-receipts-retain-hold')).unknownMinor,5);
    });
    await check('duplicate conflicting zero-charge and authenticated no-dispatch accounting',async()=>{
      const a=await sent(),receipt=await usage(a,{outcome:'BILLED_FAILURE',input:0,output:0,minor:0});assert.equal(await reconcile(receipt),'ACCEPTED');assert.equal(await reconcile(receipt),'DUPLICATE');assert.equal(await reconcile(await usage(a,{outcome:'BILLED_FAILURE',input:1,output:0,minor:0})),'CONFLICT');assert.equal((await f.row(a.id)).attempt.minor_used,0);
      const b=await reserve(1);assert.equal(await call('admit',[b.id,b.token]),true);assert.equal(await reconcile(await usage(b,{outcome:'NO_DISPATCH',input:0,output:0,minor:0})),'ACCEPTED');assert.equal((await f.row(b.id)).attempt.usage_state,'RELEASED');
      const costs=await accounting('zero-charge-versus-proven-no-send');assert.equal(costs.heldMinor,5);assert.equal(costs.disputedMinor,5);assert.equal(costs.confirmedMinor,0);
    });
    await check('late generation accounting cannot borrow a current guarded result',async()=>{
      const old=await observed();await operate('STOP');await operate('RESUME');const current=await observed(1);
      assert.equal(await reconcile(await usage(old)),'ACCEPTED');assert.equal(await call('guard_input',[old.id,old.token],f.guard),null);assert.equal(await reconcile(await usage(current)),'ACCEPTED');
      const input=await call('guard_input',[current.id,current.token],f.guard),result=independentlyGuardBroker(input);assert.equal(await call('commit_result',[current.id,current.token,result],f.guard),true);assert.equal((await f.b.query('SELECT count(*)::int n FROM broker9d.results')).rows[0].n,1);
      assert.equal((await accounting('late-cost-no-current-authority')).confirmedMinor,4);
    });
    await check('terminal cleanup retains dispatched spending tombstone and late authenticated cost',async()=>{
      const a=await sent();assert.equal((await operate('TERMINATE',a.requestId)).status,'APPLIED');await f.advance(61);assert.equal(await call('recover',[a.id]),false);assert.equal((await operate('CLEAN',a.requestId)).status,'APPLIED');
      const before=await accounting('terminal-before-late-cost');assert.equal(before.heldMinor,5);assert.equal(before.unknownMinor,5);assert.equal(await f.register(),a.requestId);assert.equal(await call('register',[{...f.message(0),extra:true}]),null);
      assert.equal(await call('reserve',[a.requestId]),null);assert.equal(await call('observe',[a.id,a.token,{}]),false);assert.equal(await reconcile(await usage(a,{outcome:'BILLED_FAILURE',input:128,output:32,minor:2})),'ACCEPTED');
      const row=await f.row(a.id);assert.equal(row.request.status,'TERMINAL');assert.equal(row.request.payload,null);assert.equal(row.attempt.response,null);assert.equal(await call('guard_input',[a.id,a.token],f.guard),null);const after=await accounting('terminal-after-late-cost');assert.equal(after.heldMinor,before.heldMinor);assert.equal(after.lifetimeMinorReserved,before.lifetimeMinorReserved);assert.equal(after.confirmedMinor,2);
      await assert.rejects(f.b.query("UPDATE broker9d.requests SET status='PENDING' WHERE id=$1",[a.requestId]),{code:'42501'});
    });
    await check('terminal unsent release waits for expiry and cannot reopen the request',async()=>{
      const a=await reserve();await operate('TERMINATE',a.requestId);assert.equal(await call('recover',[a.id]),false);await f.advance(61);assert.equal(await call('recover',[a.id]),true);assert.equal((await f.row(a.id)).request.status,'TERMINAL');assert.equal((await accounting('terminal-unsent-release')).heldMinor,0);
    });
    await check('operations invalid stale idempotent and conflicting arguments are persisted correctly',async()=>{
      for(const args of [[null,null,'STOP',0,'OPERATOR_STOP'],[randomUUID(),null,'STOP',null,'OPERATOR_STOP'],[randomUUID(),null,'STOP',0,null],[randomUUID(),null,'STOP',0,'RETENTION_MINIMIZATION']])assert.equal((await call('operate',args,f.ops)).status,'INVALID');
      assert.equal((await call('operate',[randomUUID(),null,'STOP',-1,'OPERATOR_STOP'],f.ops)).status,'STALE');assert.equal((await call('operate',[randomUUID(),randomUUID(),'CLEAN',0,'RETENTION_MINIMIZATION'],f.ops)).status,'STALE');
      const id=await f.register(),revision=(await f.b.query('SELECT revision FROM broker9d.requests WHERE id=$1',[id])).rows[0].revision;assert.equal((await call('operate',[randomUUID(),id,'CLEAN',revision,'RETENTION_MINIMIZATION'],f.ops)).status,'INVALID');
      const op=randomUUID(),args=[op,id,'TERMINATE',revision,'UNRESOLVED_PROVIDER'],answer=await call('operate',args,f.ops),before=await state();assert.equal(answer.status,'APPLIED');assert.deepEqual(await call('operate',args,f.ops),answer);assert.deepEqual(await state(),before);assert.equal((await call('operate',[op,id,'TERMINATE',revision,'STALE_GENERATION'],f.ops)).status,'CONFLICT');
    });
    await check('cleanup failure rolls back terminal payload changes and accounting',async()=>{
      const a=await reserve();await operate('TERMINATE',a.requestId);const row=(await f.row(a.id)).request,workRow=(await f.b.query('SELECT to_jsonb(w) value FROM shadow9d.work w WHERE id=$1',[row.work_id])).rows[0].value;
      await f.b.query('DELETE FROM shadow9d.work WHERE id=$1',[row.work_id]);const before=await state();
      try{await assert.rejects(operate('CLEAN',a.requestId),{code:'23514'});assert.deepEqual(await state(),before);}finally{await f.b.query('INSERT INTO shadow9d.work OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::shadow9d.work,$1)).*',[workRow]);}
      assert.equal((await operate('CLEAN',a.requestId)).status,'APPLIED');assert.equal((await accounting('failed-cleanup-retains-hold')).heldMinor,5);
    });
    await restore();witness.catalogAfter=await p5Catalog(f.b);assert.deepEqual(witness.catalogAfter,witness.catalogBefore);assert.deepEqual((await f.b.query('SELECT * FROM broker9d.configuration')).rows[0],cfg);witness.configurationAfter=cfg;
    if(profiling)witness.native=await p5Native(f.b,witness.catalogBefore);witness.status='PASS';await writeFile(join(process.env.CUSTODY_OUTPUT,(profiling?'p5-native-witness-':'p5-witness-')+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{for(const p of actions)await p.stop();await f.close();}
});
