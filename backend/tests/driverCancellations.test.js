import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignmentWindowStartedAt,
  cancellationWindowStart,
  DRIVER_CANCELLATION_WINDOW_DAYS,
  recordDriverCancellationIncident,
} from '../services/driverCancellations.js'

test('a captain hand-back starts a fresh assignment timeout window', () => {
  const bookedAt = new Date('2026-08-20T10:00:00.000Z')
  const handedBackAt = new Date('2026-08-20T12:00:00.000Z')
  assert.equal(assignmentWindowStartedAt(bookedAt, null), bookedAt)
  assert.equal(assignmentWindowStartedAt(bookedAt, { createdAt: handedBackAt }), handedBackAt)
})

test('the rolling cancellation-history window remains 30 days', () => {
  const now = new Date('2026-08-20T12:00:00.000Z')
  assert.equal(DRIVER_CANCELLATION_WINDOW_DAYS, 30)
  assert.equal(cancellationWindowStart(now).toISOString(), '2026-07-21T12:00:00.000Z')
})

test('driver cancellation records evidence and queues shadow adjudication without punitive writes', async () => {
  const writes = { cancellations: [], cases: [], evidenceVersions: [], work: [], drivers: [], wallet: [], offers: [] }
  const now = new Date('2026-09-25T09:00:00.000Z')
  const tx = {
    driverLocation: { findUnique: async () => null },
    routeObservation: { findMany: async () => [] },
    notificationDelivery: { findMany: async () => [] },
    booking: { findMany: async () => [] },
    driverCancellation: {
      create: async ({ data }) => {
        const row = { id: 'cancel-1', ...data, createdAt: data.createdAt ?? now }
        writes.cancellations.push(row)
        return row
      },
    },
    responsibilityCase: {
      findUnique: async ({ where }) => writes.cases.find(item => item.id === where.id) ?? null,
      upsert: async args => {
        writes.cases.push(args)
        writes.cases.push(args.create)
        return args.create
      },
    },
    responsibilityEvidenceVersion: {
      upsert: async args => {
        const row = { id: 'evidence-version-1', ...args.create }
        writes.evidenceVersions.push(row)
        return row
      },
    },
    responsibilityAdjudicationWork: {
      upsert: async args => {
        const row = { id: 'work-1', attemptCount: 0, ...args.create }
        writes.work.push(row)
        return row
      },
    },
    driver: { findUnique: async () => null, update: async args => { writes.drivers.push(args) } },
    walletEntry: { create: async args => { writes.wallet.push(args) } },
    rideOffer: { updateMany: async args => { writes.offers.push(args) } },
  }

  const result = await recordDriverCancellationIncident(tx, 'driver-1', {
    booking: {
      id: 'booking-1',
      userId: 'user-1',
      fare: 800,
      status: 'assigned',
      scheduledAt: new Date('2026-09-25T10:00:00.000Z'),
    },
    reason: 'rider_unreachable',
    now,
  })

  assert.equal(result.responsibilityCase.state, 'NEEDS_ADMIN_REVIEW')
  assert.equal(writes.cases.filter(item => item.where).length, 1)
  const upsert = writes.cases.find(item => item.where)
  assert.equal(upsert.where.id, 'driver-cancellation:booking-1:driver-1')
  const createdCase = upsert.create
  assert.equal(createdCase.sourceKey, 'driver-cancellation:booking-1:driver-1')
  const snapshot = createdCase.evidenceSnapshot
  assert.equal(snapshot.timeline.length, 8)
  assert.equal(snapshot.timeline.find(row => row.category === 'location').quality.provenance, 'missing')
  assert.equal(snapshot.timeline.find(row => row.category === 'connectivity').quality.reachability, 'UNKNOWN')
  assert.equal(snapshot.timeline.find(row => row.category === 'feasibility').value.assessment, 'UNASSESSED')
  assert.equal(snapshot.caseType, 'DRIVER_CANCELLATION')
  assert.equal(snapshot.scheduledAt, '2026-09-25T10:00:00.000Z')
  assert.equal(createdCase.scheduledAt.toISOString(), '2026-09-25T10:00:00.000Z')
  assert.deepEqual(snapshot.timeline.filter(entry => ['booking', 'assignment', 'cancellation'].includes(entry.category))
    .map(entry => ({ category: entry.category, value: entry.value })), [
    {
      category: 'booking',
      value: {
        bookingId: 'booking-1',
        status: 'assigned',
        scheduledAt: '2026-09-25T10:00:00.000Z',
        userId: 'user-1',
        authoritativeFarePaise: 80_000,
        fareBasis: 'BOOKING_FARE_AT_INCIDENT',
      },
    },
    {
      category: 'assignment',
      value: { driverId: 'driver-1', fromStatus: 'assigned', confirmedAt: null,
        driverAssignedAt: null, expectedPickupAt: null, reachedAt: null, reachedLocationObservedAt: null },
    },
    {
      category: 'cancellation',
      value: {
        cancellationId: 'cancel-1',
        initiator: 'driver',
        reason: 'rider_unreachable',
        otherReason: null,
        createdAt: '2026-09-25T09:00:00.000Z',
      },
    },
  ])
  assert.equal(writes.drivers.length, 0)
  assert.equal(writes.wallet.length, 0)
  assert.equal(writes.offers.length, 0)
  assert.equal(writes.evidenceVersions.length, 1)
  assert.equal(writes.work.length, 1)
  assert.equal(writes.work[0].status, 'PENDING')
  const known = await recordDriverCancellationIncident(tx, 'driver-1', {
    booking: { id: 'booking-2', userId: 'user-1', fare: 800, status: 'reached', scheduledAt: now,
      confirmedAt: now, driverAssignedAt: now, expectedPickupAt: now, reachedAt: now, reachedLocationAt: now },
    now,
  })
  assert.deepEqual(known.responsibilityCase.evidenceSnapshot.timeline.find(row => row.category === 'assignment').value, {
    driverId: 'driver-1', fromStatus: 'reached', confirmedAt: now.toISOString(), driverAssignedAt: now.toISOString(),
    expectedPickupAt: now.toISOString(), reachedAt: now.toISOString(), reachedLocationObservedAt: now.toISOString(),
  })
})
