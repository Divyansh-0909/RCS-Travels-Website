import { RESPONSIBILITY_ANALYST_CONFIG_VERSION } from '../../backend/services/responsibilityShadowConfig.js';
// Actual dedicated login; no privileged client with SET ROLE. SQL independently
// enforces limits even when this adapter is bypassed.
export function createIsolatedShadowRepository(client) {
  const call = async (sql, values) => (await client.query(sql, values)).rows[0].value;
  return {
    async claimNext() {
      const row = await call('SELECT shadow9d.claim() AS value', []);
      if (!row) return null;
      return { id: row.id, caseId: row.snapshot.caseId, evidenceVersionId: row.id,
        analystConfigVersion: RESPONSIBILITY_ANALYST_CONFIG_VERSION,
        attemptCount: row.attempts, claimedAt: row.lease_token,
        evidenceVersion: { snapshot: row.snapshot, evidenceHash: row.evidence_hash } };
    },
    async complete(work, result) {
      const saved = await call('SELECT shadow9d.complete($1,$2,$3) AS value', [work.id, work.claimedAt, JSON.stringify(result)]);
      return { completed: saved, result: saved ? result : null };
    },
    async fail(work, failure) {
      const changed = await call('SELECT shadow9d.fail($1,$2,$3) AS value', [work.id, work.claimedAt, failure.errorCategory]);
      return { changed };
    },
    permit: work => call('SELECT shadow9d.permit($1,$2) AS value', [work.id, work.claimedAt]),
  };
}
export function guardedOfflineAnalyst(repository, analyst, workRef) {
  return { async analyzeResponsibilityCase(evidence) {
    if (!await repository.permit(workRef.current)) throw Object.assign(new Error('SHADOW_STOPPED'), { code: 'SHADOW_STOPPED' });
    return analyst.analyzeResponsibilityCase(evidence);
  } };
}
