import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import v8 from 'node:v8';
import {mkdtemp,readFile,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import crypto,{createHmac} from 'node:crypto';
import {responsibilityEvidenceHash} from '../services/responsibilityAnalyst.js';
import {EventEmitter} from 'node:events';
import {prepareTransportReplay} from '../../tools/phase9d/transport-replay.mjs';
import {deriveShadowExport} from '../../tools/phase9d/export-projection.mjs';
import {exportSourceFixture,EXPORT_TEST_KEY} from './helpers/phase9dExportFixture.js';
import {transportMac,authenticateTransport,validateTransportPayload,TRANSPORT_PATH} from '../../tools/phase9d/transport-protocol.mjs';
import {sendShadowDelivery} from '../../tools/phase9d/transport-http.mjs';
import {createTransportService} from '../../tools/phase9d/transport-service.mjs';
import {openTransportDatabase} from '../../tools/phase9d/transport-database.mjs';
import {pumpRemoteExport,createRemoteExportRepository} from '../../tools/phase9d/transport-pump.mjs';
const key='synthetic-request-key-at-least-thirty-two';
const payload=()=>deriveShadowExport(exportSourceFixture(),EXPORT_TEST_KEY);
const request=async(server,bytes,headers={},path=TRANSPORT_PATH,method='POST')=>bounded(new Promise((done,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,headers:{'content-type':'application/json','x-shadow-mac':transportMac(bytes,key),...headers}},res=>{
    const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',reject);res.once('end',()=>done({code:res.statusCode,body:Buffer.concat(chunks).toString()}));
  });req.on('error',reject);req.end(bytes);
}));
const start=async server=>new Promise(done=>server.listen(0,'127.0.0.1',done));
const close=async server=>{server.closeAllConnections();return new Promise(done=>server.close(done));};
async function bounded(promise){
  let timer;try{return await Promise.race([promise,new Promise((_done,reject)=>{timer=setTimeout(()=>reject(Error('TEST_DEADLINE')),3000);})]);}finally{clearTimeout(timer);}
}

test('versioned body MAC binds bytes and protocol route; payload contract rejects adversarial variants',()=>{
  const p=payload(),bytes=Buffer.from(JSON.stringify(p)),mac=transportMac(bytes,key);
  assert.equal(mac,createHmac('sha256',key).update('POST\n/v1/shadow/deliveries\n').update(bytes).digest('hex'));
  assert.equal(authenticateTransport(bytes,mac,key),true);
  assert.equal(authenticateTransport(bytes,new String(mac),key),false);
  const shortKey='k'.repeat(32);assert.equal(authenticateTransport(bytes,transportMac(bytes,shortKey),shortKey),true);
  for(const bad of [null,'','z'.repeat(64),'A'.repeat(64),'1'.repeat(63),'1'.repeat(65),'0'.repeat(64),'x'+mac,mac+'x'])assert.equal(authenticateTransport(bytes,bad,key),false);
  assert.equal(authenticateTransport(Buffer.concat([bytes,Buffer.from(' ')]),mac,key),false);
  assert.throws(()=>transportMac(bytes,'short'));assert.throws(()=>transportMac(bytes,new String(key)));
  assert.deepEqual(validateTransportPayload(bytes),p);
  assert.deepEqual(validateTransportPayload(Buffer.concat([bytes,Buffer.alloc(65536-bytes.length,32)])),p);
  assert.throws(()=>validateTransportPayload(Buffer.concat([bytes,Buffer.alloc(65537-bytes.length,32)])),/PAYLOAD_LIMIT/);
  assert.throws(()=>validateTransportPayload(Buffer.alloc(0)),/PAYLOAD_LIMIT/);
  for(const family of ['RIDER_CANCELLATION','DRIVER_LATE']){
    const valid=payload();valid.snapshot.caseType=family;valid.evidenceHash=responsibilityEvidenceHash(valid.snapshot);
    assert.equal(validateTransportPayload(Buffer.from(JSON.stringify(valid))).snapshot.caseType,family);
  }
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(65537),Buffer.from([0xff]),Buffer.from('null'),Buffer.from('[]'),Buffer.from('{')])assert.throws(()=>validateTransportPayload(bytes));
  assert.throws(()=>validateTransportPayload(Buffer.from('null')),e=>e.code==='ERR_ASSERTION');
  const changes=[p=>p.extra=true,p=>p.schema='bad',p=>p.config='bad',p=>p.projection='bad',p=>p.collector='bad',p=>p.frozenV5='bad',p=>p.key='a'.repeat(63),p=>p.evidenceHash='a'.repeat(65),p=>p.originalCommitment='A'.repeat(64),p=>p.lineage.extra=1,p=>p.lineage.evidenceVersion='bad',p=>p.lineage.actorId='a'.repeat(65),p=>p.lineage.bookingId='a'.repeat(64),p=>p.lineage.caseId='a'.repeat(64),p=>p.snapshot.caseType='FAILED_PICKUP',p=>p.evidenceHash='0'.repeat(64)];
  for(const change of changes){const bad=payload();change(bad);assert.throws(()=>validateTransportPayload(Buffer.from(JSON.stringify(bad))));}
  for(const field of ['key','evidenceHash','originalCommitment'])for(const extra of ['prefix','suffix']){
    const bad=payload();bad[field]=extra==='prefix'?'x'+bad[field]:bad[field]+'x';assert.throws(()=>validateTransportPayload(Buffer.from(JSON.stringify(bad))));
  }
  const utf=payload();utf.snapshot.timeline[0].value={text:'�'};utf.evidenceHash=responsibilityEvidenceHash(utf.snapshot);
  const invalidUtf=Buffer.from(JSON.stringify(utf));const index=invalidUtf.indexOf(Buffer.from('�'));assert.ok(index>=0);
  const corrupted=Buffer.concat([invalidUtf.subarray(0,index),Buffer.from([255]),invalidUtf.subarray(index+3)]);assert.throws(()=>validateTransportPayload(corrupted),e=>e.code==='ERR_ENCODING_INVALID_ENCODED_DATA');
});

