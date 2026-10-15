import test from 'node:test'
import assert from 'node:assert/strict'
import {
  outstandingFinalizedLiabilityPaise,
  recoverFinalizedLiabilitiesFromEarning,
  ResponsibilityLiabilityRecoveryError,
} from '../services/responsibilityLiabilityRecovery.js'
import { savePayoutUpi, setPayoutUpiVerification } from '../services/driverFinance.js'
import { walletEvent } from '../services/walletKeys.js'
import { PaymentError } from '../services/paymentErrors.js'

function recoveryDb() {
  const driver = { id: 'driver-1', walletBalance: 150, payoutUpiId: 'old@upi', payoutUpiVerifiedAt: new Date('2026-09-26T00:00:00Z') }
  const liabilities = [
    { id: 'liability-old', driverId: driver.id, amountPaise: 7000, createdAt: new Date('2026-09-20T00:00:00Z'), entries: [] },
    { id: 'liability-new', driverId: driver.id, amountPaise: 5000, createdAt: new Date('2026-09-21T00:00:00Z'), entries: [] },
  ]
  const walletEntries = new Map([
    ['ride_collection:booking:earning-booking:source:scheduled_ride_final', {
      driverId: driver.id, amount: 90, type: 'ride_collection', method: 'upi', bookingId: 'earning-booking',
    }],
  ])
  const liabilityQueries = []
  const recoveryLocks = []
  const earningQueries = []
  const recoveryEntryCreates = []
  const liabilityEntryCreates = []
  const db = {
    driver: {
      findUnique: async ({ where }) => where.id === driver.id ? { ...driver } : null,
      update: async ({ where, data, select }) => {
        assert.equal(where.id, driver.id)
        if (data.walletBalance?.increment) driver.walletBalance += data.walletBalance.increment
        if ('payoutUpiId' in data) driver.payoutUpiId = data.payoutUpiId
        if ('payoutUpiVerifiedAt' in data) driver.payoutUpiVerifiedAt = data.payoutUpiVerifiedAt
        if (!select) return { ...driver }
        return Object.fromEntries(Object.keys(select).map(key => [key, driver[key]]))
      },
    },
    walletEntry: {
      findUnique: async query => {
        earningQueries.push(query)
        return walletEntries.get(query.where.eventKey) ?? null
      },
      createMany: async ({ data, skipDuplicates }) => {
        recoveryEntryCreates.push({ data, skipDuplicates })
        const row = data[0]
        if (walletEntries.has(row.eventKey)) return { count: 0 }
        walletEntries.set(row.eventKey, { ...row })
        return { count: 1 }
      },
    },
    responsibilityLiability: {
      findMany: async query => {
        liabilityQueries.push(query)
        const { where } = query
        return liabilities
        .filter(row => row.driverId === where.driverId)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
        .map(row => ({ id: row.id, amountPaise: row.amountPaise, entries: row.entries.map(entry => ({ ...entry })) }))
      },
    },
    responsibilityLiabilityEntry: {
      findUnique: async ({ where }) => liabilities
        .flatMap(liability => liability.entries.map(entry => ({ ...entry, liabilityId: liability.id })))
        .find(entry => entry.sourceKey === where.sourceKey) ?? null,
      createMany: async ({ data, skipDuplicates }) => {
        liabilityEntryCreates.push({ data, skipDuplicates })
        const row = data[0]
        const liability = liabilities.find(candidate => candidate.id === row.liabilityId)
        if (liability.entries.some(entry => entry.sourceKey === row.sourceKey)) return { count: 0 }
        liability.entries.push({ ...row })
        return { count: 1 }
      },
    },
    $queryRaw: async strings => {
      recoveryLocks.push(strings.join(''))
      return []
    },
  }
  db.$transaction = work => work(db)
  return {
    db,
    driver,
    liabilities,
    walletEntries,
    liabilityQueries,
    recoveryLocks,
    earningQueries,
    recoveryEntryCreates,
    liabilityEntryCreates,
  }
}

