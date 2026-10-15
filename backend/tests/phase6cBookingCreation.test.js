import test from 'node:test'
import assert from 'node:assert/strict'
import { createBookingFromQuote } from '../services/bookingCreation.js'
import { markNoDriver } from '../services/driverAssignment.js'

const user = { id: 'customer-1', phone: 'customer-phone', bookingCode: 'CODE1' }

function fixture({ fare, coupon = 0, compensation = 0 }) {
  let booking
  let payment
  const allocations = []
  const calls = []
  const bookingUpdates = []
  const couponClaims = []
  const couponLinks = []
  const entitlement = { id: 'compensation-1', amountPaise: compensation * 100 }
  const tx = {
    $queryRaw: async () => [],
    booking: {
      create: async ({ data }) => { booking = { id: 'booking-1', ...data }; calls.push('booking'); return booking },
      findUnique: async () => booking,
      update: async (args) => {
        bookingUpdates.push(args); Object.assign(booking, args.data); calls.push('price'); return booking
      },
    },
    responsibilityCompensation: { findMany: async () => compensation ? [{ ...entitlement,
      allocations: allocations.filter(row => row.status === 'RESERVED' || row.status === 'CONSUMED'),
    }] : [] },
    responsibilityCompensationAllocation: {
      findMany: async () => allocations,
      create: async ({ data }) => {
        const row = { id: `allocation-${allocations.length + 1}`, ...data }
        allocations.push(row); calls.push('reservation'); return row
      },
    },
    coupon: {
      updateMany: async args => { couponClaims.push(args); return { count: 1 } },
      update: async args => { couponLinks.push(args); return {} },
    },
    payment: {
      createMany: async ({ data }) => {
        payment = { id: 'payment-1', ...data[0] }; calls.push('advance-intent'); return { count: 1 }
      },
      findUniqueOrThrow: async () => payment,
    },
  }
  const db = { booking: { findMany: async () => [] }, $transaction: work => work(tx) }
  const input = {
    user, quote: { fares: { sedan: { solo: fare } }, ...(coupon ? { coupon: { id: 'coupon-1', amount: coupon } } : {}) },
    pickupAddress: 'A', pickupLat: 28.6, pickupLng: 77.2,
    dropAddress: 'B', dropLat: 28.7, dropLng: 77.3,
    vehicleClass: 'sedan', scheduledAt: '2026-10-01T08:00:00.000Z',
  }
  const providerOrders = []
  const options = {
    db,
    createOrder: async args => { providerOrders.push(args); return { orderId: 'test-order' } },
    assign: id => calls.push(`assign:${id}`),
  }
  return { input, options, tx, calls, allocations, bookingUpdates, couponClaims, couponLinks, providerOrders,
    get booking() { return booking }, get payment() { return payment } }
}

test('scheduled reservation precedes the post-compensation ₹80 advance and survives any driver category', async () => {
  const f = fixture({ fare: 1000, coupon: 100, compensation: 100 })
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.financials.advance, 8000)
  assert.equal(result.financials.finalFare, 80000)
  assert.equal(f.booking.customerPayment, 800)
  assert.equal(f.booking.driverId, undefined)
  assert.deepEqual(f.bookingUpdates[0].where, { id: 'booking-1' })
  assert.deepEqual(f.calls.filter(call => ['booking', 'reservation', 'price', 'advance-intent'].includes(call)),
    ['booking', 'reservation', 'price', 'advance-intent'])
  for (const group of ['rcs', 'partner', 'admin']) {
    f.booking.driver = { group }
    assert.equal(f.booking.scheduledAdvanceAmount, 8000)
    assert.equal(f.booking.customerPayment, 800)
    assert.equal(f.allocations[0].status, 'RESERVED')
  }
})

test('coupon redemption claims the exact entitlement and links it to the created booking', async () => {
  const f = fixture({ fare: 1000, coupon: 100 })
  await createBookingFromQuote(f.input, f.options)
  assert.deepEqual(f.couponClaims[0].where, {
    id: 'coupon-1', userId: user.id, amount: 100, redeemedAt: null, bookingId: null,
  })
  assert.ok(f.couponClaims[0].data.redeemedAt instanceof Date)
  assert.deepEqual(f.couponLinks, [{ where: { id: 'coupon-1' }, data: { bookingId: 'booking-1' } }])
})

test('without compensation the ₹900 obligation has a ₹90 advance', async () => {
  const f = fixture({ fare: 1000, coupon: 100 })
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.financials.finalFare, 90000)
  assert.equal(result.financials.advance, 9000)
  assert.equal(f.booking.scheduledAdvanceDisposition, 'awaiting_payment')
  assert.equal(f.allocations.length, 0)
})

