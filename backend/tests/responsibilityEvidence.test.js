import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestClock } from './helpers/testClock.js'
import { createRoutingEvidence } from './helpers/routingEvidence.js'
import { createLocationEvidence, pickupProgress } from './helpers/locationEvidence.js'
import { createConnectivityEvidence, connectivityState } from './helpers/connectivityEvidence.js'
import { createNotificationSink } from './helpers/notificationSink.js'
import { createResponsibilityEvidence, evidenceCategory, responsibilityCaseType } from './helpers/responsibilityEvidence.js'

const start = '2026-09-25T06:00:00.000Z'
const pickup = { lat: 28.6, lng: 77.2 }
const driverPoint = { lat: 28.7, lng: 77.3 }

const makeCase = (caseType, options = {}) => createResponsibilityEvidence({
  caseId: `case-${caseType.toLowerCase()}`, bookingId: 'booking-1', caseType,
  clock: options.clock ?? createTestClock(start), requiredCategories: options.requiredCategories,
})

test('A: driver cancellation snapshot keeps booking, assignment, cancellation and money facts without deciding fault', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_CANCELLATION)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking',
    value: { scheduledAt: '2026-09-25T07:00:00.000Z' } })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'driver_assigned', source: 'assignment',
    value: { driverId: 'driver-1' } })
  evidence.record({ category: evidenceCategory.CANCELLATION, kind: 'driver_cancelled', source: 'booking_event',
    value: { reason: 'vehicle_issue' } })
  evidence.record({ category: evidenceCategory.PAYMENT, kind: 'advance', source: 'razorpay', value: { amountPaise: 6000 } })
  evidence.record({ category: evidenceCategory.PAYOUT, kind: 'wallet_hold', source: 'wallet', value: { amountPaise: 6000 } })
  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.deepEqual(snapshot.completeness.missing, [])
  assert.equal(snapshot.timeline.length, 5)
  assert.equal('responsibility' in snapshot, false)
})

test('B: failed pickup preserves routing, GPS provenance and notification acceptance versus delivery', async () => {
  const clock = createTestClock(start)
  const routing = createRoutingEvidence({ clock })
  const locations = createLocationEvidence({ clock })
  const connectivity = createConnectivityEvidence({ clock })
  const notifications = createNotificationSink({ clock })
  const evidence = makeCase(responsibilityCaseType.FAILED_PICKUP, { clock })
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: { at: '07:00Z' } })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: { driverId: 'driver-1' } })
  routing.setRoute({ origin: driverPoint, destination: pickup, distanceKm: 12, normalMinutes: 18, trafficMinutes: 24 })
  const route = routing.query({ origin: driverPoint, destination: pickup }).observation
  evidence.record({ category: evidenceCategory.ROUTING, kind: 'pickup_route', source: route.provider, value: route,
    observedAt: route.calculatedAt, receivedAt: route.receivedAt, quality: { cacheAgeMs: 0 } })
  const location = locations.add({ driverId: 'driver-1', latitude: driverPoint.lat, longitude: driverPoint.lng,
    accuracyMeters: 35, observedAt: '2026-09-25T06:02:00.000Z', receivedAt: '2026-09-25T06:05:00.000Z' })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: location.source, value: location,
    observedAt: location.observedAt, receivedAt: location.receivedAt, quality: { accuracyMeters: 35 } })
  connectivity.record('network', connectivityState.ONLINE)
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network', source: 'device', value: connectivity.latest('network') })
  notifications.next('accepted')
  const notice = await notifications.send({ channel: 'push', recipient: 'driver-1', type: 'pickup_warning' })
  evidence.record({ category: evidenceCategory.NOTIFICATION, kind: 'pickup_warning', source: 'push_provider', value: notice,
    observedAt: notice.attemptedAt, quality: { delivered: notice.deliveredAt !== null } })
  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.equal(snapshot.timeline.find(item => item.kind === 'gps_fix').receivedAt, '2026-09-25T06:05:00.000Z')
  assert.equal(snapshot.timeline.find(item => item.kind === 'pickup_warning').quality.delivered, false)
})

