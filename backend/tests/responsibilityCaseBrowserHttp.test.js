import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { clerkMiddleware } from '@clerk/express'
import { createBrowserAuth, browserPublishableKey } from './helpers/phase9BrowserAuth.js'
import { installLiveSessionFake } from './helpers/liveSessionFake.js'

test('case-list HTTP requires an active signed admin session before reading any metadata', async t => {
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/rcs_test'
  process.env.CLERK_PUBLISHABLE_KEY = browserPublishableKey
  process.env.CLERK_SECRET_KEY = 'sk_test_phase9_synthetic_only'
  const actors = { admin: { id: 'browser_admin', clerkId: 'user_browser_admin', name: 'Synthetic admin', role: 'admin' },
    customer: { id: 'browser_customer', clerkId: 'user_browser_customer', name: 'Synthetic rider', role: 'customer' } }
  let reads = 0
  globalThis.prisma = { responsibilityCase: { findMany: async () => { reads++; return [] }, count: async () => { reads++; return 0 } } }
  const auth = createBrowserAuth(actors), live = installLiveSessionFake(actors)
  t.after(() => live.restore())
  const app = express()
  app.use(clerkMiddleware({ publishableKey: browserPublishableKey, secretKey: 'sk_test_phase9_synthetic_only', jwtKey: auth.jwtKey }))
  const { default: router } = await import('../routes/responsibilityAdmin.ts')
  app.use('/api/admin/responsibility', router)
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'Synthetic request failed' }))
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const url = `http://127.0.0.1:${server.address().port}/api/admin/responsibility/cases`
  const send = (actor, suffix = '', overrides) => fetch(url + suffix, { headers: actor ? { Authorization: `Bearer ${auth.token(actors[actor], overrides)}` } : {} })
  assert.equal((await send(null)).status, 401)
  assert.equal((await send('customer')).status, 403)
  assert.equal((await send('admin', '', { exp: 1 })).status, 401)
  assert.equal(reads, 0)
  assert.equal((await send('admin', '?limit=1000')).status, 400)
  assert.equal((await send('admin', '?cursor=garbage')).status, 400)
  assert.equal(reads, 0)
  const response = await send('admin')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { items: [], total: 0, limit: 5, nextCursor: null })
  assert.equal(reads, 2)
  live.sessions.get('sess_browser_admin').status = 'revoked'
  assert.equal((await send('admin')).status, 401)
  assert.equal(reads, 2)
})
