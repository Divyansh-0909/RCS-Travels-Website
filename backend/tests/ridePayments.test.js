import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RidePaymentError,
  applyRidePaymentCaptureEffect,
  createRideNowFinalIntent,
  recordRideNowCashPayment,
  recordScheduledFinalCashPayment,
  ridePaymentView,
} from '../services/ridePayments.ts'

const baseBooking = (overrides = {}) => ({
  id: 'ride-1',
  userId: 'user-1',
  status: 'completed',
  scheduledAt: null,
  fare: 500,
  couponAmount: 50,
  customerPayment: 450,
  scheduledAdvancePct: 1500,
  scheduledAdvanceAmount: 6800,
  scheduledAdvancePaidAmount: 6800,
  scheduledRemainingAmount: 38200,
  scheduledFinalPaidAmount: 0,
  scheduledFinalPaymentMethod: null,
  scheduledFinalPaidAt: null,
  rideNowPaidAmount: 0,
  rideNowPaymentMethod: null,
  rideNowPaidAt: null,
  ...overrides,
})

const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value)

function harness(initial = baseBooking()) {
  let row = { ...initial }
  let payment = null
  const tx = {
    booking: {
      findUnique: async ({ where }) => where.id === row.id ? { ...row } : null,
      findUniqueOrThrow: async ({ where }) => {
        if (where.id !== row.id) throw new Error('not found')
        return { ...row }
      },
      updateMany: async ({ where, data }) => {
        if (!matches(row, where)) return { count: 0 }
        row = { ...row, ...data }
        return { count: 1 }
      },
    },
    payment: {
      createMany: async ({ data }) => {
        if (!payment) payment = { id: 'payment-1', status: 'created', ...data[0] }
        return { count: 1 }
      },
      findUniqueOrThrow: async ({ where }) => {
        if (!payment || payment.idempotencyKey !== where.idempotencyKey) throw new Error('not found')
        return { ...payment }
      },
    },
  }
  return { tx, row: () => ({ ...row }), payment: () => payment && ({ ...payment }) }
}

const paymentFor = (purpose, amount = 45000) => ({
  id: 'payment-1',
  bookingId: 'ride-1',
  purpose,
  amount,
})

test('ride payment view reports authoritative Ride Now and scheduled amounts', () => {
  assert.deepEqual(ridePaymentView(baseBooking()), {
    state: 'pending', method: null, amount: 45000, paidAmount: 0, paidAt: null,
  })
  const paidAt = new Date('2026-09-18T05:00:00Z')
  assert.deepEqual(ridePaymentView(baseBooking({
    scheduledAt: new Date('2026-09-20T05:00:00Z'),
    scheduledFinalPaidAmount: 38200,
    scheduledFinalPaymentMethod: 'upi',
    scheduledFinalPaidAt: paidAt,
  })), {
    state: 'paid', method: 'upi', amount: 38200, paidAmount: 38200, paidAt,
  })

  assert.deepEqual(ridePaymentView(baseBooking({
    customerPayment: -1,
    rideNowPaidAmount: 0,
    rideNowPaymentMethod: 'cash',
  })), {
    state: 'paid', method: 'cash', amount: 0, paidAmount: 0, paidAt: null,
  })

  assert.deepEqual(ridePaymentView(baseBooking({
    rideNowPaidAmount: 100,
    rideNowPaymentMethod: 'cash',
  })), {
    state: 'pending', method: 'cash', amount: 45000, paidAmount: 100, paidAt: null,
  })

  assert.equal(ridePaymentView(baseBooking({ rideNowPaymentMethod: 'bank' })).method, null)
})

test('RidePaymentError exposes stable default metadata', () => {
  const error = new RidePaymentError('conflict')
  assert.equal(error.status, 409)
  assert.equal(error.code, 'RIDE_PAYMENT_CONFLICT')
})

test('Ride Now cash settles the server amount and retries idempotently', async () => {
  const h = harness()
  const first = await recordRideNowCashPayment(h.tx, 'ride-1')
  assert.equal(first.state, 'paid')
  assert.equal(first.method, 'cash')
  assert.equal(first.paidAmount, 45000)
  assert.equal(h.row().rideNowPaidAmount, 45000)
  const paidAt = h.row().rideNowPaidAt

  const retry = await recordRideNowCashPayment(h.tx, 'ride-1')
  assert.equal(retry.method, 'cash')
  assert.equal(h.row().rideNowPaidAt, paidAt)
})

