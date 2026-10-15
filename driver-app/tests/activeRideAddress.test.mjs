import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRideAddress } from '../src/lib/activeRideAddress.ts';

test('the active ride shows the address of its current endpoint', () => {
  const ride = { pickupAddress: 'Synthetic Delhi pickup', dropAddress: 'Synthetic Delhi drop' };
  assert.equal(activeRideAddress(ride, 'pickup'), 'Synthetic Delhi pickup');
  assert.equal(activeRideAddress(ride, 'drop'), 'Synthetic Delhi drop');
});

test('an absent drop address is preserved without displaying a misleading pickup address', () => {
  const ride = { pickupAddress: 'Synthetic Delhi pickup', dropAddress: null };
  assert.equal(activeRideAddress(ride, 'drop'), null);
});
