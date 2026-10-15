import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {minimizeServerDenials,appendDenialObservations} from '../../tools/phase9d/closure-observer.mjs';
import {validateClosureFrame} from '../../tools/phase9d/closure-contract.mjs';
const serverIdentity='a'.repeat(64),role='custody_sender',key='synthetic-observer-secret-at-least-thirty-two';
const log=overrides=>({timestamp:'2026-10-15 12:00:00.000 UTC',user:role,pid:123,session_id:'123.abc',line_num:2,state_code:'42501',error_severity:'ERROR',message:'private SQL\n{"state_code":"28P01"}',statement:'never exported',...overrides});
const options={serverIdentity,roles:[role],correlations:[{pid:123,role,sqlstate:'42501',denialClass:'SIGNING_SECRET'}]};
test('server JSON denial minimization excludes raw SQL and distinguishes claimed authentication actors',()=>{
  const records=minimizeServerDenials([log(),log({line_num:3,state_code:'28P01',error_severity:'FATAL'}),log({state_code:'00000'})].map(JSON.stringify).join('\n')+'\n',options);
  assert.equal(records.length,2);assert.equal(records[0].denialClass,'SIGNING_SECRET');assert.equal(records[1].actorTrust,'CLAIMED_UNAUTHENTICATED');assert.equal(records[1].denialClass,'AUTHENTICATION');
  assert.ok(!JSON.stringify(records).includes('never exported'));assert.ok(!JSON.stringify(records).includes('private'));
  assert.equal(minimizeServerDenials(JSON.stringify(log()),{...options,correlations:[]})[0].denialClass,'DATABASE_DENIAL');
  for(const change of [{pid:0},{line_num:1.5},{session_id:'invalid'},{timestamp:'invalid'},{user:'unknown'}])assert.throws(()=>minimizeServerDenials(JSON.stringify(log(change)),options));
  assert.throws(()=>minimizeServerDenials('x'.repeat(1048577),options));assert.throws(()=>minimizeServerDenials(JSON.stringify(log({message:'x'.repeat(16384)})),options));assert.throws(()=>minimizeServerDenials('not json',options));
});
test('bounded observer spool reuses duplicates, detects conflicting logs and preserves ordered signed inputs across restart',()=>{
  const source=randomUUID(),records=minimizeServerDenials(JSON.stringify(log()),options),configuration={source,key};
  const initial={frames:[]},first=appendDenialObservations(initial,records,configuration);assert.equal(initial.frames.length,0);
  assert.deepEqual(appendDenialObservations(JSON.parse(JSON.stringify(first)),records,configuration),first);
  const sources=new Map([[source,{id:source,key,service:'denial-observer-v2'}]]);validateClosureFrame(first.frames[0],sources);
  assert.throws(()=>appendDenialObservations(first,[{...records[0],denialClass:'ROLE_ESCALATION'}],configuration),/OBSERVER_CONFLICT/);
  const nextRecord={...records[0],logLine:'3'},second=appendDenialObservations(first,[nextRecord],configuration);assert.equal(second.frames[1].event.sequence,'2');validateClosureFrame(second.frames[1],sources);
  assert.throws(()=>appendDenialObservations(first,[nextRecord],{...configuration,maxRecords:1}),/OBSERVER_STORAGE_LIMIT/);
  assert.throws(()=>appendDenialObservations(initial,records,{...configuration,maxBytes:1}),/OBSERVER_STORAGE_LIMIT/);
  for(const change of [{sqlstate:'00000'},{actorTrust:'CLAIMED_UNAUTHENTICATED'},{denialClass:'unknown'},{authenticatedRole:'private@user'},{serverIdentity:'x'},{logLine:'0'},{ownerHash:'b'.repeat(64)},{extra:'forbidden'}])assert.throws(()=>validateClosureFrame({event:{...first.frames[0].event,...change},mac:first.frames[0].mac},sources));
});