test('Ride Now cash rejects wrong ride state and an existing UPI settlement', async () => {
  const scheduled = harness(baseBooking({ scheduledAt: new Date('2026-09-20T05:00:00Z') }))
  await assert.rejects(recordRideNowCashPayment(scheduled.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'RIDE_NOW_REQUIRED')

  const active = harness(baseBooking({ status: 'started' }))
  await assert.rejects(recordRideNowCashPayment(active.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'RIDE_NOT_COMPLETED')

  const upi = harness(baseBooking({ rideNowPaidAmount: 45000, rideNowPaymentMethod: 'upi', rideNowPaidAt: new Date() }))
  await assert.rejects(recordRideNowCashPayment(upi.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'PAYMENT_ALREADY_SETTLED')

  const missing = harness()
  await assert.rejects(recordRideNowCashPayment(missing.tx, 'missing'),
    (error) => error instanceof RidePaymentError && error.code === 'BOOKING_NOT_FOUND')

  const raced = harness()
  raced.tx.booking.updateMany = async () => ({ count: 0 })
  await assert.rejects(recordRideNowCashPayment(raced.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'PAYMENT_STATE_CHANGED')
})

test('scheduled final cash settles only a completed ride with its advance paid', async () => {
  const scheduledAt = new Date('2026-09-20T05:00:00Z')
  const h = harness(baseBooking({ scheduledAt }))
  const first = await recordScheduledFinalCashPayment(h.tx, 'ride-1')
  assert.equal(first.method, 'cash')
  assert.equal(first.paidAmount, 38200)
  assert.equal((await recordScheduledFinalCashPayment(h.tx, 'ride-1')).method, 'cash')

  const rideNow = harness()
  await assert.rejects(recordScheduledFinalCashPayment(rideNow.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'SCHEDULED_RIDE_REQUIRED')
  const unpaidAdvance = harness(baseBooking({ scheduledAt, scheduledAdvancePaidAmount: 0 }))
  await assert.rejects(recordScheduledFinalCashPayment(unpaidAdvance.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'ADVANCE_NOT_PAID')

  const active = harness(baseBooking({ scheduledAt, status: 'started' }))
  await assert.rejects(recordScheduledFinalCashPayment(active.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'RIDE_NOT_COMPLETED')

  const missing = harness(baseBooking({ scheduledAt }))
  await assert.rejects(recordScheduledFinalCashPayment(missing.tx, 'missing'),
    (error) => error instanceof RidePaymentError && error.code === 'BOOKING_NOT_FOUND')

  const raced = harness(baseBooking({ scheduledAt }))
  raced.tx.booking.updateMany = async () => ({ count: 0 })
  await assert.rejects(recordScheduledFinalCashPayment(raced.tx, 'ride-1'),
    (error) => error instanceof RidePaymentError && error.code === 'PAYMENT_STATE_CHANGED')
})

test('Ride Now UPI capture settles once and duplicate capture is a no-op', async () => {
  const h = harness()
  const payment = paymentFor('ride_now_final')
  assert.deepEqual(await applyRidePaymentCaptureEffect(h.tx, payment), {
    type: 'ride_now_final', bookingId: 'ride-1',
  })
  assert.equal(h.row().rideNowPaymentMethod, 'upi')
  assert.equal(h.row().rideNowPaidAmount, 45000)
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, payment), null)
})

test('scheduled final UPI capture settles once', async () => {
  const h = harness(baseBooking({ scheduledAt: new Date('2026-09-20T05:00:00Z') }))
  assert.deepEqual(await applyRidePaymentCaptureEffect(h.tx, paymentFor('scheduled_ride_final', 38200)), {
    type: 'scheduled_ride_final', bookingId: 'ride-1',
  })
  assert.equal(h.row().scheduledFinalPaymentMethod, 'upi')
  assert.equal(h.row().scheduledFinalPaidAmount, 38200)
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, paymentFor('scheduled_ride_final', 38200)), null)
})

test('a UPI capture after cash asks the gateway pipeline to refund it', async () => {
  const rideNow = harness(baseBooking({
    rideNowPaidAmount: 45000, rideNowPaymentMethod: 'cash', rideNowPaidAt: new Date(),
  }))
  assert.deepEqual(await applyRidePaymentCaptureEffect(rideNow.tx, paymentFor('ride_now_final')), {
    type: 'late_final_payment_refund', bookingId: 'ride-1', paymentId: 'payment-1',
  })

  const scheduled = harness(baseBooking({
    scheduledAt: new Date('2026-09-20T05:00:00Z'), scheduledFinalPaidAmount: 38200,
    scheduledFinalPaymentMethod: 'cash', scheduledFinalPaidAt: new Date(),
  }))
  assert.deepEqual(await applyRidePaymentCaptureEffect(scheduled.tx, paymentFor('scheduled_ride_final', 38200)), {
    type: 'late_final_payment_refund', bookingId: 'ride-1', paymentId: 'payment-1',
  })
})

test('Ride Now UPI intent uses server-owned fare and stable idempotency', async () => {
  const h = harness()
  const payment = await createRideNowFinalIntent(h.tx, baseBooking())
  assert.equal(payment.purpose, 'ride_now_final')
  assert.equal(payment.amount, 45000)
  assert.equal(payment.idempotencyKey, 'ride-now-final:ride-1')
  assert.equal(h.payment().finalFareAmount, 45000)

  const paid = harness(baseBooking({ rideNowPaidAmount: 45000, rideNowPaymentMethod: 'cash', rideNowPaidAt: new Date() }))
  await assert.rejects(createRideNowFinalIntent(paid.tx, paid.row()),
    (error) => error instanceof RidePaymentError && error.code === 'PAYMENT_ALREADY_SETTLED')
})

test('unrelated captures and captures without a booking are ignored', async () => {
  const h = harness()
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, { ...paymentFor('other_customer_payment'), bookingId: null }), undefined)
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, paymentFor('other_customer_payment')), undefined)

  assert.equal(await applyRidePaymentCaptureEffect(h.tx, { ...paymentFor('ride_now_final'), bookingId: 'missing' }), null)
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, { ...paymentFor('scheduled_ride_final'), bookingId: 'missing' }), null)
})
