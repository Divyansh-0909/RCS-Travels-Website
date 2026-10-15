import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_CAPABILITY_INVENTORY, developmentToolAuditPacket, toolAuditReviewSchema } from '../benchmarks/search/toolAudit.js';
import { emptyDraft } from '../services/search/contracts.ts';
import { createLocationReview, applyTrustedLocation, editLocationReview } from '../services/search/locations/review.ts';
import { formResolution } from '../services/search/locations/formResolution.ts';
import { resolutionRequirements } from '../services/search/locations/followup.ts';
import { preserveOwnerConflicts } from '../services/search/complex/ownerConflicts.ts';
import { collectObservations } from '../services/search/observations.ts';
import { calendarDate } from '../services/search/calendarPolicy.ts';
import { Temporal } from '@js-temporal/polyfill';
import { createTestClock } from './helpers/testClock.js';
import { issue } from '../services/search/fields.ts';

const clock = createTestClock('2026-10-05T10:00:00.000Z');
const trace = id => ({ id, split: 'DEVELOPMENT_ONLY', capabilityIds: ['jev_decisions', 'form_readiness'],
  description: 'Synthetic development-only router and form trace', requestCount: 2, inputTokens: 10, outputTokens: 3, latencyMs: 4 });

test('verifier inventory contains every specified boundary and gives models no executable tool', () => {
  const expected = { jev_decisions: 'MODEL_DECISION', luna_interpretation: 'MODEL_INTERPRETATION',
    places_autocomplete: 'APPLICATION_ORCHESTRATED', places_details: 'APPLICATION_ORCHESTRATED',
    candidate_generation: 'DETERMINISTIC', candidate_provenance: 'DETERMINISTIC', temporal_resolution: 'DETERMINISTIC',
    timezone_conversion: 'DETERMINISTIC', draft_merging: 'DETERMINISTIC', booking_validation: 'DETERMINISTIC',
    form_readiness: 'DETERMINISTIC', booking_payment_dispatch: 'NOT_SEARCH_TOOL' };
  assert.deepEqual(Object.fromEntries(SEARCH_CAPABILITY_INVENTORY.map(c => [c.id, c.classification])), expected);
  assert.equal(SEARCH_CAPABILITY_INVENTORY.every(c => c.modelCallable === false), true);
  const packet = developmentToolAuditPacket([trace('one'), trace('two')]);
  assert.equal(packet.inventoryVersion, 'search-s6-development-inventory-v2');
  assert.deepEqual(packet.traces, [trace('one'), trace('two')]);
  assert.deepEqual(packet.modelCallableTools, []); assert.equal(packet.modelControlledGooglePlaces, false);
});

test('AI verifier accepts supported findings, multiple trace/check references and enforces fixed category vocabulary', () => {
  const packet = developmentToolAuditPacket([trace('one'), trace('two')]); const schema = toolAuditReviewSchema(packet);
  const finding = { capability: 'jev_decisions', category: 'BOUNDARY', severity: 'BLOCKER', developmentTraceIds: ['one', 'two'],
    observedProblem: 'Review failure boundary', proposedChange: 'Preserve safe form resolution',
    deterministicChecksRequired: ['No booking creation', 'No hidden model tools'] };
  const answer = { inventoryVersion: packet.inventoryVersion, inputPacketHash: packet.inputPacketHash,
    modelCallableToolsRequired: false, findings: [finding], limitations: ['Development only'] };
  for (const category of ['BOUNDARY', 'NAME', 'DESCRIPTION', 'SCHEMA', 'OUTPUT', 'RECOVERY', 'REDUNDANCY',
    'MISSING_CAPABILITY', 'UNNECESSARY_CAPABILITY', 'TOKEN_WASTE']) {
    for (const severity of ['BLOCKER', 'IMPROVEMENT', 'INFORMATION']) {
      const valid = { ...answer, findings: [{ ...finding, category, severity }] };
      assert.deepEqual(schema.parse(valid), valid);
    }
  }
  for (const edit of [a => { a.findings[0].category = ''; }, a => { a.findings[0].severity = ''; },
    a => { a.findings[0].developmentTraceIds = []; }, a => { a.findings[0].deterministicChecksRequired = []; }]) {
    const bad = structuredClone(answer); edit(bad); assert.equal(schema.safeParse(bad).success, false);
  }
});