test('real HTTP service rejects authentication, shape, body limits and caps concurrent requests',async()=>{
  let calls=0,release;
  const server=createTransportService({receive:async()=>{calls++;return {receipt:'test'};}},key);await start(server);
  assert.equal(server.requestTimeout,3000);assert.equal(server.headersTimeout,2000);assert.equal(server.keepAliveTimeout,1000);assert.equal(server.maxHeadersCount,8);
  const bytes=Buffer.from(JSON.stringify(payload()));
  try{
    assert.equal((await request(server,bytes)).code,200);
    assert.equal((await request(server,Buffer.concat([bytes,Buffer.alloc(65536-bytes.length,32)]))).code,200);
    for(const [headers,path,method,code,error] of [[{},'/unknown','POST',404,'ROUTE'],[{},TRANSPORT_PATH,'GET',404,'ROUTE'],[{'content-type':'text/plain'},TRANSPORT_PATH,'POST',400,'FORMAT'],[{'content-encoding':'gzip'},TRANSPORT_PATH,'POST',400,'FORMAT'],[{'x-shadow-mac':'bad'},TRANSPORT_PATH,'POST',401,'AUTH']]){const result=await request(server,bytes,headers,path,method);assert.equal(result.code,code);assert.deepEqual(JSON.parse(result.body),{error});}
    assert.deepEqual(JSON.parse((await request(server,Buffer.from('{}'))).body),{error:'CONTRACT'});
    assert.deepEqual(JSON.parse((await request(server,Buffer.alloc(65537))).body),{error:'PAYLOAD_LIMIT'});assert.equal(calls,2);
  }finally{await close(server);}
  let immediate=false;
  const limited=createTransportService({receive:()=>immediate?{receipt:'later'}:new Promise(done=>{release=done;})},key,{maxConcurrent:1});await start(limited);
  try{
    const first=request(limited,bytes);first.catch(()=>{});await bounded((async()=>{while(!release)await new Promise(done=>setTimeout(done,1));})());
    const cap=await request(limited,bytes);assert.equal(cap.code,503);assert.deepEqual(JSON.parse(cap.body),{error:'CAPACITY'});
    release(null);const denied=await first;assert.equal(denied.code,409);assert.deepEqual(JSON.parse(denied.body),{error:'ADMISSION_DENIED'});
    immediate=true;assert.equal((await request(limited,bytes)).code,200);
  }finally{await close(limited);}
});

