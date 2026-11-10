import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createJevSearchProvider } from '../services/search/provider.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
import { createTestClock } from '../tests/helpers/testClock.js';

const root = new URL('../../', import.meta.url);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows = await load('output/hindi-temporal-v2-2026-10-08/evaluation/rows.json');
const originals = await load('output/hindi-temporal-v1-2026-10-08/original-requests.json');
const dataset = await load('docs/search/hindi-hinglish-robustness-v1/dataset.json');
const results = [];
for (const row of rows) {
  const record = dataset.records.find(item => item.id === row.id);
  const options = originals.find(item => item.caseId === row.id).requests[0].options;
  let index = 0, changed = false, matched = 0;
  const client = { async systemOne(request, actualOptions) {
    const proof = row.requestProof[index++];
    if (!proof || hash(request) !== proof.requestHash || !isDeepStrictEqual(options, actualOptions)) {
      changed = true; throw new Error('FRESH_INFERENCE_REQUIRED_NOT_A_PROVIDER_FAILURE');
    }
    matched += 1;
    return proof.response;
  } };
  const parser = createRideSearchParser(createJevSearchProvider({ client, timeoutMs: 60_000 }),
    createTestClock(record.modelInput.context.clock), generateLocationCandidates);
  const parsed = await parser.parse({ query: row.parsed.draft.query, candidates: [], timeZone: record.modelInput.context.timeZone });
  results.push({ caseId: row.id, status: changed ? 'FRESH_INFERENCE_REQUIRED' : 'EXACT_REQUEST_CACHE_REPLAY', matchedRequests: matched,
    historicalModel: 'jev-1.13.0', currentAliasComparison: 'NOT_COMPARABLE_TO_LIVE_1.14',
    schemaValidBefore: !row.parsed.issues.some(issue => issue.code.startsWith('JEV_')),
    schemaValidAfterOnMatchedInputs: changed ? null : !parsed.issues.some(issue => issue.code.startsWith('JEV_')),
    changedDerivedValues: changed ? null : !isDeepStrictEqual(row.parsed.draft, parsed.draft),
    provenanceIssues: !changed && parsed.draft ? validateDraftProvenance(parsed.draft) : null,
    issues: changed ? null : parsed.issues } );
}
const matched = results.filter(row => row.status === 'EXACT_REQUEST_CACHE_REPLAY');
const report = { version: 'search-b1-exact-request-cache-proof-v1', recordedAt: new Date().toISOString(),
  scope: 'HISTORICAL_JEV_1_13_DEVELOPMENT_RESPONSES_ONLY_NO_NETWORK_OR_ALIAS_SUBSTITUTION', networkCalls: 0,
  cases: results.length, matchedCases: matched.length, freshInferenceRequired: results.length - matched.length,
  matchedRequests: results.reduce((sum, row) => sum + row.matchedRequests, 0),
  matchedSchemaValidBefore: matched.filter(row => row.schemaValidBefore).length,
  matchedSchemaValidAfter: matched.filter(row => row.schemaValidAfterOnMatchedInputs).length,
  matchedProvenanceViolations: matched.reduce((sum, row) => sum + row.provenanceIssues.length, 0), results };
const revision = process.argv.includes('--revision=v2') ? '-v2' : '';
await writeFile(new URL(`output/search-v1-b1-comparison-2026-11-01/b1-cache-compatibility${revision}.json`, root), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ matchedCases: report.matchedCases, freshInferenceRequired: report.freshInferenceRequired,
  matchedRequests: report.matchedRequests, matchedSchemaValidBefore: report.matchedSchemaValidBefore,
  matchedSchemaValidAfter: report.matchedSchemaValidAfter, networkCalls: 0, provenanceViolations: report.matchedProvenanceViolations }));
