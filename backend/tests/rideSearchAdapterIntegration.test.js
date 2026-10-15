import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideSearchParser } from '../services/search/parser.ts';
import { createJevSearchProvider } from '../services/search/provider.ts';
import { createTestClock } from './helpers/testClock.js';
import { candidateFor, inputFor } from './helpers/rideSearchFake.js';
import { assertSearchResult } from './helpers/rideSearchAssertions.js';

test('real SDK adapter accepts the parser generated batches using a fully offline injected SDK client', async () => {
  const calls = [];
  const clock = createTestClock('2026-10-02T12:00:00+05:30');
  const input = inputFor('SUV only from campus to airport tomorrow at 6 PM for 3 people, shared outstation safe route roof carrier');
  input.candidates = [candidateFor(input, 'campus', 'A'), candidateFor(input, 'airport', 'B')];
  const values = { query_type: 'BOOKING_REQUEST', booking_complexity: 'SIMPLE', pickup_candidate: 'A', drop_candidate: 'B',
    pickup_presence: 'PRESENT', drop_presence: 'PRESENT', role_consistency: 'CONSISTENT', timing_mode: 'SCHEDULED',
    vehicle_class: 'suv', vehicle_strength: 'REQUIRED', vehicle_any: 'NOT_STATED', sharing: 'YES', isOutstation: 'YES',
    preferSafeRoute: 'YES', needsCarrier: 'YES', unsupported_service: 'PASSENGER_COUNT' };
  const client = { async systemOne(body, options) {
    calls.push({ body, options });
    clock.advance(10);
    const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]) => {
      if (question.type === 'noul') return [key, { type: 'noul', noul: 0.33 }];
      const labels = Object.keys(question.criteria);
      const selected = values[key] ?? (key.startsWith('exclude_') ? 'NOT_EXCLUDED' : labels.find(label => label.startsWith('span:')));
      return [key, { type: 'choice', choice: selected, confidence: 1,
        probabilities: Object.fromEntries(labels.map(label => [label, label === selected ? 1 : 0])) }];
    }));
    return { model: 'jev-offline-contract-fixture', answers, usage: { input_tokens: 30, output_tokens: 12 } };
  } };
  const result = await createRideSearchParser(createJevSearchProvider({ client, clock, model: 'jev-latest' }), clock).parse(input);
  assertSearchResult(result, input);
  assert.equal(result.fallbackRequired, false);
  assert.equal(result.draft.vehicleClass.value, 'suv');
  assert.equal(result.draft.passengers.value, 3);
  assert.equal(result.temporal.scheduledAt, '2026-10-03T12:30:00.000Z');
  assert.equal(result.providerMetadata.diagnostics.pickup_mentioned, 0.33);
  assert.equal(result.providerMetadata.batches[0].latencyMs, 10);
  assert.equal(result.providerMetadata.batches[1].usage.inputTokens, 30);
  assert.equal(result.providerMetadata.decisions[0].query_type.confidence, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.retry.maxRetries === 0));
});
