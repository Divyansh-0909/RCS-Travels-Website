import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {responsibilityEvidenceHash} from '../../backend/services/responsibilityAnalyst.js';
import {minimizeEvidence} from './privacy.mjs';
import {AI_RESPONSIBILITY_CONTRACT_VERSION} from '../../backend/services/responsibilityContracts.js';
export const EXPORT_SCHEMA='shadow-export-v1';
export const EXPORT_CONFIG='inactive-isolated-export-v1';
export const EXPORT_FROZEN_V5='e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75';

export function deriveShadowExport(source,key) {
  assert.equal(source.lineageValid,true,'SOURCE_LINEAGE');
  assert.ok(['DRIVER_CANCELLATION','RIDER_CANCELLATION','DRIVER_LATE'].includes(source.caseType),'UNSUPPORTED_FAMILY');
  assert.equal(responsibilityEvidenceHash(source.snapshot),source.evidenceHash,'SOURCE_HASH');
  assert.equal(source.snapshot.caseId,source.caseId,'SOURCE_CASE');
  assert.equal(source.snapshot.bookingId,source.bookingId,'SOURCE_BOOKING');
  assert.equal(source.snapshot.caseType,source.caseType,'SOURCE_FAMILY');
  assert.equal(source.snapshot.evidenceVersion,source.evidenceVersion,'SOURCE_VERSION');
  assert.equal(new Date(source.snapshot.generatedAt).toISOString(),new Date(source.generatedAt).toISOString(),'SOURCE_GENERATED_AT');
  assert.equal(source.contractVersion,AI_RESPONSIBILITY_CONTRACT_VERSION,'SOURCE_CONTRACT');
  assert.equal(source.analystConfigVersion,'responsibility-analyst-config-v1','SOURCE_ANALYST_CONFIG');
  assert.equal(source.policyVersion,'scheduled-responsibility-policy-v1','SOURCE_POLICY');
  const projected=minimizeEvidence(source.snapshot,key);
  const pseudonym=value=>createHmac('sha256',key).update(value).digest('hex');
  const payload={schema:EXPORT_SCHEMA,projection:projected.schema,config:EXPORT_CONFIG,
    collector:'phase7-committed-journal-v1',frozenV5:EXPORT_FROZEN_V5,key:pseudonym('export-v1:'+source.workId),
    lineage:{caseId:pseudonym(source.caseId),bookingId:pseudonym(source.bookingId),actorId:pseudonym(source.actorId),
      sourceEvent:pseudonym(source.sourceEvent),evidenceId:pseudonym(source.evidenceId),evidenceVersion:source.evidenceVersion,
      sourceWorkId:pseudonym(source.workId)},snapshot:projected.snapshot,evidenceHash:projected.evidenceHash,originalCommitment:projected.originalCommitment};
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<=65536,'EXPORT_OVERSIZE');
  return payload;
}
