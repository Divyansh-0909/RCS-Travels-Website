import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANCELLATION_CHARGE_CAP_PAISE,
  CUSTOMER_VALID_CANCELLATION_REASONS,
  customerCancellationChargePaise,
} from '../services/cancellationPolicy.js'

const scheduledBooking = (overrides = {}) => ({
  scheduledAt: new Date('2026-09-20T10:00:00Z'),
  driverId: 'driver-1',
  scheduledAdvancePaidAmount: 15000,
  customerPayment: 800,
  ...overrides,
})

test('scheduled cancellation charge is 10% of fare while the assigned driver is at pickup', () => {
  assert.equal(customerCancellationChargePaise({
    booking: scheduledBooking(), driverAtPickup: true,
  }), 8000)
})

test('scheduled cancellation charge is capped at ₹100', () => {
  assert.equal(customerCancellationChargePaise({
    booking: scheduledBooking({ customerPayment: 5000 }), driverAtPickup: true,
  }), CANCELLATION_CHARGE_CAP_PAISE)
})

test('every disclosed valid rider reason waives the cancellation fee', () => {
  for (const reason of CUSTOMER_VALID_CANCELLATION_REASONS) {
    assert.equal(customerCancellationChargePaise({
      booking: scheduledBooking(), driverAtPickup: true, reason,
    }), 0)
  }
})

test('no fee applies before an assigned driver reaches the chargeable pickup condition', () => {
  assert.equal(customerCancellationChargePaise({ booking: scheduledBooking(), driverAtPickup: false }), 0)
  assert.equal(customerCancellationChargePaise({ booking: scheduledBooking({ driverId: null }), driverAtPickup: true }), 0)
})
