import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fork} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer as createTcpServer} from 'node:net';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {validateClosureEvent,validateClosureFrame} from '../../tools/phase9d/closure-contract.mjs';
import {closureSession} from '../../tools/phase9d/closure-session.mjs';
import {closureHttp} from '../../tools/phase9d/closure-http.mjs';
import {closureIngress} from '../../tools/phase9d/closure-ingress.mjs';
import {FROZEN,sourceMac,commitment,keyIdentity,signReceipt,verifyReceipt} from '../../tools/phase9d/custody-protocol.mjs';
import {transportMac} from '../../tools/phase9d/transport-protocol.mjs';
import {sendShadowDelivery} from '../../tools/phase9d/transport-http.mjs';
const key='isolated-ingress-only-test-key-1234567890';
const event=()=>({schema:'custody-event-v2',source:randomUUID(),service:'source-lineage-v2',database:'a'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'b'.repeat(64),action:'SOURCE_LINEAGE',actor:'application_transaction',request:null,attempt:null,evidenceHash:'c'.repeat(64),evidenceVersion:'responsibility-evidence-v1',receipt:null,configuration:'d'.repeat(64),generation:null,frozen:FROZEN,observed:'2026-10-15T00:00:00.000Z',identityHash:'e'.repeat(64),ownerHash:null});
const frame=e=>({event:e,mac:sourceMac(e,key)});
test('versioned closed lineage frames preserve scalar bounds and source-service binding',()=>{
  const e=event(),sources=new Map([[e.source,{id:e.source,key,service:e.service}]]);assert.equal(validateClosureFrame(frame(e),sources),e);
  for(const [service,action]of [['source-lineage-v2','OUTBOX_CHANGED'],['receiver-lineage-v2','RECOVERY_AUTHORIZED'],['denial-observer-v2','AUTHENTICATION_FAILED']])assert.equal(validateClosureEvent({...e,service,action,ownerHash:'a'.repeat(64)}).action,action);
  for(const change of [{schema:'unknown'},{service:'unknown'},{action:'AUTO_FINE'},{actor:'owner'},{ownerHash:'bad'},{identityHash:'bad'},{extra:true},{sequence:'0'},{observed:'2026-02-30T00:00:00.000Z'}])assert.throws(()=>validateClosureEvent({...e,...change}));
  assert.throws(()=>validateClosureFrame(frame(e),new Map()));assert.throws(()=>validateClosureFrame({...frame(e),extra:true},sources));assert.throws(()=>validateClosureFrame({event:e,mac:'0'.repeat(64)},sources));
  assert.throws(()=>validateClosureFrame({event:e,mac:'bad'},sources));assert.throws(()=>validateClosureFrame(frame({...e,padding:'x'.repeat(8192)}),sources));
  assert.throws(()=>validateClosureFrame(frame(e),new Map([[e.source,{id:randomUUID(),key,service:e.service}]])));
  assert.throws(()=>validateClosureFrame(frame(e),new Map([[e.source,{id:e.source,key,service:'receiver-lineage-v2'}]])));
  const v1={...e,schema:'custody-event-v1',service:'broker-receiver-v1',action:'REGISTER',actor:'broker9d_exec'};delete v1.identityHash;delete v1.ownerHash;
  assert.equal(validateClosureFrame(frame(v1),new Map([[v1.source,{id:v1.source,key,service:v1.service}]])),v1);assert.equal(validateClosureEvent(v1),v1);
});
test('each supported lineage action and actor is accepted; closed identity boundaries reject prefixes and suffixes',()=>{
  const base=event();
  const actions={'source-lineage-v2':['SOURCE_LINEAGE','OUTBOX_CREATED','OUTBOX_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],'receiver-lineage-v2':['RECEIPT_ACCEPTED','WORK_ADMITTED','WORK_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],'denial-observer-v2':['PERMISSION_DENIED','AUTHENTICATION_FAILED']};
  for(const [service,values]of Object.entries(actions))for(const action of values)assert.equal(validateClosureEvent({...base,service,action}).action,action);
  for(const actor of ['application_transaction','shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_worker','shadow9d_recorder','custody_operator','trusted_observer','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'])assert.equal(validateClosureEvent({...base,actor}).actor,actor);
  for(const field of ['identityHash','ownerHash'])for(const value of ['!'+ 'a'.repeat(64),'a'.repeat(64)+'!','A'.repeat(64)])assert.throws(()=>validateClosureEvent({...base,[field]:value}));
});
test('service database admission rejects owner, memberships, URI overrides and privileged environment before SQL',async()=>{
  const role='custody_signer',database='rcs_verify_'+'a'.repeat(32),uri='postgresql://'+role+':synthetic@localhost:1/'+database;
  let created=0,ended=0,options,metadata={actor:role,effective:role,database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,member:false};
  const client={async connect(){},async query(sql){assert.ok(sql.includes('pg_catalog.pg_auth_members'));return {rows:[metadata]};},async end(){ended++;}},factory=o=>{created++;options=o;return client;};
  assert.equal(await closureSession(uri,role,{factory,environment:{}}),client);assert.deepEqual(options,{connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000});
  for(const field of ['actor','effective','database','rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolinherit','member']){const original=metadata;metadata={...metadata,[field]:typeof metadata[field]==='boolean'?true:'wrong'};await assert.rejects(closureSession(uri,role,{factory,environment:{}}));metadata=original;}
  const before=created;
  for(const invalid of ['https://'+role+'@localhost/'+database,uri+'?user=owner',uri+'#owner',uri.replace(role,'owner'),uri.replace(database,'production'),uri.replace('localhost','127.0.0.1')])await assert.rejects(closureSession(invalid,role,{factory,environment:{}}));
  for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET','CUSTODY_DATABASE_URL','TEST_MIGRATION_DATABASE_URL'])await assert.rejects(closureSession(uri,role,{factory,environment:{[name]:'present'}}));
  await assert.rejects(closureSession(uri,'owner',{factory,environment:{}}));await assert.rejects(closureSession(uri,role,{host:'remote',factory,environment:{}}));assert.equal(created,before);assert.equal(ended,9);
  for(const host of ['source-db','audit-db'])assert.equal(await closureSession(uri.replace('localhost',host),role,{host,environment:{},factory}),client);
  await assert.rejects(closureSession(uri,role,{factory:()=>({...client,async connect(){throw Error('connect failure');}}),environment:{}}),/connect failure/);
  await assert.rejects(closureSession(uri,role,{environment:{}}));
});
async function raw(port,bytes,{method='POST',path='/v1/shadow/deliveries',mac=transportMac(bytes,key)}={}){
  return new Promise((ok,fail)=>{const req=http.request({hostname:'127.0.0.1',port,path,method,agent:false,headers:{'content-length':bytes.length,'x-shadow-mac':mac}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',fail);res.on('end',()=>{try{assert.equal(res.headers['content-type'],'application/json');ok({status:res.statusCode,value:JSON.parse(Buffer.concat(chunks))});}catch(error){fail(error);}});});const timer=setTimeout(()=>req.destroy(Error('TEST_RESPONSE_DEADLINE')),2500);req.on('error',fail);req.once('close',()=>clearTimeout(timer));req.end(bytes);});
}
test('bounded ingress HTTP rejects invalid requests and releases capacity after failures',async()=>{
  let calls=0,release;const server=closureHttp(key,async value=>{calls++;if(value.pause)return new Promise(ok=>{release=()=>ok({done:true});});if(value.fail)throw Error('private failure');if(value.lost)return null;return {value};});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port,bytes=Buffer.from('{}');
  try{
    assert.equal(server.maxConnections,4);assert.equal(server.maxHeadersCount,8);assert.equal(server.headersTimeout,2000);assert.equal(server.requestTimeout,3000);assert.equal(server.keepAliveTimeout,1000);
    assert.deepEqual(await raw(port,bytes,{method:'GET'}),{status:404,value:{error:'ROUTE'}});assert.deepEqual(await raw(port,bytes,{path:'/wrong'}),{status:404,value:{error:'ROUTE'}});
    assert.deepEqual(await raw(port,bytes,{mac:'bad'}),{status:401,value:{error:'AUTH'}});assert.deepEqual(await raw(port,Buffer.alloc(8193)),{status:413,value:{error:'LIMIT'}});assert.deepEqual(await raw(port,Buffer.from('{')),{status:503,value:{error:'UNAVAILABLE'}});
    assert.equal((await raw(port,Buffer.from([255]))).status,503);
    assert.equal((await raw(port,Buffer.from([123,34,120,34,58,34,255,34,125]))).status,503);assert.equal(calls,0);
    assert.deepEqual((await raw(port,bytes)).value,{value:{}});
    assert.equal((await raw(port,Buffer.from('{}'.padEnd(8192,' ')))).status,200);
    const held=raw(port,Buffer.from('{"pause":true}'));held.catch(()=>{});for(let i=0;i<300&&!release;i++)await new Promise(ok=>setTimeout(ok,5));assert.ok(release);assert.deepEqual(await raw(port,bytes),{status:503,value:{error:'CAPACITY'}});await new Promise(ok=>setTimeout(ok,1100));release();assert.equal((await held).status,200);
    assert.deepEqual(await raw(port,Buffer.from('{"fail":true}')),{status:503,value:{error:'UNAVAILABLE'}});assert.equal((await raw(port,bytes)).status,200);
    await assert.rejects(raw(port,Buffer.from('{"lost":true}')));
    await new Promise((ok,fail)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/v1/shadow/deliveries',method:'POST',headers:{'content-length':100}},()=>fail(Error('partial body admitted')));const timeout=setTimeout(()=>{req.destroy();fail(Error('body deadline omitted'));},1700);req.on('error',()=>{clearTimeout(timeout);ok();});req.write('{');});
  }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
});
test('completed-body handler deadline bounds the caller and retains its outstanding slot until settlement',{timeout:4000},async()=>{
  for(const handlerDeadlineMs of [1,2500])assert.doesNotThrow(()=>closureHttp(key,()=>({}),{handlerDeadlineMs}));
  for(const handlerDeadlineMs of [0,-1,2501,1.5,NaN])assert.throws(()=>closureHttp(key,()=>({}),{handlerDeadlineMs}));
  for(const failure of [false,true]){
    let settle,calls=0;const server=closureHttp(key,()=>{calls++;return calls===1?new Promise((ok,fail)=>{settle=()=>failure?fail(Error('private deferred failure')):ok({late:true});}):{recovered:true};},{handlerDeadlineMs:30});
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port,bytes=Buffer.from('{}');
    try{
      const first=await raw(port,bytes);assert.deepEqual(first,{status:503,value:{error:'UNAVAILABLE'}});
      assert.equal((await raw(port,bytes)).status,503);assert.equal(calls,1);
      settle();await new Promise(ok=>setImmediate(ok));assert.equal((await raw(port,bytes)).status,200);assert.equal(calls,2);
    }finally{settle?.();server.closeAllConnections();await new Promise(ok=>server.close(ok));}
  }
});
test('rotation-aware ingress uses database-selected epoch and opaque failures',async()=>{
  const e=event(),keys=generateKeyPairSync('ed25519'),id=keyIdentity(keys.publicKey),sources=new Map([[e.source,{id:e.source,service:e.service}]]);let active=id,mode=null;const calls=[];
  const client={async query(sql,args){calls.push({sql,args});assert.equal(sql,'SELECT custody.ingest($1) receipt');assert.deepEqual(args,[frame(e)]);if(!active)throw Error('NO_ACTIVE_KEY');return {rows:[{receipt:{schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:e.sequence,hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId:id,outcome:'COMMITTED'}}]};}};
  const server=closureIngress(client,{sources,ingressKey:key,signer:async body=>signReceipt(body,keys.privateKey)},()=>mode);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const endpoint=`http://127.0.0.1:${server.address().port}/v1/shadow/deliveries`;
  try{
    const receipt=await sendShadowDelivery(endpoint,key,frame(e));verifyReceipt(receipt,e,new Map([[id,keys.publicKey]]));
    assert.equal(calls.length,1);active=null;await assert.rejects(sendShadowDelivery(endpoint,key,frame(e)));assert.equal(calls.length,2);
    active=id;mode='lost-ack';await assert.rejects(sendShadowDelivery(endpoint,key,frame(e)));assert.equal(calls.length,3);
    await assert.rejects(sendShadowDelivery(endpoint,key,frame({...e,source:randomUUID()})));assert.equal(calls.length,3);
  }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
});
test('every allowed capsule principal reaches exact default PG admission; decorated database paths fail first',async()=>{
  const database='rcs_verify_'+'a'.repeat(32),roles=['custody_sender','custody_verifier','custody_ingest','custody_inspector','custody_signer','custody_source_inspector','custody_source_sender','custody_receiver_sender','custody_lineage_inspector','custody_lineage_verifier','custody_observer'];
  for(const role of roles)for(const protocol of ['postgres:','postgresql:']){
    let connects=0;const metadata={actor:role,effective:role,database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,member:false};
    const client={async connect(){connects++;},async query(){return {rows:[metadata]};},async end(){}};
    const uri=protocol+'//'+role+':synthetic@localhost/'+database;assert.equal(await closureSession(uri,role,{factory:()=>client,environment:{}}),client);assert.equal(connects,1);
    for(const invalid of [uri.replace('/'+database,'/prefix/'+database),uri+'/suffix'])await assert.rejects(closureSession(invalid,role,{factory:()=>client,environment:{}}));assert.equal(connects,1);
  }
  let accepted=0;const server=createTcpServer(socket=>{accepted++;socket.on('error',()=>{});socket.resume();socket.end();});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try{await assert.rejects(closureSession('postgresql://custody_sender:synthetic@localhost:'+server.address().port+'/'+database,'custody_sender',{environment:{}}));assert.equal(accepted,1);}
  finally{await new Promise(ok=>server.close(ok));}
});
test('real ingress child terminates on each selected side of the synthetic DB adapter',async()=>{
  for(const mode of ['before-commit','after-commit','normal']){
    const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','NODE_V8_COVERAGE','__STRYKER_ACTIVE_MUTANT__'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
    const child=fork(fileURLToPath(new URL('./helpers/phase9dClosureIngressCrash.mjs',import.meta.url)),[mode],{env,execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    let calls=0;const exit=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));
    const exitWithin=async()=>{let timer;try{return await Promise.race([exit,new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('INGRESS_CHILD_DID_NOT_EXIT')),1500);})]);}finally{clearTimeout(timer);}};
    const ready=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{child.kill();fail(Error('INGRESS_CHILD_DEADLINE'));},5000);child.on('message',message=>{if(message.status==='DATABASE_ADAPTER_CALLED')calls++;if(message.status==='READY'){clearTimeout(timer);ok(message);}});child.once('error',error=>{clearTimeout(timer);fail(error);});});
    try{
      assert.equal(ready.mutationSelector,env.__STRYKER_ACTIVE_MUTANT__??null);
      const e={...event(),schema:'custody-event-v1',source:ready.source,service:'broker-receiver-v1',action:'REGISTER',actor:'broker9d_exec'};delete e.identityHash;delete e.ownerHash;
      const request=sendShadowDelivery(`http://127.0.0.1:${ready.port}/v1/shadow/deliveries`,ready.key,{event:e,mac:sourceMac(e,ready.key)});
      if(mode==='normal'){assert.deepEqual(await request,{synthetic:true});child.send('close');assert.equal((await exitWithin()).code,0);}
      else{await assert.rejects(request);const ended=await exitWithin();assert.ok(ended.signal==='SIGKILL'||ended.code===137||process.platform==='win32'&&ended.code===1);}
      assert.equal(calls,mode==='before-commit'?0:1);
    }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;}
  }
});

