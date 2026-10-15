import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { applyScheduledOfferAcceptance } from '../services/scheduledOfferAcceptance.js'
import { assertPhase9Connection, assertPhase9Environment, PHASE9_FORBIDDEN_DATABASE, PHASE9_EMPTY_ENV } from './helpers/phase9Isolation.js'
import { createRazorpayWebhookHandler } from '../routes/payments.js'
import { PaymentError } from '../services/paymentErrors.js'
import { cancelDriverRideInTransaction } from '../services/driverRideCancellation.js'
import { sweepScheduledRides } from '../services/assignScheduledRides.js'
import { offerScheduledRide } from '../services/scheduledOffers.js'

const NOW = new Date('2026-10-09T08:00:00Z')
const clock = { now: () => NOW }
function acceptanceFixture({ offerCount = 1, walletBalance = 1_000, held = null } = {}) {
  const writes = []
  const tx = {
    rideOffer: { async updateMany(input) { writes.push(['offer', input]); return { count: offerCount } } },
    driver: {
      async findUniqueOrThrow(input) { writes.push(['driver-read', input]); return { walletBalance } },
      async update(input) { writes.push(['driver-write', input]); return {} },
    },
    walletEntry: { async findUnique(input) { writes.push(['hold-read', input]); return input.where.eventKey.startsWith('deposit_hold:') && held ? { bookingId: 'booking-9', type: 'deposit_hold', amount: -100, ...held } : null },
      async createMany(input) { writes.push(['wallet', input]); return { count: 1 } } },
    driverCancellation: { findFirst: async () => null },
    responsibilityCase: { findMany: async () => [] },
    booking: {
      async findUnique() { return { status: 'assigned', shareGroupId: null } },
      async updateMany(input) { writes.push(['pool-host', input]); return { count: 1 } },
      async update(input) { writes.push(['pool-joiner', input]); return {} },
    },
  }
  const input = { booking: { id: 'booking-9', fare: 1_000, scheduledAt: NOW }, driverId: 'driver-9', offerId: 'offer-9', clock }
  return { tx, input, writes }
}
test('Phase 9 acceptance: pending ownership CAS, deposit and withdrawal share the real transaction', async () => {
  const { tx, input, writes } = acceptanceFixture()
  await applyScheduledOfferAcceptance(tx, input)
  assert.deepEqual(writes[0], ['offer', { where: { id: 'offer-9', bookingId: 'booking-9', driverId: 'driver-9', status: 'pending' },
    data: { status: 'accepted', respondedAt: NOW } }])
  assert.deepEqual(writes.find(row => row[0] === 'driver-read')[1], { where: { id: 'driver-9' }, select: { walletBalance: true } })
  assert.deepEqual(writes.find(row => row[0] === 'hold-read')[1], { where: { eventKey: 'deposit_hold:booking:booking-9' } })
  assert.deepEqual(writes.find(row => row[0] === 'wallet')[1], { skipDuplicates: true, data: [{
    driverId: 'driver-9', amount: -100, type: 'deposit_hold', eventKey: 'deposit_hold:booking:booking-9',
    bookingId: 'booking-9', method: null, note: '10% scheduled ride acceptance deposit',
  }] })
  assert.deepEqual(writes.find(row => row[0] === 'driver-write')[1], { where: { id: 'driver-9' }, data: { walletBalance: { increment: -100 } } })
  assert.equal(writes.filter(row => row[0] === 'offer').length, 2)
  assert.deepEqual(writes.at(-1)[1].where, { bookingId: 'booking-9', status: 'pending', driverId: { not: 'driver-9' } })
})
test('Phase 9 acceptance regression: unavailable offer fails before any financial write', async () => {
  const { tx, input, writes } = acceptanceFixture({ offerCount: 0 })
  await assert.rejects(applyScheduledOfferAcceptance(tx, input), /^Error: OFFER_UNAVAILABLE$/)
  assert.equal(writes.length, 1)
})
test('Phase 9 acceptance: insufficient live wallet fails before debit', async () => {
  const { tx, input, writes } = acceptanceFixture({ walletBalance: 99 })
  await assert.rejects(applyScheduledOfferAcceptance(tx, input), /^Error: INSUFFICIENT_WALLET$/)
  assert.equal(writes.some(row => row[0] === 'wallet'), false)
})
test('Phase 9 acceptance: exact wallet threshold is sufficient', async () => {
  const { tx, input, writes } = acceptanceFixture({ walletBalance: 100 })
  await applyScheduledOfferAcceptance(tx, input)
  assert.equal(writes.find(row => row[0] === 'wallet')[1].data[0].amount, -100)
})
test('Phase 9 regression: an existing booking hold cannot be silently reused by a replacement driver', async () => {
  const { tx, input, writes } = acceptanceFixture({ held: { driverId: 'original-driver' } })
  await assert.rejects(applyScheduledOfferAcceptance(tx, input), /^Error: DEPOSIT_OWNER_CONFLICT$/)
  assert.equal(writes.some(row => row[0] === 'wallet'), false)
})
test('Phase 9 acceptance: same-driver hold ownership remains retry compatible', async () => {
  const { tx, input } = acceptanceFixture({ held: { driverId: 'driver-9' } })
  await assert.doesNotReject(applyScheduledOfferAcceptance(tx, input))
})
test('Phase 9 acceptance: unscheduled or zero fare does not invent a wallet hold', async () => {
  for (const booking of [{ id: 'booking-9', fare: 1_000, scheduledAt: null }, { id: 'booking-9', fare: 0, scheduledAt: NOW }]) {
    const { tx, input, writes } = acceptanceFixture({ walletBalance: 0 })
    await applyScheduledOfferAcceptance(tx, { ...input, booking })
    assert.equal(writes.some(row => row[0] === 'wallet'), false)
  }
})
test('Phase 9 acceptance: default clock and optional pooling retain existing application behavior', async () => {
  const { tx, input, writes } = acceptanceFixture()
  const { clock: _clock, ...defaults } = input
  await applyScheduledOfferAcceptance(tx, { ...defaults, poolJoin: {
    host: { id: 'host' }, joiner: { id: 'booking-9' },
    orders: { host: { pickupOrder: 0, dropOrder: 1 }, joiner: { pickupOrder: 1, dropOrder: 0 } },
  } })
  assert.ok(writes[0][1].data.respondedAt instanceof Date)
  assert.equal(writes.find(row => row[0] === 'pool-host')[1].where.id, 'host')
  assert.equal(writes.find(row => row[0] === 'pool-joiner')[1].where.id, 'booking-9')
})