test('platform-controlled earnings recover finalized liabilities FIFO, append-only, and idempotently', async () => {
  const state = recoveryDb()
  const earningEventKey = 'ride_collection:booking:earning-booking:source:scheduled_ride_final'

  const first = await recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db })
  assert.deepEqual(first.recovered.map(({ liabilityId, amountPaise }) => ({ liabilityId, amountPaise })), [
    { liabilityId: 'liability-old', amountPaise: 7000 },
    { liabilityId: 'liability-new', amountPaise: 2000 },
  ])
  assert.equal(first.unrecoveredEarningPaise, 0)
  assert.equal(state.liabilityEntryCreates.length, 2)
  assert.equal(state.liabilityEntryCreates.every(call => call.skipDuplicates === true), true)
  assert.equal(state.driver.walletBalance, 60)
  assert.equal(await outstandingFinalizedLiabilityPaise('driver-1', { db: state.db }), 3000)

  const retry = await recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db })
  assert.equal(retry.recoveredPaise, 0)
  assert.equal(state.driver.walletBalance, 60)
  assert.equal(state.liabilities.flatMap(row => row.entries).length, 2)
  assert.equal(state.walletEntries.has(walletEvent.liabilityRecovery('liability-old', earningEventKey)), true)
  assert.deepEqual(
    [...state.walletEntries.entries()]
      .filter(([key]) => key.startsWith('liability_recovery:'))
      .map(([eventKey, entry]) => ({
        eventKey,
        amount: entry.amount,
        type: entry.type,
        bookingId: entry.bookingId,
        note: entry.note,
      })),
    [
      {
        eventKey: walletEvent.liabilityRecovery('liability-old', earningEventKey),
        amount: -70,
        type: 'liability_recovery',
        bookingId: 'earning-booking',
        note: 'Finalized responsibility liability recovered from platform-controlled earning',
      },
      {
        eventKey: walletEvent.liabilityRecovery('liability-new', earningEventKey),
        amount: -20,
        type: 'liability_recovery',
        bookingId: 'earning-booking',
        note: 'Finalized responsibility liability recovered from platform-controlled earning',
      },
    ],
  )
})

test('finalized-liability reads require both final-upheld relations and lock the driver before FIFO allocation', async () => {
  const state = recoveryDb()
  await outstandingFinalizedLiabilityPaise('driver-1', { db: state.db })

  assert.deepEqual(state.liabilityQueries[0], {
    where: {
      driverId: 'driver-1',
      case: { state: 'FINAL_UPHELD' },
      finalDecision: { outcome: 'FINAL_UPHELD' },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      amountPaise: true,
      entries: { select: { kind: true, amountPaise: true, sourceKey: true } },
    },
  })

  await recoverFinalizedLiabilitiesFromEarning({
    driverId: 'driver-1',
    earningEventKey: 'ride_collection:booking:earning-booking:source:scheduled_ride_final',
    db: state.db,
  })
  assert.equal(state.recoveryLocks.length, 2)
  assert.match(state.recoveryLocks[0], /FROM drivers WHERE id =/)
  assert.match(state.recoveryLocks[1], /c\.state =/)
  assert.match(state.recoveryLocks[1], /d\.outcome =/)
  assert.match(state.recoveryLocks[1], /ORDER BY l\.created_at ASC, l\.id ASC/)
  assert.deepEqual(state.earningQueries[0], {
    where: { eventKey: 'ride_collection:booking:earning-booking:source:scheduled_ride_final' },
    select: { driverId: true, amount: true, type: true, method: true, bookingId: true },
  })
  assert.equal(state.recoveryEntryCreates.every(call => call.skipDuplicates === true), true)
})

test('missing driver IDs return zero without querying finalized liability rows', async () => {
  const state = recoveryDb()
  state.db.responsibilityLiability.findMany = async () => {
    throw new Error('missing driver IDs must not query liabilities')
  }

  assert.equal(await outstandingFinalizedLiabilityPaise(undefined, { db: state.db }), 0)
})

