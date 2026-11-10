import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function observerOutcomes(module){
  const hex='a'.repeat(64),role='custody_sender',source='ffffffff-ffff-ffff-ffff-ffffffffffff',key='synthetic-observer-paired-witness-key';
  const log={timestamp:'2026-10-15 12:00:00.000 UTC',user:role,pid:123,session_id:'123.abc',line_num:1,state_code:'42501',error_severity:'ERROR'};
  const options={serverIdentity:hex,roles:[role]},outcomes=[];
  const observe=fn=>{try{return {accepted:true,value:fn()};}catch{return {accepted:false};}};
  for(const pid of [1,123,Number.MAX_SAFE_INTEGER])for(const state_code of ['42501','28P01'])for(const error_severity of ['ERROR','FATAL']){
    const records=module.minimizeServerDenials(JSON.stringify({...log,pid,state_code,error_severity}),options);
    assert.equal(records.length,1);assert.equal(records[0].denialClass,state_code==='42501'?'DATABASE_DENIAL':'AUTHENTICATION');outcomes.push(records);
  }
  for(const denialClass of ['APPLICATION_WRITE','BUDGET_CONFIGURATION','AUDIT_HISTORY','ROLE_ESCALATION','AUTHENTICATION','SIGNING_SECRET','GUARD_WRITE','OPERATIONS_CONTROL','DATABASE_DENIAL']){
    const records=module.minimizeServerDenials(JSON.stringify(log),{...options,correlations:[{pid:123,role,sqlstate:'42501',denialClass}]});
    assert.equal(records[0].denialClass,denialClass);outcomes.push(records);
  }
  for(const change of [{pid:0},{pid:1.5},{line_num:0},{line_num:1.5},{session_id:'invalid'},{timestamp:'invalid'},{user:'foreign'}]){
    const result=observe(()=>module.minimizeServerDenials(JSON.stringify({...log,...change}),options));assert.equal(result.accepted,false);outcomes.push(result);
  }
  const record={serverIdentity:hex,authenticatedRole:role,actorTrust:'AUTHENTICATED',sqlstate:'42501',logSessionHash:createHash('sha256').update(hex+'\n123.abc').digest('hex'),logLine:'1',denialClass:'DATABASE_DENIAL',observed:'2026-10-15T12:00:00.000Z'};
  const configuration={source,key},empty={frames:[]},first=module.appendDenialObservations(empty,[record],configuration),bytes=Buffer.byteLength(JSON.stringify(first));
  const minimumStateBytes=Buffer.byteLength(JSON.stringify(empty));assert.equal(minimumStateBytes,13);
  for(const state of [empty,first])for(const records of [[],[record]])for(const maxBytes of [-64,-1,0,1,12,13,14,bytes-1,bytes,bytes+1,bytes+0.5]){
    const result=observe(()=>module.appendDenialObservations(state,records,{...configuration,maxBytes}));
    if(maxBytes<=0)assert.equal(result.accepted,false);outcomes.push(result);
  }
  return {outcomes,minimumStateBytes,composition:'closed JSON spool state, native builtins, positive verified PID; compare admission and resulting records, not private assertion diagnostic text'};
}
