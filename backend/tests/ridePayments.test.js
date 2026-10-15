import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RidePaymentError,
  applyRidePaymentCaptureEffect,
  createRideNowFinalIntent,
  driverPayoutUpiAvailable,
  recordRideNowCashPayment,
  recordScheduledFinalCashPayment,
  requireVerifiedDriverPayoutUpi,
  ridePaymentView,
} from '../services/ridePayments.ts'

const baseBooking = (overrides = {}) => ({
  id: 'ride-1',
  userId: 'user-1',
  driverId: 'driver-1',
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

function harness(initial = baseBooking(), { liabilities = [] } = {}) {
  let row = { ...initial }
  let payment = null
  let driver = {
    id: 'driver-1', walletBalance: 0, payoutUpiId: 'captain@upi',
    payoutUpiVerifiedAt: new Date('2026-09-20T00:00:00Z'),
  }
  const walletEntries = new Map()
  let recoveryLockQueries = 0
  const tx = {
    driver: {
      findUnique: async ({ where }) => where.id === driver.id ? { ...driver } : null,
      update: async ({ where, data }) => {
        if (where.id !== driver.id) throw new Error('driver not found')
        if (data.walletBalance?.increment) driver.walletBalance += data.walletBalance.increment
        driver = { ...driver, ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'walletBalance')) }
        return { ...driver }
      },
    },
    walletEntry: {
      findUnique: async ({ where }) => walletEntries.get(where.eventKey) ?? null,
      createMany: async ({ data }) => {
        let count = 0
        for (const entry of data) {
          if (walletEntries.has(entry.eventKey)) continue
          walletEntries.set(entry.eventKey, { ...entry })
          count += 1
        }
        return { count }
      },
    },
    responsibilityLiability: {
      findMany: async () => liabilities.map(liability => ({
        ...liability,
        entries: liability.entries.map(entry => ({ ...entry })),
      })),
    },
    responsibilityLiabilityEntry: {
      findUnique: async ({ where }) => liabilities
        .flatMap(liability => liability.entries.map(entry => ({ ...entry, liabilityId: liability.id })))
        .find(entry => entry.sourceKey === where.sourceKey) ?? null,
      createMany: async ({ data }) => {
        const entry = data[0]
        const liability = liabilities.find(candidate => candidate.id === entry.liabilityId)
        if (!liability || liability.entries.some(candidate => candidate.sourceKey === entry.sourceKey)) return { count: 0 }
        liability.entries.push({ ...entry })
        return { count: 1 }
      },
    },
    $queryRaw: async () => {
      recoveryLockQueries += 1
      return []
    },
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
  return {
    tx,
    row: () => ({ ...row }),
    payment: () => payment && ({ ...payment }),
    driver: () => ({ ...driver }),
    walletEntries: () => [...walletEntries.values()].map((entry) => ({ ...entry })),
    liabilityEntries: () => liabilities.flatMap(liability => liability.entries.map(entry => ({ ...entry }))),
    recoveryLockQueries: () => recoveryLockQueries,
    setDriver: (overrides) => { driver = { ...driver, ...overrides } },
  }
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

  assert.deepEqual(ridePaymentView(baseBooking({ customerPayment: 0 })), {
    state: 'paid', method: null, amount: 0, paidAmount: 0, paidAt: null,
  })
  assert.deepEqual(ridePaymentView(baseBooking({
    scheduledAt: new Date('2026-09-20T05:00:00Z'), scheduledRemainingAmount: 0,
  })), {
    state: 'paid', method: null, amount: 0, paidAmount: 0, paidAt: null,
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
  assert.equal(h.driver().walletBalance, 450)
  assert.deepEqual(h.walletEntries().map(({ amount, type, method, eventKey }) => ({ amount, type, method, eventKey })), [{
    amount: 450,
    type: 'ride_collection',
    method: 'upi',
    eventKey: 'ride_collection:booking:ride-1:source:ride_now_final',
  }])
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, payment), null)
  assert.equal(h.driver().walletBalance, 450)
  assert.equal(h.walletEntries().length, 1)
})

