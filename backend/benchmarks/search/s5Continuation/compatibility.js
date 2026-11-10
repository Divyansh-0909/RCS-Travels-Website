import { isDeepStrictEqual } from 'node:util';
import { createJevSearchProvider } from '../../../services/search/provider.ts';
import { createRideSearchParser } from '../../../services/search/parser.ts';
import { generateLocationCandidates } from '../../../services/search/locations/candidates.ts';
import { validateDraftProvenance } from '../../../services/search/provenance.ts';
import { parseInputSchema } from '../../../services/search/contracts.ts';
import { routingRequest, extractionRequest, locationRequest } from '../../../services/search/questions.ts';
import { collectObservations } from '../../../services/search/observations.ts';
import { fallbackEligibility } from '../../../services/search/complex/eligibility.ts';
import { buildWireRequest } from '../decisionComparison/adapters.js';
import { canonical, digest } from './artifacts.js';

export const JEV = Object.freeze({ model: 'jev-latest', reportedModel: 'jev-1.14.0', timeoutMs: 10000, retries: 0,
  endpoint: 'https://api.typesafe.ai/v1/systemone', sdkVersion: '0.6.0' });
export const parseInput = row => parseInputSchema.parse({ query: { id: row.providerQueryId, revision: row.queryRevision, text: row.modelInput.query },
  candidates: [], timeZone: row.modelInput.context.timeZone });
export const caseClock = row => ({ now: () => new Date(row.modelInput.context.clock) });
export function jevRequests(row) {
  const input = parseInput(row), now = caseClock(row).now().toISOString();
  const booking = { ...input, candidates: generateLocationCandidates(input.query, 'BOOKING_REQUEST').candidates };
  const location = { ...input, candidates: generateLocationCandidates(input.query, 'LOCATION_SEARCH').candidates };
  return { routing: routingRequest(input, now), booking: extractionRequest(booking, now, collectObservations(input.query, booking.candidates)),
    ...(location.candidates.length ? { location: locationRequest(location, now) } : {}) };
}
export function stageIdentity(provider, request, contextHash) {
  return digest({ provider, endpoint: provider === 'jev' ? JEV.endpoint : 'https://api.openai.com/v1/responses',
    request: canonical(request), timeoutMs: provider === 'jev' ? 10000 : 15000, retries: 0, contextHash });
}
export function compatibleJev(saved, request, options) {
  return saved?.provider === 'jev' && saved.raw?.model === JEV.reportedModel && saved.eligibleForRegisteredScores === true
    && saved.httpStatus === 200 && saved.error === null && saved.retries === 0
    && options.timeout === JEV.timeoutMs && options.retry?.maxRetries === 0
    && isDeepStrictEqual(canonical(request), saved.request);
}
export function reusableProvider(row, catalog) {
  const served = [], refused = [];
  const client = { async systemOne(request, options) {
    const saved = catalog.find(item => item.caseId === row.caseId && compatibleJev(item, request, options));
    if (!saved) { refused.push({ requestHash: digest(request) }); throw new Error('CURRENT_JEV_REQUIRED'); }
    served.push({ requestHash: digest(request), originalRequestIdentity: saved.requestIdentity, originalStage: saved.stage,
      responseHash: digest(saved.raw), actualReportedModel: saved.raw.model });
    return structuredClone(saved.raw);
  } };
  return { provider: createJevSearchProvider({ client, model: JEV.model, clock: caseClock(row), timeoutMs: JEV.timeoutMs }), served, refused };
}
export async function exactReplay(row, catalog) {
  const cache = reusableProvider(row, catalog);
  const result = await createRideSearchParser(cache.provider, caseClock(row), generateLocationCandidates).parse(parseInput(row));
  const complete = cache.refused.length === 0 && cache.served.length > 0;
  return { caseId: row.caseId, exactRequestReuse: complete, served: cache.served, refused: cache.refused,
    parserResult: complete ? result : null, currentFallback: complete ? fallbackEligibility(result) : null,
    provenance: complete ? validateDraftProvenance(result.draft) : null,
    measurement: 'EXACT_API_EVIDENCE_REPLAY_NOT_FRESH_INFERENCE; changed-code diagnostics are not new model scores' };
}
export const wireFor = request => buildWireRequest('jev', request);
