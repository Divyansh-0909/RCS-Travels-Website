import assert from 'node:assert/strict';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {responsibilityEvidenceHash} from '../../backend/services/responsibilityAnalyst.js';
import {EXPORT_SCHEMA,EXPORT_CONFIG,EXPORT_FROZEN_V5} from './export-projection.mjs';
export const TRANSPORT_PATH='/v1/shadow/deliveries';
export const TRANSPORT_LIMIT=65536;
export function transportMac(bytes,key) {
  assert.equal(typeof key,'string');assert.ok(key.length>=32);
  return createHmac('sha256',key).update('POST\n'+TRANSPORT_PATH+'\n').update(bytes).digest('hex');
}
export function authenticateTransport(bytes,mac,key) {
  return typeof mac==='string'&&/^[a-f0-9]{64}$/.test(mac)&&
    timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(transportMac(bytes,key),'hex'));
}
export function validateTransportPayload(bytes) {
  assert.ok(bytes.length>0&&bytes.length<=TRANSPORT_LIMIT,'PAYLOAD_LIMIT');
  const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  assert.ok(payload&&typeof payload==='object'&&!Array.isArray(payload));
  assert.deepEqual(Object.keys(payload).sort(),['schema','projection','config','collector','frozenV5','key','lineage','snapshot','evidenceHash','originalCommitment'].sort());
  assert.equal(payload.schema,EXPORT_SCHEMA);assert.equal(payload.config,EXPORT_CONFIG);
  assert.equal(payload.projection,'shadow-minimized-v1');assert.equal(payload.collector,'phase7-committed-journal-v1');assert.equal(payload.frozenV5,EXPORT_FROZEN_V5);
  for(const field of ['key','evidenceHash','originalCommitment'])assert.match(payload[field],/^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(payload.lineage).sort(),['caseId','bookingId','actorId','sourceEvent','evidenceId','sourceWorkId','evidenceVersion'].sort());
  for(const field of ['caseId','bookingId','actorId','sourceEvent','evidenceId','sourceWorkId'])assert.match(payload.lineage[field],/^[a-f0-9]{64}$/);
  assert.equal(payload.lineage.evidenceVersion,'responsibility-evidence-v1');
  assert.equal(payload.lineage.caseId,payload.snapshot.caseId);assert.equal(payload.lineage.bookingId,payload.snapshot.bookingId);
  assert.ok(['DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE'].includes(payload.snapshot.caseType));
  assert.equal(responsibilityEvidenceHash(payload.snapshot),payload.evidenceHash);
  return payload;
}
