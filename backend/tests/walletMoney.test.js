import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { commissionOn, rideFareOf, COMMISSION_MIN_FARE } from '../services/commission.js'
import { walletEvent, balancesFrom, isBlockedByBalance } from '../services/walletKeys.js'
import { scheduledDepositFor } from '../services/scheduledDeposit.js'
import { couponAmountForSpend, customerPaymentFor } from '../services/coupons.js'
import { loyaltyRewardsEarned, commissionWithReward } from '../services/loyalty.js'
import { COMPLAINT_FINE_AMOUNT, COMPLAINT_FINE_THRESHOLD, COMPLAINT_SUSPEND_THRESHOLD } from '../services/complaints.js'

// The money rules, with no database: every one of these is a pure function, and
// each is here because getting it wrong is silent. A commission charged on the
// pre-coupon fare over-bills a driver by a few rupees a ride and nothing ever
// errors; a wallet hold subtracted twice shows a captain money he cannot find.

describe('commission — the ₹800 floor is tested AFTER the coupon', () => {
  test('₹799 payable earns nothing, ₹800 payable earns 5%', () => {
    assert.deepEqual(commissionOn({ rideFare: 799 }), { pct: 0, amt: 0, payableRideFare: 799 })
    assert.deepEqual(commissionOn({ rideFare: 800 }), { pct: 5, amt: 40, payableRideFare: 800 })
  })

  test('a coupon that drops the fare under the floor removes the commission', () => {
    // The decision of 14 Aug 2026: ₹1,200 less a ₹500 coupon is a ₹700 ride.
    const withCoupon = commissionOn({ rideFare: 1200, couponAmount: 500 })
    assert.equal(withCoupon.payableRideFare, 700)
    assert.equal(withCoupon.amt, 0)
    assert.equal(withCoupon.pct, 0)
    // ...and the same ride without one is comfortably over it, so the coupon is
    // doing the work here rather than the fare being low to begin with.
    assert.equal(commissionOn({ rideFare: 1200 }).amt, 60)
  })

  test('a coupon that leaves the fare over the floor still charges, on the reduced figure', () => {
    const r = commissionOn({ rideFare: 1000, couponAmount: 100 })
    assert.equal(r.payableRideFare, 900)
    assert.equal(r.amt, 45) // 5% of 900, not of 1000
  })

  test('an ordinary ₹1,000 ride earns ₹50', () => {
    assert.equal(commissionOn({ rideFare: 1000 }).amt, 50)
  })

  test('a bare number is REFUSED — the old signature must not silently survive', () => {
    // This is the entire guard against a call site continuing to pass the
    // pre-coupon fare. If this ever stops throwing, the bug is back.
    assert.throws(() => commissionOn(1200), TypeError)
    assert.throws(() => commissionOn(COMMISSION_MIN_FARE), TypeError)
  })

  test('a coupon larger than the fare cannot make the payable fare negative', () => {
    assert.equal(commissionOn({ rideFare: 300, couponAmount: 500 }).payableRideFare, 0)
  })

  test('pass-through charges still come off before any of this', () => {
    // ₹1,000 total carrying a ₹200 toll is an ₹800 ride, and a ₹100 coupon then
    // takes it under the floor.
    const ride = rideFareOf(1000, { toll: 200 })
    assert.equal(ride, 800)
    assert.equal(commissionOn({ rideFare: ride, couponAmount: 100 }).amt, 0)
  })
})

describe('wallet event keys', () => {
  test('are stable across calls — an unstable key disables the unique index', () => {
    assert.equal(walletEvent.depositHold('b1'), walletEvent.depositHold('b1'))
    assert.equal(walletEvent.fine('d1', 3), walletEvent.fine('d1', 3))
  })

  test('separate the events that share a booking', () => {
    const keys = new Set([
      walletEvent.depositHold('b1'),
      walletEvent.depositRefund('b1'),
      walletEvent.commission('b1'),
      walletEvent.couponReimbursement('b1'),
    ])
    // One booking, four distinct events — this is why (bookingId, type) was the
    // wrong key and why the refund is not merely the hold written again.
    assert.equal(keys.size, 4)
  })

  test('a fine is keyed by threshold, so 3 complaints bills once and 4 bills nothing new', () => {
    assert.equal(walletEvent.fine('d1', 3), walletEvent.fine('d1', 3))
    assert.notEqual(walletEvent.fine('d1', 3), walletEvent.fine('d1', 5))
    assert.notEqual(walletEvent.fine('d1', 3), walletEvent.fine('d2', 3))
  })
})

