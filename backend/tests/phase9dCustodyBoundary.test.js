import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {sendCustodyFrame} from '../../tools/phase9d/closure-client.mjs';
import {closureIngress} from '../../tools/phase9d/closure-ingress.mjs';
import {custodyStatus} from '../../tools/phase9d/closure-status.mjs';
import {appendDenialObservations} from '../../tools/phase9d/closure-observer.mjs';
import {validateClosureFrame} from '../../tools/phase9d/closure-contract.mjs';
import {FROZEN,commitment,sourceMac} from '../../tools/phase9d/custody-protocol.mjs';
import {sendShadowDelivery} from '../../tools/phase9d/transport-http.mjs';
import {transportMac} from '../../tools/phase9d/transport-protocol.mjs';
const key='synthetic-boundary-key-at-least-thirty-two';
test('capsule HTTP client pins service identity and bounds failure responses',async t=>{
  let mode='valid',calls=0;
  const timers=[],cleared=new Set(),nativeSet=setTimeout,nativeClear=clearTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>{const timer=nativeSet(fn,delay,...args);if(delay===2000)timers.push(timer);return timer;});
  t.mock.method(globalThis,'clearTimeout',timer=>{cleared.add(timer);nativeClear(timer);});
  const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('TEST_BOUNDARY_DEADLINE')),2500);})]);}finally{clearTimeout(timer);}};
  t.mock.method(http,'request',(_url,options,callback)=>{
    assert.equal(options.method,'POST');assert.equal(options.agent,false);assert.equal(options.headers['content-type'],'application/json');
    calls++;const request=new EventEmitter();request.destroy=error=>{request.emit('error',error);request.emit('close');};
    request.end=bytes=>{
      assert.equal(options.headers['content-length'],bytes.length);assert.equal(options.headers['x-shadow-mac'],transportMac(bytes,key));
      if(mode==='deadline')return;
      queueMicrotask(()=>{
        const response=new EventEmitter();response.statusCode=mode==='reject'?503:200;
        response.destroy=error=>response.emit('error',error);callback(response);
        if(mode==='error')response.emit('error',Error('closed'));
        else{const body=Buffer.from(mode==='oversize'?'{"committed":true}'.padEnd(4097,' '):mode==='boundary'?'{"committed":true}'.padEnd(4096,' '):mode==='json'?'invalid':'{"committed":true}');response.emit('data',body.subarray(0,2000));if(body.length>2000)response.emit('data',body.subarray(2000));response.emit('end');}
        request.emit('close');
      });
    };return request;
  });
  const endpoint='http://custody-ingress:7910/v1/shadow/deliveries';
  assert.deepEqual(await bounded(sendCustodyFrame(endpoint,key,{})),{committed:true});assert.ok(cleared.has(timers.at(-1)));
  assert.deepEqual(await bounded(sendCustodyFrame(endpoint.replace('custody-ingress','custody-signer'),key,{})),{committed:true});
  for(const invalid of [endpoint.replace('http:','https:'),endpoint.replace('custody-ingress','outside'),endpoint+'?override=1',endpoint+'#override',endpoint.replace('/v1/shadow/deliveries','/sign-anything'),endpoint.replace('http://','http://owner:secret@')])await assert.rejects(bounded(sendCustodyFrame(invalid,key,{})));
  assert.equal(calls,2);await assert.rejects(bounded(sendCustodyFrame(endpoint,key,{payload:'x'.repeat(8192)})));assert.equal(calls,2);
  assert.deepEqual(await bounded(sendCustodyFrame(endpoint,key,{x:'x'.repeat(8184)})),{committed:true});
  mode='boundary';assert.deepEqual(await bounded(sendCustodyFrame(endpoint,key,{})),{committed:true});
  for(const [selected,message]of [['reject','CUSTODY_REJECTED'],['json','RESPONSE_INVALID'],['oversize','RESPONSE_LIMIT'],['error','closed'],['deadline','CUSTODY_DEADLINE']]){mode=selected;await assert.rejects(bounded(sendCustodyFrame(endpoint,key,{})),{message});}
  assert.ok(timers.every(timer=>cleared.has(timer)));
});
test('authentication actor claims are closed denial frames and lineage status uses its own journal',async()=>{
  const source=randomUUID(),record={serverIdentity:'a'.repeat(64),authenticatedRole:'custody_sender',actorTrust:'CLAIMED_UNAUTHENTICATED',sqlstate:'28P01',logSessionHash:'b'.repeat(64),logLine:'1',denialClass:'AUTHENTICATION',observed:'2026-10-15T12:00:00.000Z'};
  const frame=appendDenialObservations({frames:[]},[record],{source,key}).frames[0];
  validateClosureFrame(frame,new Map([[source,{id:source,key,service:'denial-observer-v2'}]]));
  let queried=false;
  const local={query:async sql=>{assert.ok(sql.includes('FROM custody_lineage.events'));queried=true;return {rows:[]};}};
  assert.equal((await custodyStatus(local,null,1,null,{lineage:true})).status,'NO_LOCAL_CAPTURE');assert.equal(queried,true);
});
test('ingress crash hooks target the actual process boundary; default mode commits',async t=>{
  const event={schema:'custody-event-v1',source:randomUUID(),service:'broker-receiver-v1',database:'a'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'b'.repeat(64),action:'REGISTER',actor:'broker9d_exec',request:null,attempt:null,evidenceHash:null,evidenceVersion:null,receipt:null,configuration:null,generation:null,frozen:FROZEN,observed:'2026-10-15T00:00:00.000Z'};
  const frame={event,mac:sourceMac(event,key)},sources=new Map([[event.source,{id:event.source,service:event.service}]]);let queries=0,kills=0;
  t.mock.method(process,'kill',(pid,signal)=>{assert.equal(pid,process.pid);assert.equal(signal,'SIGKILL');kills++;throw Error('fault boundary');});
  const client={query:async()=>{queries++;return {rows:[{receipt:{hash:commitment(event)}}]};}};
  for(const mode of [undefined,'before-commit','after-commit']){
    const cfg={sources,ingressKey:key,signer:async body=>body};
    const server=mode===undefined?closureIngress(client,cfg):closureIngress(client,cfg,()=>mode);
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    try{const call=sendShadowDelivery(`http://127.0.0.1:${server.address().port}/v1/shadow/deliveries`,key,frame);if(mode)await assert.rejects(call);else assert.equal((await call).hash,commitment(event));}
    finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
  }
  assert.equal(queries,2);assert.equal(kills,2);
});
