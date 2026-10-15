import { prisma } from '../db/prisma.js'

async function recoverUniqueRace(write, reload) {
  try {
    return await write()
  } catch (error) {
    if (error?.code !== 'P2002') throw error
    const existing = await reload()
    if (!existing) throw error
    return existing
  }
}

export function createPrismaResponsibilityDecisionRepository(db = prisma) {
  return {
    findCase: caseId => db.responsibilityCase.findUnique({ where: { id: caseId } }),
    saveCaseEvidence: record => db.responsibilityCase.upsert({
      where: { id: record.id },
      update: {
        bookingId: record.bookingId,
        caseType: record.caseType,
        evidenceVersion: record.evidenceVersion,
        evidenceHash: record.evidenceHash,
        evidenceSnapshot: record.evidenceSnapshot,
        scheduledAt: record.scheduledAt,
        occurredAt: record.occurredAt,
      },
      create: record,
    }),
    setCaseState: (caseId, state) => db.responsibilityCase.update({ where: { id: caseId }, data: { state } }),
    findAnalysis: logicalKey => db.responsibilityAnalysis.findUnique({ where: { logicalKey } }),
    saveAnalysis: record => recoverUniqueRace(
      () => db.responsibilityAnalysis.upsert({
        where: { logicalKey: record.logicalKey },
        update: {},
        create: record,
      }),
      () => db.responsibilityAnalysis.findUnique({ where: { logicalKey: record.logicalKey } }),
    ),
    findDecision: caseId => db.responsibilityProvisionalDecision.findUnique({ where: { caseId } }),
    saveDecision: record => recoverUniqueRace(
      () => db.responsibilityProvisionalDecision.upsert({
        where: { caseId: record.caseId },
        update: {},
        create: record,
      }),
      () => db.responsibilityProvisionalDecision.findUnique({ where: { caseId: record.caseId } }),
    ),
  }
}