test('incomplete-body deadline releases capacity at the exact configured boundary',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let destroyCount=0,rejectRead;
  const service=createTransportService({receive:()=>{throw Error('must not process incomplete body');}},key);
  const req={method:'POST',url:TRANSPORT_PATH,headers:{'content-type':'application/json'},destroy(){destroyCount++;rejectRead(Error('body deadline'));},async *[Symbol.asyncIterator](){await new Promise((_done,reject)=>{rejectRead=reject;});yield Buffer.alloc(0);}};
  const res={destroyed:true};const pending=service.listeners('request')[0](req,res);
  t.mock.timers.tick(999);assert.equal(destroyCount,0);t.mock.timers.tick(1);assert.equal(destroyCount,1);await pending;
});

test('body deadline ends before SQL latency and aborted streams clear pending timers',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let destroyCount=0,release;
  const bytes=Buffer.from(JSON.stringify(payload()));
  const service=createTransportService({receive:()=>new Promise(done=>{release=done;})},key);
  const req={method:'POST',url:TRANSPORT_PATH,headers:{'content-type':'application/json','x-shadow-mac':transportMac(bytes,key)},destroy(){destroyCount++;},async *[Symbol.asyncIterator](){yield bytes;}};
  const result={};const res={destroyed:false,writeHead(code){result.code=code;},end(body){result.body=JSON.parse(body);}};
  const pending=service.listeners('request')[0](req,res);
  for(let i=0;i<20&&!release;i++)await new Promise(done=>setImmediate(done));assert.equal(typeof release,'function');
  t.mock.timers.tick(1100);assert.equal(destroyCount,0);release({receipt:'unit'});await pending;assert.equal(result.code,200);
  const aborted={...req,async *[Symbol.asyncIterator](){yield await Promise.reject(Error('stream aborted'));}};
  await service.listeners('request')[0](aborted,{destroyed:true});t.mock.timers.tick(1000);assert.equal(destroyCount,0);
});

test('bounded service errors and controlled crash/lost acknowledgement hooks',async()=>{
  for(const cap of [0,9,1.5,Infinity])assert.throws(()=>createTransportService({},key,{maxConcurrent:cap}));
  assert.throws(()=>createTransportService({},'short'));
  const bytes=Buffer.from(JSON.stringify(payload()));
  const server=createTransportService({receive:async()=>{throw Error('private error');}},key);await start(server);
  try{const result=await request(server,bytes);assert.equal(result.code,503);assert.deepEqual(JSON.parse(result.body),{error:'UNAVAILABLE'});assert.ok(!result.body.includes('private'));}finally{await close(server);}
  const originalKill=process.kill;let killed=0,calls=0;
  process.kill=pid=>{assert.equal(pid,process.pid);killed++;return true;};
  try{
    for(const mode of ['before-receipt-crash','after-receipt-crash','lost-ack']){
      const service=createTransportService({receive:async()=>{calls++;return {}; }},key,{fault:()=>mode});
      const req={method:'POST',url:TRANSPORT_PATH,headers:{'content-type':'application/json','x-shadow-mac':transportMac(bytes,key)},async *[Symbol.asyncIterator](){yield bytes;}};
      let destroyed=false;const res={destroy(){destroyed=true;}};
      await service.listeners('request')[0](req,res);assert.equal(destroyed,mode==='lost-ack');
    }
    assert.equal(killed,2);assert.equal(calls,2);
  }finally{process.kill=originalKill;}
});

