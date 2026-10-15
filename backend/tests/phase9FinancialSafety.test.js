import test from 'node:test'
import assert from 'node:assert/strict'
import { reserveScheduledDeposit, releaseScheduledDeposits } from '../services/scheduledDepositLifecycle.js'
import { balancesFrom, walletEvent } from '../services/walletKeys.js'
import { applyCustomerCancellationInTransaction, applyCustomerCancellation } from '../services/customerCancellation.js'
import { prisma } from '../db/prisma.js'
import { settleRideTransitionInTransaction } from '../services/rideSettlement.js'
import { cancelDriverRideInTransaction } from '../services/driverRideCancellation.js'

const original = { eventKey: walletEvent.depositHold('b'), bookingId: 'b', driverId: 'a', type: 'deposit_hold', amount: -100 }
const input = { bookingId: 'b', driverId: 'a', offerId: 'o', amount: 100 }

function ledgerFixture(entries = [], cancellation = null) {
  const rows = new Map(entries.map(row => [row.eventKey, { ...row }]))
  const writes = [], reads = [], queries = []
  const tx = {
    walletEntry: {
      findUnique: async args => { reads.push(args); return rows.get(args.where.eventKey) ?? null },
      findMany: async args => { queries.push(args); return [...rows.values()].filter(row => row.type === args.where.type) },
      createMany: async args => {
        const row = args.data[0]
        if (rows.has(row.eventKey)) return { count: 0 }
        rows.set(row.eventKey, row); writes.push(row)
        return { count: 1 }
      },
    },
    driver: { update: async args => { writes.push(args); return {} } },
    driverCancellation: { findFirst: async args => { queries.push(args); return cancellation } },
    responsibilityCase: { findMany: async () => [] },
  }
  return { tx, rows, writes, reads, queries }
}

test('deposit lifecycle: new and repeated same-booking reservation debit once with stable legacy identity', async () => {
  const f = ledgerFixture()
  await reserveScheduledDeposit(f.tx, input); await reserveScheduledDeposit(f.tx, input)
  assert.deepEqual(f.writes, [{ ...original, method: null, note: '10% scheduled ride acceptance deposit' },
    { where: { id: 'a' }, data: { walletBalance: { increment: -100 } } }])
  assert.deepEqual(f.reads[0], { where: { eventKey: original.eventKey } })
  assert.equal(f.rows.size, 1)
})

test('deposit lifecycle: known original cancellation permits independent replacement reservation without transfer', async () => {
  const f = ledgerFixture([original], { id: 'cancellation-a' })
  const replacement = { ...input, driverId: 'b' }
  await reserveScheduledDeposit(f.tx, replacement); await reserveScheduledDeposit(f.tx, replacement)
  const held = f.rows.get(`${original.eventKey}:offer:o`)
  assert.equal(held.driverId, 'b'); assert.equal(held.amount, -100)
  assert.deepEqual(f.rows.get(original.eventKey), original)
  assert.deepEqual(f.queries[0], { where: { bookingId: 'b', driverId: 'a' } })
  assert.equal(f.writes.length, 2)
})

test('deposit lifecycle: unknown original owner, foreign booking, invalid hold, mismatched amount and released reservation fail closed', async () => {
  const variants = [
    [{ ...original, driverId: 'foreign' }], [{ ...original, bookingId: 'foreign' }],
    [{ ...original, type: 'adjustment' }], [{ ...original, amount: NaN }],
    [{ ...original, amount: 0 }], [{ ...original, amount: 100 }], [{ ...original, amount: -99 }],
    [original, { eventKey: walletEvent.depositRefund('b'), amount: 100 }],
  ]
  for (const entries of variants) {
    const f = ledgerFixture(entries)
    await assert.rejects(reserveScheduledDeposit(f.tx, input), /DEPOSIT_OWNER_CONFLICT/)
    assert.equal(f.writes.length, 0)
  }
  for (const held of [{ ...original, eventKey: `${original.eventKey}:offer:o`, driverId: 'foreign' },
    { ...original, eventKey: `${original.eventKey}:offer:o`, driverId: 'b', bookingId: 'foreign' },
    { ...original, eventKey: `${original.eventKey}:offer:o`, driverId: 'b', type: 'adjustment' },
    { ...original, eventKey: `${original.eventKey}:offer:o`, driverId: 'b', amount: -99 }]) {
    const f = ledgerFixture([original, held], { id: 'cancellation-a' })
    await assert.rejects(reserveScheduledDeposit(f.tx, { ...input, driverId: 'b' }), /DEPOSIT_OWNER_CONFLICT/)
    assert.equal(f.writes.length, 0)
  }
  const foreignOriginal = ledgerFixture([{ ...original, bookingId: 'foreign' }], { id: 'cancellation-a' })
  await assert.rejects(reserveScheduledDeposit(foreignOriginal.tx, { ...input, driverId: 'b' }), /DEPOSIT_OWNER_CONFLICT/)
  assert.equal(foreignOriginal.writes.length, 0)
})

