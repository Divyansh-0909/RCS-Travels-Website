// Separate capsule endpoints; preserve the accepted loopback-only transport client.
import assert from 'node:assert/strict';
import http from 'node:http';
import {TRANSPORT_PATH,transportMac} from './transport-protocol.mjs';
export async function sendCustodyFrame(endpoint,key,frame){
  const url=new URL(endpoint);
  assert.ok(['custody-ingress','custody-signer'].includes(url.hostname));
  assert.deepEqual([url.protocol,url.pathname,url.username,url.password,url.search,url.hash],['http:',TRANSPORT_PATH,'','','','']);
  const bytes=Buffer.from(JSON.stringify(frame));assert.ok(bytes.length<=8192);
  return new Promise((resolve,reject)=>{
    const request=http.request(url,{method:'POST',agent:false,headers:{'content-type':'application/json','content-length':bytes.length,'x-shadow-mac':transportMac(bytes,key)}},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>4096)response.destroy(Error('RESPONSE_LIMIT'));else chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>{
        if(response.statusCode!==200){reject(Error('CUSTODY_REJECTED'));return;}
        try{resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(Error('RESPONSE_INVALID'));}
      });
    });
    const deadline=setTimeout(()=>request.destroy(Error('CUSTODY_DEADLINE')),2000);
    request.once('close',()=>clearTimeout(deadline));request.once('error',reject);request.end(bytes);
  });
}
