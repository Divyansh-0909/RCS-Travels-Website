import {sendShadowDelivery} from './transport-http.mjs';
import {verifyReceipt,commitment} from './custody-protocol.mjs';
export async function verifyAndAcknowledge(client,receipt,event,keys){
  verifyReceipt(receipt,event,keys);
  return (await client.query('SELECT custody_export.ack($1,$2,$3) accepted',[event.sequence,commitment(event),receipt])).rows[0].accepted;
}
export async function deliverCustody(sender,endpoint,key){
  const frame=(await sender.query('SELECT custody_export.next() frame')).rows[0].frame;
  if(frame===null)return {status:'STOPPED_OR_REVIEW'};
  try{return {status:'RECEIVED',frame,receipt:await sendShadowDelivery(endpoint,key,frame)};}
  catch{return {status:'PENDING_OR_REVIEW'};}
}