test('C: driver late case links derived progress to the direct route observations it came from', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_LATE)
  const booking = evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: { at: '07:00Z' } })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: { driverId: 'driver-1' } })
  const initial = evidence.record({ category: evidenceCategory.ROUTING, kind: 'eta', source: 'google_routes', value: { minutes: 30, distanceKm: 18 } })
  const current = evidence.record({ category: evidenceCategory.LOCATION, kind: 'route_position', source: 'device_gps', value: { minutes: 25, distanceKm: 15 } })
  evidence.record({ category: evidenceCategory.PROGRESS, kind: 'pickup_progress', source: 'test_derivation', basis: 'derived',
    derivedFrom: [initial.id, current.id], value: pickupProgress({ originalEtaMinutes: 30, currentEtaMinutes: 25,
      originalDistanceKm: 18, currentDistanceKm: 15 }) })
  const snapshot = evidence.snapshot()
  const progress = snapshot.timeline.find(item => item.kind === 'pickup_progress')
  assert.deepEqual(progress.derivedFrom, [initial.id, current.id])
  assert.equal(progress.value.etaProgressMinutes, 5)
  assert.equal(snapshot.timeline.some(item => item.id === booking.id), true)
})

test('D: driver offline case records conflicting connectivity facts and does not turn missing GPS into an offline fact', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_OFFLINE)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: {} })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network', source: 'device', claimKey: 'driver.network', value: 'offline' })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'heartbeat', source: 'server', claimKey: 'driver.network', value: 'online' })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: 'device_gps', availability: 'unknown', value: null })
  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.equal(snapshot.contradictions.length, 1)
  assert.equal(snapshot.contradictions[0].claimKey, 'driver.network')
  assert.equal(snapshot.timeline.find(item => item.kind === 'gps_fix').availability, 'unknown')
})

test('E: rider cancellation keeps cancellation, location, notification and payment evidence as separate facts', () => {
  const evidence = makeCase(responsibilityCaseType.RIDER_CANCELLATION)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'driver_assigned', source: 'assignment', value: {} })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: 'device_gps', value: { distanceMeters: 620 }, quality: { ageMs: 12_000 } })
  evidence.record({ category: evidenceCategory.CANCELLATION, kind: 'rider_cancelled', source: 'booking_event', value: { reason: 'change_of_plan' } })
  evidence.record({ category: evidenceCategory.NOTIFICATION, kind: 'cancel_notice', source: 'whatsapp', value: { state: 'accepted' } })
  evidence.record({ category: evidenceCategory.PAYMENT, kind: 'advance_state', source: 'razorpay', value: { state: 'captured' } })
  assert.equal(evidence.snapshot().completeness.complete, true)
})

test('F: platform assignment failure exposes missing and unavailable mandatory evidence explicitly', () => {
  const evidence = makeCase(responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'sweep', source: 'assignment_engine', value: { candidates: 0 } })
  let snapshot = evidence.snapshot()
  assert.deepEqual(snapshot.completeness.missing, ['feasibility'])
  evidence.record({ category: evidenceCategory.FEASIBILITY, kind: 'candidate_check', source: 'routing', availability: 'not_available',
    value: null, quality: { failureCategory: 'ROUTING_TIMEOUT' } })
  snapshot = evidence.snapshot()
  assert.deepEqual(snapshot.completeness.missing, [])
  assert.deepEqual(snapshot.completeness.unavailable, ['feasibility'])
  assert.equal(snapshot.completeness.complete, false)
})

test('G: replacement failure preserves opposing feasibility observations and external evidence', () => {
  const evidence = makeCase(responsibilityCaseType.REPLACEMENT_FAILURE)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'replacement_started', source: 'assignment_engine', value: {} })
  evidence.record({ category: evidenceCategory.FEASIBILITY, kind: 'replacement_eta', source: 'routing_a', claimKey: 'replacement.feasible', value: true })
  evidence.record({ category: evidenceCategory.FEASIBILITY, kind: 'replacement_eta', source: 'routing_b', claimKey: 'replacement.feasible', value: false })
  evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'weather', source: 'weather_provider', value: { condition: 'heavy_rain' },
    quality: { observed: true } })
  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.deepEqual(snapshot.contradictions[0].observations.map(item => item.value), [true, false])
})

