import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertCompensationInventoryInvariants,
  assertLiabilityInvariants,
  assertRcsBalanceInvariants,
  assertReplacementDriverDeductionOwnership,
  assertRideSettlementInvariants,
} from './helpers/financialInvariants.js'

const validCompensatedRide = () => ({
  // ₹400 fare; no ordinary coupon; ₹80 compensation leaves ₹320 for the customer.
  // The authoritative normal driver gross is ₹400 and RCS funds the compensation.
  farePaise: 40000,
  ordinaryCouponPaise: 0,
  compensationPaise: 8000,
  normalDriverGrossPaise: 40000,
  customerSources: { advancePaise: 0, finalPaise: 0, cashPaise: 32000 },
  driver: {
    actualGrossPaise: 40000,
    directCashPaise: 32000,
    controlledPayoutPaise: 8000,
    commissionWithheldPaise: 0,
    deductionWithheldPaise: 0,
    platformNetPayoutPaise: 8000,
    netTotalEarningsPaise: 40000,
  },
  funding: { compensationPaise: 8000, couponPaise: 0 },
})

test('a compensated ₹400 ride preserves normal driver gross without double-paying cash', () => {
  assert.doesNotThrow(() => assertRideSettlementInvariants(validCompensatedRide()))
  const defaultCoupon = validCompensatedRide()
  delete defaultCoupon.ordinaryCouponPaise
  assert.doesNotThrow(() => assertRideSettlementInvariants(defaultCoupon))
})

test('a compensation cannot reduce the authoritative normal driver gross to the customer obligation', () => {
  const settlement = validCompensatedRide()
  settlement.driver.actualGrossPaise = 32000
  assert.throws(() => assertRideSettlementInvariants(settlement), /actual driver gross/)
})

test('a partial cash source cannot be counted as full direct cash', () => {
  const settlement = validCompensatedRide()
  settlement.customerSources = { advancePaise: 16000, finalPaise: 0, cashPaise: 16000 }
  assert.throws(() => assertRideSettlementInvariants(settlement), /direct cash/)
})

test('an ordinary coupon is collected separately and funded when normal gross is unchanged', () => {
  const settlement = validCompensatedRide()
  settlement.ordinaryCouponPaise = 10000
  settlement.compensationPaise = 0
  settlement.customerSources.cashPaise = 30000
  settlement.driver.directCashPaise = 30000
  settlement.driver.controlledPayoutPaise = 10000
  settlement.driver.platformNetPayoutPaise = 10000
  settlement.funding = { compensationPaise: 0, couponPaise: 10000 }
  assert.doesNotThrow(() => assertRideSettlementInvariants(settlement))
})

test('cash cannot fund a settlement-batch deduction, while a partial controlled payout can', () => {
  const allCash = validCompensatedRide()
  allCash.compensationPaise = 0
  allCash.customerSources.cashPaise = 40000
  allCash.driver.directCashPaise = 40000
  allCash.driver.controlledPayoutPaise = 0
  allCash.driver.deductionWithheldPaise = 100
  allCash.driver.platformNetPayoutPaise = 0
  allCash.funding = { compensationPaise: 0, couponPaise: 0 }
  assert.throws(() => assertRideSettlementInvariants(allCash), /deduction cannot be withheld from direct cash/)

  const partialControlled = validCompensatedRide()
  partialControlled.driver.commissionWithheldPaise = 1000
  partialControlled.driver.deductionWithheldPaise = 7000
  partialControlled.driver.platformNetPayoutPaise = 0
  partialControlled.driver.netTotalEarningsPaise = 32000
  assert.doesNotThrow(() => assertRideSettlementInvariants(partialControlled))
  partialControlled.driver.deductionWithheldPaise = 7001
  assert.throws(() => assertRideSettlementInvariants(partialControlled), /deduction cannot be withheld from direct cash/)
})

test('ride settlement rejects overcollection, overspending, and non-paise amounts', () => {
  const overcollected = validCompensatedRide()
  overcollected.customerSources.cashPaise = 32001
  assert.throws(() => assertRideSettlementInvariants(overcollected), /customer advance, final, and cash/)

  const overspent = validCompensatedRide()
  overspent.driver.commissionWithheldPaise = 100
  assert.throws(() => assertRideSettlementInvariants(overspent), /platform net payout/)

  const fractional = validCompensatedRide()
  fractional.customerSources.cashPaise = 32000.5
  assert.throws(() => assertRideSettlementInvariants(fractional), /safe integer/)

  const negative = validCompensatedRide()
  negative.driver.deductionWithheldPaise = -1
  assert.throws(() => assertRideSettlementInvariants(negative), /must not be negative/)

  const unsafe = validCompensatedRide()
  unsafe.funding.compensationPaise = Number.MAX_SAFE_INTEGER + 1
  assert.throws(() => assertRideSettlementInvariants(unsafe), /safe integer/)
})

