import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPaise,
  assertGrossRecoveryNetInvariant,
  customerObligationPaise,
  liabilityPaiseForFare,
  scheduledAdvancePaiseForObligation,
} from '../services/responsibilityFinancialMath.js'

test('liability is 10% of fare, rounds half-paise upward, and is capped at ₹100', () => {
  assert.equal(liabilityPaiseForFare(1_005), 101)
  assert.equal(liabilityPaiseForFare(100_000), 10_000)
  assert.equal(liabilityPaiseForFare(250_000), 10_000)
})

test('financial math rejects fractional, negative, and unsafe paise inputs', () => {
  assert.throws(() => assertPaise(-1), /value must be a non-negative safe integer/)
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => liabilityPaiseForFare(invalid), /farePaise must be a non-negative safe integer/)
  }
  assert.throws(() => customerObligationPaise({ farePaise: -1 }), /farePaise must be a non-negative safe integer/)
  assert.throws(() => customerObligationPaise({ farePaise: 100, couponPaise: -1 }), /couponPaise must be a non-negative safe integer/)
  assert.throws(() => customerObligationPaise({ farePaise: 100, compensationPaise: -1 }), /compensationPaise must be a non-negative safe integer/)
  assert.throws(() => scheduledAdvancePaiseForObligation(-1), /obligationPaise must be a non-negative safe integer/)
  assert.throws(() => assertGrossRecoveryNetInvariant({ grossPaise: -1, recoveryPaise: 0, netPaise: 0 }), /grossPaise must be a non-negative safe integer/)
  assert.throws(() => assertGrossRecoveryNetInvariant({ grossPaise: 1, recoveryPaise: -1, netPaise: 0 }), /recoveryPaise must be a non-negative safe integer/)
  assert.throws(() => assertGrossRecoveryNetInvariant({ grossPaise: 1, recoveryPaise: 0, netPaise: -1 }), /netPaise must be a non-negative safe integer/)
})

test('customer obligation applies coupon before compensation and caps each at the remaining fare', () => {
  assert.deepEqual(customerObligationPaise({
    farePaise: 40_000, couponPaise: 10_000, compensationPaise: 8_000,
  }), {
    appliedCouponPaise: 10_000,
    appliedCompensationPaise: 8_000,
    obligationPaise: 22_000,
  })
  assert.deepEqual(customerObligationPaise({
    farePaise: 1_000, couponPaise: 900, compensationPaise: 900,
  }), {
    appliedCouponPaise: 900,
    appliedCompensationPaise: 100,
    obligationPaise: 0,
  })
})

test('scheduled advance uses existing whole-rupee rounding and derives the exact remainder', () => {
  assert.deepEqual(scheduledAdvancePaiseForObligation(19_500), {
    advancePaise: 2_000,
    remainingPaise: 17_500,
  })
  assert.deepEqual(scheduledAdvancePaiseForObligation(19_400), {
    advancePaise: 1_900,
    remainingPaise: 17_500,
  })
  assert.deepEqual(scheduledAdvancePaiseForObligation(50), {
    advancePaise: 0,
    remainingPaise: 50,
  })
})

test('gross, recovery, and net amounts must reconcile', () => {
  assert.equal(assertGrossRecoveryNetInvariant({ grossPaise: 10_000, recoveryPaise: 2_500, netPaise: 7_500 }), true)
  assert.equal(assertGrossRecoveryNetInvariant({ grossPaise: 10_000, recoveryPaise: 10_000, netPaise: 0 }), true)
  assert.throws(() => assertGrossRecoveryNetInvariant({ grossPaise: 10_000, recoveryPaise: 10_001, netPaise: 0 }), /must not exceed/)
  assert.throws(() => assertGrossRecoveryNetInvariant({ grossPaise: 10_000, recoveryPaise: 2_500, netPaise: 7_499 }), /must equal/)
})
