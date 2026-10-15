import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledBookingNeedsTime } from '../src/lib/bookingTiming.js';

test('a refreshed scheduled intent without a slot must return to time selection', () => {
    assert.equal(scheduledBookingNeedsTime('Schedule', null, false), true);
    assert.equal(scheduledBookingNeedsTime('Schedule', undefined, false), true);
    assert.equal(scheduledBookingNeedsTime('Schedule', '', false), true);
});
test('an explicit Ride Now intent, current slot or existing authoritative booking needs no new slot', () => {
    assert.equal(scheduledBookingNeedsTime('Ride now', null, false), false);
    assert.equal(scheduledBookingNeedsTime('Schedule', '2026-10-12T12:00:00.000Z', false), false);
    assert.equal(scheduledBookingNeedsTime('Schedule', null, true), false);
});