test('compensation is capped by post-coupon fare; zero due needs no provider order', async () => {
  const f = fixture({ fare: 160, coupon: 100, compensation: 100 })
  f.options.createOrder = async () => { throw new Error('zero obligation must not create checkout') }
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.status, 'confirmed')
  assert.equal(result.financials.advance, 0)
  assert.equal(result.financials.finalFare, 0)
  assert.equal(result.payment, null)
  assert.equal(Object.hasOwn(result, 'paymentError'), false)
  assert.equal(f.booking.scheduledAdvanceDisposition, 'not_applicable')
  assert.equal(f.booking.customerPayment, 0)
  assert.equal(f.payment, undefined)
  assert.deepEqual(f.providerOrders, [])
  assert.equal(f.allocations[0].amountPaise, 6000)
  assert.equal(10000 - f.allocations[0].amountPaise, 4000)
})

test('Ride Now reserves before assignment and prices the customer independently of driver category', async () => {
  const f = fixture({ fare: 400, compensation: 80 })
  f.input.scheduledAt = null
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.status, 'pending')
  assert.equal(f.booking.customerPayment, 320)
  assert.deepEqual(f.calls.filter(call => call.startsWith('assign')), ['assign:booking-1'])
  assert.equal(f.allocations[0].amountPaise, 8000)
  assert.equal(f.booking.source, 'website')
  assert.equal(f.booking.isOutstation, false)
  assert.deepEqual(f.bookingUpdates[0].where, { id: 'booking-1' })
})

test('Ride Now with no compensation returns the created booking without a pricing update', async () => {
  const f = fixture({ fare: 400 })
  f.input.scheduledAt = null
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.bookingId, 'booking-1')
  assert.equal(f.booking.customerPayment, 400)
  assert.deepEqual(f.bookingUpdates, [])
  assert.deepEqual(f.calls.filter(call => call.startsWith('assign')), ['assign:booking-1'])
})

test('booking creation rejects an invalid quote and conflicting active rides before money writes', async () => {
  const invalid = fixture({ fare: 0 })
  await assert.rejects(createBookingFromQuote(invalid.input, invalid.options), { code: 'FARE_QUOTE' })
  assert.deepEqual(invalid.calls, [])

  const overlap = fixture({ fare: 400 })
  overlap.options.db.booking.findMany = async () => [{
    scheduledAt: new Date(overlap.input.scheduledAt), pickupAddress: 'Other', dropAddress: 'Elsewhere',
  }]
  await assert.rejects(createBookingFromQuote(overlap.input, overlap.options), /around this time/)
  assert.deepEqual(overlap.calls, [])

  overlap.options.db.booking.findMany = async () => [{
    scheduledAt: new Date('2026-11-01T08:00:00.000Z'),
    pickupAddress: ' a ', dropAddress: ' b ',
  }]
  await assert.rejects(createBookingFromQuote(overlap.input, overlap.options), /active booking for this route/)
  assert.deepEqual(overlap.calls, [])

  overlap.input.scheduledAt = null
  overlap.options.db.booking.findMany = async () => [{
    scheduledAt: null, pickupAddress: 'Other', dropAddress: 'Elsewhere',
  }]
  await assert.rejects(createBookingFromQuote(overlap.input, overlap.options), /around this time/)
})

function bookingFilteredByRequestedStatus(existingBooking) {
  const f = fixture({ fare: 400 })
  f.options.db.booking.findMany = async ({ where }) =>
    where.status.in.includes(existingBooking.status) ? [existingBooking] : []
  return f
}

test('each in-progress booking status prevents another ride in the same time window', async () => {
  const blockingStatuses = ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']

  for (const status of blockingStatuses) {
    const f = bookingFilteredByRequestedStatus({
      status, scheduledAt: new Date('2026-10-01T08:10:00.000Z'),
      pickupAddress: 'Different pickup', dropAddress: 'Different drop',
    })

    await assert.rejects(createBookingFromQuote(f.input, f.options), /around this time/, status)
    assert.deepEqual(f.calls, [], status)
  }
})

test('terminal bookings never prevent a new ride, even when their route and time match', async () => {
  for (const status of ['completed', 'cancelled', 'no_driver']) {
    const f = bookingFilteredByRequestedStatus({
      status, scheduledAt: new Date('2026-10-01T08:00:00.000Z'),
      pickupAddress: ' a ', dropAddress: ' b ',
    })

    await createBookingFromQuote(f.input, f.options)
    assert.equal(f.booking.status, 'payment_pending', status)
  }
})