test('Phase 9 environment: only the dedicated sentinel and loopback test URL are admitted', () => {
  assert.equal(PHASE9_FORBIDDEN_DATABASE, 'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden')
  assert.equal(path.basename(PHASE9_EMPTY_ENV), 'phase9-empty.env')
  assert.doesNotMatch(readFileSync(PHASE9_EMPTY_ENV, 'utf8'), /^[^#\s].*=/m)
  const env = { PHASE9_ISOLATED: '1', DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE,
    DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV, TEST_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/rcs_test' }
  assert.doesNotThrow(() => assertPhase9Environment(env))
  for (const key of ['PHASE9_ISOLATED', 'DATABASE_URL', 'DIRECT_URL', 'DOTENV_CONFIG_PATH']) {
    assert.throws(() => assertPhase9Environment({ ...env, [key]: 'wrong' }), /dedicated isolated runner/)
  }
  assert.throws(() => assertPhase9Environment({ ...env, TEST_DATABASE_URL: 'postgresql://test:test@remote.invalid/rcs_test' }), /loopback/)
})
test('Phase 9 network: socket argument forms reject every remote host and pipe', () => {
  for (const args of [[443, 'provider.invalid'], [{ host: 'provider.invalid', port: 443 }], ['/tmp/provider.sock'],
    [{ path: '/tmp/provider.sock' }]]) assert.throws(() => assertPhase9Connection(args), /forbids non-loopback/)
  for (const args of [[], [80], [80, () => {}], [80, '127.0.0.1'], [{ host: 'localhost', port: 80 }],
    [{ host: '::1', port: 80 }], [{ host: '[::1]', port: 80 }], [{ port: 80 }]]) assert.doesNotThrow(() => assertPhase9Connection(args))
})
test('Phase 9 network fence actually installs, rejects remote connections and delegates valid argument forms', () => {
  const helper = new URL('./helpers/phase9Isolation.js', import.meta.url).href
  const script = `import net from 'node:net'; import assert from 'node:assert/strict';
    let forwarded = 0; net.Socket.prototype.connect = function () { forwarded++; return this };
    const isolation = await import(${JSON.stringify(helper)});
    const socket = new net.Socket();
    assert.throws(() => socket.connect(443, 'provider.invalid'), /forbids non-loopback/);
    assert.throws(() => socket.connect([{ host: 'provider.invalid', port: 443 }]), /forbids non-loopback/);
    socket.connect(80, '127.0.0.1'); socket.connect([{ host: '127.0.0.1', port: 80 }]);
    assert.equal(forwarded, 2);
    assert.throws(() => isolation.installPhase9NetworkFence({}), /dedicated isolated runner/);
    isolation.installPhase9NetworkFence(process.env);
    socket.connect(80, '127.0.0.1'); assert.equal(forwarded, 3); socket.destroy();`
  execFileSync(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true, timeout: 10_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE } : {}),
      ...(process.env.__STRYKER_ACTIVE_MUTANT__ ? { __STRYKER_ACTIVE_MUTANT__: process.env.__STRYKER_ACTIVE_MUTANT__ } : {}),
      PHASE9_ISOLATED: '1', DATABASE_URL: PHASE9_FORBIDDEN_DATABASE, DIRECT_URL: PHASE9_FORBIDDEN_DATABASE,
      DOTENV_CONFIG_PATH: PHASE9_EMPTY_ENV, TEST_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/rcs_test' } })
})
test('Phase 9 real webhook handler preserves signed body and provider event identity', async () => {
  const rawBody = Buffer.from('{}')
  let called
  const handler = createRazorpayWebhookHandler({ async processWebhook(input) { called = input; return { applied: true } } })
  let response
  await handler({ body: rawBody, get: header => ({ 'x-razorpay-signature': 'signature', 'x-razorpay-event-id': 'event' })[header] },
    { json: body => { response = body } }, error => { throw error })
  assert.deepEqual(called, { rawBody, signature: 'signature', eventId: 'event' })
  assert.deepEqual(response, { ok: true, applied: true })
})
test('Phase 9 webhook handler keeps domain errors and forwards unexpected failure', async () => {
  for (const error of [new PaymentError('INVALID_WEBHOOK_SIGNATURE', 'Invalid signature', 400), new Error('unexpected')]) {
    let status, body, forwarded
    const res = { status(code) { status = code; return this }, json(value) { body = value } }
    await createRazorpayWebhookHandler({ async processWebhook() { throw error } })({ get() {} }, res, value => { forwarded = value })
    if (error instanceof PaymentError) { assert.equal(status, 400); assert.equal(body.code, 'INVALID_WEBHOOK_SIGNATURE') }
    else assert.equal(forwarded, error)
  }
})
test('Phase 9 integrity: all 22 original V5 source identities and freeze digest remain unchanged', () => {
  const repository = process.env.RCS_PHASE9_REPOSITORY_ROOT ?? fileURLToPath(new URL('../../', import.meta.url))
  const manifest = JSON.parse(readFileSync(path.join(repository, 'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json')))
  const { freezeHash, ...body } = manifest
  const sha = bytes => createHash('sha256').update(bytes).digest('hex')
  assert.equal(freezeHash, 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75')
  assert.equal(sha(JSON.stringify(body)), freezeHash)
  for (const item of manifest.sourceManifest) assert.equal(sha(readFileSync(path.join(repository, item.file))), item.sha256, item.file)
})
test('Phase 9 cancellation regression: conditional update binds the current driver and status before capacity or incident writes', async () => {
  let captured
  const tx = { booking: { async updateMany(input) { captured = input; return { count: 0 } } } }
  assert.equal(await cancelDriverRideInTransaction(tx, { id: 'booking', status: 'assigned' }, { id: 'driver' }), null)
  assert.deepEqual(captured.where, { id: 'booking', status: 'assigned', driverId: 'driver' })
  assert.deepEqual(captured.data, { status: 'pending', driverId: null })
})
test('Phase 9 architecture: simulator calls shadow-only sweep and forbids composed consequence jobs', () => {
  const source = readFileSync(new URL('./helpers/phase9Lifecycle.js', import.meta.url), 'utf8')
  assert.match(source, /sweepResponsibilityShadowAdjudication/)
  assert.doesNotMatch(source, /lib\/jobs|sweepResponsibilityFinalization|applyAuthorizedResponsibility|createProductionResponsibilityAnalyst/)
  const runner = readFileSync(new URL('./run-phase9.js', import.meta.url), 'utf8')
  assert.match(runner, /PHASE9_FORBIDDEN_DATABASE/)
  assert.doesNotMatch(runner, /\.\.\.process\.env/)
})
test('Phase 9 scheduled worker reuses the injected database, clock, offer and notification boundaries', async () => {
  const calls = []
  const booking = { id: 'scheduled', reference: 'SYNTHETIC', scheduledAt: new Date(NOW.getTime() + 30 * 60_000), adminAlertedAt: null }
  const db = { booking: {
    async findMany(input) { calls.push(['find', input]); return [booking] },
    async updateMany(input) { calls.push(['stamp', input]); return { count: 1 } },
  } }
  await sweepScheduledRides({ db, clock,
    reminders: async now => { calls.push(['reminder', now]) },
    offer: async (id, options) => { calls.push(['offer', id, options]) },
    alert: async row => { calls.push(['alert', row]) },
  })
  assert.deepEqual(calls[0], ['reminder', NOW])
  assert.deepEqual(calls.find(row => row[0] === 'find')[1].where, { status: 'confirmed', driverId: null,
    scheduledAt: { lte: new Date(NOW.getTime() + 6 * 60 * 60_000), gte: NOW } })
  assert.deepEqual(calls.find(row => row[0] === 'offer'), ['offer', 'scheduled', { db, clock }])
  assert.deepEqual(calls.find(row => row[0] === 'stamp')[1], { where: { id: 'scheduled', adminAlertedAt: null }, data: { adminAlertedAt: NOW } })
  assert.equal(calls.filter(row => row[0] === 'alert').length, 1)
})
test('Phase 9 scheduled worker retries cannot duplicate an already won alert stamp', async () => {
  let alerts = 0
  const db = { booking: { async findMany() { return [{ id: 'scheduled', scheduledAt: NOW, adminAlertedAt: null }] },
    async updateMany() { return { count: 0 } } } }
  await sweepScheduledRides({ db, clock, reminders: async () => {}, offer: async () => {}, alert: async () => { alerts++ } })
  assert.equal(alerts, 0)
})
test('Phase 9 regression: worker retry cannot escalate past an unanswered RCS offer', async () => {
  const groups = []
  const db = { booking: { async findUnique() { return { id: 'booking', status: 'confirmed', driverId: null,
    scheduledAt: new Date(NOW.getTime() + 60_000), confirmedAt: new Date(NOW.getTime() - 60 * 60_000) } } },
    rideOffer: { async groupBy() { return [{ status: 'pending', _count: 1 }] } },
    driver: { async findMany(input) { groups.push(input.where.group); return [] } },
  }
  assert.equal(await offerScheduledRide('booking', { db, clock }), 0)
  assert.deepEqual(groups, ['rcs'])
})
test('Phase 9 scheduled dispatch: terminal RCS offers resolve priority; an empty fleet still reaches partners', async () => {
  for (const status of ['accepted', 'rejected', 'withdrawn', null]) {
    const groups = []
    const db = { booking: { async findUnique() { return { id: 'booking', status: 'confirmed', driverId: null,
      scheduledAt: new Date(NOW.getTime() + 60_000), confirmedAt: new Date(NOW.getTime() - 60 * 60_000) } } },
      rideOffer: { async groupBy() { return status ? [{ status, _count: 1 }] : [] } },
      driver: { async findMany(input) { groups.push(input.where.group); return [] } },
    }
    assert.equal(await offerScheduledRide('booking', { db, clock }), 0)
    assert.deepEqual(groups, status ? ['partner'] : ['rcs', 'partner'])
  }
})
test('Phase 9 dispatch regression: eligible RCS drivers retain priority and receive the actual offer', async () => {
  const groups = [], writes = []
  const candidate = { id: 'rcs-driver', vehicleClass: 'sedan', vehicleCapacity: 4, suspendedAt: null }
  const db = { booking: { async findUnique() { return { id: 'booking', status: 'confirmed', driverId: null,
    scheduledAt: new Date(NOW.getTime() + 60_000), confirmedAt: new Date(NOW.getTime() - 60 * 60_000) } } },
    rideOffer: { async groupBy() { return [] }, async createMany(input) { writes.push(input); return { count: 1 } } },
    reliabilityBlock: { async findFirst() { return null } },
    driver: { async findMany(input) { groups.push(input.where.group); return input.where.group === 'rcs' ? [candidate] : [] },
      async updateMany() {} },
  }
  assert.equal(await offerScheduledRide('booking', { db, clock, push: async () => {} }), 1)
  assert.deepEqual(groups, ['rcs'])
  assert.deepEqual(writes[0], { data: [{ bookingId: 'booking', driverId: 'rcs-driver', group: 'rcs' }], skipDuplicates: true })
})