test('H: snapshots are immutable, serialization is deterministic, validation rejects invalid evidence, and reset restarts IDs', () => {
  const clock = createTestClock(start)
  const evidence = makeCase(responsibilityCaseType.DRIVER_CANCELLATION, { clock, requiredCategories: [] })
  const original = { nested: { b: 2, a: 1 } }
  evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'note', source: 'fixture', value: original })
  original.nested.a = 99
  const first = evidence.snapshot()
  const serialized = evidence.serialize()
  assert.equal(first.timeline[0].value.nested.a, 1)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.timeline[0]), true)
  assert.equal(evidence.serialize(), serialized)
  assert.throws(() => { first.timeline.push({}) }, TypeError)
  assert.throws(() => evidence.record({ category: 'invalid', kind: 'x', source: 'x' }), /Unsupported evidence category/)
  assert.throws(() => evidence.record({ category: evidenceCategory.EXTERNAL, kind: '', source: 'x' }), /kind and source/)
  assert.throws(() => evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'x', source: 'x', basis: 'derived' }), /derivedFrom/)
  assert.throws(() => evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'x', source: 'x', basis: 'bad' }), /basis/)
  assert.throws(() => evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'x', source: 'x', availability: 'bad' }), /availability/)
  evidence.reset()
  const afterReset = evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'note', source: 'fixture', value: {} })
  assert.equal(afterReset.id, 'ev_0001')
  assert.equal(evidence.timeline().length, 1)
  assert.throws(() => createResponsibilityEvidence({ caseId: 'x', bookingId: 'b', caseType: 'BAD' }), /Unsupported responsibility case type/)
  assert.throws(() => createResponsibilityEvidence({ caseId: '', bookingId: 'b', caseType: responsibilityCaseType.DRIVER_LATE }), /required/)
  assert.throws(() => createResponsibilityEvidence({ caseId: 'x', bookingId: 'b', caseType: responsibilityCaseType.DRIVER_LATE,
    requiredCategories: null }), /Required evidence categories/)
})

test('quality contract: evidence categories and case requirements stay explicit', () => {
  assert.deepEqual(evidenceCategory, {
    BOOKING: 'booking', ASSIGNMENT: 'assignment', ROUTING: 'routing', LOCATION: 'location',
    CONNECTIVITY: 'connectivity', NOTIFICATION: 'notification', PAYMENT: 'payment', PAYOUT: 'payout',
    CANCELLATION: 'cancellation', FEASIBILITY: 'feasibility', PROGRESS: 'progress', EXTERNAL: 'external',
  })

  const expected = new Map([
    [responsibilityCaseType.DRIVER_CANCELLATION, ['booking', 'assignment', 'cancellation']],
    [responsibilityCaseType.FAILED_PICKUP, ['booking', 'assignment', 'routing', 'location', 'connectivity', 'notification']],
    [responsibilityCaseType.DRIVER_LATE, ['booking', 'assignment', 'routing', 'location']],
    [responsibilityCaseType.DRIVER_OFFLINE, ['booking', 'assignment', 'connectivity']],
    [responsibilityCaseType.RIDER_CANCELLATION, ['booking', 'assignment', 'cancellation', 'location']],
    [responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE, ['booking', 'assignment', 'feasibility']],
    [responsibilityCaseType.REPLACEMENT_FAILURE, ['booking', 'assignment', 'feasibility']],
  ])

  for (const [caseType, requiredCategories] of expected) {
    const completeness = makeCase(caseType).snapshot().completeness
    assert.deepEqual(completeness.requiredCategories, requiredCategories)
    assert.deepEqual(completeness.missing, requiredCategories)
    assert.deepEqual(completeness.unavailable, [])
    assert.equal(completeness.complete, false)
  }
})

