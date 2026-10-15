import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthenticationError, PermissionDeniedError } from '@typesafe-ai/sdk';
import { createJevSearchProvider } from '../services/search/provider.ts';
import { trustedFields, formTrustedFields, applyFormFields, requiresTrustedReview } from '../services/search/complex/trusted.ts';
import { createSearchInterpretationService } from '../services/search/complex/service.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { createLocationReview, editLocationReview } from '../services/search/locations/review.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { resolved } from '../services/search/fields.ts';
import { inputFor } from './helpers/rideSearchFake.js';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { lunaFake, lunaOutput } from './helpers/rideSearchS4Fake.js';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const ref = field => [{ kind: 'USER_FIELD', field, revision: 2 }];
async function seedReview() {
  const input = inputFor('a ride'); input.query.revision = 2;
  const parsed = await createRideSearchParser(searchFake(input.query.text), clock).parse(input);
  return createLocationReview(parsed, clock.now(), input.timeZone);
}
test('Jev authentication and permission failures remain operational auth issues, not language fallback', async () => {
  for (const ErrorType of [AuthenticationError, PermissionDeniedError]) {
    const provider = createJevSearchProvider({ client: { systemOne: async () => { throw new ErrorType(401, {}, new Headers(), 'private'); } } });
    await assert.rejects(provider.decide({ state: 'a ride', questions: { q: { kind: 'choice', instructions: 'route', choices: { A: 'A' } } } }), error => error.code === 'JEV_AUTH_ERROR');
  }
});

test('trusted granular date/time edits and unspecified model fields survive session replay, preserving provenance', async () => {
  assert.deepEqual(trustedFields(), []);
  let review = await seedReview();
  const time = { kind: 'CLOCK', hour: 6, notation: 'H12', minute: resolved(0, []), period: resolved('PM', []), precision: 'EXACT' };
  const date = { kind: 'ABSOLUTE', day: resolved(3, []), month: resolved(10, []), year: resolved(2026, []) };
  review = editLocationReview(review, 'timing.date', resolved(date, []));
  review = editLocationReview(review, 'timing.time', resolved(time, []));
  review = editLocationReview(review, 'passengers', resolved(3, []));
  assert.deepEqual(trustedFields(review.session).map(value => value.field), ['timing.date', 'timing.time', 'passengers']);
  const input = inputFor('a complex ride'); const luna = lunaFake(value => lunaOutput(value.query));
  const output = await createSearchInterpretationService(searchFake(input.query.text, { complexity: 'COMPLEX' }), placesFake(), luna, clock)
    .parse(input, { activeField: null, formRevision: review.revision, review });
  assert.equal(output.draft.timing.date.value.day.value, 3); assert.equal(output.draft.timing.time.value.hour, 6);
  assert.equal(output.draft.passengers.value, 3); assert.equal(output.telemetry.trustedConflicts, 0);
  assert.equal(output.draft.timing.time.refs[0].kind, 'USER_FIELD');
});

test('explicit scalar formDraft preferences survive fallback without requiring a previous review session', async () => {
  const input = inputFor('SUV from campus to airport');
  const form = emptyDraft({ ...input.query, revision: 2 });
  form.vehicleClass = { state: 'RESOLVED', value: 'sedan', strength: 'REQUIRED', excluded: [], refs: ref('vehicleClass') };
  input.formDraft = form;
  const luna = lunaFake(value => lunaOutput(value.query, { pickup: 'campus', drop: 'airport', modify(draft) {
    draft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [{ kind: 'QUERY_SPAN', queryId: value.query.id, revision: value.query.revision, start: 0, end: 3 }] };
  } }));
  const output = await createSearchInterpretationService(searchFake(input.query.text, { complexity: 'COMPLEX' }), placesFake(), luna, clock).parse(input);
  assert.equal(output.draft.vehicleClass.value, 'sedan', JSON.stringify(output.issues));
  assert.equal(output.draft.vehicleClass.refs[0].kind, 'USER_FIELD');
  assert.equal(luna.calls[0].input.trustedFields[0].value.value, 'sedan');
  assert.equal(output.parse.draft.vehicleClass.value, 'sedan');
  assert.equal(output.telemetry.trustedConflicts, 1);
});

test('form location references alone cannot fabricate trusted geography; an authoritative review registry is required', async () => {
  const review = await seedReview(); const form = emptyDraft(review.session.effectiveDraft.query);
  form.pickup = resolved({ kind: 'USER_SELECTION', selectionId: 'saved' }, ref('pickup'));
  assert.throws(() => applyFormFields(review, form), /TRUSTED_REVIEW_CONTEXT_REQUIRED/);
  assert.equal(requiresTrustedReview(form), true);
  assert.deepEqual(formTrustedFields(), []);
  const scalar = emptyDraft(form.query); scalar.sharing = resolved(false, ref('sharing'));
  assert.equal(applyFormFields(review, scalar).session.effectiveDraft.sharing.value, false);
  scalar.sharing.refs = []; assert.deepEqual(formTrustedFields(scalar), []);
  assert.equal(requiresTrustedReview(scalar), false);
  const query = inputFor('complex ride');
  query.formDraft = form; query.trustedLocationSelections = [{ selectionId: 'saved', displayText: 'saved' }];
  const luna = lunaFake();
  const output = await createSearchInterpretationService(searchFake(query.query.text, { complexity: 'COMPLEX' }), placesFake(), luna, clock).parse(query);
  assert.equal(output.issues.at(-1).code, 'TRUSTED_REVIEW_CONTEXT_REQUIRED'); assert.equal(luna.calls.length, 0);
});
