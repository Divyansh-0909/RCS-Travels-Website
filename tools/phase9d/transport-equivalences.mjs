import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto,{randomUUID} from 'node:crypto';
import {mock} from 'node:test';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {hash} from './baseline.mjs';
import {deriveShadowExport} from './export-projection.mjs';
import {exportSourceFixture,EXPORT_TEST_KEY} from '../../backend/tests/helpers/phase9dExportFixture.js';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/phase9d-transport-2026-10-13');
const {Client}=createRequire(new URL('../../backend/package.json',import.meta.url))('pg');
const reports=['mutation-transport.json','mutation-transport-focused.json','mutation-transport-round3.json','mutation-transport-round4.json'],all=new Map();
const identity=(file,m)=>JSON.stringify([file,m.location,m.mutatorName,m.replacement]);
for(const name of reports){const r=JSON.parse(await readFile(join(out,name)));for(const [file,value] of Object.entries(r.files)){
  assert.equal(hash(value.source),hash(await readFile(join(root,file))));for(const m of value.mutants)all.set(identity(file,m),{file,...m});
}}
function replace(source,m){
  const lines=source.split('\n'),offset=position=>lines.slice(0,position.line-1).reduce((n,line)=>n+line.length+1,0)+position.column-1;
  const start=offset(m.location.start),end=offset(m.location.end);
  const replacement=['BlockStatement','CallExpression'].includes(m.mutatorName)?m.replacement:'('+m.replacement+')';
  return source.slice(0,start)+replacement+source.slice(end);
}
async function moduleFor(_file,source){const path=join(root,'tools/phase9d','.transport-equivalence-'+randomUUID()+'.mjs');await writeFile(path,source,{flag:'wx'});try{return await import(pathToFileURL(path).href);}finally{await unlink(path);}}
const bytes=Buffer.from(JSON.stringify(deriveShadowExport(exportSourceFixture(),EXPORT_TEST_KEY)));
async function protocol(module){
  const results=[];
  for(const value of [JSON.parse(bytes),null,false,true,0,1,'text',[],{},[{}]]){
    try{results.push({accepted:module.validateTransportPayload(Buffer.from(JSON.stringify(value)))});}catch(error){results.push({denied:true,type:error.constructor.name,code:error.code});}
  }
  return results;
}
async function replay(module){
  const output=await mkdtemp(join(tmpdir(),'rcs-transport-equivalence-'));let sequence=0;
  mock.method(crypto,'randomUUID',()=>`00000000-0000-0000-0000-${(++sequence).toString(16).padStart(12,'0')}`);syncBuiltinESMExports();
  let path;
  try{
    path=await module.prepareTransportReplay({mode:'record-replay',output,sources:{synthetic:'a'.repeat(64)}});
    assert.equal(await module.prepareTransportReplay({mode:'saved-replay',path,output,sources:{synthetic:'a'.repeat(64)}}),path);
    const recipe=JSON.parse(await readFile(path));assert.ok(recipe.initial.bookings.length>0);return recipe;
  }finally{mock.restoreAll();syncBuiltinESMExports();if(path)await unlink(path);}
}
async function ipc(file,source,mode){
  let handler;const sent=[],queries=[];let ends=0,connects=0;
  const originals=['send','disconnect'].map(name=>[name,Object.getOwnPropertyDescriptor(process,name)]),once=process.once;
  mock.method(Client.prototype,'connect',async()=>{connects++;});mock.method(Client.prototype,'end',async()=>{ends++;});
  mock.method(Client.prototype,'query',async sql=>{queries.push(sql);return {rows:[sql.includes('session_user')?{actor:'shadow9d_capture',effective:'shadow9d_capture',database:'rcs_verify_'+'a'.repeat(32),rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}:{installed:false}]};});
  Object.defineProperty(process,'send',{value:value=>sent.push(value),configurable:true});Object.defineProperty(process,'disconnect',{value:()=>{},configurable:true});
  mock.method(process,'once',function(event,callback){if(event==='message'){handler=callback;return process;}return once.call(this,event,callback);});
  try{
    await moduleFor(file,source);await handler({mode,connectionString:'postgres://shadow9d_capture:synthetic@localhost/rcs_verify_'+'a'.repeat(32)});
    assert.equal(sent.at(-1).status,'FAILED_CLOSED');assert.equal(connects,mode==='receiver'?1:0);
    return {sent,queries,ends,connects};
  }finally{mock.restoreAll();for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(process,name,descriptor);else delete process[name];}}
}
async function service(module,oversized){
  const queries=[],key='synthetic-equivalence-request-key-thirty-two';
  const server=module.createTransportService({receive:async payload=>{queries.push(payload);return {receipt:'synthetic'};}},key);
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    const body=oversized?Buffer.alloc(65537):bytes;
    const {transportMac}=await import('./transport-protocol.mjs');
    const response=await new Promise((done,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/v1/shadow/deliveries',method:'POST',headers:{'content-type':'application/json','x-shadow-mac':transportMac(body,key)}},res=>{
      const data=[];res.on('data',b=>data.push(b));res.on('error',reject);res.on('end',()=>done({status:res.statusCode,body:Buffer.concat(data).toString()}));
    });req.on('error',reject);req.end(body);});
    return {response,queries};
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
}
const reviewed=[];
for(const m of all.values())if(m.status==='Survived'){
  const source=await readFile(join(root,m.file),'utf8'),mutated=replace(source,m);let review;
  if(m.file.endsWith('transport-child.mjs')&&m.mutatorName==='StringLiteral'&&[8,11].includes(m.location.start.line)){
    const mode=m.location.start.line===8?'unsupported':'receiver';assert.deepEqual(await ipc(m.file,mutated,mode),await ipc(m.file,source,mode));
    review='Only an internal Error message changes. The unchanged catch emits the same bounded FAILED_CLOSED result and performs identical SQL/connection cleanup; no error message escapes.';
  }else if(m.file.endsWith('transport-protocol.mjs')&&m.location.start.line===18){
    assert.deepEqual(await protocol(await moduleFor(m.file,mutated)),await protocol(await moduleFor(m.file,source)));
    review='The exact ten-key Object.keys contract already excludes every JSON primitive and array. Removing this redundant object-type subcondition cannot admit a payload; structured outputs/error type/code agree.';
  }else if(m.file.endsWith('transport-service.mjs')&&m.mutatorName==='ArrowFunction'&&m.location.start.line===4){
    assert.deepEqual(await service(await moduleFor(m.file,mutated),false),await service(await moduleFor(m.file,source),false));
    review='Default null and undefined match none of the three strict fault-mode strings. Normal responses and complete repository calls agree. A changed fault dispatcher invalidates this review.';
  }else if(m.file.endsWith('transport-service.mjs')&&m.mutatorName==='CallExpression'&&m.location.start.line===16){
    assert.deepEqual(await service(await moduleFor(m.file,mutated),true),await service(await moduleFor(m.file,source),true));
    review='Node 24 async-iterator early return destroys the IncomingMessage in either composition. Explicit resume is redundant for this bounded server: same 413 body, zero repository calls and successful connection/server closure. Runtime/stream composition changes invalidate this review.';
  }else if(m.file.endsWith('transport-replay.mjs')&&m.mutatorName==='StringLiteral'&&m.location.start.line===12){
    assert.deepEqual(await replay(await moduleFor(m.file,mutated)),await replay(await moduleFor(m.file,source)));
    review='Only the prefix of an internal UUID-qualified output filename changes. Exclusive creation, returned-path selection, owned-directory/extension validation and complete deterministic recipe bytes agree. No consumer requires that prefix; a changed filename-selection contract invalidates this review.';
  }else throw Error('UNREVIEWED_MEANINGFUL_MUTANT:'+identity(m.file,m));
  reviewed.push({identity:identity(m.file,m),file:m.file,location:m.location,mutatorName:m.mutatorName,replacement:m.replacement,sourceSha256:hash(source),status:'REVIEWED_EQUIVALENT',review,pairedWitness:'PASS'});
}
await writeFile(join(out,'reviewed-equivalences.json'),JSON.stringify({reviewed,scope:'Only exact surviving identities above; raw statuses preserved; equivalences depend on unchanged surrounding validation/catch/stream composition.'},null,2));
console.log(JSON.stringify({pairedWitnesses:reviewed.length,status:'PASS'}));
