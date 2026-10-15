import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import v8 from 'node:v8';
import crypto,{createHmac} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deriveShadowExport,EXPORT_CONFIG,EXPORT_FROZEN_V5,EXPORT_SCHEMA} from '../../tools/phase9d/export-projection.mjs';
import {createShadowExportRepository} from '../../tools/phase9d/export-repository.mjs';
import {pumpShadowExport} from '../../tools/phase9d/export-pump.mjs';
import {executeShadowExport} from '../../tools/phase9d/export-core.mjs';
import {prepareOutboxReplay,replayEvents} from '../../tools/phase9d/outbox-replay.mjs';
import {exportSourceFixture,EXPORT_TEST_KEY} from './helpers/phase9dExportFixture.js';
import {responsibilityEvidenceHash} from '../services/responsibilityAnalyst.js';

test('source-bound export is stable, private, frozen and explicitly review-only',()=>{
  const source=exportSourceFixture(),payload=deriveShadowExport(source,EXPORT_TEST_KEY);
  assert.deepEqual(payload,deriveShadowExport(source,EXPORT_TEST_KEY));
  assert.equal(payload.schema,EXPORT_SCHEMA);assert.equal(payload.config,EXPORT_CONFIG);assert.equal(payload.frozenV5,EXPORT_FROZEN_V5);
  assert.equal(payload.schema,'shadow-export-v1');assert.equal(payload.config,'inactive-isolated-export-v1');
  assert.equal(payload.frozenV5,'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75');
  assert.equal(payload.collector,'phase7-committed-journal-v1');assert.equal(payload.projection,'shadow-minimized-v1');
  assert.match(payload.key,/^[a-f0-9]{64}$/);assert.equal(payload.evidenceHash,responsibilityEvidenceHash(payload.snapshot));
  assert.equal(payload.snapshot.completeness.complete,false);
  for(const value of ['synthetic-phone','synthetic-token','sk-synthetic','ignore guard','original-driver','committed-event',EXPORT_TEST_KEY])assert.ok(!JSON.stringify(payload).includes(value));
  assert.notEqual(payload.lineage.caseId,source.caseId);assert.notEqual(payload.lineage.bookingId,source.bookingId);
  const pseudonym=value=>createHmac('sha256',EXPORT_TEST_KEY).update(value).digest('hex');
  assert.equal(payload.key,pseudonym('export-v1:'+source.workId));
  assert.deepEqual(payload.lineage,{caseId:pseudonym(source.caseId),bookingId:pseudonym(source.bookingId),actorId:pseudonym(source.actorId),
    sourceEvent:pseudonym(source.sourceEvent),evidenceId:pseudonym(source.evidenceId),evidenceVersion:source.evidenceVersion,sourceWorkId:pseudonym(source.workId)});
});
test('each source admission mismatch and unsupported family fails before payload dispatch',()=>{
  for(const [field,value,reason]of [['lineageValid',false,'SOURCE_LINEAGE'],['caseType','FAILED_PICKUP','UNSUPPORTED_FAMILY'],['evidenceHash','0'.repeat(64),'SOURCE_HASH'],['caseId','foreign','SOURCE_CASE'],
    ['bookingId','foreign','SOURCE_BOOKING'],['evidenceVersion','forged','SOURCE_VERSION'],['generatedAt','2026-10-12T00:00:00.000Z','SOURCE_GENERATED_AT'],['contractVersion','forged','SOURCE_CONTRACT'],
    ['analystConfigVersion','forged','SOURCE_ANALYST_CONFIG'],['policyVersion','forged','SOURCE_POLICY']])assert.throws(()=>deriveShadowExport({...exportSourceFixture(),[field]:value},EXPORT_TEST_KEY),new RegExp(reason),field);
  for(const caseType of ['RIDER_CANCELLATION','DRIVER_LATE']){const source=exportSourceFixture();source.caseType=caseType;source.snapshot.caseType=caseType;source.evidenceHash=responsibilityEvidenceHash(source.snapshot);assert.equal(deriveShadowExport(source,EXPORT_TEST_KEY).snapshot.caseType,caseType);}
  const wrongFamily=exportSourceFixture();wrongFamily.caseType='RIDER_CANCELLATION';assert.throws(()=>deriveShadowExport(wrongFamily,EXPORT_TEST_KEY),/SOURCE_FAMILY/);
  assert.throws(()=>deriveShadowExport(exportSourceFixture(),'short'),/PRIVACY_KEY_REQUIRED/);
  const large=exportSourceFixture(),entry=large.snapshot.timeline[0];large.snapshot.timeline=Array.from({length:225},(_,i)=>({...entry,id:String(i),kind:'x',source:'x',value:{},quality:{}}));
  large.evidenceHash=responsibilityEvidenceHash(large.snapshot);
  assert.ok(Buffer.byteLength(JSON.stringify(large.snapshot))<65536);assert.throws(()=>deriveShadowExport(large,EXPORT_TEST_KEY),/EXPORT_OVERSIZE/);
});
test('the maximum 65536-byte export is accepted and the next byte is denied',()=>{
  const source=exportSourceFixture(),entry=source.snapshot.timeline[0];
  source.snapshot.timeline=Array.from({length:150},(_,index)=>({...entry,id:'boundary-'+index,kind:'x',source:'x',value:{},quality:{}}));
  source.evidenceHash=responsibilityEvidenceHash(source.snapshot);
  const initial=Buffer.byteLength(JSON.stringify(deriveShadowExport(source,EXPORT_TEST_KEY)));
  const n=Math.floor((65536-initial+1)/67);assert.ok(n>0);
  source.snapshot.timeline[0].derivedFrom=Array(n).fill('x');source.evidenceHash=responsibilityEvidenceHash(source.snapshot);
  const size=Buffer.byteLength(JSON.stringify(deriveShadowExport(source,EXPORT_TEST_KEY))),remaining=65536-size;
  assert.ok(remaining>=0&&remaining<67);source.snapshot.generatedAt=source.snapshot.generatedAt.replace('Z','0'.repeat(remaining)+'Z');
  assert.equal(Buffer.byteLength(JSON.stringify(deriveShadowExport(source,EXPORT_TEST_KEY))),65536);
  source.snapshot.generatedAt=source.snapshot.generatedAt.replace('Z','0Z');assert.throws(()=>deriveShadowExport(source,EXPORT_TEST_KEY),/EXPORT_OVERSIZE/);
});
test('repository uses only parameterized outbox capabilities and retains exact payload',async()=>{
  const calls=[],repository=createShadowExportRepository({async query(sql,args){calls.push([sql,args]);return {rows:[{value:'result'}]};}}),work={id:7,token:'private-capability'};
  assert.equal(await repository.scan(),'result');assert.equal(await repository.claim(),'result');
  await repository.stage(work,{x:'synthetic'});await repository.deliver(work);await repository.fail(work,true,'DELIVERY_UNAVAILABLE');
  assert.deepEqual(calls,[['SELECT outbox9d.scan() value',[]],['SELECT outbox9d.claim() value',[]],
    ['SELECT outbox9d.stage($1,$2,$3) value',[7,'private-capability','{"x":"synthetic"}']],
    ['SELECT outbox9d.deliver($1,$2) value',[7,'private-capability']],['SELECT outbox9d.fail($1,$2,$3,$4) value',[7,'private-capability',true,'DELIVERY_UNAVAILABLE']]]);
});
function fake({empty=false,invalid=false,staged=false,stage=true,receipt=9,error=false}={}) {
  const calls=[],work={id:1,token:'lease',source:exportSourceFixture(),payload:staged?{already:'verified in database'}:null};
  if(invalid)work.source.lineageValid=false;
  return {calls,async scan(){calls.push('scan');},async claim(){calls.push('claim');return empty?null:work;},
    async stage(w,p){assert.equal(w,work);assert.equal(p.schema,EXPORT_SCHEMA);calls.push('stage');return stage;},
    async deliver(w){assert.equal(w,work);calls.push('deliver');if(error)throw Error('synthetic unavailable');return receipt;},
    async fail(w,retry,category){assert.equal(w,work);calls.push(['fail',retry,category]);}};
}
test('pump handles empty, bad source, stage denial, delivery outage and bounded retry states',async()=>{
  for(const [options,status,last]of [[{empty:true},'EMPTY','claim'],[{invalid:true},'MANUAL_REVIEW',['fail',false,'SOURCE_INVALID']],
    [{stage:false},'MANUAL_REVIEW',['fail',false,'STAGE_DENIED']],[{error:true},'RETRYABLE',['fail',true,'DELIVERY_UNAVAILABLE']],
    [{receipt:null},'RETRYABLE',['fail',true,'DELIVERY_UNAVAILABLE']]]){
    const repo=fake(options);assert.equal((await pumpShadowExport(repo,EXPORT_TEST_KEY)).status,status);assert.deepEqual(repo.calls.at(-1),last);
  }
});
test('pump preserves staged payload, ordered hooks and lost-ack committed recovery boundaries',async()=>{
  const repo=fake(),hooks=[];
  const saved=await pumpShadowExport(repo,EXPORT_TEST_KEY,{afterClaim:()=>hooks.push('claim'),afterStage:()=>hooks.push('stage'),afterDelivery:()=>hooks.push('delivery')});
  assert.deepEqual(saved,{status:'ACKED',receipt:9});assert.deepEqual(repo.calls,['scan','claim','stage','deliver']);assert.deepEqual(hooks,['claim','stage','delivery']);
  const resumed=fake({staged:true});assert.equal((await pumpShadowExport(resumed,EXPORT_TEST_KEY)).status,'ACKED');assert.deepEqual(resumed.calls,['scan','claim','deliver']);
  for(const hook of ['afterClaim','afterStage','afterDelivery'])await assert.rejects(pumpShadowExport(fake(),EXPORT_TEST_KEY,{[hook]:()=>{throw Error('controlled crash');}}),/controlled crash/);
  assert.equal((await pumpShadowExport(fake(),EXPORT_TEST_KEY)).status,'ACKED');
});
test('reviewed catch omission has identical complete outcomes and repository effects',async()=>{
  const original=await readFile(new URL('../../tools/phase9d/export-pump.mjs',import.meta.url),'utf8');
  const anchor="catch{await repository.fail(work,true,'DELIVERY_UNAVAILABLE');return {status:'RETRYABLE'};}";
  assert.equal(original.split(anchor).length,2);
  const variant=original.replace(anchor,'catch{}').replace("'./export-projection.mjs'",JSON.stringify(new URL('../../tools/phase9d/export-projection.mjs',import.meta.url).href));
  const {pumpShadowExport:omitted}=await import('data:text/javascript;base64,'+Buffer.from(variant).toString('base64'));
  for(const options of [{error:true},{receipt:null},{receipt:undefined},{receipt:9},{staged:true,error:true},{invalid:true},{empty:true},{stage:false}]){
    const left=fake(options),right=fake(options);assert.deepEqual(await pumpShadowExport(left,EXPORT_TEST_KEY),await omitted(right,EXPORT_TEST_KEY));assert.deepEqual(left.calls,right.calls);
  }
  for(const implementation of [pumpShadowExport,omitted]){
    const repo=fake({error:true});repo.fail=async()=>{throw Error('durable retry unavailable');};await assert.rejects(implementation(repo,EXPORT_TEST_KEY),/durable retry unavailable/);
  }
});

