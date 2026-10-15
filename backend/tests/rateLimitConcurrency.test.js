import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { createApiLimiters, createLimiter } from '../middleware/rateLimit.js'

const sharedProxyIp = '198.51.100.42'
const readPaths = [
  '/api/users/me',
  '/api/admin/drivers/driver-42/documents',
  '/api/admin/finance',
  '/api/bookings/my-bookings',
  '/api/driver/rides',
]

async function withServer(app, run) {
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  try {
    return await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

function fixtureApp(limits) {
  const app = express()
  app.set('trust proxy', 1)
  app.use((req, _res, next) => {
    // Test-only stand-in for the identity supplied by the auth middleware.
    req.auth = { userId: req.get('x-test-user') || null }
    next()
  })
  app.use('/api', limits.read, limits.write, limits.location)
  for (const path of readPaths) app.get(path, (_req, res) => res.json({ ok: true }))
  app.post('/api/bookings', (_req, res) => res.json({ ok: true }))
  app.post('/api/driver/location', (_req, res) => res.json({ ok: true }))
  return app
}

async function request(url, path, { method = 'GET', user } = {}) {
  return fetch(`${url}${path}`, {
    method,
    headers: { 'x-test-user': user, 'x-forwarded-for': sharedProxyIp },
  })
}

async function statuses(requests) {
  return Promise.all((await Promise.all(requests)).map(response => response.status))
}

function count(values, expected) {
  return values.filter(value => value === expected).length
}

test('normal protected traffic keeps two admins, a rider, and a driver isolated behind one proxy IP', async () => {
  const limits = createApiLimiters({
    getUserId: req => req.auth.userId,
    readLimit: readPaths.length,
  })

  await withServer(fixtureApp(limits), async url => {
    const identities = ['admin-a', 'admin-b', 'rider-a', 'driver-a']
    const results = await Promise.all(identities.map(async user => ({
      user,
      codes: await statuses(readPaths.map(path => request(url, path, { user }))),
    })))

    for (const { user, codes } of results) {
      assert.equal(count(codes, 200), readPaths.length, `${user} normal requests`)
      assert.equal(count(codes, 429), 0, `${user} normal requests`)
    }
  })
})

test('a parallel read burst consumes exactly one admin shared quota without affecting other identities', async () => {
  const quota = 8
  const burstSize = 20
  const limits = createApiLimiters({ getUserId: req => req.auth.userId, readLimit: quota })

  await withServer(fixtureApp(limits), async url => {
    const burstCodes = await statuses(Array.from(
      { length: burstSize },
      (_, index) => request(url, readPaths[index % readPaths.length], { user: 'admin-a' }),
    ))
    assert.equal(count(burstCodes, 200), quota)
    assert.equal(count(burstCodes, 429), burstSize - quota)

    const unaffected = await Promise.all(['admin-b', 'rider-a', 'driver-a'].map(async user => ({
      user,
      codes: await statuses(readPaths.slice(0, 3).map(path => request(url, path, { user }))),
    })))
    for (const { user, codes } of unaffected) {
      assert.equal(count(codes, 200), 3, `${user} remains isolated from admin-a burst`)
      assert.equal(count(codes, 429), 0, `${user} remains isolated from admin-a burst`)
    }
  })
})

test('concurrent Promise.all clients receive independent exact quotas on the same endpoint', async () => {
  const quota = 7
  const users = ['admin-a', 'admin-b', 'rider-a', 'driver-a']
  const limits = createApiLimiters({ getUserId: req => req.auth.userId, readLimit: quota })

  await withServer(fixtureApp(limits), async url => {
    const workerResults = await Promise.all(users.map(async user => ({
      user,
      codes: await statuses(Array.from(
        { length: quota + 3 },
        () => request(url, '/api/bookings/my-bookings', { user }),
      )),
    })))

    for (const { user, codes } of workerResults) {
      assert.equal(count(codes, 200), quota, `${user} exact concurrent allowance`)
      assert.equal(count(codes, 429), 3, `${user} exact concurrent excess`)
    }
  })
})

test('write and driver-location quotas are isolated for the same identity', async () => {
  const limits = createApiLimiters({
    getUserId: req => req.auth.userId,
    readLimit: 2,
    writeLimit: 2,
    locationLimit: 2,
  })

  await withServer(fixtureApp(limits), async url => {
    const user = 'driver-a'
    const writeCodes = await statuses(Array.from({ length: 3 }, () => request(url, '/api/bookings', { method: 'POST', user })))
    const locationCodes = await statuses(Array.from({ length: 3 }, () => request(url, '/api/driver/location', { method: 'POST', user })))
    const readCodes = await statuses(Array.from({ length: 2 }, () => request(url, '/api/driver/rides', { user })))

    assert.deepEqual([count(writeCodes, 200), count(writeCodes, 429)], [2, 1])
    assert.deepEqual([count(locationCodes, 200), count(locationCodes, 429)], [2, 1])
    assert.deepEqual([count(readCodes, 200), count(readCodes, 429)], [2, 0])
  })
})

test('a short-window limiter accepts traffic again after its cooldown', async () => {
  const app = express()
  app.use(createLimiter({ policy: 'cooldown-test', windowMs: 500, limit: 1, keyGenerator: req => req.get('x-test-user') }))
  app.get('/cooldown', (_req, res) => res.json({ ok: true }))

  await withServer(app, async url => {
    assert.equal((await request(url, '/cooldown', { user: 'admin-a' })).status, 200)
    assert.equal((await request(url, '/cooldown', { user: 'admin-a' })).status, 429)
    await new Promise(resolve => setTimeout(resolve, 650))
    assert.equal((await request(url, '/cooldown', { user: 'admin-a' })).status, 200)
  })
})
