import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
  const {identityHash:ignored,ownerHash:alsoIgnored,...base}=e,v1={...base,schema:'custody-event-v1',service:'broker-receiver-v1',action:'REGISTER',actor:'broker9d_exec'};
  assert.equal(validateClosureFrame(frame(v1),new Map([[v1.source,{id:v1.source,key,service:v1.service}]])),v1);assert.equal(validateClosureEvent(v1),v1);
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
  return new Promise((ok,fail)=>{const req=http.request({hostname:'127.0.0.1',port,path,method,agent:false,headers:{'content-length':bytes.length,'x-shadow-mac':mac}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>ok({status:res.statusCode,value:JSON.parse(Buffer.concat(chunks))}));});req.on('error',fail);req.end(bytes);});
}
test('bounded ingress HTTP rejects invalid requests and releases capacity after failures',async()=>{
  let calls=0,release;const server=closureHttp(key,async value=>{calls++;if(value.pause)return new Promise(ok=>{release=()=>ok({done:true});});if(value.fail)throw Error('private failure');if(value.lost)return null;return {value};});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port,bytes=Buffer.from('{}');
  try{
    assert.equal(server.maxConnections,4);assert.equal(server.maxHeadersCount,8);assert.equal(server.headersTimeout,2000);assert.equal(server.requestTimeout,3000);assert.equal(server.keepAliveTimeout,1000);
    assert.equal((await raw(port,bytes,{method:'GET'})).status,404);assert.equal((await raw(port,bytes,{path:'/wrong'})).status,404);
    assert.equal((await raw(port,bytes,{mac:'bad'})).status,401);assert.equal((await raw(port,Buffer.alloc(8193))).status,413);assert.equal((await raw(port,Buffer.from('{'))).status,503);
    assert.equal((await raw(port,Buffer.from([255]))).status,503);assert.equal(calls,0);
    assert.deepEqual((await raw(port,bytes)).value,{value:{}});
    const held=raw(port,Buffer.from('{"pause":true}'));while(!release)await new Promise(ok=>setTimeout(ok,5));assert.equal((await raw(port,bytes)).status,503);release();assert.equal((await held).status,200);
    assert.equal((await raw(port,Buffer.from('{"fail":true}'))).status,503);assert.equal((await raw(port,bytes)).status,200);
    await assert.rejects(raw(port,Buffer.from('{"lost":true}')));
    await new Promise((ok,fail)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/v1/shadow/deliveries',method:'POST',headers:{'content-length':100}},()=>fail(Error('partial body admitted')));const timeout=setTimeout(()=>{req.destroy();fail(Error('body deadline omitted'));},1700);req.on('error',()=>{clearTimeout(timeout);ok();});req.write('{');});
  }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
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
