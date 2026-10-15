import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ResponsibilityCompensationError,
  isBookingEligibleForResponsibilityCompensation,
  consumeReservedResponsibilityCompensation,
  releaseReservedResponsibilityCompensation,
  reserveResponsibilityCompensation,
} from '../services/responsibilityCompensation.js'

function transaction({ booking: bookingPatch = {}, entitlements = [] } = {}) {
  const allocations = []
  const locks = []
  const calls = {
    bookingFindUnique: [], entitlementFindMany: [], allocationFindMany: [],
    allocationCreate: [], allocationUpdateMany: [],
  }
  const booking = {
    id: 'booking-1', userId: 'user-1', fare: 120, couponAmount: 0,
    status: 'assigned', driverId: 'driver-1', driver: { group: 'rcs' }, ...bookingPatch,
  }
  const tx = {
    $queryRaw: async (...args) => { locks.push(args); return [{ id: 'locked' }] },
    booking: { findUnique: async args => { calls.bookingFindUnique.push(args); return booking } },
    responsibilityCompensation: {
      findMany: async args => {
        calls.entitlementFindMany.push(args)
        return entitlements.map(entitlement => ({ ...entitlement,
        allocations: allocations.filter(allocation => allocation.compensationId === entitlement.id &&
          ['RESERVED', 'CONSUMED'].includes(allocation.status)),
        }))
      },
    },
    responsibilityCompensationAllocation: {
      findMany: async args => {
        calls.allocationFindMany.push(args)
        const { where } = args
        return allocations.filter(allocation => allocation.bookingId === where.bookingId &&
          (!where.status || allocation.status === where.status))
      },
      create: async ({ data }) => {
        calls.allocationCreate.push(data)
        const allocation = { id: `allocation-${allocations.length + 1}`, ...data }
        allocations.push(allocation)
        return allocation
      },
      updateMany: async ({ where, data }) => {
        calls.allocationUpdateMany.push({ where, data })
        let count = 0
        for (const allocation of allocations) {
          if ((where.id ? allocation.id === where.id : allocation.bookingId === where.bookingId) && allocation.status === where.status) {
            Object.assign(allocation, data)
            count += 1
          }
        }
        return { count }
      },
    },
  }
  return { tx, allocations, locks, calls }
}

test('reserves FIFO entitlements, including a partial allocation', async () => {
  const fixture = transaction({ entitlements: [
    { id: 'old', amountPaise: 7000 },
    { id: 'new', amountPaise: 10000 },
  ] })
  const result = await reserveResponsibilityCompensation(fixture.tx, 'booking-1')

  assert.equal(result.obligationPaise, 12000)
  assert.equal(result.reservedPaise, 12000)
  assert.deepEqual(fixture.allocations.map(({ compensationId, amountPaise, sourceKey }) =>
    ({ compensationId, amountPaise, sourceKey })), [
    { compensationId: 'old', amountPaise: 7000, sourceKey: 'responsibility-compensation:booking-1:old' },
    { compensationId: 'new', amountPaise: 5000, sourceKey: 'responsibility-compensation:booking-1:new' },
  ])
  assert.equal(fixture.locks.length, 2)
})

