import { prisma } from '../db/prisma.js'
import { isDriverReliabilityBlocked } from './driverReliability.js'

/** The production lookup is durable; tests may install a narrow deterministic fake. */
let reliabilityBlockLookup = isDriverReliabilityBlocked

export function registerReliabilityBlockLookup(lookup) {
  if (typeof lookup !== 'function') throw new TypeError('reliability block lookup must be a function')
  reliabilityBlockLookup = lookup
}

export function isIndependentSuspensionActive(driver, now = new Date()) {
  return Boolean(driver?.suspendedAt && (!driver.suspensionExpiresAt || new Date(driver.suspensionExpiresAt) > now))
}

/** One policy for every operation that gives a captain new work. */
export async function newWorkEligibility(driver, {
  db = prisma,
  now = new Date(),
  lookupReliabilityBlock = reliabilityBlockLookup,
} = {}) {
  if (!driver) return { eligible: false, code: 'DRIVER_NOT_FOUND' }
  if (isIndependentSuspensionActive(driver, now)) return { eligible: false, code: 'INDEPENDENTLY_SUSPENDED' }
  if (await lookupReliabilityBlock({ driverId: driver.id, db, now })) return { eligible: false, code: 'RELIABILITY_BLOCKED' }
  return { eligible: true, code: null }
}

/**
 * Re-read within the claim transaction so a stale offer cannot beat a block.
 * @param {string} driverId
 * @param {{db?: typeof prisma | import('@prisma/client').Prisma.TransactionClient, now?: Date}} [options]
 */
export async function recheckDriverNewWorkEligibility(driverId, { db = prisma, now = new Date() } = {}) {
  const locked = await db.$queryRaw`SELECT id FROM drivers WHERE id = ${driverId} FOR UPDATE`
  if (locked.length !== 1) return { eligible: false, code: 'DRIVER_NOT_FOUND' }
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    select: { id: true, suspendedAt: true, suspensionExpiresAt: true },
  })
  return newWorkEligibility(driver, { db, now })
}
