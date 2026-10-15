import test from 'node:test'
import assert from 'node:assert/strict'
import { getRazorpayXConfig, getRazorpayXWebhookSecret, safeRazorpayXConfig } from '../config/razorpayX.js'
import {
  applyPayoutProviderState,
  recomputePayoutBatchStatus,
  refreshPayout,
} from '../services/driverPayouts.js'
import { PaymentError } from '../services/paymentErrors.js'
import { processRazorpayXPayoutWebhook } from '../services/razorpayXPayoutWebhook.js'
import { createRazorpayXWebhookHandler } from '../routes/razorpayXWebhook.js'
import { createRazorpayXFake, payoutProviderState } from './helpers/razorpayXFake.js'

const payoutRequest = (reference = 'local-payout-1') => ({
  amount: 50000,
  currency: 'INR',
  upiId: 'captain@upi',
  name: 'Captain Test',
  reference,
  idempotencyKey: `payout:${reference}`,
})

function createPayoutDb(initial = {}) {
  let payout = {
    id: 'local-payout-1',
    batchId: 'batch-1',
    driverId: 'driver-1',
    amount: 50000,
    currency: 'INR',
    status: 'processing',
    externalPayoutId: 'pout_0001',
    paidAt: null,
    ...initial,
  }
  let batch = { id: payout.batchId, status: 'processing', executedAt: null }
  let walletBalance = 500
  const entries = new Map()
  const events = new Map()
  const calls = {
    findFirst: [], findUnique: [], findMany: [], payoutUpdates: [], eventCreates: [], transactions: [],
  }
  const matches = (candidate) => Object.entries(candidate).every(([key, value]) => payout[key] === value)
  const tx = {
    driverPayout: {
      findFirst: async (input) => {
        calls.findFirst.push(input)
        return input.where.OR.some(matches) ? { ...payout } : null
      },
      findUnique: async (input) => {
        calls.findUnique.push(input)
        return input.where.id === payout.id
        ? { ...payout, driver: { walletBalance } }
        : null
      },
      findMany: async (input) => {
        calls.findMany.push(input)
        return input.where.batchId === payout.batchId ? [{ status: payout.status }] : []
      },
      update: async ({ where, data }) => {
        calls.payoutUpdates.push({ where, data })
        if (where.id !== payout.id) throw new Error('Payout not found')
        payout = { ...payout, ...data }
        return { ...payout }
      },
    },
    driverPayoutBatch: {
      update: async ({ where, data }) => {
        if (where.id !== batch.id) throw new Error('Batch not found')
        batch = { ...batch, ...data }
        return { ...batch }
      },
    },
    razorpayWebhookEvent: {
      createMany: async (input) => {
        calls.eventCreates.push(input)
        const { data } = input
        const event = data[0]
        if (events.has(event.eventId)) return { count: 0 }
        events.set(event.eventId, { ...event })
        return { count: 1 }
      },
      update: async ({ where, data }) => {
        events.set(where.eventId, { ...events.get(where.eventId), ...data })
        return { ...events.get(where.eventId) }
      },
    },
    walletEntry: {
      createMany: async ({ data }) => {
        const entry = data[0]
        if (entries.has(entry.eventKey)) return { count: 0 }
        entries.set(entry.eventKey, { ...entry })
        return { count: 1 }
      },
    },
    driver: {
      update: async ({ data }) => {
        walletBalance += data.walletBalance.increment
        return { id: payout.driverId, walletBalance }
      },
    },
  }
  const db = { ...tx, $transaction: (work, options) => {
    calls.transactions.push(options)
    return work(tx)
  } }
  return {
    db,
    payout: () => ({ ...payout }),
    batch: () => ({ ...batch }),
    wallet: () => ({ balance: walletBalance, entries: [...entries.values()] }),
    events,
    calls,
  }
}

