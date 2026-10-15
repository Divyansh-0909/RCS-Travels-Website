import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyntheticLocation } from '../../tools/phase9-native/synthetic-location-core.mjs'

const fixture = () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi',
  fix: { timestamp: 1000, coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } })
test('synthetic location never reads a position before permission and preserves observed timestamps/accuracy', async () => {
  let reads = 0, granted = false
  const value = fixture()
  const location = createSyntheticLocation({ permission: async () => ({ granted }), read: async () => { reads++; return value } })
  await assert.rejects(location.getCurrentPositionAsync(), { message: 'Foreground permission denied' })
  assert.equal(await location.getLastKnownPositionAsync(), null)
  assert.equal(reads, 0)
  granted = true
  assert.equal(await location.getCurrentPositionAsync(), value.fix)
  assert.equal((await location.getLastKnownPositionAsync()).timestamp, 1000)
  const originalSchedule = globalThis.setInterval, originalCancel = globalThis.clearInterval
  let scheduled, cancelled
  globalThis.setInterval = (callback, delay) => { assert.equal(typeof callback, 'function'); assert.equal(delay, 1000); scheduled = 9; return scheduled }
  globalThis.clearInterval = handle => { cancelled = handle }
  try {
    const defaults = createSyntheticLocation({ permission: async () => ({ granted: true }), read: async () => value })
    const watch = await defaults.watchPositionAsync({}, () => {})
    watch.remove(); assert.equal(cancelled, scheduled)
  } finally { globalThis.setInterval = originalSchedule; globalThis.clearInterval = originalCancel }
  assert.equal(await location.hasStartedLocationUpdatesAsync(), false)
  await assert.rejects(location.startLocationUpdatesAsync(), { message: 'Native background GPS collection disabled in this synthetic fixture' })
  await location.stopLocationUpdatesAsync()
})
test('synthetic location fails closed for unknown, unavailable, malformed and out-of-area fixtures', async () => {
  const valid = fixture()
  for (const value of [{ ...valid, schema: 'wrong' }, { ...valid, source: 'personal' }, { ...valid, unavailable: true },
    { ...valid, fix: null }, { ...valid, fix: { timestamp: 1000 } }, ...['timestamp', 'accuracy', 'latitude', 'longitude'].map(field => {
      const value = structuredClone(valid); if (field === 'timestamp') value.fix.timestamp = NaN; else value.fix.coords[field] = NaN; return value
    }), ...[[28.49, 77.2], [28.81, 77.2], [28.6, 77.09], [28.6, 77.41]].map(([latitude, longitude]) => ({
      ...valid, fix: { ...valid.fix, coords: { ...valid.fix.coords, latitude, longitude } } }))]) {
    const location = createSyntheticLocation({ permission: async () => ({ granted: true }), read: async () => value })
    const message = value.schema !== valid.schema || value.source !== valid.source ? 'Unknown GPS fixture'
      : value.unavailable ? 'Synthetic location unavailable' : 'GPS fixture outside synthetic boundary'
    await assert.rejects(location.getCurrentPositionAsync(), error => error.name === 'Error' && error.message === message)
  }
  for (const [latitude, longitude] of [[28.5, 77.1], [28.8, 77.4]]) {
    const value = { ...valid, fix: { ...valid.fix, coords: { ...valid.fix.coords, latitude, longitude } } }
    const location = createSyntheticLocation({ permission: async () => ({ granted: true }), read: async () => value })
    assert.equal(await location.getCurrentPositionAsync(), value.fix)
  }
})
test('synthetic watcher suppresses unavailable fixes and cancellation prevents late observations', async () => {
  let next, cancelled, unavailable = false
  const observed = [], value = fixture()
  const location = createSyntheticLocation({ permission: async () => ({ granted: true }),
    read: async () => ({ ...value, unavailable }), schedule: callback => { next = callback; return 7 }, cancel: handle => { cancelled = handle } })
  const watch = await location.watchPositionAsync({}, fix => observed.push(fix))
  assert.equal(observed.length, 1)
  unavailable = true; await next(); assert.equal(observed.length, 1)
  unavailable = false; await next(); assert.equal(observed.length, 2)
  watch.remove(); assert.equal(cancelled, 7)
  await next(); assert.equal(observed.length, 2)
})
