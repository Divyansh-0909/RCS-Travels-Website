import test from 'node:test'
import assert from 'node:assert/strict'
import { walletEvent } from '../services/walletKeys.js'
import {
  cancelDriverRide,
  cancelDriverRideInTransaction,
  DRIVER_CANCELLABLE_STATUSES,
} from '../services/driverRideCancellation.js'
import {
  applyCustomerCancellationInTransaction,
} from '../services/customerCancellation.js'
import {
  settleRideTransition,
  settleRideTransitionInTransaction,
} from '../services/rideSettlement.js'
import { prisma } from '../db/prisma.js'
import { rankCandidates } from '../services/driverDispatchCandidates.js'

const BOOKING_ID = 'booking-1'
const DRIVER_ID = 'driver-1'

function fakeTransaction({
  status = 'assigned',
  capacity = 0,
  depositHold = null,
  commissionFreeRidesRemaining = 0,
  cancellationBenefitRestrictedUntil = null,
  completedRideCount = 1,
  compensationAllocations = [],
  payoutUpiId = null,
  payoutUpiVerifiedAt = null,
  existingWalletEntries = [],
} = {}) {
  const walletEntries = new Map()
  if (depositHold !== null) {
    walletEntries.set(walletEvent.depositHold(BOOKING_ID), {
      eventKey: walletEvent.depositHold(BOOKING_ID),
      amount: depositHold,
      bookingId: BOOKING_ID, driverId: DRIVER_ID, type: 'deposit_hold',
    })
  }

  const state = {
    booking: { id: BOOKING_ID, status, driverId: DRIVER_ID, fare: 1000,
      couponAmount: 0, customerPayment: 1000 },
    capacity,
    capacityWrites: 0,
    offerWithdrawals: 0,
    offerWithdrawalArgs: [],
    cancellations: [],
    responsibilityCases: new Map(),
    responsibilityEvidenceVersions: new Map(),
    responsibilityAdjudicationWork: new Map(),
    compensationAllocations: compensationAllocations.map(allocation => ({ ...allocation })),
    walletEntries,
    walletBalance: 0,
    completedCountReads: 0,
    completedRideCount,
    commissionFreeRidesRemaining,
    cancellationBenefitRestrictedUntil,
    bookingUpdates: [],
    bookingFindUniqueOrThrowArgs: [],
    compensationFindManyArgs: [],
    compensationUpdateManyArgs: [],
    driverFindUniqueArgs: [],
    paymentCreateManyArgs: [],
    payments: new Map(),
    recoveryLockCount: 0,
  }
  for (const entry of existingWalletEntries) walletEntries.set(entry.eventKey, { ...entry })

  const tx = {
    driverLocation: { findUnique: async () => null },
    routeObservation: { findMany: async () => [] },
    notificationDelivery: { findMany: async () => [] },
    booking: {
      findMany: async () => [],
      updateMany: async ({ where, data }) => {
        if (where.id !== BOOKING_ID || state.booking.status !== where.status
          || (Object.hasOwn(where, 'driverId') && where.driverId !== state.booking.driverId)) return { count: 0 }
        Object.assign(state.booking, data)
        return { count: 1 }
      },
      update: async args => {
        const { data } = args
        state.bookingUpdates.push(args)
        Object.assign(state.booking, data)
        return state.booking
      },
      count: async () => {
        state.completedCountReads += 1
        return state.booking.status === 'completed' ? state.completedRideCount : 0
      },
      findUniqueOrThrow: async args => {
        state.bookingFindUniqueOrThrowArgs.push(args)
        return { ...state.booking }
      },
    },
    rideOffer: {
      updateMany: async args => {
        state.offerWithdrawals += 1
        state.offerWithdrawalArgs.push(args)
        return { count: 1 }
      },
    },
    driver: {
      updateMany: async ({ where, data }) => {
        if (data.vehicleCapacity?.increment) {
          if (state.capacity >= where.vehicleCapacity.lt) return { count: 0 }
          state.capacity += data.vehicleCapacity.increment
          state.capacityWrites += 1
        }
        return { count: 1 }
      },
      update: async ({ data }) => {
        if (typeof data.vehicleCapacity === 'number') {
          state.capacity = data.vehicleCapacity
          state.capacityWrites += 1
        }
        if (data.walletBalance?.increment) state.walletBalance += data.walletBalance.increment
        if (data.commissionFreeRidesRemaining?.decrement) {
          state.commissionFreeRidesRemaining -= data.commissionFreeRidesRemaining.decrement
        }
        if (data.commissionFreeRidesRemaining?.increment) {
          state.commissionFreeRidesRemaining += data.commissionFreeRidesRemaining.increment
        }
        return {}
      },
      findUniqueOrThrow: async () => ({
        commissionFreeRidesRemaining: state.commissionFreeRidesRemaining,
        cancellationBenefitRestrictedUntil: state.cancellationBenefitRestrictedUntil,
      }),
      findUnique: async args => {
        state.driverFindUniqueArgs.push(args)
        return {
        suspendedAt: null,
        suspensionExpiresAt: null,
        payoutUpiId,
        payoutUpiVerifiedAt,
        }
      },
    },
    rideComplaint: {
      count: async () => 0,
    },
    driverCancellation: {
      create: async ({ data }) => {
        const row = {
          id: `cancellation-${state.cancellations.length + 1}`,
          ...data,
          createdAt: data.createdAt ?? new Date('2026-09-25T09:00:00.000Z'),
        }
        state.cancellations.push(row)
        return row
      },
      count: async () => state.cancellations.length,
    },
    responsibilityCase: {
      upsert: async ({ where, create }) => {
        if (!state.responsibilityCases.has(where.id)) state.responsibilityCases.set(where.id, create)
        return state.responsibilityCases.get(where.id)
      },
      findUnique: async ({ where }) => state.responsibilityCases.get(where.id) ?? null,
      update: async ({ where, data }) => {
        const current = state.responsibilityCases.get(where.id)
        if (!current) throw new Error('responsibility case missing')
        const updated = { ...current, ...data }
        state.responsibilityCases.set(where.id, updated)
        return updated
      },
    },
    responsibilityEvidenceVersion: {
      upsert: async ({ where, create }) => {
        const key = `${where.caseId_evidenceHash.caseId}:${where.caseId_evidenceHash.evidenceHash}`
        if (!state.responsibilityEvidenceVersions.has(key)) {
          state.responsibilityEvidenceVersions.set(key, { id: `evidence-${state.responsibilityEvidenceVersions.size + 1}`, ...create })
        }
        return state.responsibilityEvidenceVersions.get(key)
      },
    },
    responsibilityAdjudicationWork: {
      upsert: async ({ where, create }) => {
        if (!state.responsibilityAdjudicationWork.has(where.logicalKey)) {
          state.responsibilityAdjudicationWork.set(where.logicalKey, { id: `work-${state.responsibilityAdjudicationWork.size + 1}`, ...create })
        }
        return state.responsibilityAdjudicationWork.get(where.logicalKey)
      },
    },
    responsibilityCompensationAllocation: {
      findMany: async args => {
        const { where } = args
        state.compensationFindManyArgs.push(args)
        return state.compensationAllocations.filter(allocation =>
          allocation.bookingId === where.bookingId && (!where.status || allocation.status === where.status))
      },
      updateMany: async args => {
        const { where, data } = args
        state.compensationUpdateManyArgs.push(args)
        const matches = state.compensationAllocations.filter(row =>
          (where.id ? row.id === where.id : row.bookingId === where.bookingId) && row.status === where.status)
        for (const allocation of matches) Object.assign(allocation, data)
        return { count: matches.length }
      },
      create: async ({ data }) => {
        const allocation = { id: `split-${state.compensationAllocations.length + 1}`, ...data }
        state.compensationAllocations.push(allocation)
        return allocation
      },
    },
    responsibilityLiability: { findMany: async () => [] },
    $queryRaw: async () => {
      state.recoveryLockCount += 1
      return []
    },
    walletEntry: {
      findMany: async ({ where }) => [...state.walletEntries.values()].filter(row => row.bookingId === where.bookingId && row.type === where.type),
      findUnique: async ({ where }) => state.walletEntries.get(where.eventKey) ?? null,
      createMany: async ({ data }) => {
        let count = 0
        for (const entry of data) {
          if (state.walletEntries.has(entry.eventKey)) continue
          state.walletEntries.set(entry.eventKey, entry)
          count += 1
        }
        return { count }
      },
    },
    payment: {
      createMany: async args => {
        state.paymentCreateManyArgs.push(args)
        let count = 0
        for (const payment of args.data) {
          if (state.payments.has(payment.idempotencyKey)) continue
          state.payments.set(payment.idempotencyKey, payment)
          count += 1
        }
        return { count }
      },
      findUniqueOrThrow: async ({ where }) => state.payments.get(where.idempotencyKey),
    },
  }

  return { tx, state }
}

