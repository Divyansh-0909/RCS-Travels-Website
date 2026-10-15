import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {evidenceCriteriaV5Questions} from '../../backend/benchmarks/responsibility/evidenceCriteriaV5.js';
export const offlineFixtures=Object.freeze(['valid','timeout','429','5xx','malformed','oversized','unknown-usage']);
export async function offlineResponse(request,options,fixture) {
  assert.deepEqual(request.questions,evidenceCriteriaV5Questions());
  assert.equal(options.retry.maxRetries,0);
  assert.ok(offlineFixtures.includes(fixture));
  if(fixture==='timeout')return new Promise(()=>{});
  if(['429','5xx'].includes(fixture))throw Error('OFFLINE_'+fixture);
  if(fixture==='malformed')return {model:'jev-1.13.0',answers:{responsibility:{choice:'SET_HUMAN_FINAL',confidence:1}}};
  if(fixture==='oversized')return {model:'jev-1.13.0',answers:{untrusted:'x'.repeat(33000)}};
  const answers=Object.fromEntries(Object.keys(request.questions).map(key=>[key,{choice:key==='responsibility'?'DRIVER_CAUSED':
    ['evidenceSufficient','ordinaryDriverFailure'].includes(key)?'YES':'NO',confidence:0.99}]));
  return {model:'jev-1.13.0',answers,usage:{input_tokens:128,output_tokens:32}};
}
export function offlineUsage(envelope) {
  return {input:128,output:32,minor:2,receipt:createHash('sha256').update(JSON.stringify(envelope)).digest('hex')};
}
export async function brokerDeadline(operation,milliseconds=2000) {
  let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('BROKER_DEADLINE')),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