test('the production ₹500 Ride Now UPI case creates exactly one ₹500 driver receivable', async () => {
  const h = harness(baseBooking({ fare: 500, couponAmount: 0, customerPayment: 500 }))
  const payment = paymentFor('ride_now_final', 50000)
  await applyRidePaymentCaptureEffect(h.tx, payment)
  await applyRidePaymentCaptureEffect(h.tx, payment)
  assert.equal(h.driver().walletBalance, 500)
  assert.equal(h.walletEntries().length, 1)
  assert.equal(h.walletEntries()[0].amount, 500)
  assert.equal(h.walletEntries()[0].type, 'ride_collection')
})

test('scheduled final UPI capture settles once', async () => {
  const h = harness(baseBooking({ scheduledAt: new Date('2026-09-20T05:00:00Z') }))
  assert.deepEqual(await applyRidePaymentCaptureEffect(h.tx, paymentFor('scheduled_ride_final', 38200)), {
    type: 'scheduled_ride_final', bookingId: 'ride-1',
  })
  assert.equal(h.row().scheduledFinalPaymentMethod, 'upi')
  assert.equal(h.row().scheduledFinalPaidAmount, 38200)
  assert.equal(h.driver().walletBalance, 382)
  assert.equal(h.walletEntries()[0].eventKey, 'ride_collection:booking:ride-1:source:scheduled_ride_final')
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, paymentFor('scheduled_ride_final', 38200)), null)
  assert.equal(h.driver().walletBalance, 382)
})

test('newly posted Ride Now and scheduled-final UPI collections recover finalized liabilities', async () => {
  for (const [purpose, booking, amount] of [
    ['ride_now_final', baseBooking(), 45000],
    ['scheduled_ride_final', baseBooking({ scheduledAt: new Date('2026-09-20T05:00:00Z') }), 38200],
  ]) {
    const h = harness(booking, {
      liabilities: [{
        id: 'liability-1', driverId: 'driver-1', amountPaise: 10000,
        createdAt: new Date('2026-09-19T00:00:00Z'), entries: [],
      }],
    })
    const payment = paymentFor(purpose, amount)
    await applyRidePaymentCaptureEffect(h.tx, payment)

    assert.deepEqual(h.liabilityEntries().map(({ kind, amountPaise, earningBookingId }) => ({ kind, amountPaise, earningBookingId })), [{
      kind: 'RECOVERED', amountPaise: 10000, earningBookingId: 'ride-1',
    }])
    assert.equal(h.walletEntries().some(entry => entry.type === 'liability_recovery' && entry.amount === -100), true)

    const locksAfterFirstCapture = h.recoveryLockQueries()
    await applyRidePaymentCaptureEffect(h.tx, payment)
    assert.equal(h.recoveryLockQueries(), locksAfterFirstCapture)
    assert.equal(h.liabilityEntries().length, 1)
  }
})

