import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'

export const reliabilityBlockType = Object.freeze({
  TEMPORARY: 'TEMPORARY',
  INDEFINITE: 'INDEFINITE',
})

export class DriverReliabilityError extends Error {
  constructor(code, message = code) {
    super(message)
    this.code = code
  }
}

export async function findActiveReliabilityBlock(driverId, {
  db = prisma,
  now = new Date(),
} = {}) {
  if (!driverId) return null
  const indefinite = await db.reliabilityBlock.findFirst({
    where: { driverId, type: reliabilityBlockType.INDEFINITE, removedAt: null },
    orderBy: { blockedAt: 'desc' },
  })
  if (indefinite) return indefinite
  return db.reliabilityBlock.findFirst({
    where: {
      driverId,
      type: reliabilityBlockType.TEMPORARY,
      removedAt: null,
      blockedUntil: { gt: now },
    },
    orderBy: { blockedAt: 'desc' },
  })
}

export async function isDriverReliabilityBlocked({ driverId, db = prisma, now = new Date() } = {}) {
  return Boolean(await findActiveReliabilityBlock(driverId, { db, now }))
}

export async function getDriverReliabilityState(driverId, {
  db = prisma,
  now = new Date(),
  historyLimit = 50,
} = {}) {
  const driver = await db.driver.findUnique({ where: { id: driverId }, select: { id: true } })
  if (!driver) throw new DriverReliabilityError('DRIVER_NOT_FOUND', 'Driver not found')
  const [strikeCount, strikes, activeBlock, blocks] = await Promise.all([
    db.reliabilityStrike.count({ where: { driverId, status: 'UPHELD' } }),
    db.reliabilityStrike.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: historyLimit,
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
    }),
    findActiveReliabilityBlock(driverId, { db, now }),
    db.reliabilityBlock.findMany({
      where: { driverId },
      orderBy: { blockedAt: 'desc' },
      take: historyLimit,
    }),
  ])
  return { driverId, strikeCount, activeBlock, strikes, blocks }
}

export async function getDriverReliabilitySummary(driverId, options = {}) {
  const state = await getDriverReliabilityState(driverId, options)
  return {
    driverId: state.driverId,
    strikeCount: state.strikeCount,
    activeReliabilityRestriction: state.activeBlock ? {
      type: state.activeBlock.type,
      blockedAt: state.activeBlock.blockedAt,
      blockedUntil: state.activeBlock.blockedUntil,
    } : null,
    strikes: state.strikes.map(strike => ({
      id: strike.id,
      responsibilityCaseId: strike.responsibilityCaseId,
      incidentType: strike.incidentType,
      status: strike.status,
      createdAt: strike.createdAt,
    })),
  }
}

export async function removeIndefiniteReliabilityBlock({
  driverId,
  blockId,
  adminActorId,
  reason,
}, {
  db = prisma,
  clock = systemClock,
} = {}) {
  if (!adminActorId) throw new DriverReliabilityError('ADMIN_ID_REQUIRED', 'Authenticated admin identity is required')
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    throw new DriverReliabilityError('REMOVAL_REASON_REQUIRED', 'A meaningful removal reason is required')
  }
  return db.$transaction(async tx => {
    const driverLocked = await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${driverId} FOR UPDATE`
    if (driverLocked.length !== 1) throw new DriverReliabilityError('DRIVER_NOT_FOUND', 'Driver not found')
    const locked = await tx.$queryRaw`SELECT id FROM reliability_blocks WHERE id = ${blockId} FOR UPDATE`
    if (locked.length !== 1) throw new DriverReliabilityError('BLOCK_NOT_FOUND', 'Reliability block not found')
    const block = await tx.reliabilityBlock.findUnique({ where: { id: blockId } })
    if (!block || block.driverId !== driverId) throw new DriverReliabilityError('BLOCK_NOT_FOUND', 'Reliability block not found')
    if (block.type !== reliabilityBlockType.INDEFINITE) {
      throw new DriverReliabilityError('BLOCK_NOT_REMOVABLE', 'Only an indefinite reliability block is admin-removable')
    }
    if (block.removedAt) return { block, reused: true }
    const removedAt = clock.now()
    const updated = await tx.reliabilityBlock.update({
      where: { id: block.id },
      data: { removedAt, removedBy: adminActorId, removalReason: reason.trim() },
    })
    return { block: updated, reused: false }
  })
}