test('deposit lifecycle: terminal release pays each owner exactly once, including a replacement key', async () => {
  const second = { ...original, driverId: 'b', eventKey: `${original.eventKey}:offer:o` }
  const f = ledgerFixture([original, second])
  await releaseScheduledDeposits(f.tx, 'b'); await releaseScheduledDeposits(f.tx, 'b')
  assert.deepEqual(f.queries[0], { where: { bookingId: 'b', type: 'deposit_hold' }, orderBy: { eventKey: 'asc' } })
  assert.equal(f.rows.size, 4)
  for (const hold of [original, second]) {
    const refund = f.rows.get(hold.eventKey.replace('deposit_hold:', 'deposit_refund:'))
    assert.equal(refund.driverId, hold.driverId); assert.equal(refund.bookingId, 'b')
    assert.equal(refund.amount, 100); assert.equal(refund.type, 'deposit_refund')
    assert.equal(refund.note, 'Scheduled ride acceptance deposit released at booking terminal state')
  }
  assert.equal(f.writes.length, 4)
  assert.deepEqual(balancesFrom([...f.rows.values()]), { available: 0, held: 0, total: 0 })
  const empty = ledgerFixture(); await releaseScheduledDeposits(empty.tx, 'b'); assert.equal(empty.writes.length, 0)
})

test('deposit lifecycle: invalid release and conflicting preexisting refund cannot credit a different actor or booking', async () => {
  for (const hold of [{ ...original, eventKey: 'unrecognized' }, { ...original, bookingId: 'foreign' },
    { ...original, eventKey: 'deposit_hold:booking:foreign' }, { ...original, amount: 0 }, { ...original, amount: Infinity }]) {
    const f = ledgerFixture([hold])
    await assert.rejects(releaseScheduledDeposits(f.tx, 'b'), /DEPOSIT_OWNER_CONFLICT/)
    assert.equal(f.writes.length, 0)
  }
  for (const fields of [{ driverId: 'foreign' }, { bookingId: 'foreign' }, { type: 'adjustment' }, { amount: 99 }]) {
    const f = ledgerFixture([original, { ...original, eventKey: walletEvent.depositRefund('b'), type: 'deposit_refund', amount: 100, ...fields }])
    await assert.rejects(releaseScheduledDeposits(f.tx, 'b'), /DEPOSIT_OWNER_CONFLICT/)
    assert.equal(f.writes.length, 0)
  }
})

test('wallet holds: releasing one reservation cannot hide a second hold for the same booking', () => {
  const hold = { ...original, eventKey: `${original.eventKey}:offer:o` }
  assert.deepEqual(balancesFrom([original, hold, { ...original, type: 'deposit_refund', amount: 100,
    eventKey: walletEvent.depositRefund('b') }]), { available: -100, held: 100, total: 0 })
})

test('customer cancellation: terminal and started snapshots cause no writes; active CAS binds driver ownership', async () => {
  for (const status of ['cancelled', 'completed', 'started', 'no_driver']) {
    assert.equal(await applyCustomerCancellationInTransaction({}, { booking: { status }, cancellationCharge: 0 }), false)
  }
  for (const status of ['pending', 'payment_pending', 'confirmed', 'assigned', 'en_route', 'reached']) {
    let predicate
    const tx = { booking: { updateMany: async args => { predicate = args.where; return { count: 0 } } } }
    assert.equal(await applyCustomerCancellationInTransaction(tx, { booking: { id: 'b', status, driverId: 'a' }, cancellationCharge: 100 }), false)
    assert.deepEqual(predicate, { id: 'b', status, driverId: 'a' })
  }
})

test('settlement: conditional transition binds the current driver before capacity or money writes', async () => {
  let predicate
  const tx = { booking: { updateMany: async args => { predicate = args.where; return { count: 0 } } } }
  assert.equal(await settleRideTransitionInTransaction(tx, { booking: { id: 'b', commissionAmt: 100 },
    driver: { id: 'a' }, from: 'started', to: 'completed', capturedAt: '2026-10-09T08:00:00Z' }), false)
  assert.deepEqual(predicate, { id: 'b', status: 'started', driverId: 'a' })
})

test('customer cancellation wrapper uses the application transaction without an external side effect', async () => {
  const previous = prisma.$transaction
  let calls = 0
  prisma.$transaction = async work => { calls++; return work({}) }
  try { assert.equal(await applyCustomerCancellation({ booking: { status: 'completed' }, cancellationCharge: 0 }), false) }
  finally { prisma.$transaction = previous }
  assert.equal(calls, 1)
})