test('reservation issues stable lock and Prisma query contracts before allocating FIFO credit', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 12000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')

  assert.deepEqual(fixture.calls.bookingFindUnique, [{
    where: { id: 'booking-1' },
    select: { id: true, userId: true, fare: true, couponAmount: true, status: true },
  }])
  assert.deepEqual(fixture.locks.map(([query, userId]) => [Array.from(query), userId]), [
    [['SELECT id FROM users WHERE id = ', ' FOR UPDATE'], 'user-1'],
    [['SELECT id FROM responsibility_compensations WHERE user_id = ',
      ' ORDER BY created_at ASC, id ASC FOR UPDATE'], 'user-1'],
  ])
  assert.deepEqual(fixture.calls.allocationFindMany, [{
    where: { bookingId: 'booking-1' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  }])
  assert.deepEqual(fixture.calls.entitlementFindMany, [{
    where: { userId: 'user-1' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { allocations: { where: { status: { in: ['RESERVED', 'CONSUMED'] } } } },
  }])
  assert.deepEqual(fixture.calls.allocationCreate, [{
    compensationId: 'e1', bookingId: 'booking-1', amountPaise: 12000,
    status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:e1',
  }])
})

test('active reservations reduce availability and retry reuses the booking allocation', async () => {
  const fixture = transaction({ entitlements: [{ id: 'entitlement-1', amountPaise: 10000 }] })
  const first = await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  const second = await reserveResponsibilityCompensation(fixture.tx, 'booking-1')

  assert.equal(first.reservedPaise, 10000)
  assert.equal(second.reused, true)
  assert.equal(second.reservedPaise, 10000)
  assert.equal(fixture.allocations.length, 1)
})

test('booking eligibility is independent of assignment and driver category', async () => {
  for (const driver of [null, { group: 'rcs' }, { group: 'partner' }, { group: 'owner' }]) {
    const fixture = transaction({ booking: { status: 'payment_pending', driverId: driver ? 'driver-1' : null, driver },
      entitlements: [{ id: 'e1', amountPaise: 10000 }] })
    assert.equal((await reserveResponsibilityCompensation(fixture.tx, 'booking-1')).reservedPaise, 10000)
  }
  assert.equal(isBookingEligibleForResponsibilityCompensation({ userId: 'u1', status: 'no_driver' }), false)
  assert.equal(isBookingEligibleForResponsibilityCompensation({ userId: null, status: 'pending' }), false)
  const cancelled = transaction({ booking: { status: 'cancelled' } })
  await assert.rejects(reserveResponsibilityCompensation(cancelled.tx, 'booking-1'), error =>
    error instanceof ResponsibilityCompensationError && error.code === 'BOOKING_NOT_ELIGIBLE')
})

test('only every documented pre-completion booking status is eligible', () => {
  for (const status of ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached', 'started']) {
    assert.equal(isBookingEligibleForResponsibilityCompensation({ userId: 'user-1', status }), true)
  }
  for (const status of ['cancelled', 'completed', 'no_driver', '', null]) {
    assert.equal(isBookingEligibleForResponsibilityCompensation({ userId: 'user-1', status }), false)
  }
  assert.equal(isBookingEligibleForResponsibilityCompensation(null), false)
})

test('consume is terminal and release restores the entitlement to a future booking', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 12000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  const released = await releaseReservedResponsibilityCompensation(fixture.tx, 'booking-1', {
    clock: { now: () => new Date('2026-09-27T00:00:00.000Z') },
  })
  assert.deepEqual(released, { bookingId: 'booking-1', status: 'RELEASED', count: 1 })

  fixture.tx.booking.findUnique = async () => ({
    id: 'booking-2', userId: 'user-1', fare: 120, couponAmount: 0,
    status: 'assigned', driverId: 'driver-1', driver: { group: 'rcs' },
  })
  const rereseved = await reserveResponsibilityCompensation(fixture.tx, 'booking-2')
  assert.equal(rereseved.reservedPaise, 12000)
  const consumed = await consumeReservedResponsibilityCompensation(fixture.tx, 'booking-2', {
    clock: { now: () => new Date('2026-09-27T01:00:00.000Z') },
  })
  assert.deepEqual(consumed, { bookingId: 'booking-2', status: 'CONSUMED', count: 1 })
  assert.equal(fixture.allocations.find(allocation => allocation.bookingId === 'booking-1').releasedAt.toISOString(), '2026-09-27T00:00:00.000Z')
})

test('reservation is based on fare after coupon and never cancellation charges', async () => {
  const fixture = transaction({ booking: { fare: 1000, couponAmount: 100, cancellationCharge: 500 },
    entitlements: [{ id: 'e1', amountPaise: 100000 }] })
  const result = await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  assert.equal(result.obligationPaise, 90000)
  assert.equal(result.reservedPaise, 90000)
})

test('completion consumes only the final eligible amount and releases the unused part', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 10000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  assert.deepEqual(await consumeReservedResponsibilityCompensation(fixture.tx, 'booking-1', { maxPaise: 6000 }), {
    bookingId: 'booking-1', status: 'CONSUMED', count: 1,
  })
  assert.deepEqual(fixture.allocations.map(row => [row.status, row.amountPaise]), [
    ['CONSUMED', 6000], ['RELEASED', 4000],
  ])
})

