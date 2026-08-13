import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  eligibleGroup,
  ownerHoldMinutes,
  OWNER_HOLD_NEAR_MIN,
  OWNER_HOLD_FAR_MIN,
  OWNER_HOLD_NEAR_THRESHOLD_H,
} from '../constants/dispatch.js'

// Which group a scheduled booking may be offered to, and when. Pure, so no
// database: the whole rule is two numbers and a comparison, and getting the
// comparison wrong fails SILENTLY — as a ride that quietly never reaches a
// partner driver, with nothing logged and no error anywhere.

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

/** A confirmed booking, `hoursAway` hours before its pickup. */
const bookingAway = (hoursAway, confirmedAt = new Date()) => ({
  confirmedAt,
  scheduledAt: new Date(confirmedAt.getTime() + hoursAway * HOUR),
})

describe('the owner hold', () => {
  test('is the near figure inside the threshold and the far one outside it', () => {
    const now = new Date()
    const near = new Date(now.getTime() + (OWNER_HOLD_NEAR_THRESHOLD_H - 0.5) * HOUR)
    const far = new Date(now.getTime() + (OWNER_HOLD_NEAR_THRESHOLD_H + 0.5) * HOUR)

    assert.equal(ownerHoldMinutes(near, now), OWNER_HOLD_NEAR_MIN)
    assert.equal(ownerHoldMinutes(far, now), OWNER_HOLD_FAR_MIN)
  })

  test('offers the ride to nobody but the owner while it runs', () => {
    const confirmedAt = new Date()
    const booking = bookingAway(24, confirmedAt)
    const during = new Date(confirmedAt.getTime() + MINUTE)

    assert.equal(eligibleGroup(booking, { rcsOffered: 0, rcsResolved: 0 }, during), 'admin')
  })

  test('runs from confirmation, not from now', () => {
    // Confirmed an hour ago: the hold is long over even though the pickup is days
    // out. Reading the clock from `now` instead would restart it on every sweep.
    const confirmedAt = new Date(Date.now() - 2 * HOUR)
    const booking = bookingAway(48, confirmedAt)

    assert.equal(eligibleGroup(booking, { rcsOffered: 0, rcsResolved: 0 }), 'rcs')
  })
})

describe('escalation past the fleet', () => {
  // Every case below is after the hold, which is the only time-based gate.
  const booking = bookingAway(5, new Date(Date.now() - 3 * HOUR))

  test('opens to the fleet when nobody has been asked yet', () => {
    assert.equal(eligibleGroup(booking, { rcsOffered: 0, rcsResolved: 0 }), 'rcs')
  })

  test('waits while a driver is still deciding', () => {
    // Three asked, one said no, two have not answered. An unanswered offer is
    // NOT a rejection — escalating here hands the ride away mid-decision.
    assert.equal(eligibleGroup(booking, { rcsOffered: 3, rcsResolved: 1 }), 'rcs')
  })

  test('reaches partner drivers once every fleet offer is resolved', () => {
    assert.equal(eligibleGroup(booking, { rcsOffered: 3, rcsResolved: 3 }), 'partner')
  })

  // THE REGRESSION THIS FILE EXISTS FOR. Suspending a captain withdraws his
  // pending offers (routes/admin.ts). If a withdrawn row still counted as
  // outstanding, rcsResolved would stay below rcsOffered forever, the sweep would
  // keep answering `rcs`, and candidatesIn would find nobody new — it excludes
  // anyone already holding a row for this booking, whatever its status. The ride
  // would never reach a partner driver, and nothing would say so.
  test('a withdrawn offer is resolved, not outstanding', () => {
    // One fleet driver, offered, then suspended out from under the booking.
    assert.equal(eligibleGroup(booking, { rcsOffered: 1, rcsResolved: 1 }), 'partner')
  })

  test('one live offer among withdrawn ones still holds the ride', () => {
    // Two suspended, one genuinely thinking about it. He gets his answer.
    assert.equal(eligibleGroup(booking, { rcsOffered: 3, rcsResolved: 2 }), 'rcs')
  })
})