test('database admission resolves its backend PG dependency without a root package installation',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'rcs-custody-module-resolution-'));
  const backend=join(directory,'backend'),packages=join(backend,'node_modules'),pg=join(packages,'pg'),tools=join(directory,'tools'),moduleDirectory=join(tools,'phase9d');
  const file=join(moduleDirectory,'closure-session.mjs'),backendPackage=join(backend,'package.json'),pgPackage=join(pg,'package.json'),pgEntry=join(pg,'index.cjs');
  const database='rcs_verify_'+'a'.repeat(32),role='custody_sender',uri='postgresql://'+role+':synthetic@localhost:1/'+database;
  try{
    await mkdir(moduleDirectory,{recursive:true});await mkdir(pg,{recursive:true});
    await writeFile(file,await readFile(new URL('../../tools/phase9d/closure-session.mjs',import.meta.url)));
    await writeFile(backendPackage,JSON.stringify({name:'synthetic-backend-resolution-fixture',private:true}));
    await writeFile(pgPackage,JSON.stringify({name:'pg',version:'0.0.0-synthetic',main:'index.cjs'}));
    const metadata={actor:role,effective:role,database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,member:false};
    await writeFile(pgEntry,'exports.Client=class {constructor(options){this.options=options;}async connect(){this.connected=true;}async query(sql){this.sql=sql;return {rows:['+JSON.stringify(metadata)+']};}async end(){this.ended=true;}};');
    assert.throws(()=>createRequire(pathToFileURL(file)).resolve('pg'),{code:'MODULE_NOT_FOUND'});
    const {closureSession:stagedSession}=await import(pathToFileURL(file).href);
    const client=await stagedSession(uri,role,{environment:{}});
    try{assert.equal(client.connected,true);assert.match(client.sql,/pg_catalog\.pg_auth_members/);assert.deepEqual(client.options,{connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000});}
    finally{await client.end();assert.equal(client.ended,true);}
  }finally{
    for(const path of [file,backendPackage,pgPackage,pgEntry])await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
    for(const path of [moduleDirectory,tools,pg,packages,backend,directory])await rmdir(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
});