test('HTTP sender bounds and pins loopback endpoint, deadline, response and status',async t=>{
  let forbiddenCalls=0;const guard=t.mock.method(http,'request',()=>{forbiddenCalls++;throw Error('UNAUTHORIZED_NETWORK_CALL');});syncBuiltinESMExports();
  for(const url of ['https://127.0.0.1'+TRANSPORT_PATH,'http://localhost'+TRANSPORT_PATH,'http://127.0.0.1/wrong','http://user@127.0.0.1'+TRANSPORT_PATH,'http://user:password@127.0.0.1'+TRANSPORT_PATH,'http://127.0.0.1'+TRANSPORT_PATH+'?x=1','http://127.0.0.1'+TRANSPORT_PATH+'#x'])await assert.rejects(sendShadowDelivery(url,key,payload()),e=>e.code==='ERR_ASSERTION');
  await assert.rejects(sendShadowDelivery('http://127.0.0.1'+TRANSPORT_PATH,key,{large:'x'.repeat(65537)}));
  assert.equal(forbiddenCalls,0);guard.mock.restore();syncBuiltinESMExports();
  let action='pass';const server=http.createServer((req,res)=>{req.resume();if(action==='hang')return;
    if(action==='large'){res.end(JSON.stringify({data:'a'.repeat(4086)}));return;}
    if(action==='exact'){res.end(JSON.stringify({data:'a'.repeat(4085)}));return;}
    if(action==='malformed'){res.end('{');return;}
    res.writeHead(action==='pass'?200:Number(action));res.end('{"receipt":"unit"}');
  });await start(server);const endpoint=`http://127.0.0.1:${server.address().port}${TRANSPORT_PATH}`;
  try{
    assert.deepEqual(await bounded(sendShadowDelivery(endpoint,key,payload())),{receipt:'unit'});
    const exact={pad:'a'.repeat(65526)};assert.equal(Buffer.byteLength(JSON.stringify(exact)),65536);assert.deepEqual(await bounded(sendShadowDelivery(endpoint,key,exact)),{receipt:'unit'});
    for(const code of ['400','401','403','404','413','409','429','503']){action=code;await assert.rejects(bounded(sendShadowDelivery(endpoint,key,payload())),e=>e.message==='DELIVERY_REJECTED'&&e.permanent===[400,401,403,404,413].includes(Number(code)));}
    action='exact';assert.equal(Buffer.byteLength(JSON.stringify({data:'a'.repeat(4085)})),4096);assert.equal((await bounded(sendShadowDelivery(endpoint,key,payload()))).data.length,4085);
    for(const [mode,message] of [['large','RESPONSE_LIMIT'],['malformed','RESPONSE_INVALID'],['hang','DELIVERY_DEADLINE']]){action=mode;await assert.rejects(bounded(sendShadowDelivery(endpoint,key,payload())),e=>e.message===message);}
  }finally{server.closeAllConnections();await close(server);}
  await assert.rejects(bounded(sendShadowDelivery(endpoint,key,payload())));
});

