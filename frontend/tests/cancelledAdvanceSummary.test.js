import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelledAdvanceSummary } from '../src/lib/cancelledAdvanceSummary.js';

const expectations = [
  ['refund_pending', 'Refund pending', 'Your advance refund has started. It has not been confirmed as processed.'],
  ['partial_refund_pending', 'Partial refund pending', 'The remaining advance refund has started after the cancellation charge. It has not been confirmed as processed.'],
  ['refunded', 'Advance refunded', 'The payment provider has confirmed your advance refund.'],
  ['partially_refunded', 'Partial advance refunded', 'The payment provider has confirmed the remaining advance refund after the cancellation charge.'],
  ['retained', 'Advance retained', 'The recorded cancellation settlement retains the advance.'],
  [null, 'No advance settlement recorded', 'There is no advance settlement recorded for this ride.'],
];
for (const [disposition, title, message] of expectations) test(`cancelled payment reads recorded ${disposition} without creating authority`, () => {
  assert.deepEqual(cancelledAdvanceSummary(disposition), { title, message });
});
for (const value of [undefined, 'paid', 'failed', 'toString', {}, 0]) test(`unrecognized status stays unknown: ${String(value)}`, () => {
  assert.deepEqual(cancelledAdvanceSummary(value), { title: 'Advance status unavailable', message: 'Refresh to check the latest saved payment status, or contact support.' });
});
