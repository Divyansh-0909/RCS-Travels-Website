import test from 'node:test'
import assert from 'node:assert/strict'
import { createResponsibilityEvidence } from '../services/responsibilityEvidence.js'
import { appendLifecycleObservations, recordCustomerLifecycleIncident } from '../services/lifecycleIncidentEvidence.js'
import { cancelCustomerWithEvidenceInTransaction, requestLateDriverRecoveryInTransaction } from '../services/customerLifecycleIncidents.js'
import { hasScheduledReservationHandoff } from '../services/scheduledReservationHandoff.js'
import { storeDriverLocation } from '../services/driverLocationUpdate.js'

const now = new Date('2026-10-09T08:10:00Z'), clock = { now: () => now }
const booking = { id: 'b', userId: 'u', driverId: 'd', status: 'assigned', sharing: false,
  scheduledAt: new Date('2026-10-09T08:00:00Z'), expectedPickupAt: new Date('2026-10-09T08:00:00Z'),
  confirmedAt: new Date('2026-10-09T06:00:00Z'), driverAssignedAt: new Date('2026-10-09T07:00:00Z'),
  driver: { id: 'd', vehicleClass: 'sedan' } }

function fixture({ moved = 1, location = null, driver = null, routes = [], notifications = [], commitments = [] } = {}) {
  const writes = [], cases = new Map()
  const tx = {
    booking: { findMany: async args => { writes.push(['commitment-read', args]); return commitments },
      updateMany: async args => { writes.push(['booking', args]); return { count: moved } } },
    driverLocation: { findUnique: async args => { writes.push(['location-read', args]); return location } },
    driver: { findUnique: async args => { writes.push(['driver-read', args]); return driver },
      update: async args => { writes.push(['capacity', args]); return {} } },
    routeObservation: { findMany: async args => { writes.push(['route-read', args]); return routes },
      create: async args => { writes.push(['route', args]); return args.data } },
    notificationDelivery: { findMany: async args => { writes.push(['notification-read', args]); return notifications } },
    rideOffer: { updateMany: async args => { writes.push(['offers', args]); return { count: 1 } } },
    cancellationLocationEvidence: { create: async args => { writes.push(['location', args]); return args.data } },
    walletEntry: { findMany: async () => [] },
    responsibilityCompensationAllocation: { updateMany: async () => ({ count: 0 }) },
    responsibilityCase: {
      upsert: async args => { const { create } = args; writes.push(['case-upsert', args]);
        if (!cases.has(create.id)) cases.set(create.id, create); return cases.get(create.id) },
      findUnique: async ({ where }) => cases.get(where.id),
    },
    responsibilityEvidenceVersion: { upsert: async args => ({ id: 'ev', ...args.create }) },
    responsibilityAdjudicationWork: { upsert: async args => { writes.push(['work', args]); return { id: 'w', ...args.create } } },
  }
  return { tx, writes, cases }
}

