import test from 'node:test';
import assert from 'node:assert/strict';
import { canCancelDriverRide } from '../src/lib/driverCancellationView.ts';

test('terminal, underway, unknown and malformed ride states expose no native cancellation action', () => {
  for (const status of ['assigned', 'en_route', 'reached']) assert.equal(canCancelDriverRide(status), true);
  for (const status of ['started', 'completed', 'cancelled', 'confirmed', 'pending', 'payment_pending',
    'COMPLETED', '', null, undefined, 0, { status: 'assigned' }]) assert.equal(canCancelDriverRide(status), false);
});
