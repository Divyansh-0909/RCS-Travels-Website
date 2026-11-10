import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { json, listFiles, digest, bytes, canonical } from './artifacts.js';
import { exactReplay, parseInput, jevRequests, wireFor } from './compatibility.js';
import { prepareLuna } from './lunaPreparation.js';
import { generateLocationCandidates } from '../../../services/search/locations/candidates.ts';
import { fallbackEligibility } from '../../../services/search/complex/eligibility.ts';
import { benchmarkCacheKey } from '../../common/cache.js';

export const PATHS = Object.freeze({
  inputs: 'output/search-s5-authorized-development/development-inputs.json',
  initial: 'output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json',
  continued: 'output/provider-resume-2026-10-07/rows.json',
  pending: 'output/search-provider-continuation-2026-10-08/runtime-pending-manifest.json',
  originalPlan: 'output/search-s5-authorized-development/development-plan.json',
  originalQueue: 'output/provider-light-2026-10-07/provider-resume-manifest.json',
  v6: 'output/search-v1-v6-retry-2026-11-03/comparison-live-results-v6-complete.json',
  places: 'output/search-provider-continuation-2026-10-08/places-rows.json',
});

async function cacheIndex(directory) {
  const index = new Map();
  const files = await listFiles(directory);
  const caches = await Promise.all(files.filter(file => /\/[a-f\d]{64}\.json$/.test(file)).map(async file => ({ file, data: await json(file) })));
  for (const { file, data } of caches) {
    assert.equal(benchmarkCacheKey(data.identity), data.key, 'CACHE_IDENTITY_CORRUPT');
    const parsed = data.value.result?.parse ?? data.value.parsed;
    if (!parsed) continue; // Other historical cache configurations are not parse-stage evidence.
    const rows = index.get(data.identity.caseId) ?? [];
    rows.push({ file, key: data.key, identity: data.identity, parseHash: digest(parsed),
      fileHash: digest(await bytes(file)) }); index.set(data.identity.caseId, rows);
  }
  return index;
}
const spans = values => values.map(({ start, end, exactText }) => ({ start, end, exactText }));

function historicalLunaInput(input, parsed) {
  return { query: parseInput(input).query, candidates: parsed.draft.candidates, partialDraft: parsed.draft,
    trustedFields: [], fallbackReasons: fallbackEligibility(parsed), now: new Date(input.modelInput.context.clock).toISOString(),
    timeZone: input.modelInput.context.timeZone };
}
function dispositions(replay) {
  if (!replay.exactRequestReuse) return { stages: ['REQUIRES_CURRENT_JEV', 'BLOCKED_OR_UNKNOWN'], currentLunaEligible: null,
    freshLuna: 'UNKNOWN_UNTIL_CURRENT_JEV', grounding: 'CONDITIONAL_AFTER_CURRENT_JEV_AND_ACCEPTED_LUNA_IF_ELIGIBLE' };
  return { stages: ['EXACT_REUSE_SUPPORTED', ...(replay.currentFallback.length ? ['REQUIRES_NEW_LUNA', 'REQUIRES_POST_LUNA_GROUNDING'] : [])],
    currentLunaEligible: replay.currentFallback.length > 0, freshLuna: replay.currentFallback.length ? 'REQUIRED_ONCE' : 'NOT_ELIGIBLE',
    grounding: replay.currentFallback.length ? 'CONDITIONAL_ON_ACCEPTED_LUNA_SOURCE_LOCATIONS' : 'DEPENDENT_ON_CURRENT_RESOLVED_SOURCE_FIELDS' };
}

