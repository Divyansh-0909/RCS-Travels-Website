import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, selectObserved, extractVehicle, extractSimple, unsupportedRequests } from '../services/search/extractor.ts';
import { collectObservations } from '../services/search/observations.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { queryRef } from '../services/search/fields.ts';

const batch = values => ({ choices: Object.fromEntries(Object.entries({ pickup_candidate: 'NONE_OR_UNCLEAR',
  drop_candidate: 'NONE_OR_UNCLEAR', timing_mode: 'UNSPECIFIED', unsupported_service: 'NONE',
  vehicle_class: 'NOT_MENTIONED', vehicle_strength: 'NOT_APPLICABLE', vehicle_any: 'NOT_STATED',
  exclude_hatchback: 'NOT_EXCLUDED', exclude_sedan: 'NOT_EXCLUDED', exclude_suv: 'NOT_EXCLUDED',
  exclude_suv_premium: 'NOT_EXCLUDED', ...values }).map(([key, choice]) => [key, { choice, confidence: .9 }])) });
const draftFor = text => emptyDraft({ id: 'extractor-witness', revision: 1, text });

test('finite answers reject missing and out-of-domain values with the recoverable provider code', () => {
  for (const value of [undefined, 'FOREIGN_CHOICE']) assert.throws(() => answer(batch({ observed: value }), 'observed', ['YES', 'NO']),
    error => error.code === 'JEV_INVALID_RESPONSE');
});

test('a supplied but unselected observation stays ambiguous rather than causing a provider exception', () => {
  const draft = draftFor('3 people');
  const observed = collectObservations(draft.query, []).passengers;
  for (const selected of ['NONE', 'UNCLEAR']) {
    const issues = []; const result = selectObserved(batch({ count: selected }), 'count', observed, issues);
    assert.equal(result.state, 'AMBIGUOUS'); assert.deepEqual(result.alternatives, [3]);
    assert.equal(issues[0].code, 'EXTRACTION_BINDING_UNRESOLVED');
  }
  const multiple = draftFor('3 people or 4 people');
  const alternatives = collectObservations(multiple.query, []).passengers;
  const issues = [];
  const result = selectObserved(batch({ count: alternatives[0].id }), 'count', alternatives, issues);
  assert.equal(result.state, 'AMBIGUOUS');
  assert.deepEqual(result.alternatives, [3, 4]);
  assert.equal(issues[0].code, 'EXTRACTION_BINDING_UNRESOLVED');
});

test('source exclusions remain visible when the provider incorrectly denies them', () => {
  const draft = draftFor('not SUV, prefer sedan'); const issues = [];
  const result = extractVehicle(draft, batch({ vehicle_class: 'sedan', vehicle_strength: 'PREFERRED' }),
    collectObservations(draft.query, []), issues);
  assert.deepEqual(result.excluded, ['suv', 'suv_premium']);
  assert.ok(issues.some(issue => issue.code === 'EXTRACTION_BINDING_UNRESOLVED'));
  for (const text of ['do not SUV, prefer sedan', 'no hatchback, no sedan, no SUV']) {
    const excludedDraft = draftFor(text); const excludedIssues = [];
    const preference = extractVehicle(excludedDraft, batch({ vehicle_class: 'sedan', vehicle_strength: 'PREFERRED' }),
      collectObservations(excludedDraft.query, []), excludedIssues);
    if (text.startsWith('do')) assert.deepEqual(preference.excluded, ['suv', 'suv_premium']);
    else {
      assert.equal(preference.reasonCode, 'VEHICLE_CONFLICT');
      assert.equal(excludedIssues[0].code, 'VEHICLE_CONFLICT');
      assert.equal(excludedIssues[0].field, 'vehicleClass');
      assert.equal(excludedIssues[0].category, 'AMBIGUOUS');
    }
  }
});

