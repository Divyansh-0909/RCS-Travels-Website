import {deriveShadowExport} from './export-projection.mjs';
// Dependency hooks are test fault boundaries. No production entry point installs
// this pump; the owned rehearsal configuration starts disabled.
export async function pumpShadowExport(repository,key,{afterClaim,afterStage,afterDelivery}={}) {
  await repository.scan();
  const work=await repository.claim();
  if(!work)return {status:'EMPTY'};
  await afterClaim?.(work);
  let payload=work.payload;
  if(!payload){
    try{payload=deriveShadowExport(work.source,key);}
    catch{await repository.fail(work,false,'SOURCE_INVALID');return {status:'MANUAL_REVIEW'};}
    if(!await repository.stage(work,payload)){
      await repository.fail(work,false,'STAGE_DENIED');return {status:'MANUAL_REVIEW'};
    }
  }
  await afterStage?.(work);
  let receipt;
  try{receipt=await repository.deliver(work);}
  catch{await repository.fail(work,true,'DELIVERY_UNAVAILABLE');return {status:'RETRYABLE'};}
  if(receipt==null){await repository.fail(work,true,'DELIVERY_UNAVAILABLE');return {status:'RETRYABLE'};}
  await afterDelivery?.(work,receipt);
  return {status:'ACKED',receipt};
}
