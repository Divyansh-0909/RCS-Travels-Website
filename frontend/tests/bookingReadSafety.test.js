import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingReadIsDenied, isVerifiedBookingRead } from '../src/lib/bookingReadSafety.js';

test('only an authoritative read for the current booking and authenticated actor may be displayed', () => {
    const read = { bookingId: 'booking-a', userId: 'customer-a' };
    assert.equal(isVerifiedBookingRead(read, 'booking-a', 'customer-a'), true);
    for (const actor of ['customer-b', '', null, undefined, 7]) {
        assert.equal(isVerifiedBookingRead(read, 'booking-a', actor), false);
    }
    for (const actor of ['', null, undefined, 7]) {
        assert.equal(isVerifiedBookingRead({ bookingId: 'booking-a', userId: actor }, 'booking-a', actor), false);
    }
    assert.equal(isVerifiedBookingRead(read, 'booking-b', 'customer-a'), false);
    assert.equal(isVerifiedBookingRead(null, 'booking-a', 'customer-a'), false);
    assert.equal(isVerifiedBookingRead(null, undefined, 'customer-a'), false);
    assert.equal(isVerifiedBookingRead({}, 'booking-a', 'customer-a'), false);
});

test('authorization and missing-booking responses hide the snapshot while transport errors remain eligible for stale display', () => {
    for (const status of [401, 403, 404]) assert.equal(bookingReadIsDenied({ status }), true);
    for (const status of [200, 400, 409, 500, 503, undefined, null, '403']) {
        assert.equal(bookingReadIsDenied({ status }), false);
    }
    assert.equal(bookingReadIsDenied(null), false);
});
