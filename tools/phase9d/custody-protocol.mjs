import assert from 'node:assert/strict';
import {createHash,createHmac,timingSafeEqual,sign,verify} from 'node:crypto';
export const FROZEN='e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75';
const hex=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:1)));
export const commitment=event=>createHash('sha256').update('custody-event-v1\n'+canonical(event)).digest('hex');
export const sourceMac=(event,key)=>createHmac('sha256',key).update('custody-source-v1\n'+canonical(event)).digest('hex');
export const keyIdentity=key=>createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
export function validateEvent(e){
  assert.deepEqual(Object.keys(e).sort(),['schema','source','service','database','sequence','previous','localId','sourceHash','action','actor','request','attempt','evidenceHash','evidenceVersion','receipt','configuration','generation','frozen','observed'].sort());
  assert.equal(e.schema,'custody-event-v1');assert.equal(e.frozen,FROZEN);assert.match(e.source,uuid);
  assert.equal(e.service,'broker-receiver-v1');assert.match(e.database,hex);
  for(const field of ['sequence','localId'])assert.match(e[field],/^[1-9][0-9]{0,14}$/);
  for(const field of ['previous','sourceHash'])assert.match(e[field],hex);
  for(const field of ['evidenceHash','configuration'])if(e[field]!==null)assert.match(e[field],hex);
  for(const field of ['request','attempt','receipt'])if(e[field]!==null)assert.match(e[field],uuid);
  if(e.generation!==null)assert.match(e.generation,/^(0|[1-9][0-9]{0,14})$/);
  assert.ok([null,'responsibility-evidence-v1'].includes(e.evidenceVersion));
  assert.match(e.actor,/^broker9d_(exec|guard|ops|reconciler)$/);
  assert.ok(['REGISTER','RESERVE','BUDGET_DENIED','DISPATCH_ADMITTED','SEND_ATTEMPT','RESPONSE_OBSERVED','OUTCOME_UNKNOWN','RECOVER','GUARDED_RESULT_COMMITTED','USAGE_RECONCILED','USAGE_CONFLICT','UNSENT_TERMINAL_RELEASE','OPERATION_STOP','OPERATION_RESUME','OPERATION_TERMINATE','OPERATION_CLEAN'].includes(e.action));
  assert.match(e.observed,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(e.observed).toISOString(),e.observed);return e;
}
export function validateFrame(frame,source,key){
  assert.deepEqual(Object.keys(frame).sort(),['event','mac']);assert.ok(Buffer.byteLength(JSON.stringify(frame))<=8192);
  const event=validateEvent(frame.event);assert.equal(event.source,source);assert.match(frame.mac,hex);
  assert.ok(timingSafeEqual(Buffer.from(frame.mac,'hex'),Buffer.from(sourceMac(event,key),'hex')));return event;
}
export function signReceipt(body,privateKey){
  return {body,signature:sign(null,Buffer.from('custody-receipt-v1\n'+canonical(body)),privateKey).toString('base64')};
}
export function verifyReceipt(receipt,event,keys){
  assert.deepEqual(Object.keys(receipt).sort(),['body','signature']);const b=receipt.body;
  assert.deepEqual(Object.keys(b).sort(),['schema','custodian','source','sequence','hash','custodySequence','receipt','keyId','outcome'].sort());
  assert.equal(b.schema,'custody-receipt-v1');assert.equal(b.custodian,'isolated-custody-v1');assert.equal(b.outcome,'COMMITTED');
  assert.equal(b.source,event.source);assert.equal(b.sequence,event.sequence);assert.equal(b.hash,commitment(event));
  assert.match(b.custodySequence,/^[1-9][0-9]{0,14}$/);assert.match(b.receipt,uuid);assert.match(b.keyId,hex);
  assert.match(receipt.signature,/^[A-Za-z0-9+/]{86}==$/);const key=keys.get(b.keyId);assert.ok(key);
  assert.ok(verify(null,Buffer.from('custody-receipt-v1\n'+canonical(b)),key,Buffer.from(receipt.signature,'base64')));return b;
}