test('the overlap window blocks rides on either side of the requested time but not at its edge', async () => {
  const requestedAt = new Date('2026-10-01T08:00:00.000Z').getTime()
  for (const offsetMs of [-(14 * 60 + 59) * 1000, (14 * 60 + 59) * 1000]) {
    const f = bookingFilteredByRequestedStatus({
      status: 'confirmed', scheduledAt: new Date(requestedAt + offsetMs),
      pickupAddress: 'Different pickup', dropAddress: 'Different drop',
    })

    await assert.rejects(createBookingFromQuote(f.input, f.options), /around this time/)
  }

  const f = bookingFilteredByRequestedStatus({
    status: 'confirmed', scheduledAt: new Date(requestedAt + 15 * 60 * 1000),
    pickupAddress: 'Different pickup', dropAddress: 'Different drop',
  })
  await createBookingFromQuote(f.input, f.options)
  assert.equal(f.booking.status, 'payment_pending')
})

test('an active ride only blocks the same normalized route outside the time window', async () => {
  const existingAt = new Date('2026-10-01T10:00:00.000Z')
  const cases = [
    { pickupAddress: ' a ', dropAddress: ' b ', conflicts: true },
    { pickupAddress: 'Other pickup', dropAddress: ' b ', conflicts: false },
    { pickupAddress: ' a ', dropAddress: 'Other drop', conflicts: false },
    { pickupAddress: 'Other pickup', dropAddress: 'Other drop', conflicts: false },
  ]

  for (const { pickupAddress, dropAddress, conflicts } of cases) {
    const f = bookingFilteredByRequestedStatus({ status: 'assigned', scheduledAt: existingAt, pickupAddress, dropAddress })
    const attempt = createBookingFromQuote(f.input, f.options)
    if (conflicts) await assert.rejects(attempt, /active booking for this route/)
    else await attempt
    assert.equal(Boolean(f.booking), !conflicts)
  }
})

test('coupon claim failure prevents booking and payment creation', async () => {
  const f = fixture({ fare: 1000, coupon: 100, compensation: 100 })
  f.tx.coupon.updateMany = async () => ({ count: 0 })
  await assert.rejects(createBookingFromQuote(f.input, f.options), {
    code: 'COUPON_UNAVAILABLE', message: 'Coupon already redeemed',
  })
  assert.deepEqual(f.calls, [])
})

test('checkout creation failure leaves a retriable payment intent and reservation', async () => {
  const f = fixture({ fare: 1000, compensation: 100 })
  f.options.createOrder = async () => { throw new Error('provider unavailable') }
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.status, 'payment_pending')
  assert.equal(result.payment, null)
  assert.equal(result.paymentError.code, 'PAYMENT_ORDER_FAILED')
  assert.equal(result.paymentError.message, 'Payment checkout could not be created. Retry payment.')
  assert.equal(f.payment.amount, 9000)
  assert.equal(f.allocations[0].status, 'RESERVED')
})

test('scheduled checkout receives the persisted payment, customer, and database', async () => {
  const f = fixture({ fare: 1000 })
  const result = await createBookingFromQuote(f.input, f.options)
  assert.deepEqual(f.providerOrders, [{ paymentId: 'payment-1', userId: 'customer-1', db: f.options.db }])
  assert.deepEqual(result.payment, { orderId: 'test-order' })
})

test('verified quote data retains safe route, sharing and booking source independently of compensation', async () => {
  const f = fixture({ fare: 400 })
  f.input.scheduledAt = null
  f.input.sharing = true
  f.input.isOutstation = true
  f.input.source = 'whatsapp'
  f.input.quote.fares.sedan.sharing = 200
  f.input.quote.fares.sedan.solo = null
  f.input.quote.durationMin = 12.4
  f.input.quote.safeRoute = { applied: true, waypoint: { lat: 28.61, lng: 77.22 } }
  f.input.quote.needsCarrier = true
  const result = await createBookingFromQuote(f.input, f.options)
  assert.equal(result.fare, 200)
  assert.equal(f.booking.source, 'whatsapp')
  assert.equal(f.booking.isOutstation, true)
  assert.equal(f.booking.preferSafeRoute, true)
  assert.equal(f.booking.safeWaypointLat, 28.61)
  assert.equal(f.booking.safeWaypointLng, 77.22)
  assert.equal(f.booking.needsCarrier, true)
  assert.equal(f.booking.soloFare, null)
  assert.equal(f.booking.durationMin, 12)
})