describe('available / held / total', () => {
  const credit = (amount) => ({ amount, type: 'adjustment', bookingId: null })
  const hold = (bookingId, amount) => ({ amount: -amount, type: 'deposit_hold', bookingId })
  const release = (bookingId, amount) => ({ amount, type: 'deposit_refund', bookingId })

  test('an open hold is off the available balance but still in the total', () => {
    const b = balancesFrom([credit(1000), hold('b1', 80)])
    assert.deepEqual(b, { available: 920, held: 80, total: 1000 })
  })

  test('releasing the hold returns it to available and leaves the total alone', () => {
    const b = balancesFrom([credit(1000), hold('b1', 80), release('b1', 80)])
    assert.deepEqual(b, { available: 1000, held: 0, total: 1000 })
  })

  test('several open holds accumulate', () => {
    const b = balancesFrom([credit(1000), hold('b1', 80), hold('b2', 120)])
    assert.deepEqual(b, { available: 800, held: 200, total: 1000 })
  })

  test('a released hold and an open one coexist', () => {
    const b = balancesFrom([credit(1000), hold('b1', 80), release('b1', 80), hold('b2', 150)])
    assert.deepEqual(b, { available: 850, held: 150, total: 1000 })
  })

  test('order does not matter — entries arrive newest-first from the index', () => {
    const rows = [credit(1000), hold('b1', 80), release('b1', 80)]
    assert.deepEqual(balancesFrom([...rows].reverse()), balancesFrom(rows))
  })

  test('a negative AVAILABLE blocks going online; held money cannot rescue it', () => {
    // Fined ₹200 against ₹100 of credit, with ₹500 held on a live ride.
    const entries = [credit(100), hold('b1', 500), credit(-200)]
    const b = balancesFrom(entries)
    assert.equal(b.available, -600)
    assert.equal(isBlockedByBalance(entries), true)
    assert.equal(isBlockedByBalance([credit(100)]), false)
  })
})

describe('scheduled acceptance deposit', () => {
  test('is exactly 15% of authoritative fare', () => assert.equal(scheduledDepositFor(1000), 150))
  test('stable keys prevent duplicate hold and release events', () => {
    assert.equal(walletEvent.depositHold('ride'), walletEvent.depositHold('ride'))
    assert.equal(walletEvent.depositRefund('ride'), walletEvent.depositRefund('ride'))
  })
})

describe('coupon tiers and settlement', () => {
  test('highest monthly completed-spend tier wins', () => {
    assert.equal(couponAmountForSpend(1999), 0)
    assert.equal(couponAmountForSpend(2000), 100)
    assert.equal(couponAmountForSpend(2500), 200)
    assert.equal(couponAmountForSpend(5000), 500)
  })
  test('customer payment and reimbursement preserve the full fare', () => {
    const payment = customerPaymentFor(1200, 500)
    assert.equal(payment, 700)
    assert.equal(payment + 500, 1200)
    assert.equal(commissionOn({ rideFare: 1200, couponAmount: 500 }).amt, 0)
  })
})

describe('complaint thresholds', () => {
  test('fine once at 3 and suspend at 5', () => {
    assert.equal(COMPLAINT_FINE_THRESHOLD, 3)
    assert.equal(COMPLAINT_FINE_AMOUNT, 200)
    assert.equal(COMPLAINT_SUSPEND_THRESHOLD, 5)
    assert.equal(walletEvent.fine('d', 3), walletEvent.fine('d', 3))
  })
})

describe('commission-free loyalty reward', () => {
  test('20th completion grants 3 future eligible rides', () => assert.equal(loyaltyRewardsEarned(19, 20), 3))
  test('three eligible commissions are waived, fourth is normal', () => {
    let remaining = 3
    const charged = []
    for (let i = 0; i < 4; i++) {
      const result = commissionWithReward(50, remaining)
      charged.push(result.commission)
      if (result.consumeReward) remaining--
    }
    assert.deepEqual(charged, [0, 0, 0, 50])
  })
  test('non-commissionable rides do not consume a reward', () => {
    assert.deepEqual(commissionWithReward(0, 3), { commission: 0, consumeReward: false })
  })
})