test('quality contract: snapshots deep-freeze nested evidence and serialize arrays, primitives, and sorted keys stably', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_CANCELLATION, { requiredCategories: [] })
  evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'note', source: 'fixture',
    value: { z: [{ d: 4, c: 3 }, 'x', 2], a: null, b: false } })

  const snapshot = evidence.snapshot()
  assert.equal(Object.isFrozen(snapshot.timeline), true)
  assert.equal(Object.isFrozen(snapshot.timeline[0].value), true)
  assert.equal(Object.isFrozen(snapshot.timeline[0].value.z), true)
  assert.equal(Object.isFrozen(snapshot.timeline[0].value.z[0]), true)
  assert.throws(() => { snapshot.timeline[0].value.z[0].c = 9 }, TypeError)

  const expected = JSON.stringify({
    bookingId: 'booking-1',
    caseId: 'case-driver_cancellation',
    caseType: 'DRIVER_CANCELLATION',
    completeness: { complete: true, missing: [], requiredCategories: [], unavailable: [] },
    contradictions: [],
    evidenceVersion: 'responsibility-evidence-v1',
    generatedAt: start,
    occurredAt: null,
    scheduledAt: null,
    timeline: [{
      availability: 'available', basis: 'direct', category: 'external', claimKey: null, derivedFrom: [], id: 'ev_0001',
      kind: 'note', observedAt: start, quality: {}, receivedAt: start, source: 'fixture',
      value: { a: null, b: false, z: [{ c: 3, d: 4 }, 'x', 2] },
    }],
  })
  assert.equal(evidence.serialize(), expected)

  const cyclicEvidence = makeCase(responsibilityCaseType.DRIVER_CANCELLATION, { requiredCategories: [] })
  const cyclicValue = { label: 'loop' }
  cyclicValue.self = cyclicValue
  cyclicEvidence.record({ category: evidenceCategory.EXTERNAL, kind: 'cyclic_note', source: 'fixture', value: cyclicValue })
  const cyclicSnapshot = cyclicEvidence.snapshot()
  assert.equal(cyclicSnapshot.timeline[0].value.self, cyclicSnapshot.timeline[0].value)
  assert.equal(Object.isFrozen(cyclicSnapshot.timeline[0].value), true)
})

test('quality contract: contradictions ignore unavailable claims, preserve evidence IDs, and sort claim keys', () => {
  const evidence = makeCase(responsibilityCaseType.FAILED_PICKUP, { requiredCategories: [] })
  const z1 = evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network_a', source: 'device',
    claimKey: 'z.network', value: { state: 'online' } })
  const z2 = evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network_b', source: 'server',
    claimKey: 'z.network', value: { state: 'online' } })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network_unknown', source: 'server',
    claimKey: 'z.network', value: { state: 'unknown' }, availability: 'unknown' })
  const z3 = evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network_c', source: 'server',
    claimKey: 'z.network', value: { state: 'offline' } })
  const a1 = evidence.record({ category: evidenceCategory.LOCATION, kind: 'arrival_a', source: 'driver',
    claimKey: 'a.arrival', value: true })
  const a2 = evidence.record({ category: evidenceCategory.LOCATION, kind: 'arrival_b', source: 'gps',
    claimKey: 'a.arrival', value: false })
  evidence.record({ category: evidenceCategory.ROUTING, kind: 'single', source: 'routing',
    claimKey: 'single.claim', value: 1 })
  evidence.record({ category: evidenceCategory.ROUTING, kind: 'single_missing', source: 'routing',
    claimKey: 'single.claim', value: 2, availability: 'not_available' })

  assert.deepEqual(evidence.snapshot().contradictions, [
    { claimKey: 'a.arrival', observations: [
      { value: true, evidenceIds: [a1.id] },
      { value: false, evidenceIds: [a2.id] },
    ] },
    { claimKey: 'z.network', observations: [
      { value: { state: 'online' }, evidenceIds: [z1.id, z2.id] },
      { value: { state: 'offline' }, evidenceIds: [z3.id] },
    ] },
  ])
})

test('quality contract: completeness distinguishes unavailable evidence and timeline uses observation, receipt, then ID order', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_LATE, { requiredCategories: ['booking', 'routing'] })
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'late', source: 'fixture', value: {},
    observedAt: '2026-09-25T06:10:00.000Z', receivedAt: '2026-09-25T06:11:00.000Z' })
  evidence.record({ category: evidenceCategory.ROUTING, kind: 'route_unknown', source: 'fixture', value: null,
    availability: 'unknown', observedAt: '2026-09-25T06:05:00.000Z', receivedAt: '2026-09-25T06:09:00.000Z' })

  let snapshot = evidence.snapshot()
  assert.deepEqual(snapshot.completeness, {
    requiredCategories: ['booking', 'routing'], complete: false, missing: [], unavailable: ['routing'],
  })

  evidence.record({ category: evidenceCategory.ROUTING, kind: 'route_available', source: 'fixture', value: { minutes: 12 },
    observedAt: '2026-09-25T06:10:00.000Z', receivedAt: '2026-09-25T06:10:00.000Z' })
  evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'same_time', source: 'fixture', value: {},
    observedAt: '2026-09-25T06:10:00.000Z', receivedAt: '2026-09-25T06:10:00.000Z' })

  snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.deepEqual(snapshot.completeness.unavailable, [])
  assert.deepEqual(snapshot.timeline.map(item => item.kind),
    ['route_unknown', 'route_available', 'same_time', 'late'])
  assert.equal(typeof evidence.serialize(), 'string')
})