test('incident collector preserves observation versus receipt, routes, delivery and real commitments without causal claims', async () => {
  const observedAt = new Date(now - 120_000)
  const location = { latitude: 28.6, longitude: 77.2, observedAt, receivedAt: now, accuracyMeters: 5, updatedAt: now }
  const routes = [{ id: 'r', calculatedAt: observedAt, receivedAt: now, trafficDurationSeconds: 1800 }]
  const notifications = [{ id: 'n', attemptedAt: observedAt, providerStatusAt: observedAt,
    providerStatusReceivedAt: now, status: 'delivered' }]
  const commitments = [{ id: 'next', scheduledAt: now, status: 'assigned' }]
  const f = fixture({ location, driver: { isOnline: false }, routes, notifications, commitments })
  const incident = await recordCustomerLifecycleIncident(f.tx, { booking, caseType: 'DRIVER_LATE', sourceKey: 'late',
    trigger: { fault: 'UNDETERMINED' }, now })
  const rows = incident.evidenceSnapshot.timeline
  assert.equal(rows.filter(row => row.category === 'notification').length, 1)
  assert.equal(rows.some(row => row.kind === 'delivery_history_unavailable'), false)
  const gps = rows.find(row => row.category === 'location')
  assert.equal(gps.observedAt, observedAt.toISOString()); assert.equal(gps.receivedAt, now.toISOString())
  assert.equal(gps.quality.stale, true); assert.equal(gps.value.observedAt, observedAt.toISOString())
  assert.equal(gps.quality.invalid, false); assert.equal(gps.quality.provenance, 'present')
  assert.equal(rows.find(row => row.category === 'routing').source, 'route_observation:r')
  assert.equal(rows.find(row => row.category === 'notification').source, 'notification_delivery:n')
  assert.equal(rows.find(row => row.category === 'connectivity').quality.reachability, 'UNKNOWN')
  assert.deepEqual(rows.find(row => row.category === 'feasibility').value,
    { driverId: 'd', commitments: [{ ...commitments[0], scheduledAt: now.toISOString() }], assessment: 'UNASSESSED' })
  assert.equal(incident.state, 'NEEDS_ADMIN_REVIEW')
  assert.deepEqual(f.writes.find(row => row[0] === 'location-read')[1], { where: { driverId: 'd' } })
  assert.deepEqual(f.writes.find(row => row[0] === 'driver-read')[1], { where: { id: 'd' }, select: { isOnline: true } })
  assert.deepEqual(f.writes.find(row => row[0] === 'route-read')[1], { where: { bookingId: 'b', receivedAt: { lte: now } },
    orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }] })
  assert.deepEqual(f.writes.find(row => row[0] === 'notification-read')[1], { where: { bookingId: 'b', attemptedAt: { lte: now } },
    orderBy: [{ attemptedAt: 'asc' }, { id: 'asc' }] })
  assert.deepEqual(f.writes.find(row => row[0] === 'commitment-read')[1], { where: { driverId: 'd', id: { not: 'b' },
    status: { in: ['assigned', 'en_route', 'reached', 'started', 'confirmed'] } },
    select: { id: true, status: true, scheduledAt: true, driverAssignedAt: true, startedAt: true, expectedPickupAt: true }, orderBy: { id: 'asc' } })
  assert.deepEqual(rows.find(row => row.category === 'booking').value, { bookingId: 'b', userId: 'u', status: 'assigned',
    scheduledAt: booking.scheduledAt.toISOString(), confirmedAt: booking.confirmedAt.toISOString() })
  assert.deepEqual(rows.find(row => row.category === 'assignment').value, { driverId: 'd',
    driverAssignedAt: booking.driverAssignedAt.toISOString(), expectedPickupAt: booking.expectedPickupAt.toISOString(), reachedAt: null })
  assert.deepEqual(rows.find(row => row.category === 'routing'), { id: 'ev_0006', category: 'routing', kind: 'persisted_route_observation',
    value: { ...routes[0], calculatedAt: observedAt.toISOString(), receivedAt: now.toISOString() }, source: 'route_observation:r',
    basis: 'direct', derivedFrom: [], availability: 'available', claimKey: null, observedAt: observedAt.toISOString(),
    receivedAt: now.toISOString(), quality: {} })
  assert.equal(incident.scheduledAt, booking.scheduledAt); assert.equal(incident.occurredAt, now)
  assert.deepEqual(f.writes.find(row => row[0] === 'case-upsert')[1], { where: { id: 'late' }, update: {}, create: incident })
  const queued = f.writes.find(row => row[0] === 'work')[1].create
  assert.equal(queued.caseId, 'late'); assert.equal(queued.evidenceVersionId, 'ev'); assert.equal(queued.status, 'PENDING')
  const accepted = fixture({ notifications: [{ id: 'accepted', attemptedAt: observedAt,
    providerStatusAt: null, providerStatusReceivedAt: null, status: 'accepted' }] })
  const acceptedCase = await recordCustomerLifecycleIncident(accepted.tx, { booking, caseType: 'DRIVER_LATE',
    sourceKey: 'accepted', trigger: {}, now })
  const notification = acceptedCase.evidenceSnapshot.timeline.find(row => row.category === 'notification')
  assert.equal(notification.observedAt, observedAt.toISOString())
  assert.equal(notification.receivedAt, observedAt.toISOString())
  const duplicate = await recordCustomerLifecycleIncident(f.tx, { booking: { ...booking, status: 'completed' },
    caseType: 'DRIVER_LATE', sourceKey: 'late', trigger: {}, now: new Date(now.getTime() + 1000) })
  assert.deepEqual(duplicate, incident, 'duplicate cannot replace the immutable first snapshot')
})

