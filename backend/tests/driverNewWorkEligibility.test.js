import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isIndependentSuspensionActive,
  newWorkEligibility,
  recheckDriverNewWorkEligibility,
  registerReliabilityBlockLookup,
} from '../services/driverNewWorkEligibility.js'
import { isDriverReliabilityBlocked } from '../services/driverReliability.js'

const now = new Date('2026-09-29T10:00:00.000Z')

test('missing driver is ineligible before any suspension or reliability lookup', async () => {
  assert.deepEqual(await newWorkEligibility(null, { now }), {
    eligible: false,
    code: 'DRIVER_NOT_FOUND',
  })
})

test('new work is refused for an active independent suspension but not an expired temporary suspension', async () => {
  assert.equal(isIndependentSuspensionActive(null, now), false)
  assert.equal(isIndependentSuspensionActive({ suspendedAt: new Date(), suspensionExpiresAt: null }, now), true)
  assert.equal(isIndependentSuspensionActive({
    suspendedAt: new Date('2026-09-20T00:00:00.000Z'),
    suspensionExpiresAt: new Date('2026-09-29T10:00:00.000Z'),
  }, now), false)
  assert.equal(isIndependentSuspensionActive({
    suspendedAt: new Date('2026-09-20T00:00:00.000Z'),
    suspensionExpiresAt: new Date('2026-09-29T10:00:01.000Z'),
  }, now), true)
  assert.equal(isIndependentSuspensionActive({
    suspendedAt: new Date('2026-09-20T00:00:00.000Z'),
    suspensionExpiresAt: new Date('2026-09-29T09:59:59.000Z'),
  }, now), false)
  assert.deepEqual(await newWorkEligibility({ id: 'driver-1', suspendedAt: new Date(), suspensionExpiresAt: null }, { now }), {
    eligible: false,
    code: 'INDEPENDENTLY_SUSPENDED',
  })
})

test('new work consults the authoritative reliability-block boundary', async () => {
  const result = await newWorkEligibility({ id: 'driver-1', suspendedAt: null, suspensionExpiresAt: null }, {
    now,
    lookupReliabilityBlock: async ({ driverId, db, now: lookupNow }) => {
      assert.equal(driverId, 'driver-1')
      assert.equal(db, dbStub)
      assert.equal(lookupNow, now)
      return true
    },
    db: dbStub,
  })
  assert.deepEqual(result, { eligible: false, code: 'RELIABILITY_BLOCKED' })
})

test('the replaceable reliability lookup accepts only functions and remains testable', async () => {
  assert.throws(
    () => registerReliabilityBlockLookup(null),
    error => error instanceof TypeError && error.message === 'reliability block lookup must be a function',
  )
  let called = false
  registerReliabilityBlockLookup(async ({ driverId }) => {
    called = driverId === 'driver-registered'
    return false
  })
  try {
    assert.deepEqual(await newWorkEligibility({ id: 'driver-registered', suspendedAt: null, suspensionExpiresAt: null }), {
      eligible: true,
      code: null,
    })
    assert.equal(called, true)
  } finally {
    registerReliabilityBlockLookup(isDriverReliabilityBlocked)
  }
})

const dbStub = {
  async $queryRaw() { return [{ id: 'driver-1' }] },
  driver: {
    async findUnique() {
      return { id: 'driver-1', suspendedAt: null, suspensionExpiresAt: null }
    },
  },
  reliabilityBlock: {
    async findFirst() { return null },
  },
}

test('claim-time recheck reads current driver state through its transaction', async () => {
  let lockSql = ''
  let findQuery = null
  const db = {
    ...dbStub,
    async $queryRaw(strings) {
      lockSql = strings.join('?')
      return [{ id: 'driver-1' }]
    },
    driver: {
      async findUnique(query) {
        findQuery = query
        return { id: 'driver-1', suspendedAt: null, suspensionExpiresAt: null }
      },
    },
  }
  const result = await recheckDriverNewWorkEligibility('driver-1', { db, now })
  assert.deepEqual(result, { eligible: true, code: null })
  assert.match(lockSql, /SELECT id FROM drivers WHERE id = .* FOR UPDATE/)
  assert.deepEqual(findQuery, {
    where: { id: 'driver-1' },
    select: { id: true, suspendedAt: true, suspensionExpiresAt: true },
  })
})

test('claim-time recheck fails closed when the driver row cannot be locked', async () => {
  const db = { ...dbStub, $queryRaw: async () => [] }
  assert.deepEqual(await recheckDriverNewWorkEligibility('missing', { db, now }), {
    eligible: false,
    code: 'DRIVER_NOT_FOUND',
  })
})

test('claim-time recheck rejects a stale offer after a reliability block appears', async () => {
  const db = {
    ...dbStub,
    reliabilityBlock: {
      async findFirst({ where }) {
        return where.type === 'INDEFINITE'
          ? { id: 'block-1', driverId: 'driver-1', type: 'INDEFINITE', removedAt: null }
          : null
      },
    },
  }
  assert.deepEqual(await recheckDriverNewWorkEligibility('driver-1', { db, now }), {
    eligible: false,
    code: 'RELIABILITY_BLOCKED',
  })
})
