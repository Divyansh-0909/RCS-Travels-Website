import http from 'node:http';
import assert from 'node:assert/strict';
import {authenticateTransport,TRANSPORT_PATH} from './transport-protocol.mjs';
// Shared bounded HTTP framing for the isolated ingress and independent signer.
export function closureHttp(key,handle,{handlerDeadlineMs=1500}={}){
  assert.ok(Number.isSafeInteger(handlerDeadlineMs)&&handlerDeadlineMs>0&&handlerDeadlineMs<=2500);
  let busy=false;
  const server=http.createServer(async(req,res)=>{
    const send=(code,value)=>{if(!res.destroyed){res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(value));}};
    if(req.method!=='POST'||req.url!==TRANSPORT_PATH){send(404,{error:'ROUTE'});return;}
    if(busy){send(503,{error:'CAPACITY'});return;}
    busy=true;const timer=setTimeout(()=>req.destroy(),1000);let pending,handlerTimer;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192){send(413,{error:'LIMIT'});return;}chunks.push(chunk);}
      clearTimeout(timer);
      const bytes=Buffer.concat(chunks);if(!authenticateTransport(bytes,req.headers['x-shadow-mac'],key)){send(401,{error:'AUTH'});return;}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      pending=Promise.resolve().then(()=>handle(value));
      const deadline=new Promise((_,reject)=>{handlerTimer=setTimeout(()=>reject(Error('HANDLER_DEADLINE')),handlerDeadlineMs);});
      const result=await Promise.race([pending,deadline]);
      if(result===null){res.destroy();return;}send(200,result);
    }catch{send(503,{error:'UNAVAILABLE'});}finally{
      clearTimeout(timer);clearTimeout(handlerTimer);
      // A timed-out SDK/DB operation is not cancelled. Keep one slot until it settles.
      const release=()=>{busy=false;};if(pending)pending.then(release,release);else release();
    }
  });
  server.headersTimeout=2000;server.requestTimeout=3000;server.keepAliveTimeout=1000;server.maxHeadersCount=8;server.maxConnections=4;return server;
}