test('batch status reconciliation distinguishes open, paid, mixed, and empty batches', async () => {
  const run = async (statuses) => {
    let updateInput
    let findInput
    const db = {
      driverPayout: { findMany: async (input) => {
        findInput = input
        return statuses.map(status => ({ status }))
      } },
      driverPayoutBatch: { update: async (input) => {
        updateInput = input
        return { id: input.where.id, ...input.data }
      } },
    }
    const result = await recomputePayoutBatchStatus('batch-1', db)
    assert.deepEqual(findInput, { where: { batchId: 'batch-1' }, select: { status: true } })
    assert.equal(updateInput.where.id, 'batch-1')
    return { result, updateInput }
  }

  const open = await run(['paid', 'processing'])
  assert.equal(open.result.status, 'processing')
  assert.equal(Object.hasOwn(open.updateInput.data, 'executedAt'), false)
  const paid = await run(['paid', 'paid'])
  assert.equal(paid.result.status, 'completed')
  assert.equal(paid.updateInput.data.executedAt instanceof Date, true)
  assert.equal((await run(['paid', 'failed'])).result.status, 'partial')
  assert.equal((await run([])).result.status, 'partial')
})

async function payoutHarness(dbOverrides = {}) {
  const provider = createRazorpayXFake()
  const external = await provider.gateway.createPayout(payoutRequest())
  const store = createPayoutDb({ externalPayoutId: external.id, ...dbOverrides })
  const deliver = args => processRazorpayXPayoutWebhook({
    ...args,
    gateway: provider.webhookGateway,
    db: store.db,
  })
  return { provider, external, store, deliver }
}

test('signed payout success callback settles once and duplicate delivery is idempotent', async () => {
  const { provider, external, store, deliver } = await payoutHarness()
  provider.setState(external.id, payoutProviderState.SUCCEEDED)
  const eventId = provider.queueCallback(external.id)

  assert.deepEqual(await provider.deliverCallback(eventId, deliver), {
    processed: true, payoutId: 'local-payout-1', status: 'paid',
  })
  assert.deepEqual(await provider.deliverCallback(eventId, deliver), { duplicate: true })
  assert.equal(store.payout().status, 'paid')
  assert.equal(store.batch().status, 'completed')
  assert.equal(store.wallet().entries.length, 1)
  assert.equal(store.wallet().balance, 0)
})

test('failed payout cannot regress when an older pending callback arrives later', async () => {
  const { provider, external, store, deliver } = await payoutHarness()
  provider.setState(external.id, payoutProviderState.FAILED, { failure_reason: 'bank_rejected' })
  await provider.deliverCallback(provider.queueCallback(external.id), deliver)
  provider.setState(external.id, payoutProviderState.PENDING)
  const result = await provider.deliverCallback(provider.queueCallback(external.id), deliver)

  assert.equal(result.status, 'failed')
  assert.equal(store.payout().status, 'failed')
  assert.equal(store.batch().status, 'partial')
  assert.equal(store.wallet().entries.length, 0)
})

test('lost callback is recovered by the existing payout polling fallback', async () => {
  const { provider, external, store } = await payoutHarness()
  provider.setState(external.id, payoutProviderState.SUCCEEDED)

  const result = await refreshPayout('local-payout-1', { gateway: provider.gateway, db: store.db })

  assert.equal(result.status, 'paid')
  assert.equal(store.payout().status, 'paid')
  assert.equal(provider.history.fetches.length, 1)
})

test('provider payout identity is authoritative and terminal paid state only permits reversal', async () => {
  const { external, store } = await payoutHarness()
  await assert.rejects(applyPayoutProviderState('local-payout-1', {
    ...external, id: 'pout_wrong', status: payoutProviderState.SUCCEEDED,
  }, { db: store.db }), error => error.code === 'PAYOUT_PROVIDER_MISMATCH'
    && error.message === 'Provider payout does not match the local payout')

  const processing = await applyPayoutProviderState('local-payout-1', {
    ...external, status: payoutProviderState.PROCESSING,
  }, { db: store.db })
  assert.equal(processing.status, 'processing')
  const paid = await applyPayoutProviderState('local-payout-1', {
    ...external, status: payoutProviderState.SUCCEEDED,
  }, { db: store.db })
  assert.equal(paid.status, 'paid')
  const stale = await applyPayoutProviderState('local-payout-1', {
    ...external, status: payoutProviderState.PENDING,
  }, { db: store.db })
  assert.equal(stale.status, 'paid')
  const reversed = await applyPayoutProviderState('local-payout-1', {
    ...external, status: payoutProviderState.REVERSED,
  }, { db: store.db })
  assert.equal(reversed.status, 'reversed')
  assert.equal(store.wallet().entries.length, 2)
  assert.equal(store.wallet().balance, 500)
  assert.deepEqual(store.wallet().entries[1], {
    driverId: 'driver-1', amount: 500, type: 'payout_reversal', method: 'upi',
    eventKey: 'payout_reversal:local-payout-1', bookingId: null,
    note: `RazorpayX reversed payout ${external.id}`,
  })
  assert.equal((await applyPayoutProviderState('local-payout-1', external, { db: store.db })).status, 'reversed')
  assert.deepEqual(store.calls.findUnique[0].include, { driver: { select: { walletBalance: true } } })
  assert.deepEqual(store.calls.transactions[0], { isolationLevel: 'Serializable' })
})