const driver = { id: DRIVER_ID, vehicleClass: 'hatchback' }

test('driver cancellation boundary keeps the exact operational cancellable states', () => {
  assert.deepEqual(DRIVER_CANCELLABLE_STATUSES, ['assigned', 'en_route', 'reached'])
})

test('driver cancellation is guarded so a retry cannot restore capacity or record consequences twice', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', compensationAllocations: [{
    id: 'allocation-1', bookingId: BOOKING_ID, compensationId: 'entitlement-1',
    amountPaise: 8000, status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:entitlement-1',
  }] })
  const booking = { id: BOOKING_ID, userId: 'user-1', fare: 1000, status: 'assigned', scheduledAt: null, sharing: false }

  const first = await cancelDriverRideInTransaction(tx, booking, driver, {
    reason: 'rider_unreachable',
  })
  const retry = await cancelDriverRideInTransaction(tx, booking, driver)

  assert.equal(first.status, 'pending')
  assert.equal(retry, null)
  assert.equal(state.booking.status, 'pending')
  assert.equal(state.booking.driverId, null)
  assert.equal(state.capacity, 4)
  assert.equal(state.capacityWrites, 1)
  assert.equal(state.cancellations.length, 1)
  assert.equal(state.compensationAllocations[0].status, 'RESERVED')
  assert.equal(state.responsibilityCases.size, 1)
  assert.equal(first.responsibilityCaseId, `driver-cancellation:${BOOKING_ID}:${DRIVER_ID}`)
  assert.equal(state.cancellations[0].reason, 'rider_unreachable')
  assert.equal(state.cancellations[0].otherReason, null)
  assert.equal(state.offerWithdrawals, 1)
  assert.equal(state.offerWithdrawalArgs.length, 1)
  assert.equal(state.offerWithdrawalArgs[0].where.bookingId, BOOKING_ID)
  assert.equal(state.offerWithdrawalArgs[0].where.status, 'pending')
  assert.equal(state.offerWithdrawalArgs[0].data.status, 'withdrawn')
  assert.equal(state.offerWithdrawalArgs[0].data.respondedAt instanceof Date, true)
})