test('Scenario A: clear driver progress remains evidence when the rider cancels', () => {
  const evidence = makeCase(responsibilityCaseType.RIDER_CANCELLATION)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: { at: '07:00Z' } })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: { driverId: 'driver-1' } })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: 'device_gps', value: { distanceKm: 12 },
    quality: { ageMs: 15_000, accuracyMeters: 24 } })
  const initial = evidence.record({ category: evidenceCategory.ROUTING, kind: 'approach_eta', source: 'google_routes',
    value: { minutes: 24, distanceKm: 12 } })
  const later = evidence.record({ category: evidenceCategory.ROUTING, kind: 'approach_eta', source: 'google_routes',
    value: { minutes: 15, distanceKm: 7 } })
  evidence.record({ category: evidenceCategory.PROGRESS, kind: 'pickup_progress', source: 'test_derivation', basis: 'derived',
    derivedFrom: [initial.id, later.id], value: pickupProgress({ originalEtaMinutes: 24, currentEtaMinutes: 15,
      originalDistanceKm: 12, currentDistanceKm: 7 }) })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'network', source: 'device', value: 'online' })
  evidence.record({ category: evidenceCategory.CANCELLATION, kind: 'rider_cancelled', source: 'booking_event', value: { reason: 'change_of_plan' } })

  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.equal(snapshot.timeline.find(item => item.kind === 'pickup_progress').value.etaProgressMinutes, 9)
  assert.equal('responsibility' in snapshot, false)
})

test('Scenario B: offline, delivered warning, reconnect, and fresh GPS remain separate timeline facts', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_OFFLINE)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: {} })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'online', source: 'device', value: true,
    observedAt: '2026-09-25T06:01:00.000Z' })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'offline', source: 'device', value: true,
    observedAt: '2026-09-25T06:10:00.000Z' })
  evidence.record({ category: evidenceCategory.NOTIFICATION, kind: 'offline_warning', source: 'push_provider',
    value: { providerAccepted: true, deliveredAt: '2026-09-25T06:12:00.000Z' }, observedAt: '2026-09-25T06:11:00.000Z' })
  evidence.record({ category: evidenceCategory.CONNECTIVITY, kind: 'reconnected', source: 'device', value: true,
    observedAt: '2026-09-25T06:14:00.000Z' })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: 'device_gps', value: { distanceKm: 8 },
    observedAt: '2026-09-25T06:14:30.000Z', quality: { ageMs: 0, accuracyMeters: 18 } })

  assert.deepEqual(evidence.snapshot().timeline.map(item => item.kind),
    ['scheduled_pickup', 'accepted', 'online', 'offline', 'offline_warning', 'reconnected', 'gps_fix'])
})

test('Scenario C: routing timeout stays separate from a previously cached route', () => {
  const evidence = makeCase(responsibilityCaseType.DRIVER_LATE)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: {} })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: 'device_gps', value: driverPoint,
    quality: { ageMs: 10_000 } })
  evidence.record({ category: evidenceCategory.ROUTING, kind: 'cached_route', source: 'google_routes_cache',
    value: { minutes: 21, distanceKm: 11 }, quality: { cacheAgeMs: 45_000 } })
  evidence.record({ category: evidenceCategory.EXTERNAL, kind: 'routing_timeout', source: 'google_routes',
    availability: 'not_available', value: null, quality: { failureCategory: 'TIMEOUT' } })

  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.equal(snapshot.timeline.find(item => item.kind === 'cached_route').availability, 'available')
  assert.equal(snapshot.timeline.find(item => item.kind === 'routing_timeout').availability, 'not_available')
})