function reviewFor(text = 'sedan cab now', unsupported = [], options = {}) {
  text = `sedan cab now ${text}`;
  const draft = emptyDraft({ id: 'offline-dev', revision: 1, text }); draft.queryType = 'BOOKING_REQUEST'; draft.complexity = 'SIMPLE';
  const refs = [{ kind: 'QUERY_SPAN', queryId: draft.query.id, revision: 1, start: 0, end: text.length }];
  draft.vehicleClass = { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs };
  draft.timing = { ...draft.timing, mode: 'IMMEDIATE', refs };
  draft.unsupportedRequests = unsupported.map(kind => ({ kind, refs, candidateIds: [], reasonCode: 'UNSUPPORTED' }));
  if (options.queryType) { draft.queryType = options.queryType; draft.complexity = 'NOT_APPLICABLE'; }
  if (options.mode) draft.timing.mode = options.mode;
  let review = createLocationReview({ draft, route: 'SIMPLE_INCOMPLETE', issues: [], fallbackRequired: false }, clock.now(), 'Asia/Kolkata');
  for (const [target, n] of options.queryType ? [] : [['pickup', 1], ['drop', 2]]) review = applyTrustedLocation(review, target, {
    selectionId: target, displayText: target, lat: 28 + n, lng: 77, source: 'USER_SELECTED_SAVED_PLACE',
    confirmedByUser: 'selection', confirmedAt: clock.now().toISOString(),
  });
  review.derived = { fareQuote: 'quote', route: 'route', locationConfirmation: 'confirmed', reviewConfirmation: 'confirmed' };
  return review;
}

test('submission readiness requires independent endpoint, fare, route and confirmation prerequisites', () => {
  const ready = reviewFor(); assert.equal(formResolution(ready, clock).state, 'READY_FOR_SUBMISSION');
  let scheduled = editLocationReview(ready, 'timing', { mode: 'SCHEDULED', refs: [],
    date: { state: 'RESOLVED', value: { kind: 'ABSOLUTE', day: { state: 'RESOLVED', value: 6, refs: [] },
      month: { state: 'RESOLVED', value: 10, refs: [] }, year: { state: 'RESOLVED', value: 2026, refs: [] } }, refs: [] },
    time: { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 6, minute: { state: 'RESOLVED', value: 0, refs: [] },
      notation: 'H12', period: { state: 'RESOLVED', value: 'PM', refs: [] }, precision: 'EXACT' }, refs: [] } });
  scheduled.derived = { ...ready.derived };
  assert.equal(formResolution(scheduled, clock).state, 'READY_FOR_SUBMISSION', JSON.stringify(formResolution(scheduled, clock)));
  assert.equal(formResolution(scheduled, clock).resolutionRequirements.some(entry => entry.code === 'VALID_SCHEDULE_REQUIRED'), false);
  assert.equal(formResolution(ready, clock).submissionAllowed, true);
  assert.equal(formResolution(ready, clock).resolutionRequirements.some(entry => entry.code === 'VALID_SCHEDULE_REQUIRED'), false);
  for (const field of ['fareQuote', 'route', 'locationConfirmation', 'reviewConfirmation']) {
    const incomplete = structuredClone(ready); incomplete.derived[field] = null;
    const result = formResolution(incomplete, clock); assert.equal(result.submissionAllowed, false);
    assert.equal(result.state, ['fareQuote', 'route'].includes(field) ? 'NEEDS_USER_RESOLUTION' : 'READY_FOR_REVIEW');
    if (['fareQuote', 'route'].includes(field)) assert.deepEqual(result.resolutionRequirements.find(r => r.field === 'derived'),
      { field: 'derived', code: 'FARE_ROUTE_RECOMPUTATION_REQUIRED', category: 'review', priority: 5 });
  }
  for (const target of ['pickup', 'drop']) {
    const incomplete = structuredClone(ready); delete incomplete.selected[target];
    assert.deepEqual(formResolution(incomplete, clock).resolutionRequirements.find(r => r.field === 'locations'),
      { field: 'locations', code: 'GROUNDED_LOCATIONS_REQUIRED', category: 'grounding', priority: 1 });
  }
  const location = reviewFor('campus', [], { queryType: 'LOCATION_SEARCH' });
  assert.deepEqual(formResolution(location, clock).resolutionRequirements.find(r => r.field === 'query'),
    { field: 'query', code: 'BOOKING_INTENT_REQUIRED', category: 'required', priority: 2 });
});