test('driver cancellation wrapper delegates through one transaction', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned' })
  const booking = { id: BOOKING_ID, userId: 'user-1', fare: 1000, status: 'assigned', scheduledAt: null, sharing: false }
  let transactionCalls = 0
  const db = {
    $transaction: async operation => {
      transactionCalls += 1
      return operation(tx)
    },
  }

  const result = await cancelDriverRide(booking, driver, { reason: 'rider_unreachable' }, db)

  assert.equal(transactionCalls, 1)
  assert.equal(result.status, 'pending')
  assert.equal(state.cancellations.length, 1)
  assert.equal(state.responsibilityCases.size, 1)
})

test('cancelling after arrival retains arrival evidence and stores Other explanation', async () => {
  const { tx, state } = fakeTransaction({ status: 'reached' })
  state.booking.reachedAt = new Date('2026-09-14T10:00:00.000Z')
  state.booking.reachedDistanceKm = 0.12
  state.booking.reachedAccuracyM = 8
  state.booking.reachedLocationAt = new Date('2026-09-14T10:00:01.000Z')
  const booking = {
    id: BOOKING_ID,
    userId: 'user-1',
    fare: 1000,
    status: 'reached',
    scheduledAt: null,
    sharing: false,
  }

  const result = await cancelDriverRideInTransaction(tx, booking, driver, {
    reason: 'other',
    otherReason: 'Pickup access was blocked by local authorities',
  })

  assert.equal(result.status, 'pending')
  assert.equal(state.booking.reachedAt?.toISOString(), '2026-09-14T10:00:00.000Z')
  assert.equal(state.booking.reachedDistanceKm, 0.12)
  assert.equal(state.booking.reachedAccuracyM, 8)
  assert.equal(state.booking.reachedLocationAt?.toISOString(), '2026-09-14T10:00:01.000Z')
  assert.equal(state.cancellations.length, 1)
  assert.equal(state.cancellations[0].reason, 'other')
  assert.equal(state.cancellations[0].otherReason, 'Pickup access was blocked by local authorities')
})

test('customer cancellation wins a race once, restores capacity, and posts deterministic wallet effects', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', depositHold: -25 })
  const booking = {
    id: BOOKING_ID,
    userId: 'user-1',
    fare: 1000,
    status: 'assigned',
    scheduledAt: new Date('2026-09-15T05:00:00Z'),
    scheduledAdvancePaidAmount: 15000,
    scheduledAdvanceDisposition: null,
    sharing: false,
    driverId: DRIVER_ID,
    driver,
  }

  const cancelled = await applyCustomerCancellationInTransaction(tx, {
    booking,
    cancellationCharge: 100,
    cancellationReason: null,
    advanceDisposition: 'partial_refund_pending',
  })
  const driverRace = await cancelDriverRideInTransaction(tx, booking, driver)
  const retry = await applyCustomerCancellationInTransaction(tx, {
    booking,
    cancellationCharge: 100,
    cancellationReason: null,
    advanceDisposition: 'partial_refund_pending',
  })

  assert.equal(cancelled, true)
  assert.equal(driverRace, null)
  assert.equal(retry, false)
  assert.equal(state.booking.status, 'cancelled')
  assert.equal(state.capacity, 4)
  assert.equal(state.capacityWrites, 1)
  assert.equal(state.cancellations.length, 0)
  assert.equal(state.walletEntries.has(walletEvent.depositRefund(BOOKING_ID)), true)
  assert.equal(state.walletEntries.has(walletEvent.scheduledCancellationCompensation(BOOKING_ID)), true)
  assert.equal(state.walletEntries.get(walletEvent.scheduledCancellationCompensation(BOOKING_ID)).amount, 100)
  assert.equal(state.walletEntries.size, 3)
})

