import {createJevV5ResponsibilityAnalyst} from '../../backend/services/responsibilityJevV5.js';
import assert from 'node:assert/strict';
import {offlineResponse,offlineUsage,brokerDeadline,offlineFixtures} from './broker-offline.mjs';
export const brokerCall=async(client,name,args)=>(await client.query('SELECT broker9d.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value;
export async function executeBrokerAttempt(client,requestId,fixture,stage=async()=>{}) {
  assert.ok(offlineFixtures.includes(fixture));
  const work=await brokerCall(client,'reserve',[requestId]);
  if(!work)return {status:'NOT_RESERVED',calls:0};
  await stage('reserved',work);
  if(!await brokerCall(client,'admit',[work.id,work.token]))return {status:'FENCED',calls:0};
  await stage('admitted',work);
  if(!await brokerCall(client,'begin_send',[work.id,work.token]))return {status:'FENCED',calls:0};
  let calls=0;
  try {
    const analyst=createJevV5ResponsibilityAnalyst({client:{async systemOne(request,options){
      calls++;const response=await offlineResponse(request,options,fixture);assert.ok(Buffer.byteLength(JSON.stringify(response))<=32768);return response;
    }}});
    await stage('send',work);
    const envelope=await brokerDeadline(analyst.analyzeResponsibilityCase(work.payload.snapshot));
    await stage('provider',work);
    if(fixture==='unknown-usage')throw Error('USAGE_UNKNOWN');
    const response={envelope,usage:offlineUsage(envelope)};
    const saved=await brokerCall(client,'observe',[work.id,work.token,JSON.stringify(response)]);
    await stage('observed',work);
    return {status:saved?'RESPONSE_OBSERVED':'OBSERVATION_REJECTED',calls,id:work.id,token:work.token};
  }catch{
    await brokerCall(client,'unknown',[work.id,work.token]);
    return {status:'OUTCOME_UNKNOWN',calls,id:work.id,token:work.token};
  }
}
