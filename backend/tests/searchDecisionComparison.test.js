import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, buildWireRequest, createExperimentalAdapter, createHttpTransport, normalizeResponse } from '../benchmarks/search/decisionComparison/adapters.js';
import { requestCost, summarizeEconomics, permitPilot, permitOwnerAuthorizedPilot } from '../benchmarks/search/decisionComparison/economics.js';
import { commonTasks, commonLabels, scoreCommon, freezePlan } from '../benchmarks/search/decisionComparison/pilot.js';
import { createRideSearchParser } from '../services/search/parser.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { createTestClock } from './helpers/testClock.js';

const request = () => ({ state: 'untrusted original query evidence', questions: {
  field: { kind: 'choice', instructions: 'Select a supplied value.', choices: { A: 'Alpha', NONE: 'Not stated.', AMBIGUOUS: 'Unresolved.' } },
  diagnostic: { kind: 'noul', instructions: 'Is the source relevant?' },
} });
function rawFor(provider, input = request()) {
  const body = { model: PROVIDERS[provider].expectedModel ?? PROVIDERS[provider].selector, usage: { input_tokens: 100, output_tokens: 12 },
    answers: Object.fromEntries(Object.entries(input.questions).map(([name, question]) => [name, question.kind === 'noul'
      ? { type: 'noul', noul: 0.6 } : { type: 'choice', choice: Object.keys(question.choices)[0], confidence: 0.7,
        probabilities: Object.fromEntries(Object.keys(question.choices).map((value, index) => [value, index ? 0 : 1])) }])) };
  if (provider === 'decisions') {
    body.usage.input_tokens_details = { cached_tokens: 0, cache_write_tokens: 0 };
    body.answers = Object.entries(body.answers).map(([name, answer]) => answer.type === 'noul'
      ? { name, type: 'predicate', probability: answer.noul }
      : { ...answer, name, probabilities: Object.entries(answer.probabilities).map(([value, probability]) => ({ value, probability })) });
  }
  return provider.startsWith('clef') ? { success: true, result: body, errors: [], messages: [] } : body;
}

for (const provider of Object.keys(PROVIDERS)) {
  test(`${provider}: real wire schema and fake transport normalize choice/probability evidence without inference`, async () => {
    let calls = 0;
    const raw = rawFor(provider);
    const adapter = createExperimentalAdapter(provider, { transport: { async send(body) {
      calls += 1; assert.deepEqual(body, buildWireRequest(provider, request())); return { status: 200, body: raw };
    } } });
    const result = await adapter.execute(request());
    assert.equal(calls, 1); assert.equal(result.retries, 0); assert.equal(result.error, null);
    assert.equal(result.normalized.choices.field.choice, 'A'); assert.equal(result.normalized.diagnostics.diagnostic, 0.6);
    assert.deepEqual(result.raw, raw); assert.equal(result.normalized.metadata.usage.inputTokens, 100);
    assert.equal(result.normalized.metadata.provider, `experimental:${provider}`);
  });
}

test('wire mappings preserve identical source, instruction meanings and choices across all four APIs', () => {
  const original = request();
  for (const name of ['jev', 'clefFlash', 'clef']) {
    const wire = buildWireRequest(name, original);
    assert.equal(wire.state, original.state); assert.deepEqual(wire.questions.field.criteria, original.questions.field.choices);
  }
  const decisions = buildWireRequest('decisions', original);
  assert.equal(decisions.input, original.state); assert.equal(decisions.questions[1].type, 'predicate');
  assert.deepEqual(decisions.questions[0].choices, Object.entries(original.questions.field.choices).map(([value, description]) => ({ value, description })));
  assert.deepEqual(decisions.prompt_cache_options, { mode: 'explicit', ttl: '30m' });
});

