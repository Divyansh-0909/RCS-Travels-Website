import {deriveShadowExport} from './export-projection.mjs';
import {createShadowExportRepository} from './export-repository.mjs';
import {sendShadowDelivery} from './transport-http.mjs';
export function createRemoteExportRepository(client,endpoint,key) {
  const repository=createShadowExportRepository(client);
  const call=async(sql,args)=>(await client.query(sql,args)).rows[0].value;
  return {...repository,async deliver(work){
    const payload=await call('SELECT outbox9d.remote_payload($1,$2) value',[work.id,work.token]);
    if(payload==null)return null;
    const receipt=await sendShadowDelivery(endpoint,key,payload);
    if(!await call('SELECT outbox9d.remote_ack($1,$2,$3) value',[work.id,work.token,JSON.stringify(receipt)]))return null;
    return receipt.body.receipt;
  }};
}
export async function pumpRemoteExport(client,endpoint,requestKey,privacyKey,{afterStage}={}) {
  const repository=createRemoteExportRepository(client,endpoint,requestKey);
  await repository.scan();const work=await repository.claim();if(!work)return {status:'EMPTY'};
  if(!work.payload){
    let payload;
    try{payload=deriveShadowExport(work.source,privacyKey);}catch{await repository.fail(work,false,'SOURCE_INVALID');return {status:'MANUAL_REVIEW'};}
    if(!await repository.stage(work,payload)){await repository.fail(work,false,'STAGE_DENIED');return {status:'MANUAL_REVIEW'};}
  }
  await afterStage?.(work);
  try{
    const receipt=await repository.deliver(work);
    if(receipt!=null)return {status:'ACKED',receipt};
  }catch(error){
    if(error.permanent){await repository.fail(work,false,'DELIVERY_UNAVAILABLE');return {status:'MANUAL_REVIEW'};}
  }
  await repository.fail(work,true,'DELIVERY_UNAVAILABLE');return {status:work.attempts>=4?'MANUAL_REVIEW':'RETRYABLE'};
}