test('outstanding finalized liability includes corrections and only RECOVERED ledger entries', async () => {
  const state = recoveryDb()
  state.liabilities[0].entries.push(
    { kind: 'CORRECTION', amountPaise: 1000, sourceKey: 'correction:upheld' },
    { kind: 'RECOVERED', amountPaise: 2000, sourceKey: 'recovery:one' },
    { kind: 'CREATED', amountPaise: 6000, sourceKey: 'created:ignored' },
  )
  state.liabilities[1].entries.push({ kind: 'RECOVERED', amountPaise: 1000, sourceKey: 'recovery:two' })

  assert.equal(await outstandingFinalizedLiabilityPaise('driver-1', { db: state.db }), 10000)
})

test('cash and non-platform earnings are refused before any liability or wallet write', async () => {
  const state = recoveryDb()
  const eventKey = 'cash-earning'
  state.walletEntries.set(eventKey, {
    driverId: 'driver-1', amount: 90, type: 'ride_collection', method: 'cash', bookingId: 'earning-booking',
  })
  await assert.rejects(
    () => recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: eventKey, db: state.db }),
    error => error instanceof ResponsibilityLiabilityRecoveryError && error.code === 'EARNING_SOURCE_NOT_PLATFORM_CONTROLLED',
  )
  assert.equal(state.liabilities.flatMap(row => row.entries).length, 0)
  assert.equal(state.driver.walletBalance, 150)
})

test('only UPI ride collections and named platform funding sources are eligible earnings', async () => {
  for (const earning of [
    { type: 'ride_collection', method: 'cash' },
    { type: 'ride_collection', method: 'card' },
    { type: 'ride_collection', method: null },
    { type: 'bonus', method: 'upi' },
    { type: 'coupon_reimbursement', method: null, bookingId: null },
  ]) {
    const state = recoveryDb()
    const eventKey = `ineligible:${earning.type}:${earning.method}`
    state.walletEntries.set(eventKey, {
      driverId: 'driver-1', amount: 90, bookingId: 'earning-booking', ...earning,
    })
    await assert.rejects(
      recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: eventKey, db: state.db }),
      { code: 'EARNING_SOURCE_NOT_PLATFORM_CONTROLLED' },
    )
    assert.equal(state.liabilities.flatMap(row => row.entries).length, 0)
    assert.equal(state.driver.walletBalance, 150)
  }
})

test('coupon reimbursement and responsibility compensation funding are eligible platform earnings', async () => {
  for (const [eventKey, type] of [
    ['coupon_reimbursement:booking:earning-booking', 'coupon_reimbursement'],
    ['responsibility_compensation_funding:allocation:allocation-1', 'responsibility_compensation_funding'],
  ]) {
    const state = recoveryDb()
    state.walletEntries.set(eventKey, {
      driverId: 'driver-1', amount: 40, type, method: null, bookingId: 'earning-booking',
    })

    const result = await recoverFinalizedLiabilitiesFromEarning({
      driverId: 'driver-1', earningEventKey: eventKey, db: state.db,
    })

    assert.equal(result.recoveredPaise, 4000)
    assert.equal(state.driver.walletBalance, 110)
    assert.equal(await outstandingFinalizedLiabilityPaise('driver-1', { db: state.db }), 8000)
  }
})

test('concurrent recovery attempts leave one deterministic recovery ledger', async () => {
  const state = recoveryDb()
  const earningEventKey = 'ride_collection:booking:earning-booking:source:scheduled_ride_final'
  const [first, second] = await Promise.all([
    recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db }),
    recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db }),
  ])
  assert.equal(first.recoveredPaise + second.recoveredPaise, 9000)
  assert.equal(state.driver.walletBalance, 60)
  assert.equal(state.liabilities.flatMap(row => row.entries).length, 2)
})