export async function reconcile() {
  const loaded = Object.fromEntries(await Promise.all(Object.entries(PATHS).map(async ([key, path]) => [key, await json(path)])));
  const { inputs, initial, continued, pending, originalPlan, originalQueue, v6, places } = loaded;
  assert.equal(inputs.length, 222); assert.equal(new Set(inputs.map(row => row.caseId)).size, 222);
  assert.equal(initial.length, 131); assert.equal(continued.length, 91); assert.equal(pending.LunaQueue.length, 50);
  assert.equal(originalPlan.datasetHash, '2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296');
  assert.equal(originalPlan.splitHash, 'aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de');
  const indexes = await Promise.all([cacheIndex('output/search-s5-authorized-development/live-cache/search'),
    cacheIndex('output/provider-resume-2026-10-07/jev-stage-cache/search')]);
  const oldRows = new Map([...initial, ...continued].map(row => [row.caseId, row]));
  assert.equal(oldRows.size, 222);
  const catalog = v6.observations.filter(row => row.provider === 'jev' && row.stage !== 'common');
  const cases = [], luna = [], knownRequests = [];
  for (const row of inputs) {
    const old = oldRows.get(row.caseId); assert.ok(old);
    const parsed = old.result.parse;
    assert.equal(parsed.draft.query.text, row.modelInput.query);
    assert.equal(parsed.draft.query.id, row.providerQueryId); assert.equal(parsed.draft.query.revision, row.queryRevision);
    const oldHash = digest(parsed);
    const caches = indexes.flatMap(index => index.get(row.caseId) ?? []).filter(entry => entry.parseHash === oldHash
      && entry.identity.inputHash === digest(row.modelInput) && entry.identity.datasetHash === originalPlan.datasetHash);
    assert.ok(caches.length > 0, `JEV_CACHE_LINEAGE_UNPROVEN:${row.caseId}`);
    const replay = await exactReplay(row, catalog);
    if (replay.exactRequestReuse) {
      const original = v6.cases.find(value => value.provider === 'jev' && value.caseId === row.caseId).parserResult;
      const semantic = value => canonical(Object.fromEntries(['draft', 'route', 'issues', 'fallbackRequired', 'fallbackReasons', 'temporal'].map(key => [key, value[key]])));
      replay.semanticOutcomeMatchesOriginal = isDeepStrictEqual(semantic(replay.parserResult), semantic(original));
      assert.equal(replay.semanticOutcomeMatchesOriginal, true, 'REUSED_RESPONSE_CHANGED_OUTCOME');
    }
    const currentCandidates = parsed.draft.complexity === 'COMPLEX' ? [] : generateLocationCandidates(parseInput(row).query, parsed.draft.queryType).candidates;
    const origin = originalQueue.search.queue.find(value => value.caseId === row.caseId);
    if (origin?.cachedParseHash) assert.equal(origin.cachedParseHash, oldHash);
    const assessment = dispositions(replay);
    cases.push({ caseId: row.caseId, originalQuery: row.modelInput.query, inputHash: digest(row.modelInput),
      originalParsedHash: oldHash, cachedEvidence: caches, historicalFallback: fallbackEligibility(parsed),
      historicalStatus: pending.LunaQueue.includes(row.caseId) ? 'LUNA_PENDING' : 'PROVIDER_STAGE_COMPLETE',
      originalModelVersions: [...new Set(parsed.providerMetadata.batches.map(batch => batch.model))],
      originalCandidates: parsed.draft.candidates, currentCandidatesUnderSavedRoute: currentCandidates,
      candidateIdentityEqualUnderSavedRoute: isDeepStrictEqual(parsed.draft.candidates, currentCandidates),
      candidateSpansEqualUnderSavedRoute: isDeepStrictEqual(spans(parsed.draft.candidates), spans(currentCandidates)),
      hypotheticalOldLunaInput: pending.LunaQueue.includes(row.caseId) ? historicalLunaInput(row, parsed) : null,
      hypotheticalOldLunaInputHash: pending.LunaQueue.includes(row.caseId) ? digest(historicalLunaInput(row, parsed)) : null,
      historicalLunaRequestsObserved: 0, historicalInputReusableAsCurrent: false,
      current: assessment, replay });
    for (const [stage, request] of Object.entries(jevRequests(row))) knownRequests.push({ caseId: row.caseId,
      provider: 'jev', stage, request: wireFor(request), inputHash: digest(row.modelInput),
      condition: stage === 'routing' ? 'CURRENT_ROUTING_REQUIRED_UNLESS_EXACT_CACHE_RECEIPT' : 'ONLY_BRANCH_SELECTED_BY_CURRENT_ROUTING' });
    const prepared = await prepareLuna(row, replay, catalog);
    if (prepared) luna.push(prepared);
  }
  const queue = pending.LunaQueue.map((id, index) => ({ order: index + 1, ...cases.find(row => row.caseId === id) }));
  assert.equal(queue.length, 50);
  const reused = cases.filter(row => row.replay.exactRequestReuse);
  const refresh = cases.filter(row => !row.replay.exactRequestReuse);
  const summary = { developmentCases: 222, historicalProviderStageComplete: 172, historicalLunaPending: 50,
    historicalJevAttempts: [...oldRows.values()].reduce((sum, row) => sum + row.result.parse.providerMetadata.attemptedRequests, 0),
    historicalNormalizedJevResponses: [...oldRows.values()].reduce((sum, row) => sum + row.result.parse.providerMetadata.completedRequests, 0),
    currentExactJevCases: reused.length, currentExactJevRequests: reused.reduce((sum, row) => sum + row.replay.served.length, 0),
    historicalS5Jev113RequestsReusableForCurrent114: 0, requiresCurrentJevCases: refresh.length,
    requiredFreshRouting: refresh.length, conditionalFreshExtractionMaximum: refresh.length,
    knownCurrentLunaEligible: luna.length, unknownCurrentLunaEligibility: refresh.length,
    conditionalLunaMaximum: refresh.length + luna.length,
    old50ExactCurrentJev: queue.filter(row => row.replay.exactRequestReuse).length,
    old50RequiresCurrentJev: queue.filter(row => !row.replay.exactRequestReuse).length,
    old50KnownNoLuna: queue.filter(row => row.current.currentLunaEligible === false).length,
    old50KnownLuna: queue.filter(row => row.current.currentLunaEligible === true).length,
    sameCandidateIdentityUnderSavedRoute: cases.filter(row => row.candidateIdentityEqualUnderSavedRoute).length,
    sameCandidateSpansUnderSavedRoute: cases.filter(row => row.candidateSpansEqualUnderSavedRoute).length,
    preservedPlacesContinuationCases: places.length,
    detailsOrAuthoritativeSelectionObserved: 0, currentlyReusableLunaPredictions: 0,
    minimumKnownFreshModelRequests: refresh.length + luna.length,
    maximumModelRequestsBeforeGrounding: refresh.length * 2 + refresh.length + luna.length,
    firstJevBatch: queue.filter(row => !row.replay.exactRequestReuse).slice(0, 5).map(row => row.caseId),
    firstLunaBatch: luna.slice(0, 1).map(row => row.caseId),
  };
  return { summary, cases, original50: queue, knownRequests, preparedLuna: luna,
    historicalSourcePaths: PATHS, datasetHash: originalPlan.datasetHash, splitHash: originalPlan.splitHash,
    originalQueueHash: digest(pending.LunaQueue), developmentInputArtifactHash: digest(await bytes(PATHS.inputs)),
    historicalCallsNotCurrentMeasurements: true, inferenceCalls: 0, providerAvailability: 'UNKNOWN_NO_PROBE',
    sealedLabelsRead: false, newModelScores: 'NOT_MEASURED',
    PlacesPolicy: 'Preserve old autocomplete receipts in their original contexts. Fresh sessions use random UUIDs; do not silently transplant expired session results or invent a Details selection. All future grounding is conditional and excluded from initial activation.' };
}
