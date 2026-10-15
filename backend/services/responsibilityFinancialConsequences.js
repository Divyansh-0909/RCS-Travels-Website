import { prisma } from '../db/prisma.js'
import { systemClock } from '../lib/clock.js'
import { responsibilityEvidenceHash } from './responsibilityAnalyst.js'
import { responsibilityCaseState } from './responsibilityCaseState.js'
import { RESPONSIBILITY_CONSEQUENCE_STATUS } from './responsibilityConsequences.js'
import {
  liabilityPaiseForFare,
  RESPONSIBILITY_LIABILITY_CAP_PAISE,
  RESPONSIBILITY_LIABILITY_PERCENT,
} from './responsibilityFinancialMath.js'
import {
  financialPolicyForCaseType,
  responsibilityFinancialDisposition,
  durableFinancialBlockedReasons,
} from './responsibilityFinancialPolicy.js'
import { provisionalResponsibilityRoute } from './responsibilityPolicyGate.js'

export class ResponsibilityFinancialError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const requireOne = (items, code) => {
  if (items.length !== 1 || items[0].basis !== 'direct' || items[0].availability !== 'available') {
    throw new ResponsibilityFinancialError(code)
  }
  return items[0].value
}

function incidentTerms(responsibilityCase) {
  const policy = financialPolicyForCaseType(responsibilityCase.caseType)
  if (policy.disposition !== responsibilityFinancialDisposition.FINANCIALLY_SUPPORTED_DRIVER_INCIDENT) {
    throw new ResponsibilityFinancialError(policy.blockedReason)
  }
  const snapshot = responsibilityCase.evidenceSnapshot
  if (responsibilityEvidenceHash(snapshot) !== responsibilityCase.evidenceHash) {
    throw new ResponsibilityFinancialError('EVIDENCE_HASH_MISMATCH')
  }
  const entries = snapshot.timeline
  const booking = requireOne(entries.filter(entry => entry.kind === 'booking_state_at_driver_cancellation'), 'BOOKING_FARE_EVIDENCE_MISSING')
  const assignment = requireOne(entries.filter(entry => entry.kind === 'assigned_driver_at_cancellation'), 'DRIVER_EVIDENCE_MISSING')
  const cancellation = requireOne(entries.filter(entry => entry.kind === 'driver_cancellation_recorded'), 'CANCELLATION_EVIDENCE_MISSING')
  if (booking.bookingId !== responsibilityCase.bookingId || booking.fareBasis !== 'BOOKING_FARE_AT_INCIDENT' ||
      !Number.isSafeInteger(booking.authoritativeFarePaise) || booking.authoritativeFarePaise <= 0 ||
      !booking.userId || !assignment.driverId || !cancellation.cancellationId || cancellation.initiator !== 'driver') {
    throw new ResponsibilityFinancialError('INCIDENT_FINANCIAL_EVIDENCE_INVALID')
  }
  return {
    bookingId: booking.bookingId,
    userId: booking.userId,
    driverId: assignment.driverId,
    farePaise: booking.authoritativeFarePaise,
    cancellationId: cancellation.cancellationId,
  }
}

async function loadAuthorizedCaseRecords(tx, caseId) {
  const locked = await tx.$queryRaw`SELECT id FROM responsibility_cases WHERE id = ${caseId} FOR UPDATE`
  if (locked.length !== 1) throw new ResponsibilityFinancialError('CASE_MISSING')
  const responsibilityCase = await tx.responsibilityCase.findUniqueOrThrow({ where: { id: caseId } })
  const records = await Promise.all([
    tx.responsibilityFinalDecision.findUnique({ where: { caseId } }),
    tx.responsibilityConsequenceExecution.findUnique({ where: { caseId } }),
    tx.responsibilityProvisionalDecision.findUnique({ where: { caseId } }),
    tx.responsibilityAdminReview.findUnique({ where: { caseId } }),
    tx.responsibilityAppealReview.findUnique({ where: { caseId } }),
    tx.responsibilityAppealWindow.findUnique({ where: { caseId } }),
  ])
  return { responsibilityCase, records }
}

function assertFinalDecision(responsibilityCase, decision, authorization) {
  if (responsibilityCase.state !== responsibilityCaseState.FINAL_UPHELD ||
      decision?.outcome !== responsibilityCaseState.FINAL_UPHELD) {
    throw new ResponsibilityFinancialError('CASE_NOT_FINAL_UPHELD')
  }
  if (!decision.policyVersion || !decision.finalizedAt || decision.evidenceHash !== responsibilityCase.evidenceHash) {
    throw new ResponsibilityFinancialError('FINAL_DECISION_INCONSISTENT')
  }
  if (!authorization || authorization.finalDecisionId !== decision.id ||
      authorization.policyVersion !== decision.policyVersion ||
      authorization.finalizedAt.getTime() !== decision.finalizedAt.getTime() ||
      authorization.status !== RESPONSIBILITY_CONSEQUENCE_STATUS) {
    throw new ResponsibilityFinancialError('FINALIZED_AUTHORIZATION_MISSING')
  }
}

