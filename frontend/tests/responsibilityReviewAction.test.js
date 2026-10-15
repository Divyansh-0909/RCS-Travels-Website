import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewAction, reviewPayload, reviewClassificationLabels } from '../src/lib/responsibilityReviewAction.js';
import { responsibilityClassification } from '../../backend/services/responsibilityContracts.js';

const context = { case: { id: 'synthetic-case', state: 'NEEDS_ADMIN_REVIEW', evidenceVersion: 'responsibility-evidence-v1', evidenceHash: 'a'.repeat(64) } };
const draft = { decision: 'WAIVE', classification: 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_2', reason: '  Independent human review  ' };
test('only pending review or an actual open appeal permits an action', () => {
  assert.equal(reviewAction(null), null);
  assert.equal(reviewAction({}), null);
  assert.equal(reviewAction(context), 'review');
  assert.equal(reviewAction({ ...context, finalDecision: {} }), null);
  for (const state of ['APPEAL_OPEN', 'APPEAL_REVIEW']) {
    const appeal = { ...context, case: { ...context.case, state } };
    assert.equal(reviewAction(appeal), null);
    assert.equal(reviewAction({ ...appeal, appeal: {} }), 'appeal-review');
  }
  assert.equal(reviewAction({ case: { state: 'PROVISIONAL_ADMIN_UPHELD' } }), null);
});
test('waiver forces LEVEL_0 and binds the displayed evidence without borrowing model recommendations', () => {
  assert.deepEqual(reviewPayload(context, draft), { decision: 'WAIVE', classification: 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_0',
    reason: 'Independent human review', evidenceVersion: context.case.evidenceVersion, evidenceHash: context.case.evidenceHash });
  const appeal = { ...context, case: { ...context.case, state: 'APPEAL_REVIEW' }, appeal: {} };
  assert.equal(reviewPayload(appeal, draft).outcome, 'WAIVE');
  for (const classification of ['PLATFORM_CAUSED', 'EXTERNAL_OR_UNCERTAIN', 'VALID_WAIVED', 'NEEDS_REVIEW']) assert.equal(reviewPayload(context, { ...draft, classification }).classification, classification);
});
test('human review options match the frozen production API enum and reject unsupported classification names', () => {
  assert.deepEqual(Object.keys(reviewClassificationLabels).sort(), Object.values(responsibilityClassification).sort());
  assert.deepEqual(reviewClassificationLabels, { DRIVER_CAUSED: 'Driver caused', PLATFORM_CAUSED: 'Platform caused',
    VALID_WAIVED: 'Valid waiver', EXTERNAL_OR_UNCERTAIN: 'External cause or uncertain', NEEDS_REVIEW: 'Needs review' });
  for (const classification of ['UNDETERMINED', 'EXTERNAL_CAUSED', 'UNKNOWN']) {
    assert.throws(() => reviewPayload(context, { ...draft, classification }));
  }
});
test('invalid human drafts retain actionable feedback and reason bounds apply after trimming', () => {
  const message = expected => error => error.name === 'Error' && error.message === expected;
  assert.throws(() => reviewPayload({ ...context, finalDecision: {} }, draft), message('This case is not awaiting a human decision.'));
  assert.throws(() => reviewPayload(context, { ...draft, decision: '' }), message('Choose a human decision.'));
  for (const reason of [null, '   ', ' a ', 'x'.repeat(2001)]) {
    assert.throws(() => reviewPayload(context, { ...draft, reason }), message('Enter a review reason between 3 and 2,000 characters.'));
  }
  assert.equal(reviewPayload(context, { ...draft, reason: '  ' + 'x'.repeat(2000) + '  ' }).reason.length, 2000);
  assert.throws(() => reviewPayload(context, { ...draft, decision: 'UPHOLD' }), message('An upheld decision requires driver causality and a consequence level.'));
  assert.throws(() => reviewPayload(context, { ...draft, classification: 'DRIVER_CAUSED' }), message('Choose a classification compatible with waiver.'));
});
test('review refuses empty decisions, reasons, causality conflicts and unselected consequence levels', () => {
  assert.throws(() => reviewPayload({ ...context, finalDecision: {} }, draft));
  for (const decision of ['', 'AUTO_WAIVE']) assert.throws(() => reviewPayload(context, { ...draft, decision }));
  for (const reason of [null, '', ' a ', 'x'.repeat(2001)]) assert.throws(() => reviewPayload(context, { ...draft, reason }));
  for (const reason of ['abc', 'x'.repeat(2000)]) assert.equal(reviewPayload(context, { ...draft, reason }).reason, reason);
  assert.throws(() => reviewPayload(context, { ...draft, classification: 'DRIVER_CAUSED' }));
  assert.throws(() => reviewPayload(context, { ...draft, decision: 'UPHOLD' }));
  assert.throws(() => reviewPayload(context, { ...draft, decision: 'UPHOLD', classification: 'DRIVER_CAUSED', consequenceLevel: '' }));
  for (const consequenceLevel of ['LEVEL_1', 'LEVEL_2']) assert.equal(reviewPayload(context, { ...draft, decision: 'UPHOLD', classification: 'DRIVER_CAUSED', consequenceLevel }).consequenceLevel, consequenceLevel);
});
