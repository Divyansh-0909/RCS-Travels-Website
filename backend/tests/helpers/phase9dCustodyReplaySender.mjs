import {closureSession} from '../../../tools/phase9d/closure-session.mjs';
import {sendShadowDelivery} from '../../../tools/phase9d/transport-http.mjs';
process.once('message',async cfg=>{
  let client;
  try{
    client=await closureSession(cfg.uri,'custody_sender');
    const frame=(await client.query('SELECT custody_export.next() frame')).rows[0].frame;
    try{const receipt=await sendShadowDelivery(cfg.endpoint,cfg.ingressKey,frame);process.send({status:'RECEIVED',frame,receipt});}
    catch{process.send({status:'PENDING'});}
    if(cfg.pause)await new Promise(()=>{});
  }catch{process.send({status:'FAILED'});process.exitCode=1;}
  finally{await client?.end();process.disconnect();}
});