function assertClassification(decision, provisionalDecision, responsibilityCase) {
  if (decision.classification !== 'DRIVER_CAUSED') {
    throw new ResponsibilityFinancialError('FINALIZED_DRIVER_CLASSIFICATION_MISSING')
  }
  if (provisionalDecision?.evidenceHash !== responsibilityCase.evidenceHash ||
      provisionalDecision.policyVersion !== decision.policyVersion) {
    throw new ResponsibilityFinancialError('FINALIZED_DRIVER_CLASSIFICATION_MISSING')
  }
}

function isAdminUpheld(adminReview, provisionalDecision, decision, responsibilityCase) {
  return provisionalDecision.route === provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW &&
    adminReview?.decision === 'UPHOLD' && adminReview.classification === decision.classification &&
    adminReview.evidenceHash === responsibilityCase.evidenceHash && adminReview.policyVersion === decision.policyVersion
}

function hasAppealSource(appealWindow, provisionalDecision, adminReview, adminUpheld) {
  return (appealWindow?.sourceDecisionType === 'AUTO' &&
      appealWindow.sourceDecisionId === provisionalDecision.id &&
      provisionalDecision.route === provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD) ||
    (appealWindow?.sourceDecisionType === 'ADMIN' && appealWindow.sourceDecisionId === adminReview?.id && adminUpheld)
}

function assertFinalizationLineage({ responsibilityCase, decision, provisionalDecision, adminReview, appealReview, appealWindow }) {
  const autoFinalization = decision.source === 'NO_APPEAL_AUTO' &&
    provisionalDecision.route === provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD
  const adminUpheld = isAdminUpheld(adminReview, provisionalDecision, decision, responsibilityCase)
  const adminFinalization = decision.source === 'NO_APPEAL_ADMIN' && adminUpheld
  const appealSource = hasAppealSource(appealWindow, provisionalDecision, adminReview, adminUpheld)
  const appealFinalization = decision.source === 'APPEAL_REVIEW' &&
    appealReview?.outcome === 'UPHOLD' && appealReview.appealId === decision.appealId &&
    appealReview.classification === decision.classification &&
    appealReview.evidenceHash === responsibilityCase.evidenceHash &&
    appealReview.policyVersion === decision.policyVersion && appealSource
  if (!autoFinalization && !adminFinalization && !appealFinalization) {
    throw new ResponsibilityFinancialError('FINALIZED_DRIVER_CLASSIFICATION_MISSING')
  }
}

async function authorizedCase(tx, caseId) {
  const { responsibilityCase, records } = await loadAuthorizedCaseRecords(tx, caseId)
  const [decision, authorization, provisionalDecision, adminReview, appealReview, appealWindow] = records
  assertFinalDecision(responsibilityCase, decision, authorization)
  assertClassification(decision, provisionalDecision, responsibilityCase)
  assertFinalizationLineage({ responsibilityCase, decision, provisionalDecision, adminReview, appealReview, appealWindow })
  return { responsibilityCase, decision, authorization }
}

async function verifyIncident(tx, terms) {
  const [booking, cancellation] = await Promise.all([
    tx.booking.findUnique({ where: { id: terms.bookingId }, select: { userId: true } }),
    tx.driverCancellation.findUnique({ where: { id: terms.cancellationId }, select: { bookingId: true, driverId: true } }),
  ])
  if (!booking || booking.userId !== terms.userId || !cancellation ||
      cancellation.bookingId !== terms.bookingId || cancellation.driverId !== terms.driverId) {
    throw new ResponsibilityFinancialError('INCIDENT_LINK_MISMATCH')
  }
}

function matchesCreationEntry(entry, liability, sourceKey, amountPaise) {
  return entry?.liabilityId === liability.id && entry.sourceKey === sourceKey &&
    entry.amountPaise === amountPaise && entry.kind === 'CREATED' && entry.earningBookingId === null
}

