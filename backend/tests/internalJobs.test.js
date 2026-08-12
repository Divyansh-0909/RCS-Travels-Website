import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

import internalRouter from '../routes/internal.js'
import { JOB_NAMES, isJobName, runJob } from '../lib/jobs.js'

// The gate on /internal/jobs, and nothing behind it.
//
// WHAT IS DELIBERATELY NOT TESTED HERE: the sweeps. Every one of them is a
// database pass, they have their own tests, and running one from here would turn
// a unit test into an integration test against whatever DATABASE_URL happens to
// point at. The thing worth pinning down is the boundary — who gets in, and what
// a misconfigured server does — because that is the part where a mistake is
// invisible rather than loud. An unauthenticated endpoint answers 200 and looks
// like it is working.
//
// The server is bound to port 0 (the OS picks a free one) so this never collides
// with a dev server on 5000, and closed in `after` so the suite exits.

const SECRET = 'test-secret-not-a-real-one-0123456789'

let baseUrl
let server

// Captured and restored: the middleware reads NODE_ENV per request precisely so
// the production branch can be exercised, and leaving it set would leak into
// every test file that runs after this one.
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  INTERNAL_JOBS_SECRET: process.env.INTERNAL_JOBS_SECRET,
  INTERNAL_JOBS_AUDIENCE: process.env.INTERNAL_JOBS_AUDIENCE,
  INTERNAL_JOBS_SERVICE_ACCOUNT: process.env.INTERNAL_JOBS_SERVICE_ACCOUNT,
}

before(async () => {
  // internalAuth.js reads DEV_SECRET at import time, and the router is already
  // imported above — so this must be the value that was set when the module
  // first loaded. tests/ runs under `node --import tsx --test`, which imports
  // this file before the router's dependencies resolve their env, but relying on
  // that ordering would be fragile. Set it here AND assert the behaviour rather
  // than the mechanism: if the secret path stops working the first test fails.
  process.env.INTERNAL_JOBS_SECRET = SECRET

  const app = express()
  app.use(express.json())
  app.use('/internal', internalRouter)

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`
      resolve()
    })
  })
})

after(() => {
  server?.close()
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const post = (path, headers = {}) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers })

describe('the job registry', () => {
  test('names exactly the three sweeps Cloud Scheduler is wired to', () => {
    // A wire contract, not an implementation detail: these strings appear in the
    // Cloud Scheduler job definitions, so renaming one here silently stops that
    // sweep until the scheduler is updated. The test exists to make the rename
    // fail loudly at the point somebody makes it.
    assert.deepEqual([...JOB_NAMES].sort(), ['dispatch', 'document-expiry', 'document-scan'])
  })

  test('refuses a name that is not on the list', async () => {
    assert.equal(isJobName('drop-everything'), false)
    await assert.rejects(() => runJob('drop-everything'), /No such job/)
  })
})

describe('the gate on /internal', () => {
  test('refuses a request with no Authorization header', async () => {
    const response = await post('/internal/jobs/dispatch')
    assert.equal(response.status, 401)
    assert.equal((await response.json()).code, 'INTERNAL_AUTH_REQUIRED')
  })

  test('refuses a bearer token that is not the secret', async () => {
    const response = await post('/internal/jobs/dispatch', { authorization: 'Bearer wrong' })
    // Falls through the dev-secret branch to the OIDC one, which has nothing
    // configured in this test — so the answer is the unconfigured 503 rather than
    // a 401. Either way it did not run the job, which is the property that
    // matters; asserting the exact code documents WHICH refusal happened.
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'INTERNAL_AUTH_UNCONFIGURED')
  })

  test('lets the dev secret through, then 404s an unknown job', async () => {
    // Both halves in one case on purpose: a 404 here proves the request cleared
    // authentication (an unauthenticated one never reaches the router's handler)
    // without running a sweep against the database.
    const response = await post('/internal/jobs/no-such-job', { authorization: `Bearer ${SECRET}` })
    assert.equal(response.status, 404)
    assert.deepEqual((await response.json()).jobs.sort(), ['dispatch', 'document-expiry', 'document-scan'])
  })

  test('reports its mode and job list to an authenticated caller', async () => {
    const response = await fetch(`${baseUrl}/internal/jobs`, {
      headers: { authorization: `Bearer ${SECRET}` },
    })
    assert.equal(response.status, 200)

    const body = await response.json()
    assert.equal(body.mode, 'interval')
    assert.deepEqual(body.jobs.sort(), ['dispatch', 'document-expiry', 'document-scan'])
  })

  test('ignores the dev secret entirely when NODE_ENV is production', async () => {
    // THE MOST IMPORTANT CASE IN THIS FILE. The dev secret is the one path that
    // could turn these endpoints into public ones, and "it is only for dev" is
    // enforced by a branch in internalAuth.js rather than by anybody remembering
    // to unset the variable. A copied .env must not open production.
    process.env.NODE_ENV = 'production'
    try {
      const response = await post('/internal/jobs/dispatch', { authorization: `Bearer ${SECRET}` })
      assert.equal(response.status, 503)
      assert.equal((await response.json()).code, 'INTERNAL_AUTH_UNCONFIGURED')
    } finally {
      if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalEnv.NODE_ENV
    }
  })

  test('refuses an OIDC token when the caller account does not match', async () => {
    // With the audience and account configured, a garbage token must fail
    // verification rather than fall through to any permissive branch. This pins
    // the ordering in internalAuth.js: verify, THEN compare the email — never
    // "no email on the token, so skip the comparison".
    process.env.NODE_ENV = 'production'
    process.env.INTERNAL_JOBS_AUDIENCE = 'https://example-service.a.run.app'
    process.env.INTERNAL_JOBS_SERVICE_ACCOUNT = 'scheduler@example.iam.gserviceaccount.com'
    try {
      const response = await post('/internal/jobs/dispatch', { authorization: 'Bearer not.a.real.token' })
      assert.equal(response.status, 401)
      assert.equal((await response.json()).code, 'INTERNAL_AUTH_REJECTED')
    } finally {
      if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalEnv.NODE_ENV
    }
  })
})