test('strict outputs reject unknown values, malformed distributions, duplicate OpenAI names/options, refusal and model drift', () => {
  for (const corrupt of [
    body => { body.answers.field.choice = 'FOREIGN'; }, body => { body.answers.field.confidence = -1; },
    body => { body.answers.field.probabilities.A = 0.9; }, body => { body.answers.field.probabilities.EXTRA = 0; },
    body => { delete body.answers.diagnostic; }, body => { body.usage.input_tokens = -1; },
  ]) { const raw = rawFor('jev'); corrupt(raw); assert.throws(() => normalizeResponse('jev', raw, request())); }
  const duplicate = rawFor('decisions'); duplicate.answers[0].probabilities.push({ value: 'A', probability: 0 });
  assert.throws(() => normalizeResponse('decisions', duplicate, request()));
  const names = rawFor('decisions'); names.answers[1].name = 'field';
  assert.throws(() => normalizeResponse('decisions', names, request()));
  const refusal = rawFor('decisions'); refusal.answers[0] = { type: 'refusal', name: 'field' };
  assert.throws(() => normalizeResponse('decisions', refusal, request()), /REFUSAL/);
  const drift = rawFor('jev'); drift.model = 'jev-1.13.0';
  assert.throws(() => normalizeResponse('jev', drift, request()), /MODEL_VERSION_CHANGED/);
});

test('malformed provider envelopes and missing usage stay distinct from semantic accuracy', () => {
  const error = rawFor('clef'); error.success = false;
  assert.throws(() => normalizeResponse('clef', error, request()), /PROVIDER_ERROR/);
  const raw = rawFor('clefFlash'); delete raw.result.usage;
  const normalized = normalizeResponse('clefFlash', raw, request());
  assert.equal(normalized.metadata.usage, undefined);
  assert.equal(requestCost('clefFlash', { raw }), null);
  raw.result.usage = { undocumented_counter: 10 };
  assert.equal(normalizeResponse('clefFlash', raw, request()).metadata.usage, undefined);
  assert.equal(requestCost('clefFlash', { raw }), null);
});

test('all stop categories have zero retries and HTTP error text is excluded from evidence', async () => {
  for (const [status, category] of [[429, 'RATE_LIMIT'], [402, 'PAYMENT_REQUIRED'], [401, 'AUTH_OR_ACCESS'], [403, 'AUTH_OR_ACCESS'], [413, 'RESOURCE_LIMIT'], [503, 'PROVIDER_ERROR']]) {
    let calls = 0;
    const adapter = createExperimentalAdapter('decisions', { transport: { async send() { calls += 1; return { status, body: { secret: 'DO_NOT_PERSIST' }, retryAfter: '60' }; } } });
    const observed = await adapter.execute(request());
    assert.equal(observed.error.category, category); assert.equal(observed.raw, null); assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(observed), /DO_NOT_PERSIST/);
  }
});

test('timeout aborts even a transport that does not honor cancellation; oversized inputs never spend', async () => {
  let signal;
  const adapter = createExperimentalAdapter('jev', { timeoutMs: 5, transport: { send(_body, received) { signal = received; return new Promise(() => {}); } } });
  assert.equal((await adapter.execute(request())).error.category, 'TIMEOUT'); assert.equal(signal.aborted, true);
  const oversized = request(); oversized.state = 'x'.repeat(12_001);
  await assert.rejects(() => adapter.execute(oversized), /INVALID_REQUEST/);
  assert.throws(() => createExperimentalAdapter('other', { transport: {} }), /UNKNOWN_PROVIDER/);
});

test('HTTP credentials stay in the transport, redirects fail closed, and unsupported account configuration cannot send', async () => {
  const transport = createHttpTransport('clef', { apiKey: 'FAKE_SECRET', accountId: 'a'.repeat(32), fetch: async (url, options) => {
    assert.match(url, /\/ai\/run\/@cf\/cloudflare\/clef$/u); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer FAKE_SECRET'); assert.doesNotMatch(options.body, /FAKE_SECRET/);
    return { ok: true, status: 200, headers: new Map(), async json() { return rawFor('clef'); } };
  } });
  const adapter = createExperimentalAdapter('clef', { transport });
  const result = await adapter.execute(request()); assert.ok(result.normalized);
  assert.doesNotMatch(JSON.stringify(result), /FAKE_SECRET/);
  assert.throws(() => createHttpTransport('clef', { apiKey: 'FAKE', accountId: '../host' }), /ACCOUNT_UNAVAILABLE/);
});