test('sender request contract and close event clear the independent deadline',async t=>{
  const p=payload(),bytes=Buffer.from(JSON.stringify(p));let clears=0,deadline,failResponse=false;
  const req=new EventEmitter();req.end=sent=>{assert.deepEqual(sent,bytes);queueMicrotask(()=>{
    const response=new EventEmitter();response.statusCode=200;callback(response);
    if(failResponse){response.emit('error',Error('synthetic response failure'));req.emit('close');return;}
    response.emit('data',Buffer.from('{"receipt":"unit"}'));response.emit('end');req.emit('close');
  });};req.destroy=error=>req.emit('error',error);
  let callback;
  t.mock.method(http,'request',(url,options,handler)=>{
    assert.equal(url.href,'http://127.0.0.1:18765'+TRANSPORT_PATH);
    assert.deepEqual(options,{method:'POST',headers:{'content-type':'application/json','content-length':bytes.length,'x-shadow-mac':transportMac(bytes,key)},agent:false});callback=handler;return req;
  });
  const originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
  const token={timer:true};t.mock.method(globalThis,'setTimeout',(fn,ms)=>{if(ms===3000)return originalSetTimeout(fn,ms);assert.equal(ms,2000);deadline=fn;return token;});
  t.mock.method(globalThis,'clearTimeout',value=>{if(value!==token){originalClearTimeout(value);return;}clears++;});syncBuiltinESMExports();
  try{
    assert.deepEqual(await bounded(sendShadowDelivery('http://127.0.0.1:18765'+TRANSPORT_PATH,key,p)),{receipt:'unit'});assert.equal(clears,1);
    let observed;req.on('error',error=>{observed=error.message;});deadline();assert.equal(observed,'DELIVERY_DEADLINE');
    failResponse=true;await assert.rejects(bounded(sendShadowDelivery('http://127.0.0.1:18765'+TRANSPORT_PATH,key,p)),/synthetic response failure/);assert.equal(clears,2);
  }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test('dedicated database admissions deny URI overrides and privileged identity and close on failures',async()=>{
  const uri='postgres://shadow9d_capture:synthetic@localhost/rcs_verify_'+'a'.repeat(32);
  const identity={actor:'shadow9d_capture',effective:'shadow9d_capture',database:'rcs_verify_'+'a'.repeat(32),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false};
  let creations=0,ends=0;
  const factory=options=>{assert.deepEqual(options,{connectionString:options.connectionString,connectionTimeoutMillis:2000,statement_timeout:2000});creations++;return {connect:async()=>{},end:async()=>{ends++;},query:async()=>({rows:[identity]})};};
  for(const bad of [uri.replace('postgres:','http:'),uri.replace('shadow9d_capture','owner'),uri.replace('localhost','remote'),uri+'?user=owner',uri+'#override',uri+'x',uri.replace('rcs_verify_','xrcs_verify_'),uri.replace('/rcs_verify_','/nested/rcs_verify_')])await assert.rejects(openTransportDatabase(bad,'shadow9d_capture',{environment:{},clientFactory:factory}));
  await assert.rejects(openTransportDatabase(uri,'owner',{environment:{},clientFactory:factory}));
  for(const variable of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'])await assert.rejects(openTransportDatabase(uri,'shadow9d_capture',{environment:{[variable]:'synthetic'},clientFactory:factory}));
  assert.equal(creations,0);
  const client=await openTransportDatabase(uri,'shadow9d_capture',{environment:{},clientFactory:factory});await client.end();
  await (await openTransportDatabase(uri.replace('postgres:','postgresql:'),'shadow9d_capture',{environment:{},clientFactory:factory})).end();
  for(const field of ['actor','effective','database','rolsuper','rolbypassrls','rolcreatedb','rolcreaterole']){
    const original=identity[field];identity[field]=typeof original==='boolean'?true:'wrong';await assert.rejects(openTransportDatabase(uri,'shadow9d_capture',{environment:{},clientFactory:factory}));identity[field]=original;
  }
  for(const stage of ['connect','query'])await assert.rejects(openTransportDatabase(uri,'shadow9d_capture',{environment:{},clientFactory:()=>({connect:async()=>{if(stage==='connect')throw Error('connect');},query:async()=>{throw Error('query');},end:async()=>{ends++;}})}));
  assert.equal(ends,11);
});

test('remote pump stages once and persists bounded denial/retry classifications',async()=>{
  const execute=(...args)=>bounded(pumpRemoteExport(...args));
  let claim=null,stage=true,ack=true,remote=payload(),events=[];
  const db={async query(sql,args){events.push([sql,args]);if(sql.includes('remote_payload'))assert.deepEqual(args,[claim.id,claim.token]);if(sql.includes('remote_ack'))assert.deepEqual(args,[claim.id,claim.token,JSON.stringify({body:{receipt:'unit-receipt'}})]);const value=sql.includes('scan()')?1:sql.includes('claim()')?claim:sql.includes('.stage(')?stage:sql.includes('remote_payload')?remote:sql.includes('remote_ack')?ack:true;return {rows:[{value}]};}};
  let code=200;const server=http.createServer((req,res)=>{req.resume();res.writeHead(code);res.end('{"body":{"receipt":"unit-receipt"}}');});await start(server);
  const endpoint=`http://127.0.0.1:${server.address().port}${TRANSPORT_PATH}`;
  try{
    assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'EMPTY');
    claim={id:1,token:'lease',source:exportSourceFixture(),payload:null};
    assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'ACKED');
    assert.ok(events.some(([sql,args])=>sql.includes('.stage(')&&JSON.parse(args[2]).key===payload().key));
    events=[];claim.payload=payload();await execute(db,endpoint,key,EXPORT_TEST_KEY);assert.ok(!events.some(([sql])=>sql.includes('.stage(')));
    remote=null;assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'RETRYABLE');remote=payload();
    ack=false;assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'RETRYABLE');ack=true;
    code=401;events=[];assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'MANUAL_REVIEW');assert.deepEqual(events.filter(([sql])=>sql.includes('.fail(')).map(([,args])=>args),[[1,'lease',false,'DELIVERY_UNAVAILABLE']]);
    code=503;events=[];assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'RETRYABLE');assert.deepEqual(events.filter(([sql])=>sql.includes('.fail(')).map(([,args])=>args),[[1,'lease',true,'DELIVERY_UNAVAILABLE']]);
    claim.attempts=4;assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'MANUAL_REVIEW');claim.attempts=1;
    claim.payload=null;stage=false;events=[];assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'MANUAL_REVIEW');assert.deepEqual(events.filter(([sql])=>sql.includes('.fail(')).map(([,args])=>args),[[1,'lease',false,'STAGE_DENIED']]);stage=true;
    claim.source.lineageValid=false;events=[];assert.equal((await execute(db,endpoint,key,EXPORT_TEST_KEY)).status,'MANUAL_REVIEW');assert.deepEqual(events.filter(([sql])=>sql.includes('.fail(')).map(([,args])=>args),[[1,'lease',false,'SOURCE_INVALID']]);
    assert.ok(events.some(([sql,args])=>sql.includes('.fail(')&&args[2]===false));
    claim.source=exportSourceFixture();await assert.rejects(execute(db,endpoint,key,EXPORT_TEST_KEY,{afterStage:()=>{throw Error('process interruption');}}));
    const repository=createRemoteExportRepository(db,endpoint,key);await repository.fail(claim,true,'DELIVERY_UNAVAILABLE');
  }finally{await close(server);}
});

