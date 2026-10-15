import { createHmac } from 'node:crypto';
import { responsibilityEvidenceBundleSchema } from '../../backend/services/responsibilityContracts.js';
import { responsibilityEvidenceHash } from '../../backend/services/responsibilityAnalyst.js';
// Versioned isolated projection loses causal information and requires review.
// Original journals and frozen V5 contracts remain untouched.
export function minimizeEvidence(input, key) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('PRIVACY_KEY_REQUIRED');
  if (Buffer.byteLength(JSON.stringify(input)) > 65536) throw new Error('EVIDENCE_OVERSIZE');
  const evidence = responsibilityEvidenceBundleSchema.parse(input);
  const pseudonym = value => createHmac('sha256', key).update(value).digest('hex');
  const snapshot = {
    ...evidence, caseId: pseudonym(evidence.caseId), bookingId: pseudonym(evidence.bookingId),
    timeline: evidence.timeline.map(entry => ({
      ...entry, id: pseudonym(entry.id), kind: 'minimized_observation', value: { redacted: true },
      source: 'isolated-minimized-v1', derivedFrom: entry.derivedFrom.map(pseudonym),
      availability: 'unknown', claimKey: null, quality: { redacted: true },
    })),
    completeness: { requiredCategories: evidence.completeness.requiredCategories,
      complete: false, missing: evidence.completeness.requiredCategories, unavailable: [] },
    contradictions: evidence.contradictions.map(item => ({ claimKey: pseudonym(item.claimKey),
      observations: item.observations.map(observation => ({ value: { redacted: true }, evidenceIds: observation.evidenceIds.map(pseudonym) })) })),
  };
  const parsed = responsibilityEvidenceBundleSchema.parse(snapshot);
  return { schema: 'shadow-minimized-v1', snapshot: parsed, evidenceHash: responsibilityEvidenceHash(parsed),
    originalCommitment: pseudonym(responsibilityEvidenceHash(evidence)) };
}
