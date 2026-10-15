// Module configuration is isolated in a child; real route parsing and request construction remain in use.
import assert from 'node:assert/strict'
import { mock } from 'node:test'

mock.module('../../services/safeRoute.js', { namedExports: {
  hasShadyZones: () => false, decodePolyline: () => [],
} })
const { fetchRoutes } = await import('../../services/googleRoutes.js')
let body
const routes = await fetchRoutes('pickup', 'drop', { lat: NaN, lng: Infinity }, { lat: NaN, lng: Infinity }, null, {
  db: { apiUsage: { findUnique: async () => null, upsert: async () => ({}) } },
  request: async (_url, options) => { body = JSON.parse(options.body); return { json: async () => ({ routes: [{ distanceMeters: 1200 }] }) } },
  apiKey: 'offline',
})
assert.equal('computeAlternativeRoutes' in body, false)
assert.deepEqual(routes[0].provenance.origin, { lat: null, lng: null })
assert.deepEqual(routes[0].provenance.destination, { lat: null, lng: null })
mock.restoreAll()