async function existingConsequence(tx, caseId, decision, terms, amountPaise) {
  const liability = await tx.responsibilityLiability.findUnique({ where: { caseId } })
  if (!liability) return null
  const sourceKey = `liability-created:${decision.id}`
  const [compensation, createdEntry] = await Promise.all([
    tx.responsibilityCompensation.findUnique({ where: { caseId } }),
    tx.responsibilityLiabilityEntry.findUnique({ where: { sourceKey } }),
  ])
  if (liability.caseId !== caseId || liability.finalDecisionId !== decision.id ||
      liability.driverId !== terms.driverId || liability.bookingId !== terms.bookingId ||
      liability.authoritativeFarePaise !== terms.farePaise ||
      liability.rateBps !== RESPONSIBILITY_LIABILITY_PERCENT * 100 ||
      liability.capPaise !== RESPONSIBILITY_LIABILITY_CAP_PAISE ||
      liability.amountPaise !== amountPaise || liability.policyVersion !== decision.policyVersion ||
      compensation?.caseId !== caseId || compensation.liabilityId !== liability.id ||
      compensation.userId !== terms.userId || compensation.amountPaise !== amountPaise ||
      !matchesCreationEntry(createdEntry, liability, sourceKey, amountPaise)) {
    throw new ResponsibilityFinancialError('FINANCIAL_CONSEQUENCE_INCONSISTENT')
  }
  return { liability, compensation, reused: true }
}

/** The only financial executor. The caller supplies an ID, never a fare or finality assertion. */
export async function applyAuthorizedResponsibilityFinancialConsequences(caseId, {
  db = prisma,
  clock = systemClock,
} = {}) {
  if (!caseId) throw new ResponsibilityFinancialError('CASE_ID_REQUIRED')
  return db.$transaction(async tx => {
    const { responsibilityCase, decision, authorization } = await authorizedCase(tx, caseId)
    const terms = incidentTerms(responsibilityCase)
    await verifyIncident(tx, terms)
    const amountPaise = liabilityPaiseForFare(terms.farePaise)
    if (amountPaise <= 0) throw new ResponsibilityFinancialError('LIABILITY_AMOUNT_INVALID')
    const reused = await existingConsequence(tx, caseId, decision, terms, amountPaise)
    if (reused) {
      if (!authorization.financialAppliedAt) await tx.responsibilityConsequenceExecution.updateMany({
        where: { caseId, financialAppliedAt: null },
        data: { financialAppliedAt: clock.now(), financialAttemptedAt: clock.now(), financialLastError: null },
      })
      return reused
    }

    const liability = await tx.responsibilityLiability.create({ data: {
      caseId,
      finalDecisionId: decision.id,
      driverId: terms.driverId,
      bookingId: terms.bookingId,
      authoritativeFarePaise: terms.farePaise,
      rateBps: RESPONSIBILITY_LIABILITY_PERCENT * 100,
      capPaise: RESPONSIBILITY_LIABILITY_CAP_PAISE,
      amountPaise,
      policyVersion: decision.policyVersion,
      calculatedAt: clock.now(),
    } })
    await tx.responsibilityLiabilityEntry.create({ data: {
      liabilityId: liability.id,
      kind: 'CREATED',
      amountPaise,
      sourceKey: `liability-created:${decision.id}`,
    } })
    const compensation = await tx.responsibilityCompensation.create({ data: {
      caseId,
      liabilityId: liability.id,
      userId: terms.userId,
      amountPaise,
    } })
    await tx.responsibilityConsequenceExecution.update({
      where: { caseId },
      data: { financialAppliedAt: clock.now(), financialAttemptedAt: clock.now(), financialLastError: null },
    })
    return { liability, compensation, reused: false }
  })
}

export async function sweepResponsibilityFinancialConsequences({ db = prisma, clock = systemClock, batchSize = 50,
  apply = applyAuthorizedResponsibilityFinancialConsequences } = {}) {
  const pending = await db.responsibilityConsequenceExecution.findMany({
    where: {
      financialAppliedAt: null,
      status: RESPONSIBILITY_CONSEQUENCE_STATUS,
      OR: [
        { financialLastError: null },
        { financialLastError: { notIn: durableFinancialBlockedReasons } },
      ],
    },
    // Newly authorized cases go first. A blocked case moves behind the queue
    // after its durable attempt stamp, so one bad incident cannot starve others.
    orderBy: [{ financialAttemptedAt: { sort: 'asc', nulls: 'first' } }, { authorizedAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { caseId: true },
  })
  const results = []
  for (const { caseId } of pending) {
    try {
      const applied = await apply(caseId, { db, clock })
      results.push({ caseId, status: applied.reused ? 'REUSED' : 'APPLIED' })
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'FINANCIAL_EXECUTION_FAILED'
      await db.responsibilityConsequenceExecution.updateMany({
        where: { caseId, financialAppliedAt: null },
        data: { financialAttemptedAt: clock.now(), financialLastError: code },
      })
      results.push({ caseId, status: 'BLOCKED', code })
    }
  }
  return results
}