test('financial event identities remain stable and distinct from deposits', () => {
  assert.equal(walletEvent.payout('p'), 'payout:p')
  assert.equal(walletEvent.debtPayment('p'), 'debt_payment:p')
  assert.equal(walletEvent.payoutReversal('p'), 'payout_reversal:p')
  assert.equal(walletEvent.adjustment('r'), 'adjustment:r')
  assert.equal(walletEvent.liabilityRecovery('l', 'e'), 'liability_recovery:liability:l:earning:e')
})

test('terminal retries cannot repeat completion, skip a ride stage or return an underway ride to dispatch', async () => {
  for (const [from, to] of [['completed', 'completed'], ['assigned', 'completed'], ['started', 'reached'],
    ['confirmed', 'en_route'], ['assigned', 'started']]) {
    assert.equal(await settleRideTransitionInTransaction({}, { booking: {}, driver: {}, from, to }), false)
  }
  for (const status of ['started', 'completed', 'cancelled', 'confirmed']) {
    assert.equal(await cancelDriverRideInTransaction({}, { status }, {}), null)
  }
})

test('every legal ride stage reaches the driver-bound conditional update', async () => {
  for (const [from, to] of [['assigned', 'en_route'], ['assigned', 'reached'], ['en_route', 'reached'],
    ['reached', 'started'], ['started', 'completed']]) {
    let query
    const tx = { booking: { updateMany: async args => { query = args; return { count: 0 } } } }
    assert.equal(await settleRideTransitionInTransaction(tx, { booking: { id: 'b' }, driver: { id: 'a' }, from, to,
      capturedAt: '2026-10-09T08:00:00Z' }), false)
    assert.equal(query.data.status, to)
    assert.deepEqual(query.where, { id: 'b', status: from, driverId: 'a' })
  }
})

test('customer cancellation success writes exact actor, offer withdrawal, optional capacity and compensation effects', async () => {
  for (const [scheduled, assigned, charge] of [[true, true, 100], [true, true, 0], [false, true, 0], [false, false, 100], [true, false, 0]]) {
    const calls = { capacity: [], wallet: [], holdReads: [], offers: [], booking: [], allocation: [] }
    const booking = { id: 'b', status: 'assigned', driverId: assigned ? 'a' : null,
      driver: assigned ? { id: 'a', vehicleClass: 'sedan' } : null, scheduledAt: scheduled ? new Date() : null, sharing: false }
    const tx = {
      booking: { updateMany: async args => { calls.booking.push(args); return { count: 1 } } },
      rideOffer: { updateMany: async args => { calls.offers.push(args); return { count: 1 } } },
      responsibilityCompensationAllocation: { updateMany: async args => { calls.allocation.push(args); return { count: 0 } } },
      driver: { update: async args => { calls.capacity.push(args); return {} } },
      walletEntry: { findMany: async args => { calls.holdReads.push(args); return [] },
        createMany: async args => { calls.wallet.push(args); return { count: 1 } } },
    }
    assert.equal(await applyCustomerCancellationInTransaction(tx, {
      booking, cancellationCharge: charge, cancellationReason: 'driver_asked_to_cancel', advanceDisposition: 'refund_pending',
    }), true)
    assert.deepEqual(calls.booking[0], { where: { id: 'b', status: 'assigned', driverId: booking.driverId },
      data: { status: 'cancelled', cancelledBy: 'user', cancellationCharge: charge,
        cancellationReason: 'driver_asked_to_cancel', scheduledAdvanceDisposition: 'refund_pending' } })
    assert.deepEqual(calls.offers[0].where, { bookingId: 'b', status: 'pending' })
    assert.equal(calls.offers[0].data.status, 'withdrawn'); assert.ok(calls.offers[0].data.respondedAt instanceof Date)
    assert.equal(calls.capacity.length, Number(assigned) + Number(assigned && charge > 0))
    assert.equal(calls.holdReads.length, Number(scheduled))
    assert.equal(calls.wallet.length, Number(assigned && charge > 0))
    assert.equal(calls.allocation[0].where.bookingId, 'b')
    if (calls.wallet.length) assert.deepEqual(calls.wallet[0], { skipDuplicates: true, data: [{ driverId: 'a', amount: charge,
      type: 'cancellation_compensation', eventKey: walletEvent.scheduledCancellationCompensation('b'), bookingId: 'b', method: null,
      note: 'Scheduled customer cancellation compensation' }] })
  }
})

test('wallet rows unrelated to deposits cannot act as refunds', () => {
  assert.deepEqual(balancesFrom([{ bookingId: 'b', amount: -100, type: 'deposit_hold' },
    { bookingId: 'b', amount: 2, type: 'adjustment' }]),
    { available: -98, held: 100, total: 2 })
})