test('cash settlements never trigger finalized-liability recovery', async () => {
  const liability = () => [{
    id: 'liability-1', driverId: 'driver-1', amountPaise: 10000,
    createdAt: new Date('2026-09-19T00:00:00Z'), entries: [],
  }]
  const rideNow = harness(baseBooking(), { liabilities: liability() })
  await recordRideNowCashPayment(rideNow.tx, 'ride-1')
  assert.equal(rideNow.recoveryLockQueries(), 0)
  assert.equal(rideNow.liabilityEntries().length, 0)

  const scheduled = harness(baseBooking({ scheduledAt: new Date('2026-09-20T05:00:00Z') }), { liabilities: liability() })
  await recordScheduledFinalCashPayment(scheduled.tx, 'ride-1')
  assert.equal(scheduled.recoveryLockQueries(), 0)
  assert.equal(scheduled.liabilityEntries().length, 0)
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

test('a fully compensated Ride Now final payment is settled without a payment method or gateway intent', async () => {
  const h = harness(baseBooking({ customerPayment: 0 }))
  await assert.rejects(createRideNowFinalIntent(h.tx, h.row()),
    (error) => error instanceof RidePaymentError && error.code === 'PAYMENT_ALREADY_SETTLED')
  assert.equal(h.payment(), null)
})

test('a final UPI capture is refunded if payout verification disappeared after checkout opened', async () => {
  for (const [purpose, scheduledAt] of [
    ['ride_now_final', null],
    ['scheduled_ride_final', new Date('2026-09-20T05:00:00Z')],
  ]) {
    const h = harness(baseBooking({ scheduledAt }))
    h.setDriver({ payoutUpiVerifiedAt: null })
    assert.deepEqual(await applyRidePaymentCaptureEffect(h.tx, paymentFor(purpose)), {
      type: 'late_final_payment_refund', bookingId: 'ride-1', paymentId: 'payment-1',
    })
    assert.equal(h.row().rideNowPaymentMethod, null)
    assert.equal(h.row().scheduledFinalPaymentMethod, null)
  }
})

test('a duplicate captured UPI payment is not refunded merely because payout verification changed later', async () => {
  const h = harness(baseBooking({ rideNowPaidAmount: 45000, rideNowPaymentMethod: 'upi', rideNowPaidAt: new Date() }))
  h.setDriver({ payoutUpiVerifiedAt: null })
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, paymentFor('ride_now_final')), null)
})

test('final UPI intents require an assigned driver payout UPI that an admin verified', async () => {
  const unavailable = harness()
  unavailable.setDriver({ payoutUpiId: null, payoutUpiVerifiedAt: null })
  assert.equal(await driverPayoutUpiAvailable(unavailable.tx, unavailable.row().driverId), false)
  await assert.rejects(createRideNowFinalIntent(unavailable.tx, unavailable.row()),
    (error) => error instanceof RidePaymentError && error.code === 'DRIVER_PAYOUT_UPI_UNAVAILABLE')

  const unassigned = harness(baseBooking({ driverId: null }))
  assert.equal(await driverPayoutUpiAvailable(unassigned.tx, unassigned.row().driverId), false)
  await assert.rejects(createRideNowFinalIntent(unassigned.tx, unassigned.row()),
    (error) => error instanceof RidePaymentError && error.code === 'DRIVER_PAYOUT_UPI_UNAVAILABLE')

  const scheduled = harness(baseBooking({ scheduledAt: new Date('2026-09-20T05:00:00Z') }))
  scheduled.setDriver({ payoutUpiVerifiedAt: null })
  await assert.rejects(requireVerifiedDriverPayoutUpi(scheduled.tx, scheduled.row()),
    (error) => error instanceof RidePaymentError && error.code === 'DRIVER_PAYOUT_UPI_UNAVAILABLE')

  scheduled.setDriver({ payoutUpiVerifiedAt: new Date('2026-09-20T00:00:00Z') })
  assert.equal(await driverPayoutUpiAvailable(scheduled.tx, scheduled.row().driverId), true)
  await assert.doesNotReject(requireVerifiedDriverPayoutUpi(scheduled.tx, scheduled.row()))
})

test('unrelated captures and captures without a booking are ignored', async () => {
  const h = harness()
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, { ...paymentFor('other_customer_payment'), bookingId: null }), undefined)
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, paymentFor('other_customer_payment')), undefined)

  assert.equal(await applyRidePaymentCaptureEffect(h.tx, { ...paymentFor('ride_now_final'), bookingId: 'missing' }), null)
  assert.equal(await applyRidePaymentCaptureEffect(h.tx, { ...paymentFor('scheduled_ride_final'), bookingId: 'missing' }), null)
})
