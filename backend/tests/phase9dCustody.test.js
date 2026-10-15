import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,createHash,createHmac} from 'node:crypto';
import {FROZEN,canonical,commitment,sourceMac,validateEvent,validateFrame,keyIdentity,signReceipt,verifyReceipt} from '../../tools/phase9d/custody-protocol.mjs';
import {custodySession} from '../../tools/phase9d/custody-session.mjs';
import {deliverCustody,verifyAndAcknowledge} from '../../tools/phase9d/custody-delivery.mjs';
import http from 'node:http';
import {custodyService} from '../../tools/phase9d/custody-service.mjs';
import {transportMac} from '../../tools/phase9d/transport-protocol.mjs';
import {fork} from 'node:child_process';
import {sendShadowDelivery} from '../../tools/phase9d/transport-http.mjs';
const event=()=>({schema:'custody-event-v1',source:randomUUID(),service:'broker-receiver-v1',database:'d'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'a'.repeat(64),action:'REGISTER',actor:'broker9d_exec',request:null,attempt:null,evidenceHash:null,evidenceVersion:null,receipt:null,configuration:null,generation:null,frozen:FROZEN,observed:'2026-10-14T00:00:00.000Z'});
test('custody closed scalar protocol and asymmetric receipt binding',()=>{
  const e=event(),keys=generateKeyPairSync('ed25519'),keyId=keyIdentity(keys.publicKey),trust=new Map([[keyId,keys.publicKey]]);
  assert.equal(canonical({z:'x',a:null}),'{"a":null,"z":"x"}');assert.equal(validateEvent(e),e);
  assert.equal(FROZEN,'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75');
  assert.equal(canonical({a:1,b:2,c:3}),'{"a":1,"b":2,"c":3}');
  assert.equal(commitment(e),createHash('sha256').update('custody-event-v1\n'+canonical(e)).digest('hex'));
  assert.equal(sourceMac(e,'key'),createHmac('sha256','key').update('custody-source-v1\n'+canonical(e)).digest('hex'));
  assert.equal(keyId,createHash('sha256').update(keys.publicKey.export({type:'spki',format:'der'})).digest('hex'));
  const frame={event:e,mac:sourceMac(e,'key')};assert.equal(validateFrame(frame,e.source,'key'),e);
  validateFrame({mac:frame.mac,event:e},e.source,'key');
  for(const mac of [frame.mac.toUpperCase(),frame.mac+'x','x'+frame.mac])assert.throws(()=>validateFrame({...frame,mac},e.source,'key'));
  for(const changed of [{...frame,mac:'0'.repeat(64)},{...frame,mac:'bad'},{...frame,private:'secret'},{event:{...e,private:'secret'},mac:frame.mac}])assert.throws(()=>validateFrame(changed,e.source,'key'));
  assert.throws(()=>validateFrame(frame,randomUUID(),'key'));assert.throws(()=>validateFrame({event:{...e,actor:'x'.repeat(9000)},mac:frame.mac},e.source,'key'));
  const populated={...e,evidenceHash:'b'.repeat(64),configuration:'c'.repeat(64),request:randomUUID(),attempt:randomUUID(),receipt:randomUUID(),generation:'0',evidenceVersion:'responsibility-evidence-v1'};validateEvent(populated);
  for(const actor of ['broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'])validateEvent({...e,actor});
  for(const actor of ['xbroker9d_exec','broker9d_execx'])assert.throws(()=>validateEvent({...e,actor}));
  validateEvent({...e,generation:'123456789012345'});
  for(const action of ['REGISTER','RESERVE','BUDGET_DENIED','DISPATCH_ADMITTED','SEND_ATTEMPT','RESPONSE_OBSERVED','OUTCOME_UNKNOWN','RECOVER','GUARDED_RESULT_COMMITTED','USAGE_RECONCILED','USAGE_CONFLICT','UNSENT_TERMINAL_RELEASE','OPERATION_STOP','OPERATION_RESUME','OPERATION_TERMINATE','OPERATION_CLEAN'])validateEvent({...e,action});
  for(const field of ['database','previous','sourceHash','evidenceHash','configuration'])for(const value of ['a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'x'+'a'.repeat(64),'a'.repeat(64)+'x','a'.repeat(64)+'\n'])assert.throws(()=>validateEvent({...e,[field]:value}),field);
  for(const field of ['source','request','attempt','receipt'])for(const value of ['x'+e.source,e.source+'x',e.source+'\n',e.source.toUpperCase(),e.source.slice(1),e.source.replace('-','x')])assert.throws(()=>validateEvent({...e,[field]:value}),field);
  for(const field of ['sequence','localId','generation'])for(const value of ['1x','x1','1\n',' 1','1.2','1'.repeat(16)])assert.throws(()=>validateEvent({...e,[field]:value}),field);
  for(const value of ['2026-10-14T24:00:00.000Z','2026-10-14T00:00:00.000Zx','x2026-10-14T00:00:00.000Z','2026-10-14T00:00:00.000Z\n','+010000-10-14T00:00:00.000Z'])assert.throws(()=>validateEvent({...e,observed:value}));
  for(const [field,value]of Object.entries({schema:'x',frozen:'x',source:'x',service:'x',database:'x',sequence:'0',localId:'-1',previous:'x',sourceHash:'x',evidenceHash:'x',configuration:'x',request:'x',attempt:'x',receipt:'x',generation:'-1',evidenceVersion:'x',actor:'admin',action:'HUMAN_FINAL',observed:'2026-02-30T00:00:00.000Z'}))assert.throws(()=>validateEvent({...e,[field]:value}),field);
  const body={schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:'1',hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId,outcome:'COMMITTED'},receipt=signReceipt(body,keys.privateKey);
  assert.deepEqual(verifyReceipt(receipt,e,trust),body);
  verifyReceipt({signature:receipt.signature,body},e,trust);
  for(const custodySequence of ['x1','1x','11','10']){
    const r=signReceipt({...body,custodySequence},keys.privateKey);
    if(/^[0-9]+$/.test(custodySequence))verifyReceipt(r,e,trust);else assert.throws(()=>verifyReceipt(r,e,trust));
  }
  for(const value of [' '+receipt.signature,receipt.signature+'x',receipt.signature+'\n'])assert.throws(()=>verifyReceipt({...receipt,signature:value},e,trust));
  assert.throws(()=>verifyReceipt(signReceipt({...body,keyId:'invalid'},keys.privateKey),e,new Map([['invalid',keys.publicKey]])));
  for(const [field,value]of Object.entries({schema:'x',custodian:'x',source:randomUUID(),sequence:'2',hash:'0'.repeat(64),custodySequence:'0',receipt:'x',keyId:'x',outcome:'PENDING'}))assert.throws(()=>verifyReceipt(signReceipt({...body,[field]:value},keys.privateKey),e,trust));
  assert.throws(()=>verifyReceipt({...receipt,signature:'x'},e,trust));assert.throws(()=>verifyReceipt(signReceipt(body,generateKeyPairSync('ed25519').privateKey),e,trust));assert.throws(()=>verifyReceipt(receipt,e,new Map()));
});
test('custody session refuses environment/URI/identity escalation and closes failed admission',async()=>{
  const role='custody_sender',name='rcs_verify_'+'a'.repeat(32),uri=`postgresql://${role}:synthetic@localhost:5432/${name}`;
  const row={actor:role,effective:role,database:name,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false};let closes=0,factoryCalls=0;
  const factory=options=>{factoryCalls++;assert.deepEqual(options,{connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000});return {async connect(){},async query(sql){assert.equal(sql,'SELECT session_user actor,current_user effective,current_database() database,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=session_user');return {rows:[row]};},async end(){closes++;}};};
  await custodySession(uri,role,{environment:{},factory});
  for(const value of [uri+'?user=postgres',uri+'#x',uri.replace('localhost','external'),uri.replace(name,'production'),uri.replace('postgresql:','https:'),uri.replace(name,'nested/'+name),uri+'suffix']){const before=factoryCalls;await assert.rejects(custodySession(value,role,{environment:{},factory}));assert.equal(factoryCalls,before);}
  for(const actor of ['custody_verifier','custody_ingest','custody_inspector'])await custodySession(uri.replace(role,actor),actor,{environment:{},factory:()=>({async connect(){},async query(){return {rows:[{...row,actor,effective:actor}]};},async end(){}})});
  await custodySession(uri.replace('postgresql:','postgres:'),role,{environment:{},factory:()=>({async connect(){},async query(){return {rows:[row]};},async end(){}})});
  await assert.rejects(custodySession(uri.replace(':5432/',':1/'),role,{environment:{}}),{code:'ECONNREFUSED'});
  await assert.rejects(custodySession(uri,'postgres',{environment:{},factory}));
  for(const k of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET'])await assert.rejects(custodySession(uri,role,{environment:{[k]:'synthetic'},factory}));
  row.rolsuper=true;await assert.rejects(custodySession(uri,role,{environment:{},factory}));assert.equal(closes,1);
});
test('custody acknowledgement verifies before SQL; stopped sender cannot fabricate delivery',async()=>{
  const e=event(),keys=generateKeyPairSync('ed25519'),keyId=keyIdentity(keys.publicKey);let calls=0;
  const client={async query(sql,args){calls++;if(sql==='SELECT custody_export.next() frame'){assert.equal(args,undefined);return {rows:[{frame:null}]};}assert.equal(sql,'SELECT custody_export.ack($1,$2,$3) accepted');assert.deepEqual(args,[e.sequence,commitment(e),r]);return {rows:[{accepted:true}]};}};
  assert.deepEqual(await deliverCustody(client,'http://127.0.0.1:1/v1/shadow/deliveries','key'),{status:'STOPPED_OR_REVIEW'});
  await assert.rejects(verifyAndAcknowledge(client,{body:{}},e,new Map()));assert.equal(calls,1);
  const r=signReceipt({schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:e.sequence,hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId,outcome:'COMMITTED'},keys.privateKey);
  assert.equal(await verifyAndAcknowledge(client,r,e,new Map([[keyId,keys.publicKey]])),true);
});
test('custody ingress bounded authentication, parsing, capacity, outage and lost response',async t=>{
  const set=globalThis.setTimeout,clear=globalThis.clearTimeout,ids=new Set(),cleared=new Set();
  t.mock.method(globalThis,'setTimeout',(cb,ms,...args)=>{const id=set(cb,ms,...args);if(ms===1000)ids.add(id);return id;});
  t.mock.method(globalThis,'clearTimeout',id=>{if(ids.has(id))cleared.add(id);return clear(id);});
  const e=event(),keys=generateKeyPairSync('ed25519'),keyId=keyIdentity(keys.publicKey),sourceKey='synthetic-source-key',ingressKey='synthetic-ingress-key-at-least-32-bytes';let mode=null,held=false,release;
  const body={schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:e.sequence,hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId,outcome:'COMMITTED'};
  const client={async query(sql,args){assert.equal(sql,'SELECT custody.accept($1,$2,$3) receipt');assert.deepEqual(args,[e,commitment(e),keyId]);if(mode==='error')throw Error('synthetic');if(mode==='hold'){held=true;await new Promise(ok=>release=ok);}return {rows:[{receipt:body}]};}};
  const server=custodyService(client,{source:e.source,sourceKey,ingressKey,...keys},()=>mode);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const request=(bytes,options={})=>new Promise((ok,fail)=>{const req=http.request({host:'127.0.0.1',port:options.port??server.address().port,path:'/v1/shadow/deliveries',method:'POST',headers:{'x-shadow-mac':transportMac(bytes,ingressKey)},...options},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>ok({code:res.statusCode,text,headers:res.headers}));});req.setTimeout(2500,()=>req.destroy(Error('TEST_RESPONSE_DEADLINE')));req.on('error',fail);req.end(bytes);});
  let bytes;
  try{
    bytes=JSON.stringify({event:e,mac:sourceMac(e,sourceKey)});
    const status=async(bytes,options,code,error)=>{const r=await request(bytes,options);assert.equal(r.code,code);assert.equal(r.headers['content-type'],'application/json');if(error)assert.deepEqual(JSON.parse(r.text),{error});else assert.deepEqual(JSON.parse(r.text),signReceipt(body,keys.privateKey));};
    await status(bytes,{},200);await status(bytes,{method:'GET'},404,'ROUTE');await status(bytes,{path:'/invalid'},404,'ROUTE');
    await status(bytes,{headers:{}},401,'AUTH');await status('{',{},400,'CONTRACT');await status('x'.repeat(8193),{},413,'LIMIT');
    await status(bytes+' '.repeat(8192-Buffer.byteLength(bytes)),{},200);
    mode='error';await status(bytes,{},503,'UNAVAILABLE');mode='lost-ack';const lostAt=Date.now();await assert.rejects(request(bytes));assert.ok(Date.now()-lostAt<1700,'lost-ack injection closes the response immediately');
    mode='hold';const pending=request(bytes);while(!held)await new Promise(ok=>setTimeout(ok,5));await status(bytes,{},503,'CAPACITY');release();assert.equal((await pending).code,200);
    mode=null;
    await new Promise((ok,fail)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/v1/shadow/deliveries',method:'POST'},()=>fail(Error('partial request cannot enter ingress')));const deadline=setTimeout(()=>{fail(Error('missing ingress body deadline'));req.destroy();},1700);req.once('error',()=>{clearTimeout(deadline);ok();});req.write('{');});
    assert.equal((await request(bytes)).code,200);
    const sender={async query(){return {rows:[{frame:{event:e,mac:sourceMac(e,sourceKey)}}]};}};
    assert.equal((await deliverCustody(sender,'http://127.0.0.1:'+server.address().port+'/v1/shadow/deliveries',ingressKey)).status,'RECEIVED');
    assert.equal((await deliverCustody(sender,'http://127.0.0.1:1/v1/shadow/deliveries',ingressKey)).status,'PENDING_OR_REVIEW');
  }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
  const defaultServer=custodyService(client,{source:e.source,sourceKey,ingressKey,...keys});await new Promise(ok=>defaultServer.listen(0,'127.0.0.1',ok));
  try{assert.equal((await request(bytes,{port:defaultServer.address().port})).code,200);}finally{defaultServer.closeAllConnections();await new Promise(ok=>defaultServer.close(ok));}
  assert.equal(cleared.size,ids.size);
});
test('custody crash branches terminate real children before/after the independent commit boundary',async()=>{
  for(const fault of ['before-commit','after-commit']){
    const child=fork(new URL('./helpers/phase9dCustodyFaultChild.js',import.meta.url),{execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});let queries=0;
    const exit=new Promise(ok=>child.once('exit',(code,signal)=>ok({code,signal})));child.on('message',r=>{if(r.stage==='QUERY')queries++;});
    try{
      const ready=await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('UNIT_CHILD_START')),4000);child.once('message',r=>{clearTimeout(timer);ok(r);});child.send({fault});});
      await assert.rejects(sendShadowDelivery('http://127.0.0.1:'+ready.port+'/v1/shadow/deliveries',ready.ingressKey,ready.frame));
      let timer;try{const stopped=await Promise.race([exit,new Promise((_,fail)=>timer=setTimeout(()=>fail(Error('UNIT_CHILD_NOT_TERMINATED')),4000))]);assert.ok(stopped.code!==0||stopped.signal!==null);}finally{clearTimeout(timer);}
      assert.equal(queries,fault==='before-commit'?0:1);
    }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;}
  }
});