test('missing, future, receipt-only, fresh and unassigned facts keep exact unknown boundaries', async () => {
  for (const location of [null, { receivedAt: new Date(now.getTime() + 1), observedAt: now },
    { observedAt: now, receivedAt: null }, { receivedAt: now, observedAt: null },
    { receivedAt: now, observedAt: new Date(now.getTime() + 1) },
    { receivedAt: now, observedAt: now, accuracyMeters: 101 },
    { receivedAt: now, observedAt: now, accuracyMeters: -1 }]) {
    const f = fixture({ location, notifications: [{ id: 'future', attemptedAt: now,
      providerStatusReceivedAt: new Date(now.getTime() + 1) }] })
    const evidence = createResponsibilityEvidence({ caseId: 'c', caseType: 'DRIVER_LATE', bookingId: 'b', clock })
    await appendLifecycleObservations(f.tx, evidence, { booking, driverId: 'd', now })
    const rows = evidence.snapshot().timeline
    assert.ok(rows.every(row => row.kind !== 'persisted_notification_delivery'))
    if (!location || location.receivedAt > now) assert.equal(rows.find(row => row.category === 'location').availability, 'unknown')
    if (location?.accuracyMeters === 101 || location?.accuracyMeters === -1) assert.equal(rows.find(row => row.category === 'location').quality.invalid, true)
  }
  const f = fixture()
  const incident = await recordCustomerLifecycleIncident(f.tx, { booking: { ...booking, driverId: null,
    scheduledAt: null, confirmedAt: null, driverAssignedAt: null, expectedPickupAt: null, reachedAt: now },
    caseType: 'RIDER_CANCELLATION', sourceKey: 'rider:b', trigger: {}, now })
  const assignment = incident.evidenceSnapshot.timeline.find(row => row.category === 'assignment').value
  assert.equal(assignment.driverId, null); assert.equal(assignment.reachedAt, now.toISOString())
  assert.equal(f.writes.filter(row => row[0] === 'location-read').length, 0)
  const missing = incident.evidenceSnapshot.timeline
  assert.equal(missing.find(row => row.category === 'location').source, 'driver_location:unassigned')
  assert.equal(missing.find(row => row.category === 'connectivity').source, 'driver:unassigned')
  assert.equal(missing.find(row => row.category === 'feasibility').source, 'driver_commitments:unassigned')
  assert.deepEqual(missing.find(row => row.category === 'feasibility').value,
    { driverId: null, commitments: [], assessment: 'UNASSESSED' })
  for (const category of ['routing', 'notification']) {
    const value = missing.find(row => row.category === category)
    assert.equal(value.availability, 'unknown'); assert.equal(value.value, null); assert.equal(value.source, 'booking:b')
    assert.equal(value.kind, category === 'routing' ? 'route_history_unavailable' : 'delivery_history_unavailable')
  }
  for (const caseType of ['FAILED_PICKUP', 'DRIVER_OFFLINE', 'PLATFORM_ASSIGNMENT_FAILURE', 'REPLACEMENT_FAILURE', 'DRIVER_CANCELLATION']) {
    await assert.rejects(recordCustomerLifecycleIncident({}, { caseType }), /UNSUPPORTED_LIFECYCLE_DETECTOR/)
  }
})

test('customer cancellation collector is atomic with committed movement and uses the existing financial service', async () => {
  const rejected = fixture({ moved: 0 })
  assert.equal(await cancelCustomerWithEvidenceInTransaction(rejected.tx, { booking, cancellationCharge: 0 }, { clock }), false)
  assert.equal(rejected.cases.size, 0)
  const f = fixture()
  assert.equal(await cancelCustomerWithEvidenceInTransaction(f.tx, { booking, cancellationCharge: 0 }, { clock }), true)
  assert.equal(f.cases.get('rider-cancellation:b').caseType, 'RIDER_CANCELLATION')
  assert.equal(f.cases.get('rider-cancellation:b').evidenceSnapshot.timeline.find(row => row.category === 'cancellation').value.reason, null)
  assert.deepEqual(f.cases.get('rider-cancellation:b').evidenceSnapshot.timeline.find(row => row.category === 'cancellation').value,
    { initiator: 'rider', reason: null, transition: 'cancelled' })
  const f2 = fixture()
  assert.equal(await cancelCustomerWithEvidenceInTransaction(f2.tx, { booking, cancellationCharge: 0,
    cancellationReason: 'driver_asked_to_cancel' }, { location: { bookingId: 'b' }, route: { bookingId: 'b' } }), true)
  assert.deepEqual(f2.writes.find(row => row[0] === 'location')[1].data, { bookingId: 'b' })
  assert.deepEqual(f2.writes.find(row => row[0] === 'route')[1].data, { bookingId: 'b' })
})