test('a durable source allocation is counted exactly once before the next FIFO liability', async () => {
  const state = recoveryDb()
  const earningEventKey = 'ride_collection:booking:earning-booking:source:scheduled_ride_final'
  state.liabilities[0].entries.push({
    kind: 'RECOVERED',
    amountPaise: 7000,
    sourceKey: walletEvent.liabilityRecovery('liability-old', earningEventKey),
  })

  const result = await recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db })
  assert.deepEqual(result.recovered.map(({ liabilityId, amountPaise }) => ({ liabilityId, amountPaise })), [
    { liabilityId: 'liability-new', amountPaise: 2000 },
  ])
  assert.equal(result.recoveredPaise, 2000)
  assert.equal(result.unrecoveredEarningPaise, 0)
  assert.equal(state.driver.walletBalance, 130)
  assert.deepEqual(state.liabilities[1].entries, [{
    liabilityId: 'liability-new',
    kind: 'RECOVERED',
    amountPaise: 2000,
    sourceKey: walletEvent.liabilityRecovery('liability-new', earningEventKey),
    earningBookingId: 'earning-booking',
  }])
})

test('a RECOVERED entry for another source does not suppress this earning allocation', async () => {
  const state = recoveryDb()
  const earningEventKey = 'ride_collection:booking:earning-booking:source:scheduled_ride_final'
  state.liabilities[0].entries.push({
    kind: 'RECOVERED', amountPaise: 1000, sourceKey: 'liability_recovery:another-earning',
  })

  const result = await recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db })
  assert.deepEqual(result.recovered.map(({ liabilityId, amountPaise }) => ({ liabilityId, amountPaise })), [
    { liabilityId: 'liability-old', amountPaise: 6000 },
    { liabilityId: 'liability-new', amountPaise: 3000 },
  ])
  assert.equal(result.recoveredPaise, 9000)
  assert.equal(state.driver.walletBalance, 60)
})

test('a non-RECOVERED entry using this earning source fails closed', async () => {
  const state = recoveryDb()
  const earningEventKey = 'ride_collection:booking:earning-booking:source:scheduled_ride_final'
  state.liabilities[0].entries.push({
    kind: 'CREATED',
    amountPaise: 1,
    sourceKey: walletEvent.liabilityRecovery('liability-old', earningEventKey),
  })

  await assert.rejects(
    recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db }),
    { code: 'RECOVERY_IDEMPOTENCY_CONFLICT' },
  )
  assert.equal(state.driver.walletBalance, 150)
})

test('fully recovered liabilities never receive zero recovery rows, and surplus earnings remain unrecovered', async () => {
  const state = recoveryDb()
  const earningEventKey = 'surplus-platform-earning'
  state.walletEntries.set(earningEventKey, {
    driverId: 'driver-1', amount: 150, type: 'ride_collection', method: 'upi', bookingId: 'earning-booking',
  })
  state.liabilities[0].entries.push({ kind: 'RECOVERED', amountPaise: 7000, sourceKey: 'prior-recovery' })

  const result = await recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey, db: state.db })
  assert.deepEqual(result.recovered.map(({ liabilityId, amountPaise }) => ({ liabilityId, amountPaise })), [
    { liabilityId: 'liability-new', amountPaise: 5000 },
  ])
  assert.equal(result.recoveredPaise, 5000)
  assert.equal(result.unrecoveredEarningPaise, 10000)
  assert.equal(state.liabilities[0].entries.length, 1)
  assert.equal(state.driver.walletBalance, 100)
})

test('liability recovery and compensation-funding keys remain deterministic and distinct', () => {
  const recovery = walletEvent.liabilityRecovery('liability-1', 'ride_collection:booking:b1:source:final')
  assert.equal(recovery, walletEvent.liabilityRecovery('liability-1', 'ride_collection:booking:b1:source:final'))
  assert.notEqual(recovery, walletEvent.responsibilityCompensationFunding('allocation-1'))
})