test('standalone IPC child closes connections, fences failures and holds diagnostic stage for termination',async t=>{
  const {Client}=createRequire(new URL('../package.json',import.meta.url))('pg');
  let nextClaim=null,installed=true,ends=0;
  t.mock.method(Client.prototype,'connect',async()=>{});
  t.mock.method(Client.prototype,'end',async()=>{ends++;});
  t.mock.method(Client.prototype,'query',async function(sql,args){
    const role=this.connectionParameters.user;
    if(sql.includes('to_regprocedure'))assert.deepEqual(args,[role==='shadow9d_capture'?'transport9d.receive(jsonb)':'outbox9d.remote_ack(bigint,uuid,jsonb)']);
    if(sql.includes('transport9d.receive')){assert.deepEqual(args,[JSON.stringify(payload())]);return {rows:[{value:{receipt:'child-unit'}}]};}
    return {rows:[sql.includes('session_user')?{actor:role,effective:role,database:this.connectionParameters.database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}:sql.includes('to_regprocedure')?{installed}:{value:sql.includes('claim()')?nextClaim:1}]};
  });
  let configurationHandler,closeHandler,serverHandler,disconnected=0,flushed=0;
  const sent=[],originalOnce=process.once,originalOn=process.on,descriptors=['send','disconnect'].map(k=>[k,Object.getOwnPropertyDescriptor(process,k)]);
  Object.defineProperty(process,'send',{value:result=>sent.push(result),configurable:true});
  Object.defineProperty(process,'disconnect',{value:()=>{disconnected++;},configurable:true});
  t.mock.method(process,'once',function(event,handler){if(event==='message'){configurationHandler=handler;return process;}return originalOnce.call(this,event,handler);});
  t.mock.method(process,'on',function(event,handler){if(event==='message'){closeHandler=handler;return process;}return originalOn.call(this,event,handler);});
  t.mock.method(v8,'takeCoverage',()=>{flushed++;});
  t.mock.method(http,'createServer',handler=>{serverHandler=handler;return {listen(port,host,ready){assert.equal(port,0);assert.equal(host,'127.0.0.1');ready();},address(){return {port:1234};},close(done){done();}};});syncBuiltinESMExports();
  const uri=role=>'postgres://'+role+':synthetic@localhost/rcs_verify_'+'a'.repeat(32);
  try{
    await import('../../tools/phase9d/transport-child.mjs');assert.equal(sent[0].status,'READY');
    await configurationHandler({mode:'sender',connectionString:uri('shadow9d_exporter'),requestKey:key,privacyKey:EXPORT_TEST_KEY});assert.equal(sent.at(-1).status,'EMPTY');assert.equal(disconnected,1);assert.equal(ends,1);
    await configurationHandler({mode:'receiver',connectionString:uri('shadow9d_capture'),requestKey:key,fault:'lost-ack'});assert.deepEqual(sent.at(-1),{status:'LISTENING',port:1234});assert.equal(typeof serverHandler,'function');
    const bytes=Buffer.from(JSON.stringify(payload()));
    for(const attempt of [1,2]){
      const req={method:'POST',url:TRANSPORT_PATH,headers:{'content-type':'application/json','x-shadow-mac':transportMac(bytes,key)},async *[Symbol.asyncIterator](){yield bytes;}};
      const seen={};const res={destroyed:false,destroy(){seen.destroyed=true;},writeHead(status,headers){seen.status=status;assert.deepEqual(headers,{'content-type':'application/json'});},end(value){seen.body=JSON.parse(value);}};
      await serverHandler(req,res);assert.deepEqual(seen,attempt===1?{destroyed:true}:{status:200,body:{receipt:'child-unit'}});
    }
    await closeHandler({action:'ignore'});assert.equal(disconnected,1);await closeHandler({action:'close'});assert.equal(disconnected,2);assert.equal(ends,2);
    await configurationHandler({mode:'invalid',connectionString:uri('shadow9d_exporter'),requestKey:key});assert.equal(sent.at(-1).status,'FAILED_CLOSED');
    await configurationHandler({mode:'receiver',connectionString:uri('wrong'),requestKey:key});assert.equal(sent.at(-1).status,'FAILED_CLOSED');assert.equal(flushed,4);
    installed=false;await configurationHandler({mode:'receiver',connectionString:uri('shadow9d_capture'),requestKey:key});assert.equal(sent.at(-1).status,'FAILED_CLOSED');assert.equal(ends,3);installed=true;
    nextClaim={id:1,token:'synthetic',source:exportSourceFixture(),payload:null};
    configurationHandler({mode:'sender',connectionString:uri('shadow9d_exporter'),requestKey:key,privacyKey:EXPORT_TEST_KEY,crashAfterStage:true});
    for(let i=0;i<20&&sent.at(-1).status!=='STAGED';i++)await new Promise(done=>setImmediate(done));
    assert.equal(sent.at(-1).status,'STAGED');assert.equal(disconnected,5);
  }finally{
    t.mock.restoreAll();syncBuiltinESMExports();
    for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(process,name,descriptor);else delete process[name];}
  }
});