test('driver cancellation winning the race prevents customer cancellation money effects', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', depositHold: -25 })
  const booking = {
    id: BOOKING_ID,
    userId: 'user-1',
    fare: 1000,
    status: 'assigned',
    scheduledAt: new Date('2026-09-15T05:00:00Z'),
    scheduledAdvancePaidAmount: 15000,
    sharing: false,
    driverId: DRIVER_ID,
    driver,
  }

  const handedBack = await cancelDriverRideInTransaction(tx, booking, driver)
  const customerRace = await applyCustomerCancellationInTransaction(tx, {
    booking,
    cancellationCharge: 100,
    cancellationReason: null,
    advanceDisposition: 'partial_refund_pending',
  })

  assert.equal(handedBack.status, 'confirmed')
  assert.equal(customerRace, false)
  assert.equal(state.booking.status, 'confirmed')
  assert.equal(state.capacityWrites, 1)
  assert.equal(state.cancellations.length, 1)
  assert.equal(state.walletEntries.size, 1)
})

test('driver cancellation and replacement keep the booking-level compensation reservation', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', compensationAllocations: [{
    id: 'allocation-1', bookingId: BOOKING_ID, compensationId: 'entitlement-1',
    amountPaise: 8000, status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:entitlement-1',
  }] })
  const booking = { id: BOOKING_ID, userId: 'user-1', fare: 400, couponAmount: 0,
    status: 'assigned', scheduledAt: new Date('2026-09-15T05:00:00Z'),
    sharing: false, driverId: DRIVER_ID, driver }
  assert.equal((await cancelDriverRideInTransaction(tx, booking, driver)).status, 'confirmed')
  assert.equal(state.compensationAllocations[0].status, 'RESERVED')
  assert.equal(state.booking.driverId, null)
})

test('completion settlement is guarded so duplicate completion cannot repeat settlement side effects', async () => {
  const { tx, state } = fakeTransaction({ status: 'started' })
  const booking = {
    id: BOOKING_ID,
    status: 'started',
    sharing: false,
    shareGroupId: null,
    soloFare: null,
    fare: 1000,
    rideFare: 1000,
    couponAmount: 0,
    commissionAmt: 50,
    scheduledAt: null,
  }
  const args = {
    booking,
    driver,
    from: 'started',
    to: 'completed',
    distanceKm: 0.2,
    accuracy: 12,
    capturedAt: '2026-09-14T10:00:00.000Z',
    completionOverrideReason: null,
    customerConfirmedCompletion: false,
  }
  const now = new Date('2026-09-14T10:00:01.000Z')

  const first = await settleRideTransitionInTransaction(tx, args, now)
  const retry = await settleRideTransitionInTransaction(tx, args, now)

  assert.equal(first, true)
  assert.equal(retry, false)
  assert.equal(state.booking.status, 'completed')
  assert.equal(state.capacity, 4)
  assert.equal(state.capacityWrites, 1)
  assert.equal(state.completedCountReads, 1)
  assert.equal(state.walletEntries.get(walletEvent.commission(BOOKING_ID)).amount, -50)
  assert.equal(state.walletEntries.get(walletEvent.commission(BOOKING_ID)).type, 'commission')
  assert.equal(state.walletEntries.get(walletEvent.commission(BOOKING_ID)).note,
    'Platform commission settled on ride completion')
  assert.equal(state.walletBalance, -50)
  assert.deepEqual(state.bookingFindUniqueOrThrowArgs, [{ where: { id: BOOKING_ID } }])
})

test('non-completion transitions persist their evidence and reject a stale source status', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned' })
  const booking = { id: BOOKING_ID, status: 'assigned', sharing: false, commissionAmt: 0 }
  const args = {
    booking,
    driver,
    from: 'assigned',
    to: 'reached',
    distanceKm: 0.12,
    accuracy: 8,
    capturedAt: '2026-09-14T10:00:00.000Z',
  }
  const now = new Date('2026-09-14T10:00:01.000Z')

  assert.equal(await settleRideTransitionInTransaction(tx, args, now), true)
  assert.equal(state.booking.status, 'reached')
  assert.equal(state.booking.reachedAt, now)
  assert.equal(state.booking.reachedDistanceKm, 0.12)
  assert.equal(state.booking.reachedAccuracyM, 8)
  assert.equal(state.booking.reachedLocationAt?.toISOString(), '2026-09-14T10:00:00.000Z')
  assert.equal(await settleRideTransitionInTransaction(tx, args, now), false)
  assert.equal(state.capacityWrites, 0)
  assert.equal(state.walletEntries.size, 0)
})

test('en-route transition persists the guarded status without completion effects', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned' })
  const booking = { id: BOOKING_ID, status: 'assigned', sharing: false, commissionAmt: 0 }

  assert.equal(await settleRideTransitionInTransaction(tx, {
    booking,
    driver,
    from: 'assigned',
    to: 'en_route',
    distanceKm: 0.3,
    accuracy: 10,
    capturedAt: '2026-09-14T10:00:00.000Z',
  }), true)
  assert.equal(state.booking.status, 'en_route')
  assert.equal(state.capacityWrites, 0)
  assert.equal(state.walletEntries.size, 0)
})

