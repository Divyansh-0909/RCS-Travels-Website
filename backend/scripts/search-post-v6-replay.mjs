import { load, save } from './search-post-v6-offline.mjs';
import { replayDevelopmentCase } from '../benchmarks/search/postV6Offline.js';

const phase = process.argv[2];
if (!['before', 'after', 'closure'].includes(phase)) throw new Error('OFFLINE_ONLY: specify before, after or closure');
const inputs = await load('output/search-v1-v6-readiness-2026-11-02/pilot-inputs-v6.json');
const terminal = await load('output/search-v1-v6-retry-2026-11-03/comparison-live-results-v6-complete.json');
const strict = [], fixtures = [];
for (const row of inputs) {
  strict.push(await replayDevelopmentCase(row, terminal));
  fixtures.push(await replayDevelopmentCase(row, terminal, 'COUNTERFACTUAL_SAVED_ANSWER_FIXTURE'));
}
const report = { recordedAt: new Date().toISOString(), phase, networkCalls: 0, newModelAccuracy: 'NOT_MEASURED',
  strictReplay: { compatible: strict.filter(row => row.compatible).length,
    originalResultsReproduced: strict.filter(row => row.originalParseReproduced).length,
    incompatibleCases: strict.filter(row => !row.compatible).map(row => row.caseId), results: strict },
  counterfactualSavedAnswerFixtures: { cases: fixtures.length, results: fixtures,
    provenanceViolations: fixtures.reduce((sum, row) => sum + (row.provenance?.length ?? 0), 0),
    submissionAllowed: fixtures.filter(row => row.form?.submissionAllowed).length } };
await save(`v6-${phase}-replay.json`, report);
console.log(JSON.stringify({ phase, compatible: report.strictReplay.compatible,
  reproduced: report.strictReplay.originalResultsReproduced, incompatible: report.strictReplay.incompatibleCases,
  fixtureProvenanceViolations: report.counterfactualSavedAnswerFixtures.provenanceViolations }));
