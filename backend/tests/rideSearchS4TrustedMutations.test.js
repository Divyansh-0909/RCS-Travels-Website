import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../services/search/contracts.ts';
import { trustedFields, formTrustedFields, applyFormFields, preservePartial } from '../services/search/complex/trusted.ts';
import { createLocationReview, editLocationReview } from '../services/search/locations/review.ts';
import { queryRef, resolved } from '../services/search/fields.ts';
import { inputFor } from './helpers/rideSearchFake.js';

function draft() { return emptyDraft(inputFor('SUV tomorrow at 6 PM').query); }
function review() {
  const value = draft();
  return createLocationReview({ draft: value, route: 'UNCLEAR_OR_UNRELATED', issues: [], fallbackRequired: false, fallbackReasons: [], providerMetadata: {} }, new Date('2026-10-02T10:00:00Z'), 'Asia/Kolkata');
}
const ref = field => [{ kind: 'USER_FIELD', field, revision: 3 }];
test('only valid explicit edits enter trusted model context; corrupt histories are rejected before provider input', () => {
  const original = review(); const corrupt = { ...original.session, schemaVersion: 'wrong' };
  assert.throws(() => trustedFields(corrupt), /CORRUPT_PROVENANCE/);
  const form = draft(); form.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [queryRef(form.query, 0, 3)] };
  assert.deepEqual(formTrustedFields(form), []);
  form.sharing = resolved(false, ref('sharing'));
  assert.deepEqual(formTrustedFields(form), [{ field: 'sharing', value: form.sharing }]);
});

test('form-owned pickup/drop/standalone selections require registry, and scalar/date ambiguity cannot be misread as geography', () => {
  for (const field of ['pickup', 'drop', 'locationSearch']) {
    const form = draft(); form[field] = resolved({ kind: 'USER_SELECTION', selectionId: 'saved' }, ref(field));
    assert.throws(() => applyFormFields(review(), form), /TRUSTED_REVIEW_CONTEXT_REQUIRED/);
  }
  const form = draft(); form.passengers = resolved(3, ref('passengers')); form.sharing = resolved(false, ref('sharing'));
  const applied = applyFormFields(review(), form);
  assert.equal(applied.session.effectiveDraft.passengers.value, 3); assert.equal(applied.session.effectiveDraft.sharing.value, false);
  assert.equal(applied.parseIssues.length, 0);
  const match = editLocationReview(review(), 'sharing', resolved(false, []));
  assert.deepEqual(applyFormFields(match, form).parseIssues, []);
  const conflict = editLocationReview(review(), 'sharing', resolved(true, []));
  const corrected = applyFormFields(conflict, form);
  assert.equal(corrected.session.effectiveDraft.sharing.value, false);
  assert.deepEqual(corrected.parseIssues, [{ code: 'TRUSTED_STATE_CONFLICT', field: 'sharing', category: 'AMBIGUOUS', refs: ref('sharing'), values: undefined }]);
});

test('partial preservation neither overwrites present fields nor promotes any user-owned reference into a query snapshot', () => {
  const partial = draft(); partial.passengers = resolved(3, [queryRef(partial.query, 0, 3), ...ref('passengers')]);
  const next = draft(); preservePartial(next, partial); assert.equal(next.passengers.state, 'UNSPECIFIED');
  partial.timing.mode = 'SCHEDULED'; partial.timing.refs = [queryRef(partial.query, 4, 12), ...ref('timing')];
  preservePartial(next, partial); assert.equal(next.timing.mode, 'UNSPECIFIED');
  next.passengers = resolved(4, [queryRef(next.query, 0, 3)]); preservePartial(next, partial); assert.equal(next.passengers.value, 4);
  partial.timing = { mode: 'IMMEDIATE', refs: [queryRef(partial.query, 4, 12)], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } };
  next.timing.mode = 'SCHEDULED'; preservePartial(next, partial); assert.equal(next.timing.mode, 'SCHEDULED');
  partial.timing.mode = 'SCHEDULED'; partial.timing.date = resolved({ kind: 'RELATIVE', anchor: 'TOMORROW' }, [queryRef(partial.query, 4, 12)]);
  next.timing.date = resolved({ kind: 'RELATIVE', anchor: 'TODAY' }, [queryRef(next.query, 4, 12)]);
  partial.timing.time = resolved({ kind: 'DAYPART', value: 'EVENING' }, [queryRef(partial.query, 4, 12)]);
  next.timing.time = resolved({ kind: 'DAYPART', value: 'MORNING' }, [queryRef(next.query, 4, 12)]);
  preservePartial(next, partial); assert.equal(next.timing.date.value.anchor, 'TODAY'); assert.equal(next.timing.time.value.value, 'MORNING');
});
