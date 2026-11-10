import assert from 'node:assert/strict';
import http from 'node:http';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PAIRED_EVENT_DEADLINE')),1500);})]);}finally{clearTimeout(timer);}};
const request=(port,key,transportMac,value)=>{
  const bytes=Buffer.from(JSON.stringify(value));
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:'/v1/shadow/deliveries',method:'POST',agent:false,headers:{'content-length':bytes.length,'x-shadow-mac':transportMac(bytes,key)}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>{try{resolve({status:res.statusCode,contentType:res.headers['content-type'],value:JSON.parse(Buffer.concat(chunks))});}catch(error){reject(error);}});
    });
    const timer=setTimeout(()=>req.destroy(Error('PAIRED_REQUEST_DEADLINE')),2000);
    req.once('close',()=>clearTimeout(timer));req.on('error',reject);req.end(bytes);
  });
};

export async function httpOutcomes(module,transportMac){
  const key='synthetic-http-paired-witness-key-at-least-thirty-two',calls=[],errors=[];
  let release,handlerReady;const closures=new Map();
  const server=module.closureHttp(key,async value=>{
    calls.push(value);
    if(value.defer)return new Promise(resolve=>{release=resolve;handlerReady?.();});
    if(value.fail)throw Error('private-handler-detail');
    return {value};
  },{handlerDeadlineMs:30});
  server.on('error',error=>errors.push(error.code??error.name));
  server.on('request',(req,res)=>{res.on('error',error=>errors.push(error.code??error.name));res.once('close',()=>closures.get(req.headers['x-paired-case'])?.());});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,outcomes=[];
  try{
    outcomes.push(await request(port,key,transportMac,{}));
    outcomes.push(await request(port,key,transportMac,{fail:true}));
    // A completed request times out while its underlying work remains occupied.
    outcomes.push(await request(port,key,transportMac,{defer:true}));
    outcomes.push(await request(port,key,transportMac,{duringDeadline:true}));
    release({late:true});await tick();await tick();
    outcomes.push(await request(port,key,transportMac,{afterDeadline:true}));
    // Abort a fully received request before its controlled handler settles.
    let req;
    const ready=new Promise(resolve=>{handlerReady=resolve;}),gone=new Promise(resolve=>{closures.set('handler-abort',resolve);});
    const bytes=Buffer.from('{"defer":true}');
    const aborted=new Promise(resolve=>{
      req=http.request({hostname:'127.0.0.1',port,path:'/v1/shadow/deliveries',method:'POST',agent:false,headers:{'content-length':bytes.length,'x-shadow-mac':transportMac(bytes,key),'x-paired-case':'handler-abort'}},()=>resolve('UNEXPECTED_RESPONSE'));
      req.on('error',error=>resolve(error.code));req.end(bytes);
    });
    await bounded(ready);req.destroy();await bounded(gone);outcomes.push(await bounded(aborted));
    handlerReady=undefined;closures.delete('handler-abort');release({aborted:true});await tick();await tick();
    outcomes.push(await request(port,key,transportMac,{afterAbort:true}));
    // Abort the body itself: there is no complete JSON or admitted handler.
    const partialGone=new Promise(resolve=>{closures.set('body-abort',resolve);});
    const partial=new Promise(resolve=>{
      const pending=http.request({hostname:'127.0.0.1',port,path:'/v1/shadow/deliveries',method:'POST',agent:false,headers:{'content-length':100,'x-paired-case':'body-abort'}},()=>resolve('UNEXPECTED_RESPONSE'));
      pending.on('error',error=>resolve(error.code));pending.write('{');pending.once('finish',()=>{});setTimeout(()=>pending.destroy(),10);
    });
    outcomes.push(await bounded(partial));await bounded(partialGone);closures.delete('body-abort');await tick();await tick();
    outcomes.push(await request(port,key,transportMac,{afterBodyAbort:true}));
    assert.deepEqual(outcomes.map(value=>typeof value==='string'?value:value.status),[200,503,503,503,200,'ECONNRESET',200,'ECONNRESET',200]);
    assert.deepEqual(errors,[]);
    return {outcomes,calls,errors,composition:'native Node HTTP; no additional response writer; private caught error labels and post-disconnect internal response metadata are not interfaces'};
  }finally{release?.({cleanup:true});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

export async function ingressOutcomes(module,protocol,transportMac){
  const key='synthetic-ingress-paired-witness-key-at-least-thirty-two',source='ffffffff-ffff-ffff-ffff-ffffffffffff',calls=[];
  const event={schema:'custody-event-v1',source,service:'broker-receiver-v1',database:'a'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'b'.repeat(64),action:'REGISTER',actor:'broker9d_exec',request:null,attempt:null,evidenceHash:null,evidenceVersion:null,receipt:null,configuration:null,generation:null,frozen:protocol.FROZEN,observed:'2026-10-15T00:00:00.000Z'};
  let failure=false;
  const server=module.closureIngress({async query(sql,args){calls.push({sql,args});if(failure)throw Error('private-database-detail');return {rows:[{receipt:{synthetic:true}}]};}},{sources:new Map([[source,{id:source,service:event.service}]]),ingressKey:key,signer:async body=>body});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,outcomes=[];
  try{
    const frame={event,mac:protocol.sourceMac(event,key)};
    outcomes.push(await request(port,key,transportMac,frame));
    failure=true;outcomes.push(await request(port,key,transportMac,frame));failure=false;
    outcomes.push(await request(port,key,transportMac,{...frame,event:{...event,source:'00000000-0000-0000-0000-000000000000'}}));
    assert.deepEqual(outcomes.map(value=>value.status),[200,503,503]);assert.equal(calls.length,2);
    return {outcomes,calls,composition:'omitted default fault callback; its return value is used only for strict comparisons with three string fault names'};
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
