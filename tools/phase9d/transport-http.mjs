import http from 'node:http';
import assert from 'node:assert/strict';
import {TRANSPORT_PATH,TRANSPORT_LIMIT,transportMac} from './transport-protocol.mjs';
export async function sendShadowDelivery(endpoint,key,payload) {
  const url=new URL(endpoint);
  assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.pathname,TRANSPORT_PATH);assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.search,'');assert.equal(url.hash,'');
  const bytes=Buffer.from(JSON.stringify(payload));assert.ok(bytes.length<=TRANSPORT_LIMIT);
  return new Promise((resolve,reject)=>{
    const request=http.request(url,{method:'POST',headers:{'content-type':'application/json','content-length':bytes.length,'x-shadow-mac':transportMac(bytes,key)},agent:false},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>4096)response.destroy(Error('RESPONSE_LIMIT'));else chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>{
        if(response.statusCode!==200){reject(Object.assign(Error('DELIVERY_REJECTED'),{permanent:[400,401,403,404,413].includes(response.statusCode)}));return;}
        try{resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(Error('RESPONSE_INVALID'));}
      });
    });
    const timer=setTimeout(()=>request.destroy(Error('DELIVERY_DEADLINE')),2000);
    request.once('close',()=>clearTimeout(timer));request.on('error',reject);request.end(bytes);
  });
}