test('quote pricing preserves pass-through charges while calculating ride fare and commission', async () => {
  const f = fixture({ fare: 1500, coupon: 100 })
  f.input.scheduledAt = null
  f.input.sharing = true
  f.input.quote.fares.sedan = { solo: 1600, sharing: 1500, toll: 100, airport: 150, carrier: 50 }
  f.input.quote.distanceKm = 14.25
  f.input.quote.durationMin = 24.7
  f.input.quote.polyline = 'encoded-route'
  f.input.quote.needsCarrier = false

  const result = await createBookingFromQuote(f.input, f.options)

  assert.equal(result.fare, 1500)
  assert.equal(f.booking.customerPayment, 1400)
  assert.equal(f.booking.rideFare, 1200)
  assert.equal(f.booking.commissionPct, 10)
  assert.equal(f.booking.commissionAmt, 110)
  assert.equal(f.booking.soloFare, 1600)
  assert.equal(f.booking.distanceKm, 14.25)
  assert.equal(f.booking.durationMin, 25)
  assert.equal(f.booking.routePolyline, 'encoded-route')
  assert.equal(f.booking.needsCarrier, false)
})

test('safe-route waypoints are persisted only when the verified route was applied', async () => {
  const declined = fixture({ fare: 400 })
  declined.input.scheduledAt = null
  declined.input.quote.safeRoute = { applied: false, waypoint: { lat: 28.61, lng: 77.22 } }
  await createBookingFromQuote(declined.input, declined.options)
  assert.equal(declined.booking.preferSafeRoute, false)
  assert.equal(declined.booking.safeWaypointLat, null)
  assert.equal(declined.booking.safeWaypointLng, null)

  const noWaypoint = fixture({ fare: 400 })
  noWaypoint.input.scheduledAt = null
  noWaypoint.input.quote.safeRoute = { applied: true }
  await createBookingFromQuote(noWaypoint.input, noWaypoint.options)
  assert.equal(noWaypoint.booking.preferSafeRoute, true)
  assert.equal(noWaypoint.booking.safeWaypointLat, null)
  assert.equal(noWaypoint.booking.safeWaypointLng, null)
})

test('unavailable fare cards reject booking creation as a fare-quote error before writes', async () => {
  const missingCards = fixture({ fare: 400 })
  missingCards.input.quote.fares = undefined
  await assert.rejects(createBookingFromQuote(missingCards.input, missingCards.options), {
    code: 'FARE_QUOTE', message: 'That vehicle could not be priced for this route',
  })
  assert.deepEqual(missingCards.calls, [])

  const missingVehicle = fixture({ fare: 400 })
  missingVehicle.input.quote.fares = {}
  await assert.rejects(createBookingFromQuote(missingVehicle.input, missingVehicle.options), {
    code: 'FARE_QUOTE', message: 'That vehicle could not be priced for this route',
  })
  assert.deepEqual(missingVehicle.calls, [])
})

test('missing optional quote metadata is stored as null and carrier need remains false', async () => {
  const f = fixture({ fare: 400 })
  f.input.scheduledAt = null
  f.input.quote.distanceKm = undefined
  f.input.quote.durationMin = undefined
  f.input.quote.polyline = undefined
  f.input.quote.needsCarrier = false

  await createBookingFromQuote(f.input, f.options)

  assert.equal(f.booking.distanceKm, null)
  assert.equal(f.booking.durationMin, null)
  assert.equal(f.booking.routePolyline, null)
  assert.equal(f.booking.needsCarrier, false)
})

test('a terminal no-driver outcome releases the reservation in the status transaction', async () => {
  const allocation = { status: 'RESERVED' }
  let status = 'pending'
  let notices = 0
  const tx = {
    booking: { updateMany: async () => {
      if (status !== 'pending') return { count: 0 }
      status = 'no_driver'; return { count: 1 }
    } },
    responsibilityCompensationAllocation: { updateMany: async ({ where, data }) => {
      if (allocation.status !== where.status) return { count: 0 }
      Object.assign(allocation, data); return { count: 1 }
    } },
  }
  const options = { db: { $transaction: work => work(tx) }, notify: async () => { notices += 1 } }
  assert.equal(await markNoDriver('booking-1', options), true)
  assert.equal(await markNoDriver('booking-1', options), false)
  assert.equal(status, 'no_driver')
  assert.equal(allocation.status, 'RELEASED')
  assert.equal(notices, 1)
})