test('Scenario D: stale GPS is reported as stale evidence without inferring movement', () => {
  const evidence = makeCase(responsibilityCaseType.RIDER_CANCELLATION)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking', value: {} })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'accepted', source: 'offer', value: {} })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_fix', source: 'device_gps', value: driverPoint,
    observedAt: '2026-09-25T05:56:00.000Z', receivedAt: '2026-09-25T05:56:01.000Z',
    quality: { ageMs: 240_000, freshness: 'stale' } })
  evidence.record({ category: evidenceCategory.CANCELLATION, kind: 'rider_cancelled', source: 'booking_event', value: {} })

  const location = evidence.snapshot().timeline.find(item => item.kind === 'gps_fix')
  assert.equal(location.quality.freshness, 'stale')
  assert.equal('movement' in location.value, false)
})

test('Scenario E: reported arrival and far-away GPS are retained as an unresolved contradiction', () => {
  const evidence = makeCase(responsibilityCaseType.FAILED_PICKUP, { requiredCategories: [] })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'driver_reported_arrival', source: 'driver_action',
    claimKey: 'driver.near_pickup', value: true })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'gps_near_pickup', source: 'device_gps',
    claimKey: 'driver.near_pickup', value: false, quality: { distanceMeters: 2_400, accuracyMeters: 20 } })

  const snapshot = evidence.snapshot()
  assert.equal(snapshot.contradictions.length, 1)
  assert.deepEqual(snapshot.contradictions[0].observations.map(item => item.value), [true, false])
})

test('Scenario F: provider acceptance without a delivery receipt remains unconfirmed', async () => {
  const clock = createTestClock(start)
  const notifications = createNotificationSink({ clock })
  const evidence = makeCase(responsibilityCaseType.FAILED_PICKUP, { clock, requiredCategories: [] })
  notifications.next('accepted')
  const warning = await notifications.send({ channel: 'push', recipient: 'driver-1', type: 'offline_warning' })
  evidence.record({ category: evidenceCategory.NOTIFICATION, kind: 'offline_warning', source: 'push_provider',
    value: warning, observedAt: warning.attemptedAt, quality: { providerAccepted: warning.state === 'accepted',
      delivered: warning.deliveredAt !== null } })

  const item = evidence.snapshot().timeline[0]
  assert.equal(item.quality.providerAccepted, true)
  assert.equal(item.quality.delivered, false)
})

test('Scenario G: buffered GPS preserves device observation time and later server receipt time', () => {
  const clock = createTestClock('2026-09-25T06:28:00.000Z')
  const locations = createLocationEvidence({ clock })
  const evidence = makeCase(responsibilityCaseType.DRIVER_OFFLINE, { clock, requiredCategories: [] })
  const sample = locations.add({ driverId: 'driver-1', latitude: driverPoint.lat, longitude: driverPoint.lng,
    accuracyMeters: 30, observedAt: '2026-09-25T06:20:00.000Z', receivedAt: '2026-09-25T06:28:00.000Z' })
  evidence.record({ category: evidenceCategory.LOCATION, kind: 'buffered_gps', source: 'device_gps', value: sample,
    observedAt: sample.observedAt, receivedAt: sample.receivedAt })

  const item = evidence.snapshot().timeline[0]
  assert.equal(item.observedAt, '2026-09-25T06:20:00.000Z')
  assert.equal(item.receivedAt, '2026-09-25T06:28:00.000Z')
})

test('Scenario H: impossible-at-acceptance inputs are preserved without classifying platform fault', () => {
  const evidence = makeCase(responsibilityCaseType.PLATFORM_ASSIGNMENT_FAILURE)
  evidence.record({ category: evidenceCategory.BOOKING, kind: 'scheduled_pickup', source: 'booking',
    value: { scheduledAt: '2026-09-25T06:20:00.000Z' } })
  evidence.record({ category: evidenceCategory.ASSIGNMENT, kind: 'driver_accepted', source: 'ride_offer',
    value: { acceptedAt: '2026-09-25T06:05:00.000Z' } })
  evidence.record({ category: evidenceCategory.FEASIBILITY, kind: 'acceptance_inputs', source: 'assignment_observation',
    value: { minutesUntilPickup: 15, trafficEtaMinutes: 28, bufferMinutes: 5 },
    quality: { routeObservedAt: '2026-09-25T06:04:30.000Z' } })

  const snapshot = evidence.snapshot()
  assert.equal(snapshot.completeness.complete, true)
  assert.equal('responsibility' in snapshot, false)
  assert.equal(snapshot.timeline.find(item => item.kind === 'acceptance_inputs').value.trafficEtaMinutes, 28)
})
