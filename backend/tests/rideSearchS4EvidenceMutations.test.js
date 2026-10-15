import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { validateLunaEvidence } from '../services/search/complex/evidence.ts';
import { collectObservations } from '../services/search/observations.ts';
import { queryRef, resolved, ambiguous } from '../services/search/fields.ts';
import { inputFor } from './helpers/rideSearchFake.js';
const item = text => emptyDraft(inputFor(text).query);
const whole = draft => queryRef(draft.query, 0, draft.query.text.length);
const invalid = (draft, field) => validateLunaEvidence(draft).filter(issue => issue.category === 'INVALID' && issue.field === field);

test('vehicle negation variants preserve exact exclusions and reject unrelated earlier negatives', () => {
  for (const prefix of ['no ', 'not ', 'except ', 'without ', "don't ", "don't send ", 'do not ', 'do not send ', 'without a ', 'without an ', 'without  a  ']) {
    const draft = item(`${'Please '.repeat(10)}${prefix}sedan`);
    draft.vehicleClass = { state: 'EXCLUDED', excluded: ['sedan'], refs: [whole(draft)] };
    assert.deepEqual(invalid(draft, 'vehicleClass'), [], prefix);
  }
  const unrelated = item('not today SUV'); unrelated.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [whole(unrelated)] };
  assert.deepEqual(invalid(unrelated, 'vehicleClass'), []);
  const suv = item('no SUV'); suv.vehicleClass = { state: 'EXCLUDED', excluded: ['suv', 'suv_premium'], refs: [whole(suv)] };
  assert.deepEqual(validateLunaEvidence(suv), []);
});

test('vehicle strength matches surrounding explicit phrases even after a long query prefix', () => {
  for (const [phrase, strength] of [['only  SUV', 'REQUIRED'], ['SUV  only', 'REQUIRED'], ['preferred  SUV', 'PREFERRED'], ['SUV  preferred', 'PREFERRED']]) {
    const draft = item(`${'Please '.repeat(10)}${phrase}`);
    draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength, excluded: [], refs: [whole(draft)] };
    assert.deepEqual(invalid(draft, 'vehicleClass'), [], phrase);
    draft.vehicleClass.strength = strength === 'REQUIRED' ? 'PREFERRED' : 'REQUIRED';
    assert.deepEqual(invalid(draft, 'vehicleClass').map(value => [value.code, value.field]), [['LUNA_UNSUPPORTED_FACT', 'vehicleClass']]);
  }
  for (const text of ['only today SUV', 'SUV tomorrow only', 'preferred route SUV', 'SUV route preferred']) {
    const draft = item(text); draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: text.startsWith('only') || text.includes('tomorrow') ? 'PREFERRED' : 'REQUIRED', excluded: [], refs: [whole(draft)] };
    // Timing information must still be handled; this assertion concerns only strength.
    assert.deepEqual(invalid(draft, 'vehicleClass'), [], text);
  }
});

test('all ambiguity alternatives must be evidenced, and multiple source refs need one valid binding per value', () => {
  const draft = item('3 people and 4 people');
  const obs = collectObservations(draft.query, []);
  draft.passengers = ambiguous([3, 4], 'PASSENGER_CONFLICT', obs.passengers.map(value => value.ref));
  assert.deepEqual(invalid(draft, 'passengers'), []);
  draft.passengers.alternatives = [3, 9]; assert.deepEqual(invalid(draft, 'passengers').map(value => value.code), ['LUNA_UNSUPPORTED_FACT']);
  draft.passengers = resolved(3, [queryRef(draft.query, 2, 7), obs.passengers[0].ref]);
  assert.deepEqual(invalid(draft, 'passengers'), []);
  draft.passengers.refs = [queryRef(draft.query, 0, 6)]; assert.equal(invalid(draft, 'passengers').length, 1);
  draft.passengers.refs = [queryRef(draft.query, 1, 8)]; assert.equal(invalid(draft, 'passengers').length, 1);
});

test('every unsupported kind must bind to its own stated clause, not unrelated evidence', () => {
  for (const [text, kind] of [['3 people', 'PASSENGER_COUNT'], ['stop at campus', 'STOP'], ['rent a car', 'RENTAL'], ['come back', 'RETURN_JOURNEY'], ['AC car', 'AC_PREFERENCE'], ['if available', 'CONDITIONAL_PREFERENCE']]) {
    const draft = item(`${text} please`);
    draft.unsupportedRequests = [{ kind, refs: [whole(draft)], candidateIds: [], reasonCode: 'BACKEND_CAPABILITY_UNSUPPORTED' }];
    assert.deepEqual(invalid(draft, 'unsupportedRequests'), [], kind);
    draft.unsupportedRequests[0].refs = [queryRef(draft.query, draft.query.text.length - 6, draft.query.text.length)];
    assert.deepEqual(invalid(draft, 'unsupportedRequests').map(value => value.code), ['LUNA_UNSUPPORTED_FACT'], kind);
  }
  const invented = item('stop at campus'); invented.unsupportedRequests = [{ kind: 'RENTAL', refs: [whole(invented)], candidateIds: [], reasonCode: 'unsupported' }];
  assert.deepEqual(invalid(invented, 'unsupportedRequests').map(value => value.code), ['LUNA_UNSUPPORTED_FACT']);
});

test('dates and times compare semantic components while retaining independently valid nested source annotations', () => {
  const draft = item('please come tomorrow at 6 PM');
  const observations = collectObservations(draft.query, []);
  draft.timing.mode = 'SCHEDULED'; draft.timing.refs = [whole(draft)];
  draft.timing.date = resolved(observations.dates[0].value, [whole(draft)]);
  const time = structuredClone(observations.times[0].value);
  time.minute.refs = [whole(draft)]; time.period.refs = [whole(draft)];
  draft.timing.time = resolved(time, [whole(draft)]);
  assert.deepEqual(validateLunaEvidence(draft), []);
  const passengers = item('3 people'); passengers.passengers = resolved(3, [whole(passengers)]);
  const issues = validateLunaEvidence(passengers);
  assert.deepEqual(passengers.unsupportedRequests, [{ kind: 'PASSENGER_COUNT', refs: [whole(passengers)], candidateIds: [], reasonCode: 'PASSENGER_ALLOCATION_NOT_ENFORCED' }]);
  assert.deepEqual(issues, [{ code: 'UNSUPPORTED_REQUEST', field: 'PASSENGER_COUNT', category: 'UNSUPPORTED', refs: [whole(passengers)], values: undefined }]);
});