test('unsupported ride transitions fail before any booking write', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned' })
  const booking = { id: BOOKING_ID, status: 'assigned', sharing: false, commissionAmt: 0 }

  await assert.rejects(settleRideTransitionInTransaction(tx, {
    booking,
    driver,
    from: 'assigned',
    to: 'boarding',
    distanceKm: 0,
    accuracy: 0,
    capturedAt: '2026-09-14T10:00:00.000Z',
  }), /Unsupported ride transition: boarding/)
  assert.equal(state.booking.status, 'assigned')
})

test('ride transition wrapper uses one Prisma transaction and records startedAt', async () => {
  const { tx, state } = fakeTransaction({ status: 'reached' })
  const booking = { id: BOOKING_ID, status: 'reached', sharing: false, commissionAmt: 0 }
  const originalTransaction = prisma.$transaction
  let transactionCalls = 0
  prisma.$transaction = async callback => {
    transactionCalls += 1
    return callback(tx)
  }

  try {
    assert.equal(await settleRideTransition({
      booking,
      driver,
      from: 'reached',
      to: 'started',
      distanceKm: 0.1,
      accuracy: 6,
      capturedAt: '2026-09-14T10:00:00.000Z',
    }), true)
    assert.equal(transactionCalls, 1)
    assert.equal(state.booking.status, 'started')
    assert.equal(state.booking.startedAt instanceof Date, true)
  } finally {
    prisma.$transaction = originalTransaction
  }
})

test('unmatched shared completion restores the solo fare before settling commission', async () => {
  const { tx, state } = fakeTransaction({ status: 'started' })
  const booking = {
    id: BOOKING_ID,
    status: 'started',
    driverId: DRIVER_ID,
    sharing: true,
    shareGroupId: null,
    fare: 960,
    rideFare: 900,
    soloFare: 1200,
    couponAmount: 100,
    commissionAmt: 40,
    scheduledAt: null,
  }

  assert.equal(await settleRideTransitionInTransaction(tx, {
    booking, driver, from: 'started', to: 'completed',
    distanceKm: 0.2, accuracy: 12, capturedAt: '2026-09-14T10:00:00.000Z',
    completionOverrideReason: null, customerConfirmedCompletion: false,
  }), true)
  assert.equal(state.booking.fare, 1200)
  assert.equal(state.booking.rideFare, 1140)
  assert.equal(state.booking.customerPayment, 1100)
  assert.equal(state.booking.commissionPct, 10)
  assert.equal(state.booking.commissionAmt, 104)
  assert.equal(state.walletEntries.get(walletEvent.commission(BOOKING_ID)).amount, -104)
})

test('cancellation-benefit restriction blocks a newly earned loyalty reward', async () => {
  const now = new Date('2026-09-14T10:00:01.000Z')
  for (const [restriction, expectedRewards] of [
    [null, 3],
    [new Date('2026-10-14T10:00:01.000Z'), 0],
  ]) {
    const { tx, state } = fakeTransaction({
      status: 'started',
      completedRideCount: 20,
      cancellationBenefitRestrictedUntil: restriction,
    })
    const booking = {
      id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
      shareGroupId: null, soloFare: null, fare: 400, rideFare: 400,
      couponAmount: 0, commissionAmt: 0, scheduledAt: null,
    }

    assert.equal(await settleRideTransitionInTransaction(tx, {
      booking, driver, from: 'started', to: 'completed',
      distanceKm: 0.2, accuracy: 12, capturedAt: '2026-09-14T10:00:00.000Z',
      completionOverrideReason: null, customerConfirmedCompletion: false,
    }, now), true)
    assert.equal(state.commissionFreeRidesRemaining, expectedRewards)
  }
})

