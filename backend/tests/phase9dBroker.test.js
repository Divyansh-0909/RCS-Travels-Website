import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {takeCoverage} from 'node:v8';
import v8 from 'node:v8';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {deriveShadowExport} from '../../tools/phase9d/export-projection.mjs';
import {exportSourceFixture,EXPORT_TEST_KEY} from './helpers/phase9dExportFixture.js';
import {createJevV5ResponsibilityAnalyst} from '../services/responsibilityJevV5.js';
import {offlineResponse as rawOfflineResponse,offlineUsage,brokerDeadline} from '../../tools/phase9d/broker-offline.mjs';
import {setTimeout as nativeTimeout,clearTimeout as nativeClear} from 'node:timers';
import {executeBrokerAttempt as rawExecuteBrokerAttempt,brokerCall} from '../../tools/phase9d/broker-execution.mjs';
import {independentlyGuardBroker,commitGuardedBrokerResult} from '../../tools/phase9d/broker-guard.mjs';
import {brokerSession} from '../../tools/phase9d/broker-session.mjs';
import {prepareBrokerReplay,brokerReplayEvents} from '../../tools/phase9d/broker-replay.mjs';
import {evidenceCriteriaV5Questions} from '../benchmarks/responsibility/evidenceCriteriaV5.js';
import {evaluateResponsibilityPolicy,responsibilityEvaluationKey,DEFAULT_RESPONSIBILITY_POLICY} from '../services/responsibilityPolicyGate.js';
import {responsibilityCaseState} from '../services/responsibilityCaseState.js';
import {responsibilityEvidenceHash} from '../services/responsibilityAnalyst.js';
const payload=deriveShadowExport(exportSourceFixture(),EXPORT_TEST_KEY);
const observe=operation=>new Promise((done,fail)=>{
  const timer=nativeTimeout(()=>fail(Error('INDEPENDENT_WITNESS_DEADLINE')),3000);
  operation.then(value=>{nativeClear(timer);done(value);},error=>{nativeClear(timer);fail(error);});
});
const executeBrokerAttempt=(...args)=>observe(rawExecuteBrokerAttempt(...args));
const offlineResponse=(...args)=>new Promise((done,fail)=>{
  const timer=nativeTimeout(()=>fail(Error('OFFLINE_WITNESS_DEADLINE')),500);
  rawOfflineResponse(...args).then(value=>{nativeClear(timer);done(value);},error=>{nativeClear(timer);fail(error);});
});
test('offline frozen factory and independent guard preserve review-only authority',async()=>{
  const analyst=createJevV5ResponsibilityAnalyst({client:{systemOne:(request,options)=>offlineResponse(request,options,'valid')}});
  const envelope=await analyst.analyzeResponsibilityCase(payload.snapshot);
  const result=independentlyGuardBroker({evidence:payload.snapshot,response:{envelope},responseHash:'a'.repeat(64)});
  assert.equal(result.mode,'SHADOW');assert.equal(result.route,'NEEDS_ADMIN_REVIEW');assert.equal(result.output.suggestedClassification,'DRIVER_CAUSED');
  const evidenceHash=responsibilityEvidenceHash(payload.snapshot),idempotencyKey=responsibilityEvaluationKey({caseId:payload.snapshot.caseId,evidenceHash,analysisId:envelope.analysisId,policyVersion:DEFAULT_RESPONSIBILITY_POLICY.policyVersion});
  assert.deepEqual(result.gate,evaluateResponsibilityPolicy({evidence:payload.snapshot,analysisEnvelope:envelope,evidenceHash,currentState:responsibilityCaseState.POLICY_EVALUATION,idempotencyKey,policy:DEFAULT_RESPONSIBILITY_POLICY,evaluatedAt:new Date(payload.snapshot.generatedAt)}));
  assert.equal(offlineUsage(envelope).minor,2);assert.equal(result.gate.failedGates.length>0,true);
  assert.throws(()=>independentlyGuardBroker({evidence:payload.snapshot,response:{envelope:{...envelope,output:{...envelope.output,caseId:'foreign'}}}}));
});
test('broker deadline and fake error outcomes never become successful usage',async()=>{
  await assert.rejects(observe(brokerDeadline(new Promise(()=>{}),1)),/BROKER_DEADLINE/);
  assert.equal(await observe(brokerDeadline(Promise.resolve('done'),1)),'done');
  const analyst=fixture=>createJevV5ResponsibilityAnalyst({client:{systemOne:(request,options)=>offlineResponse(request,options,fixture)}});
  for(const fixture of ['429','5xx','malformed','oversized'])await assert.rejects(analyst(fixture).analyzeResponsibilityCase(payload.snapshot));
  const request={questions:evidenceCriteriaV5Questions()},options={retry:{maxRetries:0}};
  for(const fixture of ['valid','unknown-usage']){
    const response=await offlineResponse(request,options,fixture);
    assert.equal(response.model,'jev-1.13.0');assert.deepEqual(response.usage,{input_tokens:128,output_tokens:32});
    assert.deepEqual(Object.keys(response.answers),Object.keys(request.questions));
    for(const[key,value]of Object.entries(response.answers))assert.deepEqual(value,{choice:key==='responsibility'?'DRIVER_CAUSED':['evidenceSufficient','ordinaryDriverFailure'].includes(key)?'YES':'NO',confidence:0.99});
  }
  await assert.rejects(offlineResponse({questions:{}},options,'valid'));await assert.rejects(offlineResponse(request,{retry:{maxRetries:1}},'valid'));await assert.rejects(offlineResponse(request,options,'foreign'));
  for(const fixture of ['429','5xx'])await assert.rejects(offlineResponse(request,options,fixture),new RegExp('OFFLINE_'+fixture));
  assert.deepEqual(await offlineResponse(request,options,'malformed'),{model:'jev-1.13.0',answers:{responsibility:{choice:'SET_HUMAN_FINAL',confidence:1}}});
  assert.deepEqual(await offlineResponse(request,options,'oversized'),{model:'jev-1.13.0',answers:{untrusted:'x'.repeat(33000)}});
  await assert.rejects(observe(brokerDeadline(offlineResponse(request,options,'timeout'),1)),/BROKER_DEADLINE/);
});
test('SQL call construction and offline usage have independently fixed shapes',async()=>{
  const client={async query(sql,args){assert.equal(sql,'SELECT broker9d.observe($1,$2,$3) value');assert.deepEqual(args,['a','b','c']);return {rows:[{value:true}]};}};
  assert.equal(await brokerCall(client,'observe',['a','b','c']),true);
  assert.deepEqual(offlineUsage({fixed:true}),{input:128,output:32,minor:2,receipt:'a9674b522fa327b337d828c0eff524432166321a1ff876e3e0c6fddab2bab84c'});
});
test('execution transitions are distinct and unknown usage is retained',async()=>{
  const work={id:'attempt',token:'lease',payload},calls=[];
  const client={async query(sql,args){calls.push([sql,args]);return {rows:[{value:sql.includes('.reserve(')?work:true}]};}};
  assert.deepEqual(await executeBrokerAttempt(client,'request','valid'),{status:'RESPONSE_OBSERVED',calls:1,id:'attempt',token:'lease'});
  assert.deepEqual(calls.map(([sql])=>sql.match(/broker9d\.(\w+)/)[1]),['reserve','admit','begin_send','observe']);
  assert.equal((await executeBrokerAttempt(client,'request','unknown-usage')).status,'OUTCOME_UNKNOWN');
  for(const denied of ['reserve','admit','begin_send']){
    const deniedClient={async query(sql){return {rows:[{value:sql.includes('.'+denied+'(')?null:work}]};}};
    assert.deepEqual(await executeBrokerAttempt(deniedClient,'request','valid'),{status:denied==='reserve'?'NOT_RESERVED':'FENCED',calls:0});
  }
  const refusal={async query(sql){return {rows:[{value:sql.includes('.reserve(')?work:false}]};}};
  assert.equal((await executeBrokerAttempt(refusal,'request','valid')).status,'FENCED');
  const deniedObservation={async query(sql){return {rows:[{value:sql.includes('.reserve(')?work:!sql.includes('.observe(')}]};}};
  assert.equal((await executeBrokerAttempt(deniedObservation,'request','valid')).status,'OBSERVATION_REJECTED');
  await assert.rejects(executeBrokerAttempt(client,'request','live'));
  const stages=[];await executeBrokerAttempt(client,'request','valid',async(name,seen)=>{assert.equal(seen,work);stages.push(name);});assert.deepEqual(stages,['reserved','admitted','send','provider','observed']);
  const observed=JSON.parse(calls.find(([sql])=>sql.includes('.observe('))[1][2]);assert.equal(observed.envelope.provider,'typesafe-ai');assert.equal(observed.usage.input,128);assert.equal(observed.usage.output,32);assert.equal(observed.usage.minor,2);
  for(const[sql,args]of calls){const method=sql.match(/broker9d\.(\w+)/)[1];if(method==='reserve')assert.deepEqual(args,['request']);else if(method==='observe')assert.deepEqual(args.slice(0,2),['attempt','lease']);else assert.deepEqual(args,['attempt','lease']);}
});
test('separate guard returns fenced state and cannot change the fixed routing policy',async()=>{
  const client={async query(){return {rows:[{value:null}]};}};
  assert.deepEqual(await commitGuardedBrokerResult(client,'attempt','token'),{status:'FENCED'});
  const envelope=await createJevV5ResponsibilityAnalyst({client:{systemOne:(r,o)=>offlineResponse(r,o,'valid')}}).analyzeResponsibilityCase(payload.snapshot);
  for(const accepted of [true,false]){
    const real={async query(sql,args){if(sql.includes('.guard_input(')){assert.equal(sql,'SELECT broker9d.guard_input($1,$2) value');assert.deepEqual(args,['attempt','token']);return {rows:[{value:{evidence:payload.snapshot,response:{envelope},responseHash:'a'.repeat(64)}}]};}
      assert.equal(sql,'SELECT broker9d.commit_result($1,$2,$3) value');assert.deepEqual(args.slice(0,2),['attempt','token']);assert.equal(JSON.parse(args[2]).mode,'SHADOW');return {rows:[{value:accepted}]};}};
    const stages=[];assert.equal((await commitGuardedBrokerResult(real,'attempt','token',async(stage,work)=>{assert.deepEqual(work,{id:'attempt',token:'token'});stages.push(stage);})).status,accepted?'GUARDED_RESULT_COMMITTED':'FENCED');
    assert.deepEqual(stages,['guarded','committed']);
    assert.equal((await commitGuardedBrokerResult(real,'attempt','token')).status,accepted?'GUARDED_RESULT_COMMITTED':'FENCED');
  }
});
test('dedicated broker sessions reject credential and URI privilege overrides',async()=>{
  const uri='postgres://broker9d_exec:synthetic@localhost:5432/rcs_verify_'+'a'.repeat(32),queries=[];
  let ended=0;
  const client={async connect(){},async end(){ended++;},async query(sql,args){queries.push(sql);if(!sql.includes('pg_catalog'))assert.deepEqual(args,['broker9d.reserve(uuid)']);return sql.includes('pg_catalog')?{rows:[{actor:'broker9d_exec',effective:'broker9d_exec',database:'rcs_verify_'+'a'.repeat(32),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]}:{rows:[{installed:true}]};}};
  assert.equal(await brokerSession(uri,'broker9d_exec',{environment:{},factory:()=>client}),client);assert.equal(queries.length,2);
  for(const value of [uri+'?user=postgres',uri+'#x',uri.replace('localhost','remote'),uri.replace('rcs_verify_','foreign_'),uri.replace('/rcs_verify_','/nested/rcs_verify_'),uri+'suffix']){let factories=0;await assert.rejects(brokerSession(value,'broker9d_exec',{environment:{},factory:()=>{factories++;return client;}}));assert.equal(factories,0);}
  for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET']){let factories=0;await assert.rejects(brokerSession(uri,'broker9d_exec',{environment:{[name]:'forbidden'},factory:()=>{factories++;return client;}}));assert.equal(factories,0);}
  assert.equal(await brokerSession(uri.replace('postgres:','postgresql:'),'broker9d_exec',{environment:{},factory:()=>client}),client);
  const broken={...client,async query(){throw Error('denied');}};await assert.rejects(brokerSession(uri,'broker9d_exec',{environment:{},factory:()=>broken}));assert.equal(ended,1);
  const guardURI=uri.replace('broker9d_exec','broker9d_guard'),guardClient={...client,async query(sql,args){return sql.includes('pg_catalog')?{rows:[{actor:'broker9d_guard',effective:'broker9d_guard',database:'rcs_verify_'+'a'.repeat(32),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]}:{rows:[{installed:args[0]==='broker9d.commit_result(uuid,uuid,jsonb)'}]};}};
  assert.equal(await brokerSession(guardURI,'broker9d_guard',{environment:{},factory:()=>guardClient}),guardClient);
  await assert.rejects(brokerSession(uri,'owner',{environment:{}}));
});
test('broker replay binds exact source, protocol, initial state and ordered external inputs',async()=>{
  const output=join(tmpdir(),'rcs-broker-replay-'+Date.now());await mkdir(output);const sources={'owned.js':'a'.repeat(64)};
  const file=await prepareBrokerReplay({mode:'record-replay',output,sources}),bytes=await readFile(file),recipe=JSON.parse(bytes);
  assert.ok(Object.values(recipe.initial).some(rows=>rows.length>0));
  const expectedEvents=['committed-driver-cancellation','sender-stage-crash','lease-121s','receiver-durable-lost-ack','receiver-process-replacement','retry-31s','sender-ack','duplicate-export','broker-request','broker-reserve-crash','broker-lease-61s','reservation-release','replacement-broker-offline-v5','independent-guard','duplicate-result-denial','duplicate-receipt'];
  assert.deepEqual(recipe.events,expectedEvents);assert.deepEqual(brokerReplayEvents,expectedEvents);assert.equal(await prepareBrokerReplay({mode:'saved-replay',path:file,output,sources}),file);
  for(const path of [resolve(output,'../foreign.json'),join(output,'private:fixture.json'),file.replace('.json','.txt')])await assert.rejects(prepareBrokerReplay({mode:'saved-replay',path,output,sources}),/REPLAY_PATH_DENIED/);
  await assert.rejects(prepareBrokerReplay({mode:'saved-replay',path:file,output,sources:{changed:'b'}}),/REPLAY_SOURCE_DRIFT/);
  for(const change of [r=>({...r,schema:'old'}),r=>({...r,keyVersion:'old'}),r=>({...r,at:'tomorrow'}),r=>({...r,events:[]}),r=>({...r,id:'prefix'+r.id}),r=>({...r,id:r.id+'suffix'}),r=>({...r,serviceId:'prefix'+r.serviceId}),r=>({...r,serviceId:r.serviceId+'suffix'}),r=>({...r,journalIds:[]})]){
    await writeFile(file,JSON.stringify(change(recipe)));await assert.rejects(prepareBrokerReplay({mode:'saved-replay',path:file,output,sources}));
  }
  for(const journalIds of [[...recipe.journalIds.slice(0,2),'prefix'+recipe.journalIds[2]],[...recipe.journalIds.slice(0,2),recipe.journalIds[2]+'suffix']]){await writeFile(file,JSON.stringify({...recipe,journalIds}));await assert.rejects(prepareBrokerReplay({mode:'saved-replay',path:file,output,sources}));}
  const json=JSON.stringify(recipe);await writeFile(file,json+' '.repeat(1048576-Buffer.byteLength(json)));await assert.rejects(prepareBrokerReplay({mode:'saved-replay',path:file,output,sources}),/REPLAY_OVERSIZE/);await unlink(file);
  const uuid=crypto.randomUUID;crypto.randomUUID=()=>recipe.id;syncBuiltinESMExports();
  try{const exclusive=await prepareBrokerReplay({mode:'record-replay',output,sources});await assert.rejects(prepareBrokerReplay({mode:'record-replay',output,sources}),error=>error.code==='EEXIST');await unlink(exclusive);}
  finally{crypto.randomUUID=uuid;syncBuiltinESMExports();}
});
test('actual IPC entry point uses separate role admission and bounded messages',async()=>{
  const methods={connect:pg.Client.prototype.connect,query:pg.Client.prototype.query,end:pg.Client.prototype.end},old={once:process.once,send:process.send,disconnect:process.disconnect};
  let callback,messages=[],closed=0,failure=false,coverageCalls=0;const originalCoverage=v8.takeCoverage;
  const envelope=await createJevV5ResponsibilityAnalyst({client:{systemOne:(r,o)=>offlineResponse(r,o,'valid')}}).analyzeResponsibilityCase(payload.snapshot);
  const work={id:'attempt',token:'lease',payload};
  try{
    v8.takeCoverage=()=>{coverageCalls++;originalCoverage();};syncBuiltinESMExports();
    process.once=function(name,handler){assert.equal(name,'message');callback=handler;return this;};process.send=value=>messages.push(value);process.disconnect=()=>messages.push({status:'DISCONNECTED'});
    pg.Client.prototype.connect=async function(){if(failure)throw Error('offline');};pg.Client.prototype.end=async()=>{closed++;};
    pg.Client.prototype.query=async function(sql){
      if(sql.includes('pg_catalog'))return {rows:[{actor:this.connectionParameters.user,effective:this.connectionParameters.user,database:this.connectionParameters.database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]};
      if(sql.includes('to_regprocedure'))return {rows:[{installed:true}]};
      return {rows:[{value:sql.includes('.reserve(')?work:sql.includes('.guard_input(')?{evidence:payload.snapshot,response:{envelope},responseHash:'a'.repeat(64)}:true}]};
    };
    await import('../../tools/phase9d/broker-child.mjs');assert.deepEqual(messages,[{status:'READY'}]);
    const configuration={protocol:'broker-execution-v1',mode:'execute',connectionString:'postgres://broker9d_exec:synthetic@localhost/rcs_verify_'+'a'.repeat(32),requestId:'request',fixture:'valid'};
    const changes=[c=>c,c=>({...c,mode:'guard',connectionString:c.connectionString.replace('broker9d_exec','broker9d_guard'),id:'attempt',token:'lease',requestId:undefined,fixture:undefined}),c=>({...c,protocol:'unknown'}),c=>({...c,mode:'owner',connectionString:c.connectionString.replace('broker9d_exec','broker9d_guard')}),c=>({...c,unexpected:true}),c=>({...c,pauseAt:'unknown'}),c=>({...c,requestId:'x'.repeat(5000)})];
    for(const [index,change]of changes.entries()){
      const value=Object.fromEntries(Object.entries(change(configuration)).filter(([,v])=>v!==undefined));messages=[];await observe(callback(value));assert.equal(messages.at(-1).status,'DISCONNECTED');assert.equal(messages[0].status,index===0?'RESPONSE_OBSERVED':index===1?'GUARDED_RESULT_COMMITTED':'FAILED_CLOSED');
    }
    assert.equal(coverageCalls,changes.length);
    failure=true;messages=[];await observe(callback(configuration));assert.equal(messages[0].status,'FAILED_CLOSED');assert.ok(closed>=3);
    failure=false;
    const padding=4096-Buffer.byteLength(JSON.stringify(configuration))+'synthetic'.length;
    messages=[];await observe(callback({...configuration,connectionString:configuration.connectionString.replace('synthetic','p'.repeat(padding))}));assert.equal(messages[0].status,'RESPONSE_OBSERVED');
    for(const phase of ['reserved','admitted','send','provider','observed','guarded','committed']){
      messages=[];const guarded=['guarded','committed'].includes(phase),value=guarded?{protocol:'broker-execution-v1',mode:'guard',connectionString:configuration.connectionString.replace('broker9d_exec','broker9d_guard'),id:'attempt',token:'lease',pauseAt:phase}:{...configuration,pauseAt:phase};
      const pending=callback(value);await new Promise(done=>setTimeout(done,20));assert.equal(messages[0].status,'PAUSED');assert.equal(messages[0].stage,phase);takeCoverage();void pending;
    }
  }finally{v8.takeCoverage=originalCoverage;syncBuiltinESMExports();Object.assign(pg.Client.prototype,methods);process.once=old.once;if(old.send)process.send=old.send;else delete process.send;if(old.disconnect)process.disconnect=old.disconnect;else delete process.disconnect;}
});
test('caller deadlines release timers on both success and failure',async()=>{
  const original={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};let callback,cleared=0;const timer={owned:true};
  const bounded=operation=>new Promise((done,fail)=>{
    const deadline=original.setTimeout(()=>fail(Error('WITNESS_DEADLINE')),1000);
    operation.then(value=>{original.clearTimeout(deadline);done(value);},error=>{original.clearTimeout(deadline);fail(error);});
  });
  try{
    globalThis.setTimeout=(fn,ms)=>{assert.equal(ms,2000);callback=fn;return timer;};globalThis.clearTimeout=value=>{assert.equal(value,timer);cleared++;};
    assert.equal(await bounded(brokerDeadline(Promise.resolve('result'))),'result');assert.equal(cleared,1);
    const pending=brokerDeadline(new Promise(()=>{}));callback();await assert.rejects(bounded(pending),/BROKER_DEADLINE/);assert.equal(cleared,2);
  }finally{Object.assign(globalThis,original);}
});
