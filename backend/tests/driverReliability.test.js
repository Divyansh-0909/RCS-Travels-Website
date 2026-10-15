import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DriverReliabilityError,
  findActiveReliabilityBlock,
  getDriverReliabilitySummary,
  getDriverReliabilityState,
  isDriverReliabilityBlocked,
  removeIndefiniteReliabilityBlock,
} from '../services/driverReliability.js'

const NOW = new Date('2026-09-29T08:00:00.000Z')

test('reliability errors default their message to the stable code', () => {
  const error = new DriverReliabilityError('STABLE_CODE')
  assert.equal(error.code, 'STABLE_CODE')
  assert.equal(error.message, 'STABLE_CODE')
})

test('active block lookup prefers indefinite and uses strict temporary expiry', async () => {
  assert.equal(await findActiveReliabilityBlock('', { db: {} }), null)

  const calls = []
  const indefinite = { id: 'indefinite', type: 'INDEFINITE' }
  const dbIndefinite = { reliabilityBlock: { findFirst: async query => {
    calls.push(query)
    return indefinite
  } } }
  assert.equal(await findActiveReliabilityBlock('driver-1', { db: dbIndefinite, now: NOW }), indefinite)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].where.type, 'INDEFINITE')
  assert.deepEqual(calls[0].orderBy, { blockedAt: 'desc' })

  const temporary = { id: 'temporary', type: 'TEMPORARY', blockedUntil: new Date(NOW.getTime() + 1) }
  const tempCalls = []
  const dbTemporary = { reliabilityBlock: { findFirst: async query => {
    tempCalls.push(query)
    return query.where.type === 'INDEFINITE' ? null : temporary
  } } }
  assert.equal(await findActiveReliabilityBlock('driver-1', { db: dbTemporary, now: NOW }), temporary)
  assert.deepEqual(tempCalls[1].where.blockedUntil, { gt: NOW })
  assert.deepEqual(tempCalls[1].orderBy, { blockedAt: 'desc' })
  assert.equal(await isDriverReliabilityBlocked({ driverId: 'driver-1', db: dbTemporary, now: NOW }), true)

  const dbClear = { reliabilityBlock: { findFirst: async () => null } }
  assert.equal(await isDriverReliabilityBlocked({ driverId: 'driver-1', db: dbClear, now: NOW }), false)
})

test('reliability state exposes strike count, history and active block without customer evidence', async () => {
  const activeBlock = { id: 'block-1', driverId: 'driver-1', type: 'INDEFINITE', removedAt: null }
  const queries = { driver: [], count: [], strikes: [], blocks: [] }
  const db = {
    driver: { findUnique: async query => {
      queries.driver.push(query)
      return { id: 'driver-1' }
    } },
    reliabilityStrike: {
      count: async query => {
        queries.count.push(query)
        return 7
      },
      findMany: async query => {
        queries.strikes.push(query)
        assert.equal(query.take, 10)
        return [{ id: 'strike-1', responsibilityCaseId: 'case-1' }]
      },
    },
    reliabilityBlock: {
      findFirst: async query => query.where.type === 'INDEFINITE' ? activeBlock : null,
      findMany: async query => {
        queries.blocks.push(query)
        assert.equal(query.take, 10)
        return [activeBlock]
      },
    },
  }
  const state = await getDriverReliabilityState('driver-1', { db, now: NOW, historyLimit: 10 })
  assert.equal(state.strikeCount, 7)
  assert.equal(state.activeBlock, activeBlock)
  assert.equal(state.strikes[0].responsibilityCaseId, 'case-1')
  assert.deepEqual(queries.driver[0], { where: { id: 'driver-1' }, select: { id: true } })
  assert.deepEqual(queries.count[0], { where: { driverId: 'driver-1', status: 'UPHELD' } })
  assert.deepEqual(queries.strikes[0], {
    where: { driverId: 'driver-1' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      responsibilityCaseId: true,
      finalDecisionId: true,
      consequenceLevel: true,
      incidentType: true,
      policyVersion: true,
      status: true,
      createdAt: true,
    },
  })
  assert.deepEqual(queries.blocks[0], {
    where: { driverId: 'driver-1' },
    orderBy: { blockedAt: 'desc' },
    take: 10,
  })

  const summary = await getDriverReliabilitySummary('driver-1', { db, now: NOW, historyLimit: 10 })
  assert.deepEqual(summary.activeReliabilityRestriction, {
    type: 'INDEFINITE',
    blockedAt: undefined,
    blockedUntil: undefined,
  })
  assert.deepEqual(summary.strikes, [{
    id: 'strike-1', responsibilityCaseId: 'case-1', incidentType: undefined, status: undefined, createdAt: undefined,
  }])
  assert.equal(Object.hasOwn(summary, 'blocks'), false)

  const clearDb = {
    ...db,
    reliabilityBlock: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  }
  const clearSummary = await getDriverReliabilitySummary('driver-1', { db: clearDb, now: NOW, historyLimit: 10 })
  assert.equal(clearSummary.activeReliabilityRestriction, null)

  await assert.rejects(
    getDriverReliabilityState('missing', { db: { driver: { findUnique: async () => null } } }),
    error => error instanceof DriverReliabilityError && error.code === 'DRIVER_NOT_FOUND' && error.message === 'Driver not found',
  )
})

