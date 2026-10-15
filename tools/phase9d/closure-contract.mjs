import assert from 'node:assert/strict';
import {timingSafeEqual} from 'node:crypto';
import {validateEvent,validateFrame,sourceMac} from './custody-protocol.mjs';
import {denialClasses} from './closure-observer.mjs';
const actions={
  'source-lineage-v2':['SOURCE_LINEAGE','OUTBOX_CREATED','OUTBOX_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],
  'receiver-lineage-v2':['RECEIPT_ACCEPTED','WORK_ADMITTED','WORK_CHANGED','LOCAL_AUDIT','RECOVERY_AUTHORIZED'],
  'denial-observer-v2':['PERMISSION_DENIED','AUTHENTICATION_FAILED']
};
const actors=['application_transaction','shadow9d_exporter','shadow9d_capture','shadow9d_ops','shadow9d_worker','shadow9d_recorder','custody_operator','trusted_observer','broker9d_exec','broker9d_guard','broker9d_ops','broker9d_reconciler'];
export function validateClosureEvent(event){
  if(event.schema==='custody-event-v1')return validateEvent(event);
  if(event.schema==='custody-denial-v1'){
    const {serverIdentity,authenticatedRole,actorTrust,sqlstate,logSessionHash,logLine,denialClass,...base}=event;
    assert.equal(base.service,'denial-observer-v2');assert.equal(base.actor,'trusted_observer');assert.equal(base.ownerHash,null);assert.equal(base.database,serverIdentity);
    assert.match(serverIdentity,/^[a-f0-9]{64}$/);assert.match(logSessionHash,/^[a-f0-9]{64}$/);assert.match(authenticatedRole,/^[a-z][a-z0-9_]{0,62}$/);assert.match(logLine,/^[1-9][0-9]{0,14}$/);
    assert.ok(['42501','28P01'].includes(sqlstate));assert.equal(actorTrust,sqlstate==='42501'?'AUTHENTICATED':'CLAIMED_UNAUTHENTICATED');
    assert.ok(denialClasses.includes(denialClass));assert.equal(base.action,sqlstate==='42501'?'PERMISSION_DENIED':'AUTHENTICATION_FAILED');
    validateClosureEvent({...base,schema:'custody-event-v2'});return event;
  }
  const {identityHash,ownerHash,...base}=event;
  assert.equal(base.schema,'custody-event-v2');assert.ok(actions[base.service]?.includes(base.action));assert.ok(actors.includes(base.actor));
  assert.match(identityHash,/^[a-f0-9]{64}$/);if(ownerHash!==null)assert.match(ownerHash,/^[a-f0-9]{64}$/);
  // Reuse every closed scalar/identity/time bound; v2 explicitly replaces only these four enums.
  validateEvent({...base,schema:'custody-event-v1',service:'broker-receiver-v1',actor:'broker9d_exec',action:'REGISTER'});return event;
}
export function validateClosureFrame(frame,sources){
  const event=validateClosureEnvelope(frame,sources),source=sources.get(event.source);
  if(event.schema==='custody-event-v1')return validateFrame(frame,source.id,source.key);
  assert.ok(timingSafeEqual(Buffer.from(frame.mac,'hex'),Buffer.from(sourceMac(event,source.key),'hex')));return event;
}
export function validateClosureEnvelope(frame,sources){
  assert.deepEqual(Object.keys(frame).sort(),['event','mac']);assert.ok(Buffer.byteLength(JSON.stringify(frame))<=8192);
  const source=sources.get(frame.event.source);assert.ok(source,'UNKNOWN_SOURCE');
  const event=validateClosureEvent(frame.event);assert.equal(event.source,source.id);assert.equal(event.service,source.service);
  assert.match(frame.mac,/^[a-f0-9]{64}$/);return event;
}