test('scheduled completion still succeeds with cash fallback when captain payout UPI is unverified', async () => {
  for (const commissionFreeRidesRemaining of [0, 1]) {
    const { tx, state } = fakeTransaction({
      status: 'started',
      depositHold: -90,
      commissionFreeRidesRemaining,
    })
    Object.assign(state.booking, {
      scheduledAt: new Date('2026-09-15T05:00:00Z'),
      scheduledAdvancePaidAmount: 9000,
      scheduledRemainingAmount: 81000,
      customerPayment: 900,
      couponAmount: 100,
    })
    const booking = {
      id: BOOKING_ID,
      status: 'started',
      driverId: DRIVER_ID,
      sharing: false,
      shareGroupId: null,
      soloFare: null,
      fare: 1000,
      rideFare: 1000,
      couponAmount: 100,
      commissionAmt: 45,
      scheduledAt: state.booking.scheduledAt,
    }
    const args = {
      booking,
      driver,
      from: 'started',
      to: 'completed',
      distanceKm: 0.2,
      accuracy: 12,
      capturedAt: '2026-09-14T10:00:00.000Z',
      completionOverrideReason: null,
      customerConfirmedCompletion: false,
    }
    const now = new Date('2026-09-14T10:00:01.000Z')

    assert.equal(await settleRideTransitionInTransaction(tx, args, now), true)
    assert.equal(await settleRideTransitionInTransaction(tx, args, now), false)
    assert.equal(state.booking.status, 'completed')
    const scheduledAdvance = state.walletEntries.get(walletEvent.rideCollection(BOOKING_ID, 'scheduled_ride_advance'))
    assert.equal(scheduledAdvance.amount, 90)
    assert.equal(scheduledAdvance.type, 'ride_collection')
    assert.equal(scheduledAdvance.note, 'Scheduled ride advance earned after ride completion')
    const couponReimbursement = state.walletEntries.get(walletEvent.couponReimbursement(BOOKING_ID))
    assert.equal(couponReimbursement.amount, 100)
    assert.equal(couponReimbursement.type, 'coupon_reimbursement')
    assert.equal(couponReimbursement.note, 'Full coupon reimbursement')
    assert.equal(state.walletEntries.has(walletEvent.rideCollection(BOOKING_ID, 'scheduled_ride_final')), false)
    const depositRefund = state.walletEntries.get(walletEvent.depositRefund(BOOKING_ID))
    assert.equal(depositRefund.amount, 90)
    assert.equal(depositRefund.type, 'deposit_refund')
    assert.equal(depositRefund.note, 'Scheduled ride acceptance deposit released at booking terminal state')

    if (commissionFreeRidesRemaining === 0) {
      assert.equal(state.walletEntries.get(walletEvent.commission(BOOKING_ID)).amount, -45)
      assert.equal(state.walletBalance, 235)
    } else {
      assert.equal(state.walletEntries.has(walletEvent.commission(BOOKING_ID)), false)
      assert.equal(state.commissionFreeRidesRemaining, 0)
      assert.equal(state.booking.commissionAmt, 0)
      assert.equal(state.walletBalance, 280)
    }
  }
})

test('scheduled completion does not create an advance wallet entry when no advance was paid', async () => {
  const { tx, state } = fakeTransaction({ status: 'started' })
  const scheduledAt = new Date('2026-09-15T05:00:00.000Z')
  Object.assign(state.booking, {
    scheduledAt,
    scheduledAdvancePaidAmount: 0,
    scheduledRemainingAmount: 100000,
  })

  assert.equal(await settleRideTransitionInTransaction(tx, {
    booking: {
      id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
      shareGroupId: null, soloFare: null, fare: 1000, rideFare: 1000,
      couponAmount: 0, commissionAmt: 0, scheduledAt,
    },
    driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
    capturedAt: '2026-09-14T10:00:00.000Z', completionOverrideReason: null,
    customerConfirmedCompletion: false,
  }), true)

  assert.equal(state.walletEntries.has(walletEvent.rideCollection(BOOKING_ID, 'scheduled_ride_advance')), false)
})

test('customer cancellation releases reserved compensation without paying the cancellation fee from it', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', compensationAllocations: [{
    id: 'allocation-1', bookingId: BOOKING_ID, compensationId: 'entitlement-1',
    amountPaise: 8000, status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:entitlement-1',
  }] })
  const booking = { id: BOOKING_ID, status: 'assigned', driverId: DRIVER_ID, driver,
    scheduledAt: null, sharing: false }
  assert.equal(await applyCustomerCancellationInTransaction(tx, {
    booking, cancellationCharge: 20,
  }), true)
  assert.equal(state.compensationAllocations[0].status, 'RELEASED')
  assert.equal(state.walletEntries.get(walletEvent.scheduledCancellationCompensation(BOOKING_ID)).amount, 20)
  assert.equal(state.walletEntries.has(walletEvent.responsibilityCompensationFunding('allocation-1')), false)
})

test('completed platform rides fund compensation without repricing any driver category', async () => {
  for (const group of ['rcs', 'partner', 'admin']) {
    const { tx, state } = fakeTransaction({ status: 'started', compensationAllocations: [{
      id: 'allocation-1', bookingId: BOOKING_ID, compensationId: 'entitlement-1',
      amountPaise: 8000, status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:entitlement-1',
    }] })
    Object.assign(state.booking, { fare: 400, customerPayment: 320, scheduledAt: null })
    const booking = { id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
      shareGroupId: null, soloFare: null, fare: 400, rideFare: 400, couponAmount: 0,
      commissionAmt: 0, scheduledAt: null }
    const args = { booking, driver: { ...driver, group }, from: 'started', to: 'completed',
      distanceKm: 0.2, accuracy: 12, capturedAt: '2026-09-14T10:00:00.000Z',
      completionOverrideReason: null, customerConfirmedCompletion: false }
    assert.equal(await settleRideTransitionInTransaction(tx, args), true)
    assert.equal(state.booking.fare, 400)
    assert.equal(state.booking.customerPayment, 320)
    assert.equal(state.compensationAllocations[0].status, 'CONSUMED')
    assert.equal(state.walletEntries.get(walletEvent.responsibilityCompensationFunding('allocation-1')).amount, 80)
    assert.equal(state.walletEntries.get(walletEvent.responsibilityCompensationFunding('allocation-1')).type,
      'responsibility_compensation_funding')
    assert.equal(state.walletEntries.get(walletEvent.responsibilityCompensationFunding('allocation-1')).note,
      'RCS contribution for responsibility compensation used on this ride')
    assert.equal(state.walletBalance, 80)
    assert.deepEqual(state.bookingUpdates, [])
    assert.equal(await settleRideTransitionInTransaction(tx, args), false)
    assert.equal(state.walletEntries.size, 1)
  }
})

