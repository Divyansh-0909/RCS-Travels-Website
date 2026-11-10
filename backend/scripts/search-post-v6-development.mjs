import { isDeepStrictEqual } from 'node:util';
import { load, save, hash } from './search-post-v6-offline.mjs';
import { createJevSearchProvider } from '../services/search/provider.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
import { createTestClock } from '../tests/helpers/testClock.js';
import { measureB1 } from '../benchmarks/search/b1Measurement.js';

const dataset = await load('docs/search/hindi-hinglish-robustness-v1/dataset.json');
const rows = await load('output/hindi-temporal-v2-2026-10-08/evaluation/rows.json');
const originalRequests = await load('output/hindi-temporal-v1-2026-10-08/original-requests.json');
const controls = await load('output/hindi-temporal-v2-2026-10-08/english-controls/rows.json');
const controlPlan = await load('output/hindi-temporal-v2-2026-10-08/english-controls/plan.json');
const beforeB1 = await load('output/search-v1-b1-comparison-2026-11-01/b1-offline-results-v2.json');
const digest = value => hash(JSON.stringify(value));

async function strictReplay(row, context, savedRequests) {
  let index = 0, incompatible = false, matched = 0;
  const client = { async systemOne(request, options) {
    const previous = savedRequests[index++];
    if (!previous || digest(request) !== previous.hash || !isDeepStrictEqual(options, previous.options)) {
      incompatible = true;
      throw new Error('FRESH_INFERENCE_REQUIRED_NOT_A_PROVIDER_FAILURE');
    }
    matched += 1;
    return previous.response;
  } };
  const parsed = await createRideSearchParser(createJevSearchProvider({ client, timeoutMs: 60_000 }),
    createTestClock(context.clock), generateLocationCandidates).parse({
    query: row.parsed.draft.query, candidates: [], timeZone: context.timeZone,
  });
  const compatible = !incompatible && matched === savedRequests.length;
  return { caseId: row.id, status: compatible ? 'EXACT_REQUEST_HISTORICAL_REPLAY' : 'FRESH_INFERENCE_REQUIRED', matched,
    observedCurrentModelAccuracy: false, provenance: compatible && parsed.draft ? validateDraftProvenance(parsed.draft) : null,
    parsed: compatible ? parsed : null };
}

const hindi = [];
for (const row of rows) {
  const record = dataset.records.find(value => value.id === row.id);
  const options = originalRequests.find(value => value.caseId === row.id).requests[0].options;
  hindi.push(await strictReplay(row, record.modelInput.context,
    row.requestProof.map(proof => ({ hash: proof.requestHash, options, response: proof.response }))));
}
const english = [];
for (const row of controls) {
  const context = controlPlan.pairs.find(value => value.caseId === row.id).context;
  english.push(await strictReplay(row, context, row.requests.map((proof, index) => ({
    hash: digest(proof.request), options: proof.options, response: row.rawSdk.responses[index],
  }))));
}
const deterministic = measureB1(rows);
const summary = replay => ({ cases: replay.length, exactCompatible: replay.filter(value => value.status === 'EXACT_REQUEST_HISTORICAL_REPLAY').length,
  matchedRequests: replay.reduce((sum, value) => sum + value.matched, 0) });
const report = { recordedAt: new Date().toISOString(), networkCalls: 0, newModelAccuracy: 'NOT_MEASURED',
  hindi: { ...summary(hindi), rows: hindi }, english: { ...summary(english), rows: english },
  deterministic, unchangedB1EndpointNegationDiagnostics: isDeepStrictEqual(deterministic, beforeB1.after),
  deterministicEnglishControls: measureB1(controls),
  limitation: 'Owner SIMPLE routing instructions differ from these Jev 1.13 requests. Refused requests are cache incompatibility, not provider failures or new model errors.' };
await save('development-80-and-english-controls.json', report);
console.log(JSON.stringify({ hindi: summary(hindi), english: summary(english), deterministic: deterministic.metrics,
  unchangedB1: report.unchangedB1EndpointNegationDiagnostics }));
