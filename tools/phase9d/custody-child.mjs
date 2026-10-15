import {createPrivateKey,createPublicKey} from 'node:crypto';
import {custodySession} from './custody-session.mjs';
import {custodyService} from './custody-service.mjs';
import {deliverCustody,verifyAndAcknowledge} from './custody-delivery.mjs';
let client,server;
process.once('message',async c=>{
  try{
    const role={service:'custody_ingest',sender:'custody_sender',verifier:'custody_verifier'}[c.mode];
    const presented={environmentActor:new URL(process.env.TEST_DATABASE_URL).username,sourceKey:Object.hasOwn(c,'sourceKey'),receiptSigningKey:Object.hasOwn(c,'privateKey')};
    client=await custodySession(c.uri,role);
    if(c.mode==='service'){
      server=custodyService(client,{...c,privateKey:createPrivateKey(c.privateKey),publicKey:createPublicKey(c.publicKey)},()=>c.fault);
      await new Promise(ok=>server.listen(0,'127.0.0.1',ok));process.send({status:'READY',port:server.address().port,presented});return;
    }
    const result=c.mode==='sender'?await deliverCustody(client,c.endpoint,c.ingressKey):
      {accepted:await verifyAndAcknowledge(client,c.receipt,c.event,new Map([[c.keyId,createPublicKey(c.publicKey)]]))};
    process.send({...result,presented});
  }catch{process.send({status:'FAILED'});}
  finally{if(!server){await client?.end();process.disconnect();}}
});
process.on('disconnect',async()=>{if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));await client.end();}});