test('saved transport recipe validates sources, versions, event order, identifiers and size before any database creation',async t=>{
  const output=await mkdtemp(join(tmpdir(),'rcs-transport-replay-')),sources={fixture:'a'.repeat(64)};
  const path=await prepareTransportReplay({mode:'record-replay',output,sources});const bytes=await readFile(path),recipe=JSON.parse(bytes);
  assert.deepEqual(recipe.events,['committed-driver-cancellation','sender-stage-crash','lease-121s','receiver-durable-lost-ack','receiver-process-replacement','retry-31s','sender-ack','duplicate-export','existing-offline-v5-worker','terminal-cleanup','duplicate-receipt']);
  assert.ok(recipe.initial.bookings.length>0);assert.deepEqual(recipe.sources,sources);assert.equal(recipe.at,'2026-10-13T00:00:00.000Z');
  const admit=()=>prepareTransportReplay({mode:'saved-replay',path,output,sources});assert.equal(await admit(),path);
  for(const change of [r=>r.schema='other',r=>r.keyVersion='other',r=>r.at='other',r=>r.events.reverse(),r=>r.sources={},r=>r.id='x'+r.id,r=>r.id+='x',r=>r.serviceId='x'+r.serviceId,r=>r.serviceId+='x',r=>r.journalIds=[],r=>r.journalIds[0]='x'+r.journalIds[0],r=>r.journalIds[0]+='x']){
    const bad=structuredClone(recipe);change(bad);await writeFile(path,JSON.stringify(bad));await assert.rejects(admit());
  }
  await writeFile(path,Buffer.alloc(1048576));await assert.rejects(admit(),/REPLAY_OVERSIZE/);
  await writeFile(path,bytes);await assert.rejects(prepareTransportReplay({mode:'saved-replay',path,output,sources:{wrong:'hash'}}),/REPLAY_SOURCE_DRIFT/);
  await writeFile(path,bytes);await assert.rejects(prepareTransportReplay({mode:'saved-replay',path:join(output,'../escape.json'),output,sources}),/REPLAY_PATH_DENIED/);
  t.mock.method(crypto,'randomUUID',()=>recipe.id);syncBuiltinESMExports();
  try{await assert.rejects(prepareTransportReplay({mode:'record-replay',output,sources}),e=>e.code==='EEXIST');}finally{t.mock.restoreAll();syncBuiltinESMExports();await writeFile(path,bytes);}
  const other=join(output,'input.txt');await writeFile(other,bytes);await assert.rejects(prepareTransportReplay({mode:'saved-replay',path:other,output,sources}),/REPLAY_PATH_DENIED/);await unlink(other);
  await unlink(path);
});
