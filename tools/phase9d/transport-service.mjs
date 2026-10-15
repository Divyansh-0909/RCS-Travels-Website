import http from 'node:http';
import assert from 'node:assert/strict';
import {authenticateTransport,validateTransportPayload,TRANSPORT_PATH,TRANSPORT_LIMIT,transportMac} from './transport-protocol.mjs';
export function createTransportService(repository,key,{fault=()=>null,maxConcurrent=8}={}) {
  transportMac(Buffer.alloc(0),key);
  assert.ok(Number.isInteger(maxConcurrent)&&maxConcurrent>=1&&maxConcurrent<=8);
  let outstanding=0;
  const server=http.createServer(async(request,response)=>{
    const finish=(code,value)=>{response.writeHead(code,{'content-type':'application/json'});response.end(JSON.stringify(value));};
    if(request.method!=='POST'||request.url!==TRANSPORT_PATH){finish(404,{error:'ROUTE'});return;}
    if(request.headers['content-type']!=='application/json'||request.headers['content-encoding']){finish(400,{error:'FORMAT'});return;}
    if(outstanding>=maxConcurrent){finish(503,{error:'CAPACITY'});return;}
    outstanding++;const timer=setTimeout(()=>request.destroy(),1000);
    try{
      const chunks=[];let size=0;
      for await(const chunk of request){size+=chunk.length;if(size>TRANSPORT_LIMIT){finish(413,{error:'PAYLOAD_LIMIT'});request.resume();return;}chunks.push(chunk);}
      clearTimeout(timer);const bytes=Buffer.concat(chunks);
      if(!authenticateTransport(bytes,request.headers['x-shadow-mac'],key)){finish(401,{error:'AUTH'});return;}
      let payload;try{payload=validateTransportPayload(bytes);}catch{finish(400,{error:'CONTRACT'});return;}
      const mode=fault();
      if(mode==='before-receipt-crash'){process.kill(process.pid);return;}
      const receipt=await repository.receive(payload);
      if(mode==='after-receipt-crash'){process.kill(process.pid);return;}
      if(mode==='lost-ack'){response.destroy();return;}
      if(receipt==null){finish(409,{error:'ADMISSION_DENIED'});return;}
      finish(200,receipt);
    }catch{if(!response.destroyed)finish(503,{error:'UNAVAILABLE'});}
    finally{clearTimeout(timer);outstanding--;}
  });
  server.requestTimeout=3000;server.headersTimeout=2000;server.keepAliveTimeout=1000;server.maxHeadersCount=8;
  return server;
}
