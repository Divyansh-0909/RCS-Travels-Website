#!/usr/bin/env node
// Isolated middleware harness only: this is not a full-app capacity or live-load test.
// It never loads dotenv, opens a database connection, or binds beyond 127.0.0.1.
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'

process.env.NODE_ENV = 'test'

const { createApiLimiters, createOtpLimiters, createPaymentWriteLimiter } = await import('../middleware/rateLimit.js')

const MAX_REQUESTS = 400
const MAX_CONCURRENCY = 10
const BURST_REQUESTS = 300
const MAX_DURATION_MS = 45_000
const REQUEST_TIMEOUT_MS = 3_000
const startedAt = performance.now()
const runDeadline = AbortSignal.timeout(MAX_DURATION_MS)
let requestCount = 0
const latencies = []
const errors = []
const checks = []

function recordCheck(name, passed, detail) {
  checks.push({ name, passed, detail })
  if (!passed) errors.push(`${name}: ${detail}`)
}

function p95(values) {
  if (!values.length) return 0
  return values.slice().sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]
}

function percentile(values, fraction) {
  if (!values.length) return 0
  return values.slice().sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
}

function roundMs(value) {
  return Math.round(value * 100) / 100
}

async function main() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '1kb' }))

  const otp = createOtpLimiters({ sendLimit: 3, verifyLimit: 2 })
  const identity = request => request.get('x-probe-user') || null
  const api = createApiLimiters({ getUserId: identity, readLimit: 3, writeLimit: 2, locationLimit: 2 })
  const burstApi = createApiLimiters({ getUserId: identity, readLimit: BURST_REQUESTS + 10, writeLimit: 2, locationLimit: 2 })
  const payment = createPaymentWriteLimiter({ getUserId: identity, limit: 2 })

  app.post('/otp/send', otp.send, (_req, res) => res.status(200).json({ ok: true }))
  app.get('/protected/read', api.read, api.write, api.location, (_req, res) => res.status(200).json({ ok: true }))
  app.get('/probe/burst-read', burstApi.read, (_req, res) => res.status(200).json({ ok: true }))
  app.post('/protected/write', api.read, api.write, api.location, (_req, res) => res.status(200).json({ ok: true }))
  app.post('/payments/write', payment, (_req, res) => res.status(200).json({ ok: true }))
  app.post('/json', (_req, res) => res.status(200).json({ ok: true }))
  app.get('/healthy', (_req, res) => res.status(200).json({ ok: true }))
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : 400
    res.status(status).json({ error: status === 413 ? 'payload too large' : 'invalid JSON' })
  })

  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`
  let burstMetrics

  try {
    const request = async (path, { method = 'GET', headers = {}, body, measurements = latencies } = {}) => {
      assert.ok(!runDeadline.aborted, `duration cap of ${MAX_DURATION_MS}ms exceeded`)
      assert.ok(requestCount < MAX_REQUESTS, `request cap of ${MAX_REQUESTS} exceeded`)
      requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const requestStarted = performance.now()
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          body,
          signal: AbortSignal.any([controller.signal, runDeadline]),
        })
        await response.arrayBuffer()
        measurements.push(performance.now() - requestStarted)
        return response.status
      } catch (error) {
        measurements.push(performance.now() - requestStarted)
        errors.push(`request ${method} ${path}: ${error.name}`)
        return 0
      } finally {
        clearTimeout(timeout)
      }
    }

    const statuses = await Promise.all([
      request('/otp/send', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.10' }, body: JSON.stringify({ phone: '(987) 654-3210' }) }),
      request('/otp/send', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.11' }, body: JSON.stringify({ phone: '9876543210' }) }),
      request('/otp/send', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.12' }, body: JSON.stringify({ phone: '9876543210' }) }),
    ])
    const blockedWithNewIp = await request('/otp/send', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.99' }, body: JSON.stringify({ phone: '9876543210' }) })
    const differentPhone = await request('/otp/send', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.99' }, body: JSON.stringify({ phone: '9123456789' }) })
    recordCheck('OTP phone normalization and per-phone budget', statuses.every(status => status === 200), `statuses=${statuses.join(',')}`)
    recordCheck('Forwarded IP cannot evade OTP phone budget', blockedWithNewIp === 429, `status=${blockedWithNewIp}`)
    recordCheck('OTP budgets isolate different phone numbers', differentPhone === 200, `status=${differentPhone}`)

    const alphaRead = await Promise.all(Array.from({ length: 3 }, (_, index) => request('/protected/read', {
      headers: { 'x-probe-user': 'alpha', 'x-forwarded-for': `192.0.2.${index + 1}` },
    })))
    const alphaReadBlocked = await request('/protected/read', { headers: { 'x-probe-user': 'alpha', 'x-forwarded-for': '192.0.2.99' } })
    const betaRead = await request('/protected/read', { headers: { 'x-probe-user': 'beta', 'x-forwarded-for': '192.0.2.99' } })
    recordCheck('Protected read budget follows authenticated identity', alphaRead.every(status => status === 200) && alphaReadBlocked === 429, `statuses=${alphaRead.join(',')},${alphaReadBlocked}`)
    recordCheck('Protected identities have isolated read budgets', betaRead === 200, `status=${betaRead}`)

    const paymentStatuses = []
    for (let index = 0; index < 3; index += 1) paymentStatuses.push(await request('/payments/write', {
      method: 'POST', headers: { 'x-probe-user': 'payer', 'x-forwarded-for': `203.0.113.${index + 1}` }, body: '{}',
    }))
    const otherPayer = await request('/payments/write', { method: 'POST', headers: { 'x-probe-user': 'payer-two' }, body: '{}' })
    recordCheck('Protected payment write budget follows identity', paymentStatuses.join(',') === '200,200,429', `statuses=${paymentStatuses.join(',')}`)
    recordCheck('Protected payment identities are isolated', otherPayer === 200, `status=${otherPayer}`)

    const burstLatencies = []
    const burstStatuses = new Map()
    const burstStarted = performance.now()
    let nextBurstRequest = 0
    const burstWorker = async () => {
      while (nextBurstRequest < BURST_REQUESTS) {
        const index = nextBurstRequest++
        const status = await request('/probe/burst-read', {
          headers: { 'x-probe-user': 'burst-user', 'x-forwarded-for': `198.18.0.${(index % 250) + 1}` },
          measurements: burstLatencies,
        })
        burstStatuses.set(status, (burstStatuses.get(status) ?? 0) + 1)
      }
    }
    await Promise.all(Array.from({ length: MAX_CONCURRENCY }, burstWorker))
    const burstDurationMs = performance.now() - burstStarted
    const burstStatusCounts = Object.fromEntries([...burstStatuses.entries()].sort(([a], [b]) => a - b))
    burstMetrics = {
      requests: BURST_REQUESTS,
      concurrency: MAX_CONCURRENCY,
      durationMs: roundMs(burstDurationMs),
      throughputPerSecond: roundMs(BURST_REQUESTS / (burstDurationMs / 1_000)),
      p50Ms: roundMs(percentile(burstLatencies, 0.5)),
      p95Ms: roundMs(p95(burstLatencies)),
      maxMs: roundMs(Math.max(...burstLatencies)),
      statusCounts: burstStatusCounts,
    }
    const normalAfterBurst = await request('/probe/burst-read', { headers: { 'x-probe-user': 'normal-after-burst' } })
    recordCheck('300-request protected-read burst stays within its dedicated budget', burstStatusCounts['200'] === BURST_REQUESTS, `statusCounts=${JSON.stringify(burstStatusCounts)}`)
    recordCheck('Normal protected read remains healthy after burst', normalAfterBurst === 200, `status=${normalAfterBurst}`)

    const malformed = await request('/json', { method: 'POST', body: '{' })
    const oversized = await request('/json', { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(2_000) }) })
    const healthyAfterErrors = await request('/healthy')
    recordCheck('Malformed JSON remains available as a 400 response', malformed === 400, `status=${malformed}`)
    recordCheck('Oversized JSON remains available as a 413 response', oversized === 413, `status=${oversized}`)
    recordCheck('Healthy route recovers after rejection burst', healthyAfterErrors === 200, `status=${healthyAfterErrors}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }

  const elapsedMs = performance.now() - startedAt
  const result = {
    label: 'isolated middleware harness; NOT a full app capacity or live load test',
    pass: errors.length === 0 && checks.every(check => check.passed),
    requests: requestCount,
    maxRequests: MAX_REQUESTS,
    maxConcurrency: MAX_CONCURRENCY,
    durationMs: Math.round(elapsedMs),
    p95Ms: roundMs(p95(latencies)),
    burst: burstMetrics,
    errors,
    checks,
  }
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.pass ? 0 : 1
}

main().catch(error => {
  console.error(JSON.stringify({ pass: false, fatal: error.message, requests: requestCount, errors }, null, 2))
  process.exitCode = 1
})
