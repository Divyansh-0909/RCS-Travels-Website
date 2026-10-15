import http from 'node:http';
import {authenticateTransport,TRANSPORT_PATH} from './transport-protocol.mjs';
import {validateFrame,commitment,signReceipt,keyIdentity} from './custody-protocol.mjs';
export function custodyService(client,{source,sourceKey,ingressKey,privateKey,publicKey},fault=()=>null){
  const keyId=keyIdentity(publicKey);let busy=false;
  const server=http.createServer(async(req,res)=>{
    const finish=(code,value)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(req.method!=='POST'||req.url!==TRANSPORT_PATH){finish(404,{error:'ROUTE'});return;}
    if(busy){finish(503,{error:'CAPACITY'});return;}
    busy=true;const timer=setTimeout(()=>req.destroy(),1000);
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192){finish(413,{error:'LIMIT'});req.resume();return;}chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      if(!authenticateTransport(bytes,req.headers['x-shadow-mac'],ingressKey)){finish(401,{error:'AUTH'});return;}
      let event;
      try{event=validateFrame(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),source,sourceKey);}
      catch{finish(400,{error:'CONTRACT'});return;}
      const mode=fault();
      if(mode==='before-commit'){process.kill(process.pid);return;}
      const body=(await client.query('SELECT custody.accept($1,$2,$3) receipt',[event,commitment(event),keyId])).rows[0].receipt;
      if(mode==='after-commit'){process.kill(process.pid);return;}
      if(mode==='lost-ack'){res.destroy();return;}
      finish(200,signReceipt(body,privateKey));
    }catch{if(!res.destroyed)finish(503,{error:'UNAVAILABLE'});}
    finally{clearTimeout(timer);busy=false;}
  });
  server.headersTimeout=2000;server.requestTimeout=3000;server.keepAliveTimeout=1000;server.maxHeadersCount=8;return server;
}
