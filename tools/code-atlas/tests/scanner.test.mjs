import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { apiMatchKey, findCircularImportCycles, isLikelyVisibleSourceText, isSafeSourceText, joinApiPaths, normalizeApiPath, normalizeSourceText, shouldScan, stableUnique } from '../scripts/atlas-core.mjs'
import { scanProject } from '../scripts/scan-project.mjs'

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

test('normalizes user-facing source text and rejects unsafe/code-like values', () => {
  assert.equal(normalizeSourceText('  Let\'s\n get you back  on the road.  '), "Let's get you back on the road.")
  assert.equal(isSafeSourceText("Let's get you back on the road."), true)
  assert.equal(isLikelyVisibleSourceText("Let's get you back on the road."), true)
  assert.equal(isSafeSourceText('Back'), false)
  assert.equal(isSafeSourceText('Back', { allowSimpleLabel: true }), true)
  assert.equal(isSafeSourceText('/api/bookings/123'), false)
  assert.equal(isSafeSourceText('https://example.com/private'), false)
  assert.equal(isSafeSourceText('frontend/src/pages/LoginPage.jsx'), false)
  assert.equal(isSafeSourceText('process.env.DATABASE_URL'), false)
  assert.equal(isSafeSourceText('sk-proj-a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuV'), false)
})

test('indexes the login copy as a source-text occurrence with an ownership edge', async () => {
  const atlas = await scanProject(fileURLToPath(new URL('../../..', import.meta.url)))
  const text = "Let's get you back on the road."
  const node = atlas.nodes.find(item => item.type === 'sourceText' && item.path === 'frontend/src/pages/LoginPage.jsx' && item.line === 334 && item.label === text)
  assert.ok(node)
  assert.equal(node.details.kind, 'translation')
  assert.ok(atlas.edges.some(edge => edge.source === node.details.containingSymbolId && edge.target === node.id && edge.type === 'contains_text' && edge.confidence === 'confirmed'))
})

test('finds each confirmed import cycle once, in deterministic order', () => {
  const edges = [
    { source: 'file:c', target: 'file:a', type: 'imports', confidence: 'confirmed' },
    { source: 'file:a', target: 'file:b', type: 'imports', confidence: 'confirmed' },
    { source: 'file:b', target: 'file:c', type: 'imports', confidence: 'confirmed' },
    // These edges must not be mistaken for module-loader cycles.
    { source: 'file:b', target: 'file:a', type: 'imports', confidence: 'inferred' },
    { source: 'file:a', target: 'file:c', type: 'calls', confidence: 'confirmed' },
  ]
  assert.deepEqual(findCircularImportCycles(edges), [['file:a', 'file:b', 'file:c', 'file:a']])
})

test('keeps distinct cycles but removes their rotation duplicates', () => {
  const edges = [
    ['file:a', 'file:b'], ['file:b', 'file:c'], ['file:c', 'file:a'],
    ['file:a', 'file:d'], ['file:d', 'file:a'],
  ].map(([source, target]) => ({ source, target, type: 'imports', confidence: 'confirmed' }))
  assert.deepEqual(findCircularImportCycles(edges), [
    ['file:a', 'file:b', 'file:c', 'file:a'],
    ['file:a', 'file:d', 'file:a'],
  ])
})
