import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID,generateKeyPairSync} from 'node:crypto';
import http from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {commitment,sourceMac,keyIdentity,FROZEN} from './custody-protocol.mjs';
import {transportMac} from './transport-protocol.mjs';
const out='output/phase9d-audit-custody-2026-10-14',report=JSON.parse(await readFile(out+'/mutation-round5.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const event={schema:'custody-event-v1',source:randomUUID(),service:'broker-receiver-v1',database:'a'.repeat(64),sequence:'999999999999999',previous:'b'.repeat(64),localId:'999999999999999',sourceHash:'c'.repeat(64),action:'GUARDED_RESULT_COMMITTED',actor:'broker9d_reconciler',request:randomUUID(),attempt:randomUUID(),evidenceHash:'d'.repeat(64),evidenceVersion:'responsibility-evidence-v1',receipt:randomUUID(),configuration:'e'.repeat(64),generation:'999999999999999',frozen:FROZEN,observed:'2026-10-14T00:00:00.000Z'};
const frame={event,mac:sourceMac(event,'synthetic-source')};assert.ok(Buffer.byteLength(JSON.stringify(frame))<8192);
const keys=generateKeyPairSync('ed25519'),keyId=keyIdentity(keys.publicKey),body={schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:event.source,sequence:event.sequence,hash:commitment(event),custodySequence:'1',receipt:randomUUID(),keyId,outcome:'COMMITTED'};
const moduleFor=async(file,source)=>{
  const fixed=source.replace(/from '(\.\/[^']+)'/g,(_all,p)=>'from '+JSON.stringify(new URL(p,pathToFileURL(resolve(file))).href));
  return import('data:text/javascript;base64,'+Buffer.from(fixed).toString('base64'));
};
function mutate(source,m){const lines=source.split('\n'),offset=p=>lines.slice(0,p.line-1).reduce((n,s)=>n+s.length+1,0)+p.column-1;
  const start=offset(m.location.start),end=offset(m.location.end),replacement=m.replacement===';'?';':'('+m.replacement+')';return source.slice(0,start)+replacement+source.slice(end);}
const denied=fn=>{try{return {allowed:true,value:fn()};}catch{return {allowed:false};}};
function protocolOutcomes(module){
  const outcomes=[];
  for(const value of [{z:1,a:2},{a:2,z:1},Object.fromEntries(Array.from({length:32},(_,i)=>['key-'+String(i).padStart(2,'0'),i]))])outcomes.push(module.canonical(value));
  for(const observed of [event.observed,'0000-01-01T00:00:00.000Z','9999-12-31T23:59:59.999Z','2026-02-30T00:00:00.000Z','+010000-01-01T00:00:00.000Z',event.observed+'x',' '+event.observed])outcomes.push(denied(()=>module.validateEvent({...event,observed})));
  for(const value of [frame,{event:{...event,actor:'x'.repeat(9000)},mac:frame.mac},{event:{...event,schema:'x'},mac:frame.mac}])outcomes.push(denied(()=>module.validateFrame(value,event.source,'synthetic-source')));
  const receipt=module.signReceipt(body,keys.privateKey);
  for(const trust of [new Map([[keyId,keys.publicKey]]),new Map(),new Map([[keyId,null]])])outcomes.push(denied(()=>module.verifyReceipt(receipt,event,trust)));
  return outcomes;
}
async function serviceOutcomes(module){
  const calls=[],ingressKey='synthetic-ingress-key-at-least-32-bytes';
  const client={async query(sql,args){calls.push({sql,args});return {rows:[{receipt:body}]};}};
  const server=module.custodyService(client,{source:event.source,sourceKey:'synthetic-source',ingressKey,...keys});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const request=(bytes,{partial=false}={})=>new Promise((ok,fail)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/v1/shadow/deliveries',method:'POST',headers:{'x-shadow-mac':transportMac(bytes,ingressKey)}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>ok({status:res.statusCode,contentType:res.headers['content-type'],body:JSON.parse(text)}));});
    const timer=setTimeout(()=>{req.destroy();fail(Error('EQUIVALENCE_DEADLINE'));},3000);req.once('close',()=>clearTimeout(timer));req.once('error',()=>partial?ok({status:'BODY_CLOSED'}):fail(Error('REQUEST_ERROR')));
    if(partial)req.write(bytes);else req.end(bytes);
  });
  const result=[];
  try{
    const bytes=Buffer.from(JSON.stringify(frame));result.push(await request(bytes));
    result.push(await request(Buffer.concat([bytes,Buffer.alloc(8193-bytes.length,32)])));
    for(const position of [0,12,Math.floor(bytes.length/2),bytes.length-1]){const malformed=Buffer.from(bytes);malformed[position]=0xff;result.push(await request(malformed));}
    result.push(await request(Buffer.from('{'),{partial:true}));
  }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
  return {result,calls};
}
const reviews=[];
for(const [file,row]of Object.entries(report.files))for(const m of row.mutants)if(m.status==='Survived'){
  const source=await readFile(file,'utf8');assert.equal(source,row.source,'SOURCE_DRIFT');const changed=mutate(source,m),original=await moduleFor(file,source),variant=await moduleFor(file,changed);
  const before=file.endsWith('protocol.mjs')?protocolOutcomes(original):await serviceOutcomes(original);
  const after=file.endsWith('protocol.mjs')?protocolOutcomes(variant):await serviceOutcomes(variant);assert.deepEqual(after,before,'NON_EQUIVALENT:'+file+':'+m.id);
  reviews.push({file,location:m.location,mutator:m.mutatorName,replacement:m.replacement,sourceHash:hash(source),variantHash:hash(changed),status:'REVIEWED_EQUIVALENT_ON_DECLARED_COMPOSITION',originalOutcomeHash:hash(JSON.stringify(before)),variantOutcomeHash:hash(JSON.stringify(after))});
}
await writeFile(out+'/reviewed-equivalences.json',JSON.stringify({code:0,reviews,maxAdmittedSerializedFrameBytes:Buffer.byteLength(JSON.stringify(frame)),conditions:['network-decoded closed ASCII scalar frames','Object.entries keys unique','Date ISO equality retained','configured trust map contains public KeyObjects or absent keys','default fault hook used only as a null/undefined no-fault selector','native Node HTTP streams; no host/prototype compromise','opaque denied outcome; exception text is not an authority contract'],scope:'paired executable samples plus reviewed invariants; changes to composition invalidate reviews'},null,2));
console.log(JSON.stringify({code:0,equivalents:reviews.length}));
