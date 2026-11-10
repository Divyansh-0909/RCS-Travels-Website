import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAmendment, authorizationTemplate } from '../../benchmarks/search/s5Executor/registration.js';
import { createLiveTransport } from '../../benchmarks/search/s5Executor/transports.js';
import { runS5Phase } from '../../benchmarks/search/s5Executor/executor.js';
import { fakeEnvelope } from '../../benchmarks/search/decisionComparison/readiness.js';
import { decisionFake, expressionChoices } from './rideSearchFake.js';
import { lunaOutput } from './rideSearchS4Fake.js';

let amendmentPromise;
export const amendment = () => amendmentPromise ??= buildAmendment();
export const directory = () => mkdtemp(join(tmpdir(), 'rcs-s5-live-'));
export function clock() {
  let elapsed = 0, wall = Date.parse('2026-11-03T12:00:00Z');
  return { nowMs: () => elapsed, wallMs: () => wall, async sleep(ms) { elapsed += ms; wall += ms; },
    advance(ms) { elapsed += ms; wall += ms; }, setWall(ms) { wall = ms; } };
}
let activation = 0;
export function authorization(value, phase, executionClock) {
  return { ...authorizationTemplate(value, phase), syntheticAuthorization: true, activationId: `synthetic-${phase}-${++activation}`,
    ownerReply: 'SYNTHETIC TEST ONLY; NOT OWNER AUTHORIZATION', receiptReference: 'synthetic-fixture',
    issuedAt: new Date(executionClock.wallMs() - 1000).toISOString(), expiresAt: new Date(executionClock.wallMs() + 3600000).toISOString(),
    accountChecks: { providerAccessVerified: true, quotaVerified: true, pricingVerified: true,
      processingTerms: phase === 'A' ? 'STANDARD_NON_REGIONAL_DEFAULT_30M' : 'JEV_INPUT_ONLY_NO_LONG_CONTEXT', checkedAt: new Date(executionClock.wallMs()).toISOString(),
      verificationReference: 'SYNTHETIC ONLY; no account verified' } };
}
function native(request) {
  return { state: request.state, questions: Object.fromEntries(Object.entries(request.questions).map(([name, row]) => [name,
    { kind: row.type, instructions: row.instructions, ...(row.criteria ? { choices: row.criteria } : {}) }])) };
}
export async function jevResponse(request, selection = {}) {
  const decoded = native(request), state = JSON.parse(request.state);
  let answers;
  if (request.questions.booking_complexity) answers = /^(?:pickup:|tomorrow)/i.test(state.query.text)
    ? { query_type: 'BOOKING_REQUEST', booking_complexity: 'SIMPLE' } : { query_type: 'LOCATION_SEARCH', booking_complexity: 'NOT_APPLICABLE' };
  else {
    const candidates = state.candidates;
    answers = { ...expressionChoices(decoded), location_search_candidate: candidates[0]?.candidateId ?? 'NONE_OR_UNCLEAR',
      pickup_candidate: candidates[0]?.candidateId ?? 'NONE_OR_UNCLEAR',
      drop_candidate: candidates[1]?.candidateId ?? 'NONE_OR_UNCLEAR', pickup_presence: candidates.length ? 'PRESENT' : 'ABSENT',
      drop_presence: candidates.length > 1 ? 'PRESENT' : 'ABSENT', role_consistency: 'CONSISTENT',
      vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', vehicle_any: 'NOT_STATED', timing_mode: 'SCHEDULED' };
  }
  const batch = await decisionFake([{ ...answers, ...selection }]).decide(decoded);
  const choices = Object.fromEntries(Object.entries(batch.choices).map(([name, row]) => [name, row.choice]));
  return { status: 200, body: fakeEnvelope('jev', decoded, choices) };
}
export function lunaResponse(request, modify = () => {}) {
  const input = JSON.parse(request.input);
  const output = lunaOutput(input.query, { candidates: input.candidates, pickup: 'Pari Chowk', drop: 'Sunrise Metro' });
  modify(output, input);
  return { status: 200, body: { id: 'resp_synthetic', object: 'response', model: 'gpt-6-luna', status: 'completed', service_tier: 'default',
    output: [{ id: 'msg_synthetic', type: 'message', status: 'completed', role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [], logprobs: [] }] }],
    usage: { input_tokens: 1000, output_tokens: 300, total_tokens: 1300,
      input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200,
        cache_write_tokens_details: { ttl_30m_tokens: 200, ttl_12h_tokens: 0 } } } } };
}
export function transport(phase, handler, executionClock) {
  const calls = [];
  const real = createLiveTransport(phase, { OPENAI_API_KEY: 'SYNTHETIC_ONLY', TYPESAFE_API_KEY: 'SYNTHETIC_ONLY' }, async (resource, options) => {
    const body = JSON.parse(options?.body ?? await resource.clone().text());
    calls.push({ body, at: executionClock.nowMs() });
    const result = handler ? await handler(body, calls.length) : phase === 'A' ? lunaResponse(body) : await jevResponse(body);
    return new Response(typeof result.body === 'string' ? result.body : JSON.stringify(result.body), { status: result.status,
      headers: { 'content-type': 'application/json', 'x-request-id': 'synthetic-request', ...(result.retryAfter ? { 'retry-after': result.retryAfter } : {}) } });
  });
  return { ...real, kind: 'SYNTHETIC', calls };
}
export async function run(phase, options = {}) {
  const value = options.amendment ?? await amendment(), executionClock = options.clock ?? clock();
  const evidenceRoot = options.evidenceRoot ?? await directory();
  const auth = options.authorization ?? authorization(value, phase, executionClock);
  const network = options.transport ?? transport(phase, options.handler, executionClock);
  const result = await runS5Phase({ amendment: value, authorization: auth, phase, transport: network, synthetic: true,
    evidenceRoot, clock: executionClock, hooks: options.hooks, signal: options.signal });
  return { result, transport: network, clock: executionClock, evidenceRoot, authorization: auth, amendment: value };
}
