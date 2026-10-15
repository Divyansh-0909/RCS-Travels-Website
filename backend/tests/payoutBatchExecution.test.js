import test from 'node:test'
import assert from 'node:assert/strict'
import { executePayoutBatch } from '../services/driverPayouts.js'

function createBatchDb() {
  const payouts = new Map([
    ['payout-existing', {
      id: 'payout-existing', batchId: 'batch-1', driverId: 'driver-1', amount: 50000,
      currency: 'INR', payoutUpiId: 'captain-one@upi', idempotencyKey: 'key-existing',
      status: 'processing', externalPayoutId: 'pout_existing',
    }],
    ['payout-new', {
      id: 'payout-new', batchId: 'batch-1', driverId: 'driver-2', amount: 30000,
      currency: 'INR', payoutUpiId: 'captain-two@upi', idempotencyKey: 'key-new',
      status: 'pending', externalPayoutId: null,
    }],
  ])
  const drivers = new Map([
    ['driver-1', { name: 'Captain One', walletBalance: 500, payoutUpiId: 'captain-one@upi', payoutUpiVerifiedAt: new Date('2026-09-24T00:00:00Z') }],
    ['driver-2', { name: 'Captain Two', walletBalance: 300, payoutUpiId: 'captain-two@upi', payoutUpiVerifiedAt: new Date('2026-09-24T00:00:00Z') }],
  ])
  let batch = { id: 'batch-1', reference: 'batch-reference', status: 'pending', createdBy: 'admin-1' }

  const db = {
    driverPayoutBatch: {
      findUnique: async ({ where }) => where.id === batch.id
        ? { ...batch, payouts: [...payouts.values()].map(payout => ({ ...payout })) }
        : null,
      update: async ({ where, data }) => {
        assert.equal(where.id, batch.id)
        batch = { ...batch, ...data }
        return { ...batch }
      },
    },
    driverPayout: {
      findUnique: async ({ where }) => {
        const payout = payouts.get(where.id)
        return payout ? { ...payout, driver: { walletBalance: drivers.get(payout.driverId).walletBalance } } : null
      },
      findMany: async ({ where }) => [...payouts.values()]
        .filter(payout => payout.batchId === where.batchId)
        .map(({ status }) => ({ status })),
      update: async ({ where, data }) => {
        const payout = payouts.get(where.id)
        assert.ok(payout)
        const updated = { ...payout, ...data }
        payouts.set(where.id, updated)
        return { ...updated }
      },
    },
    driver: {
      findUnique: async ({ where }) => drivers.get(where.id) ?? null,
    },
  }
  db.$transaction = work => work(db)
  return db
}

test('batch execution refreshes existing payouts, creates new payouts, and reconciles status', async () => {
  const db = createBatchDb()
  const calls = { fetched: [], created: [] }
  const gateway = {
    fetchPayout: async id => {
      calls.fetched.push(id)
      return { id, status: 'pending' }
    },
    createPayout: async request => {
      calls.created.push(request)
      return { id: 'pout_new', status: 'pending' }
    },
  }

  const result = await executePayoutBatch('batch-1', { gateway, db })

  assert.deepEqual(calls.fetched, ['pout_existing'])
  assert.deepEqual(calls.created, [{
    amount: 30000,
    currency: 'INR',
    upiId: 'captain-two@upi',
    name: 'Captain Two',
    reference: 'payout-new',
    idempotencyKey: 'key-new',
  }])
  assert.equal(result.batch.status, 'processing')
  assert.deepEqual(result.payouts.map(({ id, status }) => ({ id, status })), [
    { id: 'payout-existing', status: 'processing' },
    { id: 'payout-new', status: 'processing' },
  ])
})
