import assert from 'node:assert/strict'
import test from 'node:test'
import { apiMatchKey, joinApiPaths, normalizeApiPath, shouldScan, stableUnique } from '../scripts/atlas-core.mjs'

test('normalizes client templates and query strings to route parameters', () => {
  assert.equal(normalizeApiPath('/api/bookings/${encodeURIComponent(bookingId)}/complaint?preview=1'), '/api/bookings/:bookingId/complaint')
  assert.equal(normalizeApiPath('/api/driver/rides/${id}/status'), '/api/driver/rides/:id/status')
})

test('matches client and Express parameter names independently', () => {
  assert.equal(apiMatchKey('patch', '/api/driver/rides/:id/status'), apiMatchKey('PATCH', '/api/driver/rides/:bookingId/status'))
  assert.equal(joinApiPaths('/api/bookings', '/:id/share'), '/api/bookings/:id/share')
})

test('scanner excludes generated, secret, asset, migration, and dependency paths', () => {
  assert.equal(shouldScan('frontend/src/App.jsx'), true)
  assert.equal(shouldScan('backend/.env'), false)
  assert.equal(shouldScan('backend/.env.example'), false)
  assert.equal(shouldScan('frontend/src/theme.generated.css'), false)
  assert.equal(shouldScan('backend/prisma/migrations/1/migration.ts'), false)
  assert.equal(shouldScan('driver-app/src/assets/icon.js'), false)
  assert.equal(shouldScan('frontend/node_modules/pkg/index.js'), false)
})

test('deduplication is deterministic and keeps the first relationship', () => {
  const result = stableUnique([{ id: 'b', value: 2 }, { id: 'a', value: 1 }, { id: 'a', value: 9 }])
  assert.deepEqual(result, [{ id: 'a', value: 1 }, { id: 'b', value: 2 }])
})
