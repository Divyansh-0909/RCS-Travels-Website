import test from 'node:test';
import assert from 'node:assert/strict';
import { driverAppealAction } from '../src/lib/driverAppealAction.ts';

test('captain appeal requires a case, a current display action and a meaningful bounded reason', () => {
    for (const [caseId, eligible, reason] of [['', true, 'reason'], [' ', true, 'reason'],
        ['case', false, 'reason'], ['case', true, ''], ['case', true, 'ab'], ['case', true, ' '.repeat(5)],
        ['case', true, 'a'.repeat(2001)]]) assert.equal(driverAppealAction(caseId, eligible, reason), null);
    assert.deepEqual(driverAppealAction('case', true, '  abc  '), { reason: 'abc', additionalEvidenceRefs: [] });
    assert.equal(driverAppealAction('case', true, 'a'.repeat(2000)).reason.length, 2000);
});
