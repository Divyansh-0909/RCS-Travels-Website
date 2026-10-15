import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { systemClock } from '../lib/clock.js'
import { expectedPickupAtForAssignment, isDriverDelayed } from '../services/driverDelay.js'
import { createTestClock } from './helpers/testClock.js'

test('system clock returns fresh Date instances', () => {
  const first = systemClock.now()
  const second = systemClock.now()

  assert.ok(first instanceof Date)
  assert.ok(second instanceof Date)
  assert.notEqual(first, second)
  assert.ok(Math.abs(first.getTime() - Date.now()) < 1000)
})

test('test clock sets ISO timestamps and advances by explicit milliseconds', () => {
  const clock = createTestClock('2026-09-21T08:00:00.000Z')
  clock.set('2026-09-21T09:00:00.000+00:00')
  clock.advance(30 * 60 * 1000)

  assert.equal(clock.now().toISOString(), '2026-09-21T09:30:00.000Z')
  const snapshot = clock.now()
  snapshot.setUTCFullYear(2000)
  assert.equal(clock.now().getUTCFullYear(), 2026)
})

test('clock rejects ambiguous/invalid times and leaves its instant intact after failed changes', () => {
  const clock = createTestClock('2026-09-21T08:00:00Z')
  for (const value of [undefined, null, 42, '2026-09-21T08:00:00',
    '2026-09-21 08:00:00Z', '2026-09-21t08:00:00z',
    '+002026-09-21T08:00:00Z',
    ' 2026-09-21T08:00:00Z', '2026-09-21T08:00:00Z ',
    '2026-09-21T08:00:00Z trailing', '2026-99-21T08:00:00Z',
    { toString: () => '2026-09-21T08:00:00Z' }]) {
    assert.throws(() => clock.set(value), TypeError)
  }
  for (const amount of [NaN, Infinity, -Infinity]) assert.throws(() => clock.advance(amount), TypeError)
  assert.throws(() => clock.advance(Number.MAX_VALUE), RangeError)
  assert.equal(clock.now().toISOString(), '2026-09-21T08:00:00.000Z')
  clock.advance(-30 * 60 * 1000)
  assert.equal(clock.now().toISOString(), '2026-09-21T07:30:00.000Z')
  clock.set('2026-09-21T13:00:00+05:30')
  assert.equal(clock.now().toISOString(), '2026-09-21T07:30:00.000Z')
})

test('scheduled assignment uses an injected clock when no now value is supplied', async () => {
  const clock = createTestClock('2026-09-21T08:00:00.000Z')
  const scheduledAt = new Date('2026-09-21T12:00:00.000Z')

  const result = await expectedPickupAtForAssignment({ scheduledAt }, 'unused', undefined, clock)

  assert.equal(result.toISOString(), scheduledAt.toISOString())
})

test('driver delay uses an injected clock when no now value is supplied', () => {
  const clock = createTestClock('2026-09-21T09:00:00.000Z')
  const booking = { status: 'en_route', expectedPickupAt: new Date('2026-09-21T09:20:00.000Z') }

  assert.equal(isDriverDelayed(booking, undefined, clock), false)
  clock.advance(30 * 60 * 1000)
  assert.equal(isDriverDelayed(booking, undefined, clock), true)
})

test('clock injection preserves existing pickup routing, fallback, and default-time behavior', () => {
  execFileSync(process.execPath, ['--import', 'tsx', '--experimental-test-module-mocks',
    fileURLToPath(new URL('./helpers/driverDelayProbe.mjs', import.meta.url))], { stdio: 'pipe' })
})