function removalHarness(block = {}) {
  const state = {
    block: {
      id: 'block-1',
      driverId: 'driver-1',
      type: 'INDEFINITE',
      removedAt: null,
      removedBy: null,
      removalReason: null,
      ...block,
    },
    lockPresent: true,
    driverPresent: true,
    updated: null,
    queries: [],
    findQuery: null,
    updateQuery: null,
  }
  const tx = {
    $queryRaw: async strings => {
      const sql = strings.join('')
      state.queries.push(sql)
      if (sql.includes('FROM drivers')) return state.driverPresent ? [{ id: 'driver-1' }] : []
      return state.lockPresent ? [{ id: state.block.id }] : []
    },
    reliabilityBlock: {
      findUnique: async query => {
        state.findQuery = query
        return state.block
      },
      update: async query => {
        state.updateQuery = query
        const { data } = query
        state.updated = data
        state.block = { ...state.block, ...data }
        return state.block
      },
    },
  }
  return {
    state,
    db: { $transaction: async callback => callback(tx) },
    clock: { now: () => new Date(NOW) },
  }
}

test('indefinite block removal requires authenticated admin, meaningful reason, and exact ownership', async () => {
  const base = { driverId: 'driver-1', blockId: 'block-1', adminActorId: 'admin-1', reason: 'Reviewed reinstatement' }
  await assert.rejects(
    removeIndefiniteReliabilityBlock({ ...base, adminActorId: '' }, { db: {} }),
    error => error.code === 'ADMIN_ID_REQUIRED' && error.message === 'Authenticated admin identity is required',
  )
  await assert.rejects(
    removeIndefiniteReliabilityBlock({ ...base, reason: 'x' }, { db: {} }),
    error => error.code === 'REMOVAL_REASON_REQUIRED' && error.message === 'A meaningful removal reason is required',
  )
  await assert.rejects(
    removeIndefiniteReliabilityBlock({ ...base, reason: 42 }, { db: {} }),
    { code: 'REMOVAL_REASON_REQUIRED' },
  )
  await assert.rejects(
    removeIndefiniteReliabilityBlock({ ...base, reason: '  a  ' }, { db: {} }),
    { code: 'REMOVAL_REASON_REQUIRED' },
  )

  const exactlyThree = removalHarness()
  const threeResult = await removeIndefiniteReliabilityBlock({ ...base, reason: 'abc' }, exactlyThree)
  assert.equal(threeResult.block.removalReason, 'abc')

  const missing = removalHarness()
  missing.state.lockPresent = false
  await assert.rejects(
    removeIndefiniteReliabilityBlock(base, missing),
    error => error.code === 'BLOCK_NOT_FOUND' && error.message === 'Reliability block not found',
  )

  const missingDriver = removalHarness()
  missingDriver.state.driverPresent = false
  await assert.rejects(
    removeIndefiniteReliabilityBlock(base, missingDriver),
    error => error.code === 'DRIVER_NOT_FOUND' && error.message === 'Driver not found',
  )

  const wrongOwner = removalHarness({ driverId: 'driver-2' })
  await assert.rejects(
    removeIndefiniteReliabilityBlock(base, wrongOwner),
    error => error.code === 'BLOCK_NOT_FOUND' && error.message === 'Reliability block not found',
  )

  const temporary = removalHarness({ type: 'TEMPORARY' })
  await assert.rejects(
    removeIndefiniteReliabilityBlock(base, temporary),
    error => error.code === 'BLOCK_NOT_REMOVABLE' && error.message === 'Only an indefinite reliability block is admin-removable',
  )
})

test('admin removal is audited and idempotent without deleting reliability history', async () => {
  const base = { driverId: 'driver-1', blockId: 'block-1', adminActorId: 'admin-1', reason: '  Reviewed reinstatement  ' }
  const harness = removalHarness()
  const first = await removeIndefiniteReliabilityBlock(base, harness)
  assert.equal(first.reused, false)
  assert.equal(first.block.removedAt.getTime(), NOW.getTime())
  assert.equal(first.block.removedBy, 'admin-1')
  assert.equal(first.block.removalReason, 'Reviewed reinstatement')
  assert.match(harness.state.queries[0], /SELECT id FROM drivers WHERE id = .* FOR UPDATE/)
  assert.match(harness.state.queries[1], /SELECT id FROM reliability_blocks WHERE id = .* FOR UPDATE/)
  assert.deepEqual(harness.state.findQuery, { where: { id: 'block-1' } })
  assert.equal(harness.state.updateQuery.where.id, 'block-1')

  const retry = await removeIndefiniteReliabilityBlock(base, harness)
  assert.equal(retry.reused, true)
  assert.equal(harness.state.updated.removalReason, 'Reviewed reinstatement')
})
