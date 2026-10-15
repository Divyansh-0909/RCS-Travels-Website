import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonical,commitment,sourceMac,FROZEN} from './custody-protocol.mjs';
export const denialClasses=['APPLICATION_WRITE','BUDGET_CONFIGURATION','AUDIT_HISTORY','ROLE_ESCALATION','AUTHENTICATION','SIGNING_SECRET','GUARD_WRITE','OPERATIONS_CONTROL','DATABASE_DENIAL'];
const digest=value=>createHash('sha256').update(value).digest('hex');
// Input must come from the trusted server-log channel, never an actor's stdout.
export function minimizeServerDenials(bytes,{serverIdentity,roles,correlations=[]}){
  assert.match(serverIdentity,/^[a-f0-9]{64}$/);assert.ok(Buffer.byteLength(bytes)<=1048576);
  const records=[];
  for(const line of bytes.split('\n')){
    if(!line.trim())continue;assert.ok(Buffer.byteLength(line)<=16384);const log=JSON.parse(line);
    if(!['42501','28P01'].includes(log.state_code)||!['ERROR','FATAL'].includes(log.error_severity))continue;
    assert.ok(Number.isSafeInteger(log.pid)&&log.pid>0);assert.ok(Number.isSafeInteger(log.line_num)&&log.line_num>0);
    assert.match(log.session_id,/^[a-f0-9]+\.[a-f0-9]+$/);assert.ok(roles.includes(log.user));
    const observed=new Date(log.timestamp).toISOString();
    const correlation=correlations.find(c=>c.pid===log.pid&&c.role===log.user&&c.sqlstate===log.state_code);
    const denialClass=log.state_code==='28P01'?'AUTHENTICATION':correlation?.denialClass??'DATABASE_DENIAL';assert.ok(denialClasses.includes(denialClass));
    records.push({serverIdentity,authenticatedRole:log.user,actorTrust:log.state_code==='28P01'?'CLAIMED_UNAUTHENTICATED':'AUTHENTICATED',sqlstate:log.state_code,
      logSessionHash:digest(serverIdentity+'\n'+log.session_id),logLine:String(log.line_num),denialClass,observed});
  }
  return records;
}
export function appendDenialObservations(state,records,{source,key,maxRecords=1000,maxBytes=1048576}){
  assert.ok(Number.isSafeInteger(maxRecords)&&maxRecords>0&&maxRecords<=10000);assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=10485760);
  const next=structuredClone(state),seen=new Map(next.frames.map(f=>[f.event.identityHash,f]));
  for(const record of records){
    const identity=digest(canonical({serverIdentity:record.serverIdentity,logSessionHash:record.logSessionHash,logLine:record.logLine}));
    const sourceHash=digest(canonical(record));
    if(seen.has(identity)){assert.equal(seen.get(identity).event.sourceHash,sourceHash,'OBSERVER_CONFLICT');continue;}
    assert.ok(next.frames.length<maxRecords,'OBSERVER_STORAGE_LIMIT');
    const sequence=String(next.frames.length+1),previous=next.frames.at(-1)?.event;
    const {observed,...metadata}=record;
    const event={schema:'custody-denial-v1',source,service:'denial-observer-v2',database:record.serverIdentity,sequence,previous:previous?commitment(previous):'0'.repeat(64),localId:sequence,sourceHash,
      actor:'trusted_observer',action:record.sqlstate==='28P01'?'AUTHENTICATION_FAILED':'PERMISSION_DENIED',request:null,attempt:null,evidenceHash:null,evidenceVersion:null,receipt:null,configuration:digest('jsonlog-denial-observer-v1'),generation:null,frozen:FROZEN,observed,identityHash:identity,ownerHash:null,...metadata};
    const frame={event,mac:sourceMac(event,key)};next.frames.push(frame);seen.set(identity,frame);
    assert.ok(Buffer.byteLength(JSON.stringify(next))<=maxBytes,'OBSERVER_STORAGE_LIMIT');
  }
  return next;
}