test('consumption uses FIFO updates, decrements its remaining limit, and records an unused source key', async () => {
  const fixture = transaction({ entitlements: [
    { id: 'first', amountPaise: 7000 }, { id: 'second', amountPaise: 10000 },
  ] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  const clock = { now: () => new Date('2026-09-27T02:00:00.000Z') }
  const result = await consumeReservedResponsibilityCompensation(fixture.tx, 'booking-1', { maxPaise: 9000, clock })

  assert.deepEqual(result, { bookingId: 'booking-1', status: 'CONSUMED', count: 2 })
  assert.deepEqual(fixture.calls.allocationFindMany.at(-1), {
    where: { bookingId: 'booking-1', status: 'RESERVED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  assert.deepEqual(fixture.calls.allocationUpdateMany, [
    { where: { id: 'allocation-1', status: 'RESERVED' }, data: {
      status: 'CONSUMED', consumedAt: new Date('2026-09-27T02:00:00.000Z'), amountPaise: 7000,
    } },
    { where: { id: 'allocation-2', status: 'RESERVED' }, data: {
      status: 'CONSUMED', consumedAt: new Date('2026-09-27T02:00:00.000Z'), amountPaise: 2000,
    } },
  ])
  assert.deepEqual(fixture.calls.allocationCreate.at(-1), {
    compensationId: 'second', bookingId: 'booking-1', amountPaise: 3000,
    status: 'RELEASED', releasedAt: new Date('2026-09-27T02:00:00.000Z'),
    sourceKey: 'responsibility-compensation:booking-1:second:unused',
  })
})

test('release updates only reserved allocations with the supplied timestamp', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 12000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  const releasedAt = new Date('2026-09-27T03:00:00.000Z')
  await releaseReservedResponsibilityCompensation(fixture.tx, 'booking-1', { clock: { now: () => releasedAt } })

  assert.deepEqual(fixture.calls.allocationUpdateMany, [{
    where: { bookingId: 'booking-1', status: 'RESERVED' },
    data: { status: 'RELEASED', releasedAt },
  }])
})

test('a released booking can reserve again with a new stable attempt key', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 10000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  await releaseReservedResponsibilityCompensation(fixture.tx, 'booking-1')
  const retry = await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  assert.equal(retry.reused, false)
  assert.equal(retry.reservedPaise, 10000)
  assert.equal(retry.allocations[0].sourceKey, 'responsibility-compensation:booking-1:e1:retry:1')
})

test('a previous allocation for another entitlement does not alter this entitlement attempt key', async () => {
  const fixture = transaction({ entitlements: [
    { id: 'e1', amountPaise: 12000 }, { id: 'other', amountPaise: 12000 },
  ] })
  fixture.allocations.push({
    id: 'other-prior-attempt', compensationId: 'other', bookingId: 'booking-1',
    amountPaise: 1, status: 'RELEASED', sourceKey: 'responsibility-compensation:booking-1:other',
  })

  const result = await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  assert.deepEqual(result.allocations.map(row => [row.compensationId, row.sourceKey]), [
    ['e1', 'responsibility-compensation:booking-1:e1'],
  ])
})

test('reservation and terminal transitions reject missing identities and missing bookings', async () => {
  const fixture = transaction()
  await assert.rejects(reserveResponsibilityCompensation(fixture.tx, ''), { code: 'BOOKING_ID_REQUIRED' })
  fixture.tx.booking.findUnique = async () => null
  await assert.rejects(reserveResponsibilityCompensation(fixture.tx, 'missing'), { code: 'BOOKING_MISSING' })
  await assert.rejects(releaseReservedResponsibilityCompensation(fixture.tx, ''), { code: 'BOOKING_ID_REQUIRED' })
  await assert.rejects(consumeReservedResponsibilityCompensation(fixture.tx, ''), { code: 'BOOKING_ID_REQUIRED' })
  await assert.rejects(consumeReservedResponsibilityCompensation(fixture.tx, 'booking-1', { maxPaise: -1 }),
    { code: 'INVALID_CONSUMPTION_LIMIT' })
  await assert.rejects(consumeReservedResponsibilityCompensation(fixture.tx, 'booking-1', { maxPaise: 1.5 }),
    { code: 'INVALID_CONSUMPTION_LIMIT' })
})

test('FIFO stops when the fare is covered and skips exhausted entitlements', async () => {
  const filled = transaction({ booking: { fare: 50 }, entitlements: [
    { id: 'first', amountPaise: 10000 }, { id: 'second', amountPaise: 10000 },
  ] })
  assert.equal((await reserveResponsibilityCompensation(filled.tx, 'booking-1')).reservedPaise, 5000)
  assert.deepEqual(filled.allocations.map(row => row.compensationId), ['first'])

  const exhausted = transaction({ booking: { fare: 50 }, entitlements: [
    { id: 'spent', amountPaise: 10000 }, { id: 'available', amountPaise: 10000 },
  ] })
  exhausted.allocations.push({ id: 'older-booking-allocation', compensationId: 'spent',
    bookingId: 'other-booking', amountPaise: 10000, status: 'CONSUMED' })
  const result = await reserveResponsibilityCompensation(exhausted.tx, 'booking-1')
  assert.equal(result.reservedPaise, 5000)
  assert.deepEqual(result.allocations.map(row => row.compensationId), ['available'])
})

test('zero-use completion releases the reservation, and a lost conditional update is harmless', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 10000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')
  assert.deepEqual(await consumeReservedResponsibilityCompensation(fixture.tx, 'booking-1', { maxPaise: 0 }), {
    bookingId: 'booking-1', status: 'CONSUMED', count: 0,
  })
  assert.equal(fixture.allocations[0].status, 'RELEASED')
  assert.equal(fixture.calls.allocationCreate.length, 1)

  const raced = transaction({ entitlements: [{ id: 'e1', amountPaise: 10000 }] })
  await reserveResponsibilityCompensation(raced.tx, 'booking-1')
  raced.tx.responsibilityCompensationAllocation.updateMany = async () => ({ count: 0 })
  assert.equal((await consumeReservedResponsibilityCompensation(raced.tx, 'booking-1')).count, 0)
  assert.equal(raced.allocations[0].status, 'RESERVED')
})

test('full consumption leaves no released split allocation', async () => {
  const fixture = transaction({ entitlements: [{ id: 'e1', amountPaise: 10000 }] })
  await reserveResponsibilityCompensation(fixture.tx, 'booking-1')

  await consumeReservedResponsibilityCompensation(fixture.tx, 'booking-1', { maxPaise: 10000 })
  assert.deepEqual(fixture.allocations.map(row => [row.status, row.amountPaise]), [['CONSUMED', 10000]])
  assert.equal(fixture.calls.allocationCreate.length, 1)
})
