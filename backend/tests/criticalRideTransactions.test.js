import test from 'node:test'
import assert from 'node:assert/strict'
import { walletEvent } from '../services/walletKeys.js'
import {
  cancelDriverRideInTransaction,
} from '../services/driverRideCancellation.js'
import {
  applyCustomerCancellationInTransaction,
} from '../services/customerCancellation.js'
import {
  settleRideTransitionInTransaction,
} from '../services/rideSettlement.js'
import { rankCandidates } from '../services/driverDispatchCandidates.js'

const BOOKING_ID = 'booking-1'
const DRIVER_ID = 'driver-1'

function fakeTransaction({ status = 'assigned', capacity = 0, depositHold = null } = {}) {
  const walletEntries = new Map()
  if (depositHold !== null) {
    walletEntries.set(walletEvent.depositHold(BOOKING_ID), {
      eventKey: walletEvent.depositHold(BOOKING_ID),
      amount: depositHold,
    })
  }

  const state = {
    booking: { id: BOOKING_ID, status, driverId: DRIVER_ID },
    capacity,
    capacityWrites: 0,
    offerWithdrawals: 0,
    cancellations: [],
    walletEntries,
    walletBalance: 0,
    completedCountReads: 0,
  }

  const tx = {
    booking: {
      updateMany: async ({ where, data }) => {
        if (where.id !== BOOKING_ID || state.booking.status !== where.status) return { count: 0 }
        Object.assign(state.booking, data)
        return { count: 1 }
      },
      update: async ({ data }) => {
        Object.assign(state.booking, data)
        return state.booking
      },
      count: async () => {
        state.completedCountReads += 1
        return state.booking.status === 'completed' ? 1 : 0
      },
      findUniqueOrThrow: async () => ({ ...state.booking }),
    },
    rideOffer: {
      updateMany: async () => {
        state.offerWithdrawals += 1
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
        return {}
      },
      findUniqueOrThrow: async () => ({
        commissionFreeRidesRemaining: 0,
        cancellationBenefitRestrictedUntil: null,
      }),
    },
    driverCancellation: {
      create: async ({ data }) => {
        state.cancellations.push(data)
        return data
      },
      count: async () => state.cancellations.length,
    },
    walletEntry: {
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
  }

  return { tx, state }
}

const driver = { id: DRIVER_ID, vehicleClass: 'hatchback' }

test('driver cancellation is guarded so a retry cannot restore capacity or record consequences twice', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned' })
  const booking = { id: BOOKING_ID, status: 'assigned', scheduledAt: null, sharing: false }

  const first = await cancelDriverRideInTransaction(tx, booking, driver)
  const retry = await cancelDriverRideInTransaction(tx, booking, driver)

  assert.equal(first.status, 'pending')
  assert.equal(retry, null)
  assert.equal(state.booking.status, 'pending')
  assert.equal(state.booking.driverId, null)
  assert.equal(state.capacity, 4)
  assert.equal(state.capacityWrites, 1)
  assert.equal(state.cancellations.length, 1)
  assert.equal(state.offerWithdrawals, 1)
})

test('customer cancellation wins a race once, restores capacity, and posts deterministic wallet effects', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', depositHold: -25 })
  const booking = {
    id: BOOKING_ID,
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
    cancellationCharge: 150,
    shouldRefund: false,
    shouldForfeit: true,
  })
  const driverRace = await cancelDriverRideInTransaction(tx, booking, driver)
  const retry = await applyCustomerCancellationInTransaction(tx, {
    booking,
    cancellationCharge: 150,
    shouldRefund: false,
    shouldForfeit: true,
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
  assert.equal(state.walletEntries.size, 3)
})

test('driver cancellation winning the race prevents customer cancellation money effects', async () => {
  const { tx, state } = fakeTransaction({ status: 'assigned', depositHold: -25 })
  const booking = {
    id: BOOKING_ID,
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
    cancellationCharge: 150,
    shouldRefund: false,
    shouldForfeit: true,
  })

  assert.equal(handedBack.status, 'confirmed')
  assert.equal(customerRace, false)
  assert.equal(state.booking.status, 'confirmed')
  assert.equal(state.capacityWrites, 1)
  assert.equal(state.cancellations.length, 1)
  assert.equal(state.walletEntries.size, 1)
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