test('scheduled compensation is capped after coupon and advance, updates customer payment, and funds once', async () => {
  const allocation = {
    id: 'allocation-1', bookingId: BOOKING_ID, compensationId: 'entitlement-1',
    amountPaise: 70000, status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:entitlement-1',
  }
  const { tx, state } = fakeTransaction({
    status: 'started',
    compensationAllocations: [allocation],
  })
  const scheduledAt = new Date('2026-09-15T05:00:00.000Z')
  Object.assign(state.booking, {
    userId: 'user-1', fare: 1000, couponAmount: 200, customerPayment: 800,
    scheduledAt, scheduledAdvancePaidAmount: 30000, scheduledRemainingAmount: 50000,
  })
  const args = {
    booking: {
      id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
      shareGroupId: null, soloFare: null, fare: 1000, rideFare: 1000,
      couponAmount: 200, commissionAmt: 0, scheduledAt,
    },
    driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
    capturedAt: '2026-09-14T10:00:00.000Z', completionOverrideReason: null,
    customerConfirmedCompletion: false,
  }

  const now = new Date('2026-09-14T10:00:01.000Z')
  assert.equal(await settleRideTransitionInTransaction(tx, args, now), true)
  assert.deepEqual(state.compensationFindManyArgs, [
    { where: { bookingId: BOOKING_ID, status: 'RESERVED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    { where: { bookingId: BOOKING_ID, status: 'CONSUMED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  ])
  assert.equal(state.compensationUpdateManyArgs.length, 1)
  assert.deepEqual(state.compensationUpdateManyArgs[0].where, { id: 'allocation-1', status: 'RESERVED' })
  assert.equal(state.compensationUpdateManyArgs[0].data.status, 'CONSUMED')
  assert.equal(state.compensationUpdateManyArgs[0].data.amountPaise, 50000)
  assert.equal(state.compensationAllocations[0].amountPaise, 50000)
  assert.equal(state.compensationAllocations[0].consumedAt, now)
  assert.equal(state.compensationAllocations[1].status, 'RELEASED')
  assert.equal(state.compensationAllocations[1].amountPaise, 20000)
  assert.equal(state.compensationAllocations[1].releasedAt, now)
  assert.equal(state.booking.customerPayment, 300)
  assert.deepEqual(state.bookingUpdates.map(({ where, data }) => ({ where, data })), [
    { where: { id: BOOKING_ID }, data: { customerPayment: 300 } },
    { where: { id: BOOKING_ID }, data: { scheduledRemainingAmount: 0 } },
  ])
  assert.equal(state.walletEntries.get(walletEvent.responsibilityCompensationFunding('allocation-1')).amount, 500)
  assert.equal(state.walletEntries.get(walletEvent.rideCollection(BOOKING_ID, 'scheduled_ride_advance')).amount, 300)
  assert.equal(state.walletEntries.has(walletEvent.rideCollection(BOOKING_ID, 'scheduled_ride_final')), false)
  assert.equal(state.recoveryLockCount, 6)
  assert.deepEqual(state.bookingFindUniqueOrThrowArgs, [
    { where: { id: BOOKING_ID } },
    { where: { id: BOOKING_ID } },
    { where: { id: BOOKING_ID } },
  ])
  assert.equal(await settleRideTransitionInTransaction(tx, args, now), false)
  assert.equal(state.recoveryLockCount, 6)
})

test('an already-posted compensation earning is not recovered a second time', async () => {
  const eventKey = walletEvent.responsibilityCompensationFunding('allocation-1')
  const { tx, state } = fakeTransaction({
    status: 'started',
    compensationAllocations: [{
      id: 'allocation-1', bookingId: BOOKING_ID, compensationId: 'entitlement-1',
      amountPaise: 8000, status: 'RESERVED', sourceKey: 'responsibility-compensation:booking-1:entitlement-1',
    }],
    existingWalletEntries: [{
      driverId: DRIVER_ID, amount: 80, type: 'responsibility_compensation_funding',
      eventKey, bookingId: BOOKING_ID,
    }],
  })
  Object.assign(state.booking, { fare: 400, couponAmount: 0, customerPayment: 400 })

  assert.equal(await settleRideTransitionInTransaction(tx, {
    booking: { id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
      shareGroupId: null, soloFare: null, fare: 400, rideFare: 400, couponAmount: 0,
      commissionAmt: 0, scheduledAt: null },
    driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
    capturedAt: '2026-09-14T10:00:00.000Z', completionOverrideReason: null,
    customerConfirmedCompletion: false,
  }), true)
  assert.equal(state.walletEntries.size, 1)
  assert.equal(state.walletBalance, 0)
  assert.equal(state.recoveryLockCount, 0)
})

test('scheduled final intent requires a positive remaining balance and a verified payout UPI', async () => {
  const verifiedAt = new Date('2026-09-01T00:00:00.000Z')
  for (const { advance, payoutUpiId, payoutUpiVerifiedAt, expectIntent } of [
    { advance: 10000, payoutUpiId: 'captain@upi', payoutUpiVerifiedAt: verifiedAt, expectIntent: true },
    { advance: 100000, payoutUpiId: 'captain@upi', payoutUpiVerifiedAt: verifiedAt, expectIntent: false },
    { advance: 10000, payoutUpiId: 'captain@upi', payoutUpiVerifiedAt: null, expectIntent: false },
  ]) {
    const { tx, state } = fakeTransaction({ status: 'started', payoutUpiId, payoutUpiVerifiedAt })
    const scheduledAt = new Date('2026-09-15T05:00:00.000Z')
    Object.assign(state.booking, {
      userId: 'user-1', fare: 1000, couponAmount: 0, customerPayment: 1000,
      scheduledAt, scheduledAdvancePaidAmount: advance, scheduledRemainingAmount: 1,
    })
    assert.equal(await settleRideTransitionInTransaction(tx, {
      booking: { id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
        shareGroupId: null, soloFare: null, fare: 1000, rideFare: 1000, couponAmount: 0,
        commissionAmt: 0, scheduledAt },
      driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
      capturedAt: '2026-09-14T10:00:00.000Z', completionOverrideReason: null,
      customerConfirmedCompletion: false,
    }), true)
    const remaining = Math.max(0, 100000 - advance)
    assert.equal(state.booking.scheduledRemainingAmount, remaining)
    assert.deepEqual(state.driverFindUniqueArgs, expectIntent ? [{
      where: { id: DRIVER_ID },
      select: { payoutUpiId: true, payoutUpiVerifiedAt: true },
    }, {
      where: { id: DRIVER_ID },
      select: { payoutUpiId: true, payoutUpiVerifiedAt: true },
    }] : remaining > 0 ? [{
      where: { id: DRIVER_ID },
      select: { payoutUpiId: true, payoutUpiVerifiedAt: true },
    }] : [])
    assert.equal(state.payments.size, expectIntent ? 1 : 0)
    if (expectIntent) {
      assert.deepEqual(state.paymentCreateManyArgs, [{
        data: [{ userId: 'user-1', bookingId: BOOKING_ID, purpose: 'scheduled_ride_final', amount: remaining,
          currency: 'INR', idempotencyKey: `scheduled-final:${BOOKING_ID}`, originalFareAmount: 100000,
          couponAmount: 0, finalFareAmount: 100000, advancePercentage: undefined, remainingAmount: remaining }],
        skipDuplicates: true,
      }])
    }
  }
})

test('a scheduled settlement with an unchanged balance does not write it again', async () => {
  const { tx, state } = fakeTransaction({ status: 'started' })
  const scheduledAt = new Date('2026-09-15T05:00:00.000Z')
  Object.assign(state.booking, {
    userId: 'user-1', fare: 1000, couponAmount: 0, customerPayment: 1000,
    scheduledAt, scheduledAdvancePaidAmount: 20000, scheduledRemainingAmount: 80000,
  })

  assert.equal(await settleRideTransitionInTransaction(tx, {
    booking: { id: BOOKING_ID, status: 'started', driverId: DRIVER_ID, sharing: false,
      shareGroupId: null, soloFare: null, fare: 1000, rideFare: 1000, couponAmount: 0,
      commissionAmt: 0, scheduledAt },
    driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
    capturedAt: '2026-09-14T10:00:00.000Z', completionOverrideReason: null,
    customerConfirmedCompletion: false,
  }), true)

  assert.equal(state.booking.scheduledRemainingAmount, 80000)
  assert.deepEqual(state.bookingUpdates, [])
  assert.deepEqual(state.bookingFindUniqueOrThrowArgs, [
    { where: { id: BOOKING_ID } },
    { where: { id: BOOKING_ID } },
    { where: { id: BOOKING_ID } },
  ])
})

test('dispatch ranking keeps group priority and fairness inside each 3 km band', () => {
  const old = new Date('2026-09-14T08:00:00Z')
  const recent = new Date('2026-09-14T09:00:00Z')
  const ranked = rankCandidates([
    { driverId: 'partner-near', distanceKm: 0.5, driver: { group: 'partner', lastOfferedAt: old, createdAt: old } },
    { driverId: 'rcs-recent', distanceKm: 1, driver: { group: 'rcs', lastOfferedAt: recent, createdAt: old } },
    { driverId: 'rcs-old', distanceKm: 2.5, driver: { group: 'rcs', lastOfferedAt: old, createdAt: recent } },
    { driverId: 'rcs-far-tier', distanceKm: 3.1, driver: { group: 'rcs', lastOfferedAt: new Date(0), createdAt: old } },
  ])

  assert.deepEqual(ranked.map((candidate) => candidate.driverId), [
    'rcs-old',
    'rcs-recent',
    'rcs-far-tier',
    'partner-near',
  ])
})