test('soft AC alone is advisory; independent clauses remain unresolved even with valid endpoints and quote', () => {
  for (const text of ['AC if available', 'AC car if available', 'AC  car if available', 'AC car  if available']) {
    const review = reviewFor(text, ['AC_PREFERENCE', 'CONDITIONAL_PREFERENCE']);
    const state = formResolution(review, clock); assert.equal(state.state, 'READY_FOR_SUBMISSION');
    assert.deepEqual(state.advisories.map(r => r.field).sort(), ['AC_PREFERENCE', 'CONDITIONAL_PREFERENCE']);
  }
  for (const text of ['sedan cab now', 'AC car if available if delayed', 'AC car if available unless delayed']) {
    const review = reviewFor(text, ['CONDITIONAL_PREFERENCE']);
    const state = formResolution(review, clock); assert.equal(state.state, 'NEEDS_USER_RESOLUTION'); assert.deepEqual(state.advisories, []);
    assert.equal(state.resolutionRequirements.some(r => r.field === 'CONDITIONAL_PREFERENCE'), true);
  }
  const scheduled = reviewFor('tomorrow', [], { mode: 'SCHEDULED' });
  assert.deepEqual(formResolution(scheduled, clock).resolutionRequirements.find(r => r.code === 'VALID_SCHEDULE_REQUIRED'),
    { field: 'timing', code: 'VALID_SCHEDULE_REQUIRED', category: 'temporalambiguity', priority: 3 });
});

test('endpoint-specific obsolete provider errors are dismissed independently without losing passenger or stop signals', () => {
  const review = reviewFor('stop at campus', ['STOP']); const draft = review.session.effectiveDraft;
  const errors = ['pickup', 'drop'].map(role => issue('PLACES_TIMEOUT', role, 'DEPENDENCY'));
  const state = resolutionRequirements(draft, errors, [], new Set(['pickup', 'drop']));
  assert.equal(state.some(r => r.code === 'PLACES_TIMEOUT'), false);
  assert.deepEqual(state.find(r => r.field === 'STOP'), { code: 'UNSUPPORTED_REQUEST', field: 'STOP', category: 'unsupported/policy', priority: 4 });
  for (const role of ['pickup', 'drop']) {
    const ungrounded = new Set([role]);
    assert.equal(resolutionRequirements(draft, errors, [], ungrounded).some(r => r.field !== role && r.code === 'PLACES_TIMEOUT'), true);
  }
});

test('calendar boundary equality preserves same-day dates and sends elapsed bare weekdays to next week', () => {
  const today = Temporal.PlainDate.from('2026-10-05');
  const weekday = { kind: 'WEEKDAY', weekday: 'MONDAY', qualifier: 'BARE' };
  assert.equal(calendarDate(weekday, today, '15:30:00', '15:30:00'), '2026-10-12');
  assert.equal(calendarDate(weekday, today, '15:30:01', '15:30:00'), '2026-10-05');
  assert.equal(calendarDate(weekday, today, undefined, '15:30:00'), undefined);
  assert.equal(calendarDate({ ...weekday, qualifier: 'THIS' }, today), '2026-10-05');
  const date = { kind: 'ABSOLUTE', day: { state: 'RESOLVED', value: 5, refs: [] }, month: { state: 'RESOLVED', value: 10, refs: [] }, year: { state: 'UNSPECIFIED' } };
  assert.equal(calendarDate(date, today), '2026-10-05');
  assert.equal(calendarDate({ ...date, year: { state: 'AMBIGUOUS', alternatives: [2026, 2027], reasonCode: 'CONFLICT', refs: [] } }, today), undefined);
});

test('competing clock syntax and conditional endpoints cannot silently drop original source alternatives', () => {
  for (const text of ['at 16:30 and 18:45', 'at 6PM or at 8PM', 'at 6:30 PM and at 8:45 PM']) {
    const draft = emptyDraft({ id: 'conflict', revision: 1, text });
    const issues = preserveOwnerConflicts(draft, collectObservations(draft.query, []));
    assert.equal(issues[0].code, 'TIME_SELECTION_REQUIRED'); assert.equal(draft.timing.time.state, 'AMBIGUOUS');
    assert.equal(draft.timing.time.alternatives.length, 2); assert.equal(issues[0].refs.length, 2);
  }
  const text = 'from airport to airport, but if my flight changes take me to campus';
  const draft = emptyDraft({ id: 'conditional', revision: 2, text });
  const issues = preserveOwnerConflicts(draft, collectObservations(draft.query, []));
  assert.equal(issues[0].code, 'DESTINATION_SELECTION_REQUIRED');
  assert.deepEqual(draft.drop.refs.map(r => text.slice(r.start, r.end)), ['airport', 'campus']);
  assert.equal(draft.drop.refs[0].start, 16); assert.equal(draft.drop.refs[1].start, text.lastIndexOf('campus'));
  assert.deepEqual(draft.drop.alternatives.map(v => v.candidateId), draft.candidates.map(v => v.candidateId));
});