test('a self-service UPI replacement is blocked by outstanding finalized liability, while no-op and admin verification remain allowed', async () => {
  const state = recoveryDb()
  await assert.rejects(
    () => savePayoutUpi('driver-1', 'new@upi', { db: state.db }),
    error => error instanceof PaymentError && error.code === 'OUTSTANDING_FINALIZED_LIABILITY' && error.status === 409,
  )
  assert.equal(state.driver.payoutUpiId, 'old@upi')

  const unchanged = await savePayoutUpi('driver-1', 'OLD@UPI', { db: state.db })
  assert.equal(unchanged.upiId, 'old@upi')
  assert.equal(unchanged.verified, true)

  const verification = await setPayoutUpiVerification('driver-1', false, { db: state.db })
  assert.equal(verification.verified, false)
})

test('recovery rejects missing identity, source, platform control, and invalid earning amounts', async () => {
  const state = recoveryDb()
  const key = 'invalid-earning'
  await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ earningEventKey: key, db: state.db }),
    { code: 'DRIVER_ID_REQUIRED' })
  await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', db: state.db }),
    { code: 'EARNING_EVENT_KEY_REQUIRED' })
  assert.equal(await outstandingFinalizedLiabilityPaise(null, { db: state.db }), 0)
  await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: key, db: state.db }),
    { code: 'EARNING_SOURCE_MISSING' })
  state.walletEntries.set(key, { driverId: 'other-driver', amount: 20, type: 'ride_collection', method: 'upi', bookingId: 'b1' })
  await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: key, db: state.db }),
    { code: 'EARNING_SOURCE_MISSING' })
  state.walletEntries.set(key, { driverId: 'driver-1', amount: 20, type: 'coupon_reimbursement', bookingId: null })
  await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: key, db: state.db }),
    { code: 'EARNING_SOURCE_NOT_PLATFORM_CONTROLLED' })
  for (const amount of [0, Number.POSITIVE_INFINITY, 12.345, 1e-8]) {
    state.walletEntries.set(key, { driverId: 'driver-1', amount, type: 'ride_collection', method: 'upi', bookingId: 'b1' })
    await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: key, db: state.db }),
      { code: 'EARNING_SOURCE_AMOUNT_INVALID' })
  }
})

test('a conflicting recovered allocation or wallet posting fails closed', async () => {
  const key = 'ride_collection:booking:earning-booking:source:scheduled_ride_final'
  for (const existing of [null, { liabilityId: 'different', kind: 'RECOVERED', amountPaise: 100 },
    { liabilityId: 'liability-old', kind: 'CREATED', amountPaise: 100 },
    { liabilityId: 'liability-old', kind: 'RECOVERED', amountPaise: 0 }]) {
    const state = recoveryDb()
    state.liabilities.splice(1)
    state.db.responsibilityLiabilityEntry.createMany = async () => ({ count: 0 })
    state.db.responsibilityLiabilityEntry.findUnique = async () => existing
    await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: key, db: state.db }),
      { code: 'RECOVERY_IDEMPOTENCY_CONFLICT' })
  }
  const state = recoveryDb()
  state.db.walletEntry.createMany = async () => ({ count: 0 })
  await assert.rejects(recoverFinalizedLiabilitiesFromEarning({ driverId: 'driver-1', earningEventKey: key, db: state.db }),
    { code: 'RECOVERY_WALLET_ENTRY_CONFLICT' })
})

test('a transaction client without a nested transaction recovers the same earning', async () => {
  const state = recoveryDb()
  delete state.db.$transaction
  const result = await recoverFinalizedLiabilitiesFromEarning({
    driverId: 'driver-1',
    earningEventKey: 'ride_collection:booking:earning-booking:source:scheduled_ride_final',
    db: state.db,
  })
  assert.equal(result.recoveredPaise, 9000)
})