test('payout state writes preserve provider identity, audit fields, and wallet semantics', async () => {
  const paidAt = new Date('2026-09-24T00:00:00Z')
  const paidStore = createPayoutDb({ paidAt, externalPayoutId: null })
  await applyPayoutProviderState('local-payout-1', {
    id: 'pout_paid', status: 'processed',
  }, { db: paidStore.db })
  assert.equal(paidStore.payout().paidAt, paidAt)
  assert.deepEqual(paidStore.wallet().entries[0], {
    driverId: 'driver-1', amount: -500, type: 'payout', method: 'upi',
    eventKey: 'payout:local-payout-1', bookingId: null, note: 'RazorpayX payout pout_paid',
  })

  const reversalWithoutDebit = createPayoutDb({ status: 'processing' })
  await applyPayoutProviderState('local-payout-1', {
    id: 'pout_0001', status: 'reversed',
  }, { db: reversalWithoutDebit.db })
  assert.equal(reversalWithoutDebit.wallet().entries.length, 0)

  const missingProviderId = createPayoutDb()
  const processing = await applyPayoutProviderState('local-payout-1', {
    status: 'pending',
  }, { db: missingProviderId.db })
  assert.equal(processing.externalPayoutId, 'pout_0001')
  assert.deepEqual(missingProviderId.calls.payoutUpdates.at(-1), {
    where: { id: 'local-payout-1' },
    data: { status: 'processing', externalPayoutId: 'pout_0001' },
  })

  const localIdentityOnly = createPayoutDb()
  assert.equal((await applyPayoutProviderState('local-payout-1', {
    status: 'pending',
  }, { db: localIdentityOnly.db })).status, 'processing')
})

test('payout state application validates local identity and records provider failure details', async () => {
  const missing = createPayoutDb()
  missing.db.driverPayout.findUnique = async () => null
  await assert.rejects(applyPayoutProviderState('missing', {
    id: 'pout_missing', status: 'pending',
  }, { db: missing.db }), error => error.code === 'PAYOUT_NOT_FOUND'
    && error.message === 'Payout not found')

  const described = createPayoutDb()
  const failed = await applyPayoutProviderState('local-payout-1', {
    id: 'pout_0001', status: 'rejected', error: { description: 'destination closed' },
  }, { db: described.db })
  assert.equal(failed.failureReason, 'destination closed')
  assert.equal(failed.failureCode, 'rejected')

  const fallback = createPayoutDb({ externalPayoutId: null })
  const generic = await applyPayoutProviderState('local-payout-1', {
    status: 'failed',
  }, { db: fallback.db })
  assert.equal(generic.failureReason, 'Provider status: failed')
  assert.equal(generic.externalPayoutId, null)
})

test('unknown payout callback is recorded and safely ignored', async () => {
  const provider = createRazorpayXFake()
  const external = await provider.gateway.createPayout(payoutRequest('missing-local-payout'))
  provider.setState(external.id, payoutProviderState.SUCCEEDED)
  const store = createPayoutDb({ externalPayoutId: null })
  const result = await provider.deliverCallback(provider.queueCallback(external.id), args => (
    processRazorpayXPayoutWebhook({ ...args, gateway: provider.webhookGateway, db: store.db })
  ))

  assert.deepEqual(result, { ignored: true })
  assert.equal([...store.events.values()][0].result, 'payout_not_found')
  assert.equal([...store.events.values()][0].status, 'ignored')
  assert.equal(store.calls.eventCreates[0].skipDuplicates, true)
})

