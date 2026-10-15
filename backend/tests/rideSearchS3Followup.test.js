import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { followups } from '../services/search/locations/followup.ts';
import { issue } from '../services/search/fields.ts';

test('followup ordering handles conflicts, grounding, missing, temporal ambiguity, unsupported/policy and failures', () => {
  const draft = emptyDraft({ id: 'q', revision: 1, text: 'example' });
  const refs = [{ kind: 'USER_FIELD', field: 'sharing', revision: 1 }];
  draft.sharing = { state: 'AMBIGUOUS', alternatives: [true, false], reasonCode: 'CONFLICT', refs };
  draft.timing = { ...draft.timing, mode: 'AMBIGUOUS', refs };
  draft.unsupportedRequests = [{ kind: 'STOP', refs, candidateIds: [], reasonCode: 'BACKEND_UNSUPPORTED' }];
  const values = followups(draft, [issue('TEMPORAL_CONFLICT', 'timing', 'INVALID'), issue('PLACES_QUOTA', 'pickup', 'DEPENDENCY'),
    issue('PLACE_SELECTION_REQUIRED', 'pickup', 'DEPENDENCY'),
    issue('CUSTOM_REQUIRED', 'sharing', 'MISSING'), issue('PRODUCT_POLICY_UNRESOLVED', 'vehicleClass', 'POLICY'),
    issue('JEV_TIMEOUT', 'provider', 'INVALID'), issue('JEV_TIMEOUT', 'provider', 'INVALID')],
  [issue('TIME_PERIOD_REQUIRED', 'timing.time', 'AMBIGUOUS')]);
  const uniqueCategories = [...new Set(values.map(value => value.category))];
  assert.deepEqual(uniqueCategories, ['conflict', 'grounding', 'required', 'temporalambiguity', 'unsupported/policy', 'review']);
  assert.equal(values.filter(value => value.code === 'JEV_TIMEOUT').length, 1);
  assert.ok(values.some(value => value.code === 'FIELD_AMBIGUOUS'));
  assert.ok(values.some(value => value.code === 'UNSUPPORTED_REQUEST' && value.field === 'STOP'));
  const grounded = followups(draft, [issue('PLACES_QUOTA', 'pickup', 'DEPENDENCY'), issue('PLACES_GROUNDING_REQUIRED', 'pickup', 'DEPENDENCY')], [], new Set(['pickup']));
  assert.ok(grounded.some(value => value.code === 'PLACES_QUOTA'));
  assert.ok(!grounded.some(value => value.code === 'PLACES_GROUNDING_REQUIRED'));
});

test('selected endpoints dismiss obsolete role-specific Places issues but preserve conflicts and global provider issues', () => {
  const draft = emptyDraft({ id: 'q', revision: 1, text: 'cab' });
  draft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'home' }, refs: [{ kind: 'USER_FIELD', field: 'pickup', revision: 1 }] };
  const issues = [issue('PLACE_NO_MATCH', 'pickup', 'DEPENDENCY'), issue('PLACES_TIMEOUT', 'pickup', 'DEPENDENCY'),
    issue('PLACE_SELECTION_REQUIRED', 'drop', 'DEPENDENCY'), issue('PLACES_QUOTA', 'provider', 'DEPENDENCY'), issue('ROLE_CONFLICT', 'pickup', 'AMBIGUOUS')];
  const values = followups(draft, issues, [], new Set(['pickup']));
  assert.deepEqual(values.filter(value => ['PLACE_NO_MATCH', 'PLACES_TIMEOUT'].includes(value.code)), []);
  assert.ok(values.some(value => value.field === 'drop' && value.code === 'PLACE_SELECTION_REQUIRED'));
  assert.ok(values.some(value => value.field === 'provider' && value.code === 'PLACES_QUOTA'));
  assert.ok(values.some(value => value.code === 'ROLE_CONFLICT'));
  assert.ok(followups(draft, issues).some(value => value.code === 'PLACE_NO_MATCH'));
});

test('followups order equal-priority and equal-field issues by stable diagnostic code', () => {
  const draft = emptyDraft({ id: 'q', revision: 1, text: 'cab' });
  const values = followups(draft, [issue('Z_ISSUE', 'provider', 'INVALID'), issue('A_ISSUE', 'provider', 'INVALID')]);
  assert.deepEqual(values.filter(value => value.field === 'provider').map(value => value.code), ['A_ISSUE', 'Z_ISSUE']);
});

test('a reported grounded role cannot erase Places failures until its effective value is a trusted user selection', () => {
  const draft = emptyDraft({ id: 'q', revision: 1, text: 'campus' });
  draft.pickup = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'campus' }, refs: [{ kind: 'QUERY_SPAN', queryId: 'q', revision: 1, start: 0, end: 6 }] };
  assert.ok(followups(draft, [issue('PLACES_QUOTA', 'pickup', 'DEPENDENCY')], [], new Set(['pickup'])).some(value => value.code === 'PLACES_QUOTA'));
});
