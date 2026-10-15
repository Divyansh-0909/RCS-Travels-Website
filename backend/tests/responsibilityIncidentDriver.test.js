import test from 'node:test'
import assert from 'node:assert/strict'
import { findResponsibilityIncidentDriver } from '../services/responsibilityIncidentDriver.js'
import { createResponsibilityEvidence } from '../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'

function fixture() {
  const clock = { now: () => new Date('2026-10-11T00:00:00.000Z') }
  const builder = createResponsibilityEvidence({ caseId: 'synthetic-case', caseType: 'DRIVER_CANCELLATION', bookingId: 'booking', clock })
  for (const [category, kind, value] of [
    ['assignment', 'assigned_driver_at_cancellation', { driverId: 'original' }],
    ['cancellation', 'driver_cancellation_recorded', { cancellationId: 'cancellation', initiator: 'driver' }],
  ]) builder.record({ category, kind, source: 'synthetic-authoritative-record', observedAt: clock.now(), receivedAt: clock.now(), value })
  const evidenceSnapshot = structuredClone(builder.snapshot())
  const responsibilityCase = { id: 'synthetic-case', caseType: 'DRIVER_CANCELLATION', bookingId: 'booking',
    evidenceSnapshot, evidenceHash: responsibilityEvidenceHash(evidenceSnapshot) }
  const booking = { id: 'booking', reference: 'SYNTHETIC', driverId: 'replacement',
    driver: { id: 'replacement', name: 'Synthetic Replacement', phone: 'synthetic-replacement', fcmToken: null } }
  const committed = { bookingId: 'booking', driverId: 'original' }
  const driver = { id: 'original', name: 'Synthetic Original', phone: 'synthetic-phone', fcmToken: null }
  const project = (row, select) => Object.fromEntries(Object.entries(select).filter(([, selected]) => selected).map(([key, selected]) =>
    [key, typeof selected === 'object' ? project(row[key], selected.select) : row[key]]))
  const db = { booking: { findUnique: async ({ where, select }) => { assert.deepEqual(where, { id: 'booking' }); return project(booking, select) } },
    driverCancellation: { findUnique: async ({ where, select }) => { assert.equal(where.id, 'cancellation'); return project(committed, select) } },
    driver: { findUnique: async ({ where, select }) => { assert.equal(where.id, driver.id); return project(driver, select) } } }
  return { db, responsibilityCase, booking, committed, driver }
}
const rehash = context => { context.responsibilityCase.evidenceHash = responsibilityEvidenceHash(context.responsibilityCase.evidenceSnapshot) }
test('cancellation notice and appeal belong to the immutable incident captain after replacement or termination', async () => {
  for (const driverId of ['replacement', null]) {
    const context = fixture(); context.booking.driverId = driverId
    assert.deepEqual(await findResponsibilityIncidentDriver(context.db, context.responsibilityCase),
      { ...context.booking, driverId: 'original', driver: context.driver })
  }
})
test('legacy non-cancellation families retain their existing booking lookup boundary', async () => {
  const context = fixture(); context.responsibilityCase.caseType = 'DRIVER_LATE'
  assert.deepEqual(await findResponsibilityIncidentDriver(context.db, context.responsibilityCase), context.booking)
  context.db.booking.findUnique = async () => null
  assert.equal(await findResponsibilityIncidentDriver(context.db, context.responsibilityCase), null)
})
test('missing or corrupted evidence and ambiguous assignment cannot route an incident to a driver', async () => {
  for (const mutate of [
    context => { context.responsibilityCase.evidenceHash = 'b'.repeat(64) },
    context => { context.responsibilityCase.evidenceSnapshot = null },
    context => { context.responsibilityCase.evidenceSnapshot.timeline = []; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline.push({ ...context.responsibilityCase.evidenceSnapshot.timeline[0], id: 'duplicate' }); rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[0].basis = 'derived'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[0].availability = 'not_available'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].basis = 'derived'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].availability = 'not_available'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline.push({ ...context.responsibilityCase.evidenceSnapshot.timeline[1], id: 'duplicate' }); rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[0].value = null; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].value = null; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[0].value = {}; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].value = {}; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].value.initiator = 'rider'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.caseId = 'foreign-case'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.bookingId = 'foreign-booking'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.caseType = 'DRIVER_LATE'; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[0].value.driverId = 42; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[0].value.driverId = ' '; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].value.cancellationId = 42; rehash(context) },
    context => { context.responsibilityCase.evidenceSnapshot.timeline[1].value.cancellationId = ' '; rehash(context) },
  ]) {
    const context = fixture(); mutate(context)
    assert.equal(await findResponsibilityIncidentDriver(context.db, context.responsibilityCase), null)
  }
})
test('a matching durable row cannot make a blank incident driver identity usable', async () => {
  const context = fixture()
  context.responsibilityCase.evidenceSnapshot.timeline[0].value.driverId = ' '
  context.committed.driverId = ' '
  context.driver.id = ' '
  rehash(context)
  assert.equal(await findResponsibilityIncidentDriver(context.db, context.responsibilityCase), null)
})
test('a durable cancellation and actual original driver must match the evidence identity', async () => {
  for (const mutate of [
    context => { context.db.driverCancellation.findUnique = async () => null },
    context => { context.committed.bookingId = 'other-booking' },
    context => { context.committed.driverId = 'replacement' },
    context => { context.db.driver.findUnique = async () => null },
  ]) {
    const context = fixture(); mutate(context)
    assert.equal(await findResponsibilityIncidentDriver(context.db, context.responsibilityCase), null)
  }
})