test('invalid signature and malformed signed payload are rejected before state changes', async () => {
  const { provider, external, store, deliver } = await payoutHarness()
  const eventId = provider.queueCallback(external.id)
  await assert.rejects(
    provider.deliverCallback(eventId, deliver, { validSignature: false }),
    error => error.code === 'INVALID_WEBHOOK_SIGNATURE'
      && error.message === 'Invalid RazorpayX webhook signature',
  )
  await assert.rejects(processRazorpayXPayoutWebhook({
    rawBody: Buffer.from('{bad-json'),
    signature: 'valid',
    gateway: { verifyWebhookSignature: () => true },
    db: store.db,
  }), error => error.code === 'MALFORMED_WEBHOOK'
    && error.message === 'Malformed RazorpayX webhook')
  await assert.rejects(processRazorpayXPayoutWebhook({
    rawBody: '{}', signature: 'valid', gateway: { verifyWebhookSignature: () => true }, db: store.db,
  }), error => error.code === 'INVALID_WEBHOOK_SIGNATURE')
  assert.equal(store.events.size, 0)
})

test('hash event identity and transaction-client path handle a signed null event safely', async () => {
  const store = createPayoutDb()
  const { $transaction: omitted, ...transactionClient } = store.db
  assert.equal(typeof omitted, 'function')
  const result = await processRazorpayXPayoutWebhook({
    rawBody: Buffer.from('null'),
    signature: 'valid',
    gateway: { verifyWebhookSignature: () => true },
    db: transactionClient,
  })
  assert.deepEqual(result, { ignored: true })
  assert.equal(store.events.size, 1)
  assert.equal([...store.events.values()][0].eventType, 'unknown')
  const [storedEventId] = store.events.keys()
  assert.equal(typeof storedEventId, 'string')
  assert.match(storedEventId, /^[a-f0-9]{64}$/)
})

test('unsupported or mismatched payout callbacks cannot alter a local payout', async () => {
  const { provider, external, store } = await payoutHarness()
  const signedUnsupported = Buffer.from(JSON.stringify({ event: 'payout.created', payload: {} }))
  const ignored = await processRazorpayXPayoutWebhook({
    rawBody: signedUnsupported,
    signature: 'valid',
    gateway: { verifyWebhookSignature: () => true },
    db: store.db,
  })
  assert.deepEqual(ignored, { ignored: true })

  const withoutReference = Buffer.from(JSON.stringify({
    event: 'payout.pending',
    payload: { payout: { entity: {
      id: external.id, amount: 50000, currency: 'INR', status: 'pending',
    } } },
  }))
  const accepted = await processRazorpayXPayoutWebhook({
    rawBody: withoutReference,
    signature: 'valid',
    eventId: 'without-reference',
    gateway: { verifyWebhookSignature: () => true },
    db: store.db,
  })
  assert.equal(accepted.status, 'processing')
  assert.deepEqual(store.calls.findFirst.at(-1).where, {
    OR: [{ externalPayoutId: external.id }, { id: '' }],
  })

  provider.setState(external.id, payoutProviderState.SUCCEEDED, { amount: 49999 })
  const mismatch = await provider.deliverCallback(provider.queueCallback(external.id), args => (
    processRazorpayXPayoutWebhook({ ...args, gateway: provider.webhookGateway, db: store.db })
  ))
  assert.deepEqual(mismatch, { ignored: true })
  assert.equal(store.payout().status, 'processing')
  assert.equal([...store.events.values()].at(-1).status, 'ignored')
  assert.equal([...store.events.values()].at(-1).result, 'payout_mismatch')
})