test('positive class selection cannot invent a class or omit the strength of a stated class', () => {
  const draft = draftFor('sedan'); const observed = collectObservations(draft.query, []);
  for (const values of [{ vehicle_class: 'suv', vehicle_strength: 'REQUIRED' },
    { vehicle_class: 'sedan', vehicle_strength: 'NOT_APPLICABLE' }]) {
    assert.throws(() => extractVehicle(draft, batch(values), observed, []), error => error.code === 'JEV_INVALID_RESPONSE');
  }
  const generic = draftFor('anything');
  assert.throws(() => extractVehicle(generic, batch({ vehicle_class: 'sedan', vehicle_strength: 'REQUIRED' }),
    collectObservations(generic.query, []), []), error => error.code === 'JEV_INVALID_RESPONSE');
  for (const text of ['not any car', 'no any cab', 'without any vehicle']) {
    const negative = draftFor(text);
    assert.throws(() => extractVehicle(negative, batch({ vehicle_any: 'EXPLICIT_ANY' }), collectObservations(negative.query, []), []),
      error => error.code === 'JEV_INVALID_RESPONSE');
  }
});

test('generic vehicle acceptance keeps explicit-any, unclear and unstated model outcomes distinct', () => {
  for (const any of ['EXPLICIT_ANY', 'UNCLEAR', 'NOT_STATED']) {
    const draft = draftFor('anything'); const issues = [];
    const result = extractVehicle(draft, batch({ vehicle_any: any }), collectObservations(draft.query, []), issues);
    assert.equal(result.state, any === 'EXPLICIT_ANY' ? 'EXPLICIT_ANY' : 'UNSPECIFIED');
    assert.equal(issues.length, any === 'EXPLICIT_ANY' ? 0 : 1);
    if (any !== 'EXPLICIT_ANY') assert.equal(issues[0].code, any === 'UNCLEAR' ? 'VEHICLE_CONFLICT' : 'EXTRACTION_BINDING_UNRESOLVED');
  }
});

test('a stop remains a planned feature while other unsupported clauses retain their own reason', () => {
  const draft = draftFor('stop at Library, rent for 8 hours'); const observed = collectObservations(draft.query, []);
  const result = unsupportedRequests(observed, [], 'BACKEND_CAPABILITY_UNSUPPORTED');
  assert.equal(result.find(row => row.kind === 'STOP').reasonCode, 'PLANNED_PRODUCT_FEATURE');
  assert.equal(result.find(row => row.kind === 'RENTAL').reasonCode, 'BACKEND_CAPABILITY_UNSUPPORTED');
  for (const row of result) assert.deepEqual(row.refs, [observed.unsupported.find(item => item.kind === row.kind).ref]);
  const userRef = { kind: 'USER_FIELD', field: 'unsupportedRequests', revision: 1 };
  const userObserved = { ...observed, unsupported: [{ kind: 'STOP', ref: userRef }] };
  const userResult = unsupportedRequests(userObserved, [{ candidateId: 'unrelated', start: 0, end: 10 }], 'BACKEND_CAPABILITY_UNSUPPORTED');
  assert.deepEqual(userResult[0].candidateIds, []);
  assert.deepEqual(userResult[0].refs, [userRef]);
});

test('unclear unsupported intent remains a binding issue instead of an invented OTHER capability', () => {
  const draft = draftFor('cab'); const issues = [];
  extractSimple(draft, batch({ unsupported_service: 'UNCLEAR' }), collectObservations(draft.query, []), issues);
  assert.deepEqual(draft.unsupportedRequests, []);
  assert.ok(issues.some(row => row.code === 'EXTRACTION_BINDING_UNRESOLVED' && row.field === 'unsupportedRequests'));
});

test('OTHER preserves the complete original query as the unsupported-clause review source', () => {
  const draft = draftFor('need wheelchair-lift assistance');
  extractSimple(draft, batch({ unsupported_service: 'OTHER' }), collectObservations(draft.query, []), []);
  assert.deepEqual(draft.unsupportedRequests, [{ kind: 'OTHER', candidateIds: [],
    refs: [queryRef(draft.query, 0, draft.query.text.length)], reasonCode: 'UNSUPPORTED_CLAUSE_REVIEW_REQUIRED' }]);
});

test('explicit passenger count remains a supported advisory interpretation choice', () => {
  const draft = draftFor('3 people'); const observations = collectObservations(draft.query, []); const issues = [];
  extractSimple(draft, batch({ passenger_candidate: observations.passengers[0].id,
    unsupported_service: 'PASSENGER_COUNT' }), observations, issues);
  assert.equal(draft.passengers.value, 3);
  assert.equal(draft.unsupportedRequests[0].kind, 'PASSENGER_COUNT');
  assert.ok(!issues.some(issue => issue.code === 'EXTRACTION_BINDING_UNRESOLVED'));
});