test('cost accounting charges cache writes, separates API tariff, and never treats absent usage or failed calls as free', () => {
  const raw = rawFor('decisions'); raw.usage = { input_tokens: 1000, output_tokens: 999,
    input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 } };
  assert.equal(requestCost('decisions', { raw }), (700 * 0.10 + 100 * 0.01 + 200 * 0.125) / 1_000_000);
  assert.equal(requestCost('jev', { raw: rawFor('jev') }), 100 * 0.042 / 1_000_000);
  const economics = summarizeEconomics('jev', [{ raw: rawFor('jev') }, { raw: null }], { searches: 2, valid: 1, correct: 1, fallbackCount: 1 });
  assert.equal(economics.publishedMarginalUsd, null); assert.equal(economics.downstreamFallbackUsd, null);
});

test('no-charge gate requires current account, label, quota and hard-overage evidence bound to the exact pilot', () => {
  const now = Date.now(), plan = freezePlan({ labelsReadyForPrimaryComparison: true, budgets: { jev: { maxRequests: 72, maximumPublishedUsd: 0.08 } } });
  const evidence = { planHash: plan.planHash, checkedAt: new Date(now - 10).toISOString(), expiresAt: new Date(now + 1000).toISOString(), providers: {
    jev: { accountAccessVerified: true, noAdditionalChargeVerified: true, rateLimitsVerified: true, overageDisabled: true,
      maxRequests: 72, remainingNoChargeUsd: 1, evidenceReference: 'synthetic-test-fixture-only' } } };
  assert.equal(permitPilot(plan, evidence, 'jev', now).allowed, true);
  assert.equal(permitPilot(plan, { ...evidence, planHash: 'foreign' }, 'jev', now).allowed, false);
  assert.equal(permitPilot({ ...plan, labelsReadyForPrimaryComparison: false }, evidence, 'jev', now).allowed, false);
  assert.equal(permitPilot(plan, { ...evidence, expiresAt: 'invalid' }, 'jev', now).allowed, false);
  evidence.providers.jev.overageDisabled = false;
  assert.equal(permitPilot(plan, evidence, 'jev', now).allowed, false);
});

test('explicit owner waiver is separately bound to approved labels and registered pilot limits', () => {
  const now = Date.now();
  const plan = freezePlan({ labelArtifactHash: 'approved-v3-labels', maxInputPlanningTokensPerRequest: 24576,
    budgets: { jev: { maxRequests: 72, maximumPublishedUsd: 0.074317824 } } });
  const evidence = { planHash: plan.planHash, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(),
    labelReview: { ownerApproved: true, labelArtifactHash: plan.labelArtifactHash, receiptReference: 'actual-owner-label-reply' },
    authorization: { mode: 'OWNER_WAIVED_FREE_QUOTA_CHECK', receiptReference: 'actual-owner-quota-reply', ownerReply: 'Do not worry about this' },
    providers: { jev: { maxRequests: 72, maxInputPlanningTokensPerRequest: 24576, maxPublishedTariffUsd: 0.074317824 } } };
  assert.equal(permitOwnerAuthorizedPilot(plan, evidence, 'jev', now).allowed, true);
  assert.equal(permitPilot(plan, evidence, 'jev', now).allowed, false);
  for (const changed of [{ ...evidence, planHash: 'old-plan' }, { ...evidence, labelReview: { ...evidence.labelReview, labelArtifactHash: 'different' } },
    { ...evidence, authorization: null }, { ...evidence, expiresAt: new Date(now - 1).toISOString() },
    { ...evidence, providers: { jev: { ...evidence.providers.jev, maxRequests: 73 } } }]) {
    assert.equal(permitOwnerAuthorizedPilot(plan, changed, 'jev', now).allowed, false);
  }
});