test('payout callbacks validate each event shape and provider identity field independently', async () => {
  const entity = {
    id: 'pout_0001', reference_id: 'local-payout-1', amount: 50000,
    currency: 'INR', status: 'pending',
  }
  let eventSequence = 0
  const deliver = async (event, overrides = {}) => {
    const store = createPayoutDb(overrides)
    const rawBody = Buffer.from(JSON.stringify(event))
    const result = await processRazorpayXPayoutWebhook({
      rawBody, signature: 'valid', eventId: `event-${eventSequence++}`,
      gateway: { verifyWebhookSignature: () => true }, db: store.db,
    })
    return { result, store }
  }

  for (const eventType of [
    'payout.queued', 'payout.initiated', 'payout.updated', 'payout.reversed', 'payout.rejected',
  ]) {
    const status = eventType === 'payout.reversed' ? 'reversed'
      : eventType === 'payout.rejected' ? 'rejected' : 'pending'
    const { result } = await deliver({
      event: eventType, payload: { payout: { entity: { ...entity, status } } },
    })
    assert.equal(result.ignored, undefined)
  }

  const malformedEvents = [{ event: 'payout.pending' }]
  malformedEvents.push({ event: 'payout.pending', payload: { payout: { entity: { ...entity, id: null } } } })
  malformedEvents.push({ event: 'payout.pending', payload: { payout: { entity: { ...entity, id: 7 } } } })
  malformedEvents.push({ event: 'payout.created', payload: { payout: { entity } } })
  for (const event of malformedEvents) {
    const { result, store } = await deliver(event)
    assert.deepEqual(result, { ignored: true })
    assert.equal(store.payout().status, 'processing')
    assert.equal([...store.events.values()][0].status, 'ignored')
    assert.equal([...store.events.values()][0].result, 'unsupported_or_malformed_payout')
  }

  const mismatches = [
    { ...entity, reference_id: 'wrong' },
    { ...entity, currency: 'USD' },
    { ...entity, id: 'pout_wrong' },
  ]
  for (const providerPayout of mismatches) {
    const { result, store } = await deliver({
      event: 'payout.pending', payload: { payout: { entity: providerPayout } },
    })
    assert.deepEqual(result, { ignored: true })
    assert.equal(store.payout().status, 'processing')
  }
})

test('payout webhook records stable event identity, result, and serializable transaction options', async () => {
  const { provider, external, store, deliver } = await payoutHarness()
  const eventId = provider.queueCallback(external.id)
  const result = await provider.deliverCallback(eventId, deliver)
  assert.equal(result.status, 'processing')
  assert.equal(store.events.has(eventId), true)
  assert.equal(store.events.get(eventId).status, 'processed')
  assert.equal(store.events.get(eventId).result, 'terminal_or_duplicate_state')
  assert.deepEqual(store.calls.transactions[0], { isolationLevel: 'Serializable' })

  const paidHarness = await payoutHarness()
  paidHarness.provider.setState(paidHarness.external.id, payoutProviderState.SUCCEEDED)
  const paidEventId = paidHarness.provider.queueCallback(paidHarness.external.id)
  await paidHarness.provider.deliverCallback(paidEventId, paidHarness.deliver)
  assert.equal(paidHarness.store.events.get(paidEventId).result, 'payout.paid')
})

test('webhook route maps payment errors and delegates unexpected failures', async () => {
  const headers = {
    'x-razorpay-signature': 'signature-header',
    'x-razorpay-event-id': 'event-header',
  }
  const req = { body: Buffer.from('{}'), get: name => headers[name] }
  let response
  const res = {
    status(code) { response = { code }; return this },
    json(body) { response = { ...response, body }; return response },
  }
  const paymentErrorHandler = createRazorpayXWebhookHandler(async () => {
    throw new PaymentError('INVALID_WEBHOOK_SIGNATURE', 'Invalid signature', 400)
  })
  await paymentErrorHandler(req, res, () => { throw new Error('next should not run') })
  assert.equal(response.code, 400)
  assert.equal(response.body.code, 'INVALID_WEBHOOK_SIGNATURE')

  const okHandler = createRazorpayXWebhookHandler(async input => ({
    eventId: input.eventId, signature: input.signature,
  }))
  await okHandler(req, res, () => {})
  assert.deepEqual(response.body, {
    ok: true, eventId: 'event-header', signature: 'signature-header',
  })

  const failure = new Error('unexpected')
  let delegated
  const failureHandler = createRazorpayXWebhookHandler(async () => { throw failure })
  await failureHandler(req, res, error => { delegated = error })
  assert.equal(delegated, failure)
  assert.throws(() => getRazorpayXWebhookSecret({}), /RAZORPAYX_WEBHOOK_SECRET/)
  assert.equal(getRazorpayXWebhookSecret({ RAZORPAYX_WEBHOOK_SECRET: ' hook ' }), 'hook')
  assert.throws(() => getRazorpayXConfig({}), /RAZORPAYX_KEY_ID/)
  const config = getRazorpayXConfig({
    RAZORPAYX_KEY_ID: ' id ', RAZORPAYX_KEY_SECRET: ' secret ', RAZORPAYX_ACCOUNT_NUMBER: ' account ',
  })
  assert.deepEqual(config, { keyId: 'id', keySecret: 'secret', accountNumber: 'account' })
  assert.deepEqual(safeRazorpayXConfig(config), { keyId: 'id', accountNumber: 'account' })
})