test('liability and compensation inventory reconcile', () => {
  assert.doesNotThrow(() => assertLiabilityInvariants({
    finalizedPaise: 40000, collectedPaise: 32000, outstandingPaise: 8000,
  }))
  assert.doesNotThrow(() => assertCompensationInventoryInvariants({
    issuedPaise: 12000, availablePaise: 2000, reservedPaise: 2000, consumedPaise: 8000,
  }))
  // The generic liability identity also models an RCS receivable.
  assert.doesNotThrow(() => assertLiabilityInvariants({
    finalizedPaise: 8000, collectedPaise: 3000, outstandingPaise: 5000,
  }))

  assert.throws(() => assertLiabilityInvariants({
    finalizedPaise: 40000, collectedPaise: 32001, outstandingPaise: 8000,
  }), /liability collected/)
  assert.throws(() => assertCompensationInventoryInvariants({
    issuedPaise: 12000, availablePaise: 2000, reservedPaise: 2000, consumedPaise: 8001,
  }), /compensation available/)
})

test('RCS balance records compensation funding and recovery', () => {
  assert.doesNotThrow(() => assertRcsBalanceInvariants({
    openingPaise: 10000,
    fundingPaise: 8000,
    recoveryPaise: 1000,
    compensationConsumedPaise: 8000,
    closingPaise: 11000,
  }))
  assert.throws(() => assertRcsBalanceInvariants({
    openingPaise: 10000,
    fundingPaise: 8000,
    recoveryPaise: 1000,
    compensationConsumedPaise: 8000,
    closingPaise: 10999,
  }), /RCS opening balance/)
})

test('a replacement-driver deduction cannot be charged to another driver', () => {
  assert.doesNotThrow(() => assertReplacementDriverDeductionOwnership({
    responsibleDriverId: 'driver-a', deductedDriverId: 'driver-a', deductionPaise: 8000,
  }))
  assert.throws(() => assertReplacementDriverDeductionOwnership({
    responsibleDriverId: 'driver-a', deductedDriverId: 'driver-b', deductionPaise: 8000,
  }), /replacement driver deduction/)
  assert.doesNotThrow(() => assertReplacementDriverDeductionOwnership({
    responsibleDriverId: '', deductedDriverId: '', deductionPaise: 0,
  }))
  assert.throws(() => assertReplacementDriverDeductionOwnership({
    responsibleDriverId: '', deductedDriverId: '', deductionPaise: 1,
  }), /responsible driver/)
})

test('a full compensation entitlement can pay the whole fare, but funding must reconcile', () => {
  const ride = validCompensatedRide()
  ride.compensationPaise = 40000
  ride.customerSources.cashPaise = 0
  ride.driver.directCashPaise = 0
  ride.driver.controlledPayoutPaise = 40000
  ride.driver.platformNetPayoutPaise = 40000
  ride.funding.compensationPaise = 40000
  assert.doesNotThrow(() => assertRideSettlementInvariants(ride))
  ride.funding.compensationPaise = 39999
  assert.throws(() => assertRideSettlementInvariants(ride), /compensation funding/)
  ride.funding.compensationPaise = 40000
  ride.ordinaryCouponPaise = 1
  assert.throws(() => assertRideSettlementInvariants(ride), /cannot exceed/)
})

test('financial snapshots reject missing, extra, and invalid accounting fields', () => {
  for (const record of ['customerSources', 'driver', 'funding']) {
    for (const field of Object.keys(validCompensatedRide()[record])) {
      const ride = validCompensatedRide()
      delete ride[record][field]
      assert.throws(() => assertRideSettlementInvariants(ride))
    }
    for (const value of [null, 3, 'invalid']) {
      const ride = validCompensatedRide()
      ride[record] = value
      assert.throws(() => assertRideSettlementInvariants(ride))
    }
    const extra = validCompensatedRide()
    extra[record].unaccountedPaise = 1
    assert.throws(() => assertRideSettlementInvariants(extra), /accounting fields/)
  }
  assert.throws(() => assertLiabilityInvariants({ finalizedPaise: 100, collectedPaise: 101, outstandingPaise: -1 }))
  assert.throws(() => assertCompensationInventoryInvariants({ issuedPaise: 100, availablePaise: -1, reservedPaise: 0, consumedPaise: 101 }))
  assert.throws(() => assertRcsBalanceInvariants({ openingPaise: 0, fundingPaise: -1, recoveryPaise: 2, compensationConsumedPaise: 0, closingPaise: 1 }))
})