test('late customer recovery uses the existing inclusive ten-minute threshold, owner and status CAS', async () => {
  for (const row of [{ ...booking, driverId: null }, { ...booking, driver: null },
    { ...booking, driver: { id: 'foreign' } }, { ...booking, status: 'reached' },
    { ...booking, expectedPickupAt: new Date(booking.expectedPickupAt.getTime() + 1) }]) {
    const f = fixture()
    assert.equal(await requestLateDriverRecoveryInTransaction(f.tx, row, { clock }), false)
    assert.equal(f.writes.length, 0)
  }
  const stale = fixture({ moved: 0 })
  assert.equal(await requestLateDriverRecoveryInTransaction(stale.tx, booking, { clock }), false)
  assert.equal(stale.cases.size, 0)
  for (const scheduledAt of [booking.scheduledAt, null]) {
    const f = fixture()
    assert.equal(await requestLateDriverRecoveryInTransaction(f.tx, { ...booking, scheduledAt, driverAssignedAt: null }, { clock }), true)
    assert.equal(f.writes.find(row => row[0] === 'booking')[1].data.status, scheduledAt ? 'confirmed' : 'pending')
    assert.equal([...f.cases.values()][0].evidenceSnapshot.timeline.find(row => row.category === 'progress').value.fault, 'UNDETERMINED')
  }
  const f = fixture()
  assert.equal(await requestLateDriverRecoveryInTransaction(f.tx, booking, { clock }), true)
  const update = f.writes.find(row => row[0] === 'booking')[1]
  assert.deepEqual(update.where, { id: 'b', driverId: 'd', status: 'assigned', expectedPickupAt: booking.expectedPickupAt })
  assert.equal([...f.cases.values()][0].sourceKey, 'late-driver-recovery:b:d:2026-10-09T08:00:00.000Z')
  assert.deepEqual(update.data, { status: 'confirmed', driverId: null, driverAssignedAt: null, expectedPickupAt: null })
  assert.deepEqual(f.writes.find(row => row[0] === 'offers')[1], { where: { bookingId: 'b', status: 'pending' },
    data: { status: 'withdrawn', respondedAt: now } })
  assert.deepEqual(f.writes.find(row => row[0] === 'capacity')[1], { where: { id: 'd' }, data: { vehicleCapacity: 4 } })
  assert.deepEqual([...f.cases.values()][0].evidenceSnapshot.timeline.find(row => row.category === 'progress').value,
    { initiator: 'rider', transition: 'late_driver_recovery', previousDriverId: 'd',
      previousAssignedAt: booking.driverAssignedAt.toISOString(), fault: 'UNDETERMINED' })
  assert.equal(await requestLateDriverRecoveryInTransaction(fixture().tx, { ...booking, expectedPickupAt: new Date(0) }), true)
})

test('reservation handoff requires the exact original owner and committed recovery identity', async () => {
  const sourceKey = 'late-driver-recovery:b:d:2026-10-09T08:00:00.000Z'
  const row = { sourceKey, evidenceSnapshot: { timeline: [
    { kind: 'booking', value: { driverId: 'unrelated' } },
    { kind: 'assignment_at_customer_transition', value: { driverId: 'd', expectedPickupAt: '2026-10-09T08:00:00.000Z' } },
    { kind: 'committed_customer_transition', value: { previousDriverId: 'd', transition: 'late_driver_recovery' } },
  ] } }
  const queries = []
  const tx = { driverCancellation: { findFirst: async args => { queries.push(args); return null } },
    responsibilityCase: { findMany: async args => { queries.push(args); return [row] } } }
  assert.equal(await hasScheduledReservationHandoff(tx, 'b', 'd'), true)
  assert.deepEqual(queries, [{ where: { bookingId: 'b', driverId: 'd' } },
    { where: { bookingId: 'b', caseType: 'DRIVER_LATE' }, select: { sourceKey: true, evidenceSnapshot: true } }])
  for (const change of [
    value => { value.sourceKey = 'foreign' }, value => { value.evidenceSnapshot.timeline[1].value.driverId = 'foreign' },
    value => { value.evidenceSnapshot.timeline[2].value.previousDriverId = 'foreign' },
    value => { value.evidenceSnapshot.timeline[2].value.transition = 'timeout' },
    value => { value.evidenceSnapshot.timeline = [] },
    value => { value.evidenceSnapshot.timeline[2].value = undefined },
    value => { value.evidenceSnapshot.timeline.splice(2) },
  ]) {
    const altered = structuredClone(row); change(altered)
    assert.equal(await hasScheduledReservationHandoff({ ...tx, responsibilityCase: { findMany: async () => [altered] } }, 'b', 'd'), false)
  }
  assert.equal(await hasScheduledReservationHandoff({ driverCancellation: { findFirst: async () => ({ id: 'c' }) } }, 'b', 'd'), true)
})

