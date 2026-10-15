import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackCohort } from './fixtures/rideSearchS4Fallback.js';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { inputFor } from './helpers/rideSearchFake.js';
import { lunaFake } from './helpers/rideSearchS4Fake.js';
import { createSearchInterpretationService } from '../services/search/complex/service.ts';
import { createTestClock } from './helpers/testClock.js';

test('S4 deterministic taxonomy consumes inputs alone; ground-truth routing and unsupported labels stay out of provider context', async () => {
  for (const labels of fallbackCohort) {
    const { text } = labels; const luna = lunaFake();
    const choices = {};
    if (text.includes('SUV')) Object.assign(choices, { vehicle_class: 'suv', vehicle_strength: 'REQUIRED' });
    if (text.includes('tomorrow')) choices.timing_mode = 'SCHEDULED';
    if (text.includes('now')) choices.timing_mode = 'IMMEDIATE';
    const decisions = searchFake(text, { type: text === 'Pari Chowk' ? 'LOCATION_SEARCH' : text === 'hello' ? 'UNCLEAR_OR_UNRELATED' : 'BOOKING_REQUEST',
      complexity: labels.luna ? 'COMPLEX' : 'SIMPLE', pickup: labels.pickup, drop: labels.drop, choices });
    const result = await createSearchInterpretationService(decisions, placesFake(), luna, createTestClock('2026-10-02T10:00:00Z')).parse(inputFor(text));
    assert.equal(result.evaluationRoute, labels.route, text + JSON.stringify(result.issues));
    assert.equal(luna.calls.length, labels.luna ? 1 : 0);
    for (const kind of labels.unsupported ?? []) assert.ok(result.draft.unsupportedRequests.some(value => value.kind === kind), kind);
    for (const call of luna.calls) {
      assert.ok(!('labels' in call.input)); assert.ok(!('evaluationRoute' in call.input)); assert.equal(call.input.query.text, text);
    }
  }
});
