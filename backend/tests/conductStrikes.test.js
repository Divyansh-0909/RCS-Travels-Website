import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { summarizeComplaintIncident } from '../services/complaints.js'
import { suspendDriverSchema } from '../types.ts'

const source = relative => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

test('unresolved complaint history has no automatic fine, strike, or block side effect', async () => {
  let countReads = 0
  const countQueries = []
  const tx = {
    rideComplaint: {
      count: async query => {
        countReads += 1
        countQueries.push(query)
        return 7
      },
    },
    driver: { update: async () => assert.fail('complaint history must not mutate driver state') },
    walletEntry: { create: async () => assert.fail('complaint history must not create a fine') },
    rideOffer: { updateMany: async () => assert.fail('complaint history must not withdraw offers') },
  }

  const result = await summarizeComplaintIncident(tx, 'driver-1')
  assert.deepEqual(result, { complaints: 7, reviewRequired: true, consequenceApplied: false })
  assert.equal(countReads, 1)
  assert.deepEqual(countQueries, [{ where: { driverId: 'driver-1' } }])
})

test('legacy conduct-strike executor is retired from production', () => {
  const legacyPath = fileURLToPath(new URL('../services/conductStrikes.js', import.meta.url))
  assert.equal(existsSync(legacyPath), false)
})

test('cancellation and complaint services cannot recreate direct punishment dependencies', () => {
  const files = [
    '../services/driverCancellations.js',
    '../services/driverRideCancellation.js',
    '../services/complaints.js',
  ]
  const forbidden = [
    'conductStrikes',
    'postWalletEntry',
    'commissionFreeRidesRemaining',
    'suspensionExpiresAt',
    'suspensionReason',
  ]
  for (const file of files) {
    const contents = source(file)
    for (const token of forbidden) {
      assert.equal(contents.includes(token), false, `${file} must not contain ${token}`)
    }
  }
})

test('direct admin suspension requires explicit independent moderation scope', () => {
  assert.equal(suspendDriverSchema.safeParse({ suspended: true, reason: 'Responsibility outcome' }).success, false)
  assert.equal(suspendDriverSchema.safeParse({
    suspended: true,
    reason: 'Immediate platform-integrity investigation',
    scope: 'independent_safety_or_integrity',
  }).success, true)
  assert.equal(suspendDriverSchema.safeParse({ suspended: false }).success, true)
})