test('real GPS write service preserves speed/bearing, unknown observations and independent receipt time', async () => {
  for (const previous of [null, { latitude: 28.6, longitude: 77.2, updatedAt: new Date(now - 2000) },
    { latitude: 28.6, longitude: 77.2, updatedAt: now }]) {
    let written
    const reads = []
    const db = { driverLocation: { findUnique: async args => { reads.push(args); return previous },
      upsert: async args => { written = args; return args.create } } }
    const result = await storeDriverLocation(db, 'd', { lat: 28.601, lng: 77.201, observedAt: now.getTime() - 120_000,
      accuracyMeters: 20 }, now)
    assert.equal(result.receivedAt, now); assert.equal(result.observedAt.getTime(), now.getTime() - 120_000)
    const { driverId: _driverId, ...data } = result
    assert.deepEqual(written.update, data)
    assert.deepEqual(reads, [{ where: { driverId: 'd' } }]); assert.deepEqual(written.where, { driverId: 'd' })
    assert.equal(result.speedKmh === null, !previous || previous.updatedAt.getTime() === now.getTime())
    if (previous) assert.ok(result.bearing >= 0 && result.bearing < 360)
    if (previous && previous.updatedAt < now) assert.ok(Math.abs(result.speedKmh - 532.6941963698412 / ((now - previous.updatedAt) / 1000)) < 0.001)
    if (previous) assert.ok(Math.abs(result.bearing - 41.28220734053525) < 0.0000001)
  }
  const db = { driverLocation: { findUnique: async () => null, upsert: async args => args.create } }
  assert.equal((await storeDriverLocation(db, 'd', { lat: 28.6, lng: 77.2 })).observedAt, null)
})

test('GPS reliability preserves exact age boundaries and never replaces a historical receipt with collection time', async () => {
  for (const ageMs of [null, -1, 0, 1, 30_000, 30_001]) {
    const receivedAt = new Date(now.getTime() - 10)
    const location = { latitude: 28.6, longitude: 77.2, observedAt: ageMs === null ? null : new Date(now.getTime() - ageMs),
      receivedAt, accuracyMeters: 5 }
    const f = fixture({ location, driver: { isOnline: true } })
    const incident = await recordCustomerLifecycleIncident(f.tx, { booking, caseType: 'DRIVER_LATE', sourceKey: 'gps', trigger: {}, now })
    const row = incident.evidenceSnapshot.timeline.find(item => item.category === 'location')
    assert.equal(row.kind, 'location_snapshot_at_incident'); assert.equal(row.source, 'driver_location:d')
    assert.equal(row.quality.stale, ageMs === null || ageMs < 0 || ageMs > 30_000)
    assert.equal(row.quality.ageMs, ageMs); assert.equal(row.quality.observationTimeKnown, ageMs !== null)
    assert.equal(row.receivedAt, receivedAt.toISOString()); assert.equal(row.availability, 'available')
    const connectivity = incident.evidenceSnapshot.timeline.find(item => item.category === 'connectivity')
    assert.equal(connectivity.source, 'driver:d'); assert.equal(connectivity.availability, 'available')
    assert.deepEqual(connectivity.quality, { reachability: 'UNKNOWN', historicalConnectivity: 'UNAVAILABLE' })
    assert.equal(incident.evidenceSnapshot.timeline.find(item => item.category === 'feasibility').source, 'driver_commitments:d')
  }
})

test('GPS reliability preserves inclusive accuracy limits and distinguishes missing receipt provenance', async () => {
  for (const accuracyMeters of [0, 100, 100.001, -0.001]) {
    const location = { latitude: 28.6, longitude: 77.2, observedAt: now, receivedAt: now, accuracyMeters }
    const f = fixture({ location })
    const incident = await recordCustomerLifecycleIncident(f.tx, { booking, caseType: 'DRIVER_LATE', sourceKey: 'accuracy', trigger: {}, now })
    const gps = incident.evidenceSnapshot.timeline.find(row => row.category === 'location')
    assert.equal(gps.quality.invalid, accuracyMeters < 0 || accuracyMeters > 100)
  }
  const f = fixture({ location: { observedAt: now, receivedAt: null, accuracyMeters: 5 } })
  const incident = await recordCustomerLifecycleIncident(f.tx, { booking, caseType: 'DRIVER_LATE', sourceKey: 'receipt', trigger: {}, now })
  assert.equal(incident.evidenceSnapshot.timeline.find(row => row.category === 'location').quality.provenance, 'missing')
})
