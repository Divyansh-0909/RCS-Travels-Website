import assert from 'node:assert/strict'

// Test-only accounting checks. Every monetary field is an integer number of
// paise; callers must convert legacy rupee fields before building a fixture.
// These checks validate identities in an already-decided settlement model.
// They intentionally do not choose commission rates, compensation rules, or
// which customer source is eligible for a particular payout.
const assertPaise = (value, name) => {
  assert.equal(typeof value, 'number', `${name} must be a number of paise`)
  assert.equal(Number.isSafeInteger(value), true, `${name} must be a safe integer number of paise`)
  assert.equal(value >= 0, true, `${name} must not be negative`)
}

const assertPaiseFields = (record, prefix) => {
  for (const [name, value] of Object.entries(record)) assertPaise(value, `${prefix}.${name}`)
}

const sum = (record) => Object.values(record).reduce((total, value) => total + value, 0)

const requirePaiseFields = (record, prefix, fields) => {
  assert.deepEqual(Object.keys(record).sort(), [...fields].sort(), `${prefix} must contain exactly its accounting fields`)
}

const assertCustomerCollection = ({ farePaise, ordinaryCouponPaise, compensationPaise, customerSources }) => {
  assert.equal(ordinaryCouponPaise + compensationPaise <= farePaise, true,
    'coupon plus compensation cannot exceed the fare')
  const obligationPaise = farePaise - ordinaryCouponPaise - compensationPaise
  assert.equal(sum(customerSources), obligationPaise,
    'customer advance, final, and cash sources must collect the customer obligation')
}

const assertFunding = ({ farePaise, ordinaryCouponPaise, compensationPaise, normalDriverGrossPaise, funding }) => {
  assert.equal(funding.compensationPaise, compensationPaise,
    'compensation funding must cover the compensation amount')
  assert.equal(funding.couponPaise, normalDriverGrossPaise - (farePaise - ordinaryCouponPaise),
    'coupon funding must cover the authoritative driver gross above fare less coupon')
}

const assertDriverGrossPartition = ({ driver, normalDriverGrossPaise, customerSources }) => {
  assert.equal(driver.actualGrossPaise, normalDriverGrossPaise,
    'actual driver gross must equal authoritative normal driver gross')
  assert.equal(driver.directCashPaise + driver.controlledPayoutPaise, driver.actualGrossPaise,
    'direct cash and controlled payout must partition actual driver gross')
  assert.equal(driver.directCashPaise <= customerSources.cashPaise, true,
    'direct cash paid to the driver cannot exceed the customer cash source')
}

const assertPlatformDeductions = (driver) => {
  assert.equal(driver.deductionWithheldPaise <= driver.controlledPayoutPaise - driver.commissionWithheldPaise, true,
    'deduction cannot be withheld from direct cash or exceed the controlled payout after commission')
}

const assertDriverNet = (driver) => {
  assert.equal(driver.platformNetPayoutPaise, driver.controlledPayoutPaise - driver.commissionWithheldPaise - driver.deductionWithheldPaise,
    'platform net payout must conserve the controlled payout after fees and deductions')
  assert.equal(driver.netTotalEarningsPaise, driver.directCashPaise + driver.platformNetPayoutPaise,
    'net total earnings must equal direct cash plus platform net payout')
}

/**
 * `customerSources` is the customer-side collection split (advance, final,
 * cash). `normalDriverGrossPaise` is a caller-supplied, authoritative pre-fee
 * earning: this helper deliberately does not decide whether a coupon reduces
 * it. `driver.actualGrossPaise` is independently reported and must match it.
 * `funding` separates compensation and coupon funding. `commissionWithheldPaise`
 * and `deductionWithheldPaise` are amounts actually withheld from this
 * platform-controlled settlement batch; a fee accrued from an all-cash ride
 * belongs in a separate liability fixture. `netTotalEarningsPaise` includes
 * direct cash; `platformNetPayoutPaise` does not. All named fields are required
 * paise amounts except `ordinaryCouponPaise`, which defaults to zero.
 */