test('common task inputs contain source candidates and no gold labels; unlabelled tasks do not acquire invented answers', () => {
  const input = { query: { id: 'pilot', revision: 1, text: 'कैंपस से स्टेशन जाना है' }, context: { timeZone: 'Asia/Kolkata' } };
  const { request: tasks, candidates } = commonTasks(input);
  assert.ok(candidates.some(value => value.exactText === 'कैंपस')); assert.ok(candidates.some(value => value.exactText === 'स्टेशन'));
  assert.doesNotMatch(tasks.state, /"(?:expected|truth|labels)"/u);
  assert.equal(Object.keys(tasks.questions).length, 26);
  const labels = commonLabels({ queryType: 'BOOKING_REQUEST', complexity: 'SIMPLE', pickupSpans: [], dropSpans: [],
    vehicle: { state: 'UNSPECIFIED' }, timingMode: 'UNSPECIFIED', flags: {}, missingFields: [], unsupportedRequests: [] }, candidates);
  assert.equal(labels.ambiguity, null);
  assert.deepEqual(scoreCommon([{ labels, observation: null }]).metrics.ambiguity, { correct: 0, total: 0, observed: 0 });
});

test('conditional destinations remain ambiguous in common labels and settled corrections retain routing policy', () => {
  const expected = { queryType: 'BOOKING_REQUEST', complexity: 'COMPLEX', pickupSpans: [], dropSpans: [],
    vehicle: { state: 'UNSPECIFIED' }, timingMode: 'UNSPECIFIED', flags: {}, missingFields: ['drop'],
    unsupportedRequests: ['CONDITIONAL_PREFERENCE'], conditionalAlternatives: ['CONDITIONAL_DESTINATIONS'] };
  const labels = commonLabels(expected, []);
  assert.deepEqual(labels.drop.allowed, ['AMBIGUOUS']);
  assert.deepEqual(labels.pickup.allowed, ['NONE']);
  assert.deepEqual(commonLabels({ ...expected, conditionalAlternatives: [] }, []).drop.allowed, ['NONE']);
  assert.deepEqual(expected.dropSpans, []);
  const tasks = commonTasks({ query: { id: 'correction-policy', revision: 1, text: 'actually alpha 2 nahi, beta 1 jaana hai from campus' }, context: {} });
  assert.match(tasks.request.questions.complexity.instructions, /including settled corrections requiring superseded provenance/u);
});

test('experimental adapters fit the existing parser dependency injection while complex fallback remains unexecuted', async () => {
  let calls = 0;
  const adapter = createExperimentalAdapter('decisions', { transport: { async send(wire) {
    calls += 1;
    const input = { state: wire.input, questions: Object.fromEntries(wire.questions.map(question => [question.name, question.type === 'predicate'
      ? { kind: 'noul', instructions: question.instructions } : { kind: 'choice', instructions: question.instructions,
        choices: Object.fromEntries(question.choices.map(choice => [choice.value, choice.description])) }])) };
    const raw = rawFor('decisions', input);
    for (const answer of raw.answers) {
      const selected = answer.name === 'query_type' ? 'BOOKING_REQUEST' : 'COMPLEX';
      answer.choice = selected; answer.probabilities = answer.probabilities.map(item => ({ ...item, probability: item.value === selected ? 1 : 0 }));
    }
    return { status: 200, body: raw };
  } } });
  const parser = createRideSearchParser(adapter, createTestClock('2026-10-04T12:00:00+05:30'), generateLocationCandidates);
  const result = await parser.parse({ query: { id: 'isolated-integration', revision: 1, text: 'campus to airport via market' }, candidates: [], timeZone: 'Asia/Kolkata' });
  assert.equal(result.route, 'COMPLEX_FALLBACK_REQUIRED'); assert.equal(calls, 1);
  assert.equal(result.fallbackRequired, true); assert.equal(result.draft.candidates.length, 0);
});
