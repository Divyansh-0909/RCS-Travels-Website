import { isDeepStrictEqual } from 'node:util';
import { generateLocationCandidates } from '../../services/search/locations/candidates.ts';
import { collectObservations } from '../../services/search/observations.ts';
import { statedVehicleExclusions } from '../../services/search/vehiclePolicy.ts';
import { validateDirection } from '../../services/search/validation.ts';
import { emptyDraft } from '../../services/search/contracts.ts';

const sameSpan = (a, b) => a.start === b.start && a.end === b.end && a.exactText === b.exactText;
const rate = (correct, total) => ({ correct, total });

// Gold query type is used ONLY to isolate generator coverage, never for inference.
// This does not replay changed provider inputs or claim new extraction accuracy.
export function measureB1(rows) {
  const simple = rows.filter(row => row.expected.complexity === 'SIMPLE');
  const counts = { pickup: [0, 0], drop: [0, 0], rolesRejected: [0, 0], exclusions: [0, 0], negativeFlags: [0, 0] };
  const cases = simple.map(row => {
    const query = row.parsed.draft.query;
    const generated = generateLocationCandidates(query, row.expected.queryType);
    const observed = collectObservations(query, generated.candidates);
    const endpoints = {};
    for (const role of ['pickup', 'drop']) {
      const expected = row.expected[`${role}Spans`];
      endpoints[role] = expected.map(span => {
        counts[role][1] += 1;
        const candidate = generated.candidates.find(item => sameSpan(item, span));
        if (candidate) counts[role][0] += 1;
        const draft = emptyDraft(query);
        // A synthetic opposite-role probe measures the deterministic guard only.
        const opposite = role === 'pickup' ? 'drop' : 'pickup';
        const bound = candidate ?? { ...span, candidateId: 'diagnostic', queryId: query.id, queryRevision: query.revision,
          method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'diagnostic-only' };
        draft.candidates = [bound];
        draft[opposite] = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: bound.candidateId }, refs: [] };
        const issues = [];
        validateDirection(draft, issues);
        counts.rolesRejected[1] += 1;
        const rejected = issues.some(issue => issue.code === 'ROLE_CONFLICT');
        if (rejected) counts.rolesRejected[0] += 1;
        return { ...span, covered: Boolean(candidate), oppositeRoleRejected: rejected };
      });
    }
    const exclusions = statedVehicleExclusions({ query }, observed.vehicles).sort();
    if (row.expected.vehicleExclusions.length) {
      counts.exclusions[1] += 1;
      if (isDeepStrictEqual(exclusions, [...row.expected.vehicleExclusions].sort())) counts.exclusions[0] += 1;
    }
    const flags = Object.entries(row.expected.flags).filter(([, value]) => value === false);
    for (const [flag] of flags) {
      counts.negativeFlags[1] += 1;
      if (observed.flags[flag].some(value => value.value === false)
        && !observed.flags[flag].some(value => value.value === true)) counts.negativeFlags[0] += 1;
    }
    const spansValid = generated.candidates.every(candidate => query.text.slice(candidate.start, candidate.end) === candidate.exactText);
    return { id: row.id, query: query.text, endpoints, exclusions, negativeFlags: flags.map(([flag]) => ({ flag,
      values: observed.flags[flag].map(value => value.value) })), spansValid,
      candidates: generated.candidates.map(({ start, end, exactText }) => ({ start, end, exactText })), issues: generated.issues };
  });
  return { scope: 'GOLD_QUERY_TYPE_DETERMINISTIC_DEVELOPMENT_DIAGNOSTIC_NOT_MODEL_ACCURACY', simpleCases: simple.length,
    metrics: Object.fromEntries(Object.entries(counts).map(([name, [correct, total]]) => [name, rate(correct, total)])),
    invalidSpanCases: cases.filter(row => !row.spansValid).map(row => row.id), cases };
}