export function assertRideSettlementInvariants({
  farePaise,
  ordinaryCouponPaise = 0,
  compensationPaise = 0,
  normalDriverGrossPaise,
  customerSources,
  driver,
  funding,
}) {
  assertPaise(farePaise, 'farePaise')
  assertPaise(ordinaryCouponPaise, 'ordinaryCouponPaise')
  assertPaise(compensationPaise, 'compensationPaise')
  assertPaise(normalDriverGrossPaise, 'normalDriverGrossPaise')
  assertPaiseFields(customerSources, 'customerSources')
  assertPaiseFields(driver, 'driver')
  assertPaiseFields(funding, 'funding')

  requirePaiseFields(driver, 'driver', [
    'actualGrossPaise', 'directCashPaise', 'controlledPayoutPaise',
    'commissionWithheldPaise', 'deductionWithheldPaise',
    'platformNetPayoutPaise', 'netTotalEarningsPaise',
  ])
  requirePaiseFields(customerSources, 'customerSources', ['advancePaise', 'finalPaise', 'cashPaise'])
  requirePaiseFields(funding, 'funding', ['compensationPaise', 'couponPaise'])

  assertCustomerCollection({ farePaise, ordinaryCouponPaise, compensationPaise, customerSources })
  assertFunding({ farePaise, ordinaryCouponPaise, compensationPaise, normalDriverGrossPaise, funding })
  assertDriverGrossPartition({ driver, normalDriverGrossPaise, customerSources })
  // Collection, coupon/compensation funding and the gross partition together
  // conserve controlled funds; a duplicate derived identity adds no protection.
  assertPlatformDeductions(driver)
  assertDriverNet(driver)
}

/**
 * Use for any finalized receivable, including RCS recovery: what was collected
 * plus what remains outstanding must equal the finalized amount.
 */
export function assertLiabilityInvariants({ finalizedPaise, collectedPaise, outstandingPaise }) {
  assertPaiseFields({ finalizedPaise, collectedPaise, outstandingPaise }, 'liability')
  assert.equal(collectedPaise + outstandingPaise, finalizedPaise,
    'liability collected plus outstanding must equal finalized')
}

export function assertCompensationInventoryInvariants({ issuedPaise, availablePaise, reservedPaise, consumedPaise }) {
  assertPaiseFields({ issuedPaise, availablePaise, reservedPaise, consumedPaise }, 'compensation')
  assert.equal(availablePaise + reservedPaise + consumedPaise, issuedPaise,
    'compensation available, reserved, and consumed must equal issued')
}

export function assertRcsBalanceInvariants({
  openingPaise,
  fundingPaise,
  recoveryPaise,
  compensationConsumedPaise,
  closingPaise,
}) {
  assertPaiseFields({ openingPaise, fundingPaise, recoveryPaise, compensationConsumedPaise, closingPaise }, 'rcs')
  assert.equal(openingPaise + fundingPaise + recoveryPaise - compensationConsumedPaise, closingPaise,
    'RCS opening balance plus funding and recovery less compensation consumed must equal closing balance')
}

export function assertReplacementDriverDeductionOwnership({
  responsibleDriverId,
  deductedDriverId,
  deductionPaise,
}) {
  assertPaise(deductionPaise, 'deductionPaise')
  assert.equal(typeof responsibleDriverId, 'string', 'responsibleDriverId must be a string')
  assert.equal(typeof deductedDriverId, 'string', 'deductedDriverId must be a string')
  if (deductionPaise > 0) {
    assert.equal(responsibleDriverId.length > 0, true, 'a deduction needs a responsible driver')
    assert.equal(deductedDriverId, responsibleDriverId,
      'a replacement driver deduction must belong to the responsible driver')
  }
}