const ownedUrl='postgresql://shadow9d_exporter:synthetic@localhost:5432/rcs_verify_'+'a'.repeat(32);
function exportClient({empty=false,stage=true,identity={},error=null}={}){
  const observations=[],database='rcs_verify_'+'a'.repeat(32);
  return {observations,async connect(){observations.push('connect');if(error==='connect')throw Error('connect failed');},async end(){observations.push('end');},
    async query(sql){observations.push(sql);if(error==='query')throw Error('query failed');
      if(sql.includes('pg_catalog.pg_roles'))return {rows:[{actor:'shadow9d_exporter',effective:'shadow9d_exporter',database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,...identity}]};
      const value=sql.includes('claim()')?(empty?null:{id:1,token:'lease',source:exportSourceFixture()}):sql.includes('stage(')?stage:9;
      return {rows:[{value}]};}};
}
test('export process validates its credential envelope and actual database identity before work',async()=>{
  const input={connectionString:ownedUrl,key:EXPORT_TEST_KEY,mode:'resume'};
  for(const change of [{mode:'other'},{key:null},{key:'short'},{key:new String('x'.repeat(32))},{connectionString:ownedUrl.replace('postgresql:','https:')},
    {connectionString:ownedUrl.replace('shadow9d_exporter:','shadow9d_owner:')},{connectionString:ownedUrl.replace('localhost','remote.invalid')},
    {connectionString:ownedUrl.replace('rcs_verify_','production_')},{connectionString:ownedUrl.replace('/rcs_verify_','/prefix/rcs_verify_')},
    {connectionString:ownedUrl+'/suffix'},{connectionString:ownedUrl+'?user=owner'},{connectionString:ownedUrl+'#fragment'}]){
    let created=0;await assert.rejects(executeShadowExport({...input,...change},{environment:{},clientFactory:()=>{created++;throw Error('must not create client');}}));assert.equal(created,0);
  }
  for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'])await assert.rejects(executeShadowExport(input,{environment:{[name]:'synthetic'}}),/PRIVILEGED_ENVIRONMENT_DENIED/);
  for(const [field,value] of [['actor','owner'],['effective','owner'],['database','other'],['rolsuper',true],['rolbypassrls',true],['rolcreatedb',true],['rolcreaterole',true]]){
    const client=exportClient({identity:{[field]:value}});await assert.rejects(executeShadowExport(input,{environment:{},clientFactory:()=>client}),/DATABASE_IDENTITY_DENIED/);assert.equal(client.observations.at(-1),'end');
  }
  for(const error of ['connect','query']){const client=exportClient({error});await assert.rejects(executeShadowExport(input,{environment:{},clientFactory:()=>client}));assert.equal(client.observations.at(-1),'end');}
  const boundary=exportClient();assert.equal((await executeShadowExport({...input,key:'x'.repeat(32),connectionString:ownedUrl.replace('postgresql:','postgres:')},{environment:{},clientFactory:()=>boundary})).status,'ACKED');
});
test('export process closes normal/error paths and retains only a successfully committed diagnostic lease',async()=>{
  for(const [mode,options,status,retained] of [['resume',{},'ACKED',false],['resume',{empty:true},'EMPTY',false],
    ['claim_then_crash',{},'CLAIMED',true],['stage_then_crash',{},'STAGED',true],['claim_then_crash',{empty:true},'EMPTY',false]]){
    const client=exportClient(options);const result=await executeShadowExport({connectionString:ownedUrl,key:EXPORT_TEST_KEY,mode},{environment:{},clientFactory:opts=>{
      assert.deepEqual(opts,{connectionString:ownedUrl,connectionTimeoutMillis:2000,statement_timeout:5000});return client;}});
    assert.equal(result.status,status);assert.equal(client.observations.includes('end'),!retained);
    if(mode!=='resume')assert.equal(client.observations.some(value=>value.includes('stage(')),mode==='stage_then_crash');
  }
  const client=exportClient({stage:false});await assert.rejects(executeShadowExport({connectionString:ownedUrl,key:EXPORT_TEST_KEY,mode:'stage_then_crash'},{environment:{},clientFactory:()=>client}),/STAGE_DENIED/);assert.equal(client.observations.at(-1),'end');
});
test('IPC entry preserves diagnostic leases, flushes real counters and returns only bounded failures',async t=>{
  const {Client}=createRequire(new URL('../package.json',import.meta.url))('pg'),client=exportClient();
  t.mock.method(Client.prototype,'connect',()=>client.connect());t.mock.method(Client.prototype,'query',(...args)=>client.query(...args));t.mock.method(Client.prototype,'end',()=>client.end());
  let handler,disconnected=0,flushes=0;const sent=[],originalOnce=process.once,originalExit=process.exitCode;
  const descriptors=['send','disconnect'].map(k=>[k,Object.getOwnPropertyDescriptor(process,k)]);
  t.mock.method(v8,'takeCoverage',()=>{flushes++;});syncBuiltinESMExports();
  Object.defineProperty(process,'send',{value:result=>sent.push(result),writable:true,configurable:true});
  Object.defineProperty(process,'disconnect',{value:()=>{disconnected++;},writable:true,configurable:true});
  t.mock.method(process,'once',function(event,listener){if(event==='message'){handler=listener;return process;}return originalOnce.call(this,event,listener);});
  try{
    await import('../../tools/phase9d/export-child.mjs');assert.equal(typeof handler,'function');assert.deepEqual(sent[0],{status:'READY'});
    const message={connectionString:ownedUrl,key:EXPORT_TEST_KEY,mode:'resume'};
    await handler(message);assert.deepEqual(sent.at(-1),{status:'ACKED',receipt:9});assert.equal(disconnected,1);
    for(const [mode,status] of [['claim_then_crash','CLAIMED'],['stage_then_crash','STAGED']]){await handler({...message,mode});assert.deepEqual(sent.at(-1),{status});assert.equal(disconnected,1);}
    assert.equal(flushes,3);await handler({...message,mode:'invalid'});assert.deepEqual(sent.at(-1),{status:'FAILED_CLOSED'});assert.equal(process.exitCode,1);assert.equal(disconnected,2);
  }finally{
    t.mock.restoreAll();syncBuiltinESMExports();process.exitCode=originalExit;
    for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(process,key,descriptor);else delete process[key];}
  }
});
test('saved-input admission binds schema, exact event order, synthetic key version and current sources before database creation',async t=>{
  const output=await mkdtemp(join(tmpdir(),'rcs-outbox-replay-')),sources={fixture:'a'.repeat(64)};
  const path=await prepareOutboxReplay({mode:'record-replay',output,sources}),recipe=JSON.parse(await readFile(path,'utf8'));
  assert.equal(recipe.schema,'shadow-outbox-replay-v1');assert.equal(recipe.keyVersion,'synthetic-fixture-v1');assert.equal(recipe.at,'2026-10-13T00:00:00.000Z');
  assert.deepEqual(recipe.events,['committed-driver-cancellation','export-stage','terminate-process','lease-121s','new-process-resume','duplicate-export','offline-frozen-v5','independent-review-gate','duplicate-worker']);assert.deepEqual(recipe.events,replayEvents);
  assert.deepEqual(recipe.sources,sources);assert.match(path,/replay-input-[a-f0-9-]{36}\.json$/);
  assert.equal(await prepareOutboxReplay({mode:'saved-replay',path,output,sources}),path);
  await assert.rejects(prepareOutboxReplay({mode:'saved-replay',path:output+'-foreign/input.json',output,sources}),/REPLAY_PATH_DENIED/);
  for(const change of [{schema:'other'},{keyVersion:'other'},{at:'2026-10-14T00:00:00.000Z'},{events:[...recipe.events].reverse()},{sources:{fixture:'b'.repeat(64)}},{journalIds:[]},{journalIds:['invalid',...recipe.journalIds.slice(1)]},
    {journalIds:['x'+recipe.journalIds[0],...recipe.journalIds.slice(1)]},{journalIds:[recipe.journalIds[0]+'x',...recipe.journalIds.slice(1)]}]){
    await writeFile(path,JSON.stringify({...recipe,...change}));await assert.rejects(prepareOutboxReplay({mode:'saved-replay',path,output,sources}));
  }
  await writeFile(path,JSON.stringify({...recipe,sources:{fixture:'b'.repeat(64)}}));await assert.rejects(prepareOutboxReplay({mode:'saved-replay',path,output,sources}),/REPLAY_SOURCE_DRIFT/);
  const valid=JSON.stringify(recipe);await writeFile(path,valid+' '.repeat(1048576-Buffer.byteLength(valid)));await assert.rejects(prepareOutboxReplay({mode:'saved-replay',path,output,sources}),/REPLAY_OVERSIZE/);
  await writeFile(path,' '.repeat(1048577));await assert.rejects(prepareOutboxReplay({mode:'saved-replay',path,output,sources}),/REPLAY_OVERSIZE/);
  t.mock.method(crypto,'randomUUID',()=> '00000000-0000-0000-0000-000000000001');syncBuiltinESMExports();
  try{await prepareOutboxReplay({mode:'record-replay',output,sources});await assert.rejects(prepareOutboxReplay({mode:'record-replay',output,sources}),error=>error.code==='EEXIST');}
  finally{t.mock.restoreAll();syncBuiltinESMExports();}
});
