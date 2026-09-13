import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { clerkClient } from '@clerk/express'

// Install a closed fake before importing the route: this suite must never query
// the database configured in a developer's environment.
const unexpected = async () => { throw new Error('Unexpected database call in auth test') }
const prisma = {
  otpVerification: { findUnique: unexpected, update: unexpected, updateMany: unexpected, upsert: unexpected },
  user: { findUnique: unexpected },
}
globalThis.prisma = prisma
const { default: router } = await import('../routes/hybridAuth.js')

const verify = router.stack.find(layer => layer.route?.path === '/verify-otp').route.stack.at(-1).handle
const send = router.stack.find(layer => layer.route?.path === '/send-otp').route.stack.at(-1).handle
const checkName = router.stack.find(layer => layer.route?.path === '/check-name').route.stack.at(-1).handle
const phone = '0000000001'
const otp = '123456'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this },
  json(body) { this.body = body; return this } })

function fixture(t, beforeConsume = () => {}) {
  const row = { phone, otpHash: hash(otp), used: false, expiresAt: new Date(Date.now() + 60000) }
  let minted = 0
  t.mock.method(prisma.otpVerification, 'findUnique', async () => ({ ...row }))
  t.mock.method(prisma.otpVerification, 'update', async () => { row.used = true; return row })
  t.mock.method(prisma.otpVerification, 'updateMany', async ({ where, data }) => {
    beforeConsume(row)
    if (row.phone !== where.phone || row.otpHash !== where.otpHash || row.used !== where.used ||
        row.expiresAt <= where.expiresAt.gt) return { count: 0 }
    Object.assign(row, data)
    return { count: 1 }
  })
  t.mock.method(prisma.user, 'findUnique', async () => ({ id: 'local-rider', clerkId: 'local-clerk' }))
  t.mock.method(clerkClient.users, 'getUserList', async () => ({ data: [{ id: 'local-clerk' }] }))
  t.mock.method(clerkClient.signInTokens, 'createSignInToken', async () => ({ token: `local-ticket-${++minted}` }))
  return { row, minted: () => minted }
}

test('parallel verification of one OTP mints exactly one sign-in ticket', async t => {
  const state = fixture(t)
  let release
  const bothArrived = new Promise(resolve => { release = resolve })
  let reads = 0
  t.mock.method(prisma.otpVerification, 'findUnique', async () => {
    const snapshot = { ...state.row }
    if (++reads === 2) release()
    await bothArrived
    return snapshot
  })
  const responses = [response(), response()]
  await Promise.all(responses.map(res => verify({ body: { phone, otp, intent: 'login' } }, res)))
  assert.deepEqual(responses.map(res => res.statusCode).sort(), [200, 400])
  assert.equal(state.minted(), 1)
})

test('a resend replacing the OTP during verification cannot be consumed by the old code', async t => {
  const state = fixture(t, row => { row.otpHash = hash('654321') })
  const res = response()
  await verify({ body: { phone, otp, intent: 'login' } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(state.row.used, false)
  assert.equal(state.minted(), 0)
})

test('a code expiring during verification cannot mint a ticket', async t => {
  const state = fixture(t, row => { row.expiresAt = new Date(0) })
  const res = response()
  await verify({ body: { phone, otp, intent: 'login' } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(state.minted(), 0)
})

test('an unspecified environment sends OTPs without logging credentials', async t => {
  const previous = process.env.NODE_ENV
  delete process.env.NODE_ENV
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  t.mock.method(prisma.user, 'findUnique', async () => ({ id: 'local-rider' }))
  t.mock.method(prisma.otpVerification, 'findUnique', async () => null)
  t.mock.method(prisma.otpVerification, 'upsert', async () => ({}))
  const log = t.mock.method(console, 'log', () => {})
  const network = t.mock.method(globalThis, 'fetch', async () => ({ ok: true }))
  const res = response()
  await send({ body: { phone, intent: 'login' } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(network.mock.calls.length, 1)
  assert.equal(log.mock.calls.length, 0)
})

test('signup conflicts do not disclose the existing account name before phone verification', async t => {
  t.mock.method(prisma.user, 'findUnique', async () => ({ id: 'local-rider', name: 'Private test name' }))
  const res = response()
  await send({ body: { phone, intent: 'signup' } }, res)
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.code, 'ACCOUNT_EXISTS')
  assert.equal(res.body.account, undefined)
  assert(!JSON.stringify(res.body).includes('Private test name'))
})

test('public name preflight validates syntax without querying rider or captain accounts', async () => {
  for (const audience of [undefined, 'driver']) {
    const res = response()
    await checkName({ body: { name: 'Private test name', audience } }, res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { available: true })
  }
  const invalid = response()
  await checkName({ body: { name: ' ' } }, invalid)
  assert.equal(invalid.statusCode, 400)
})
