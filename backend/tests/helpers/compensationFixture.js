import { randomUUID } from 'node:crypto'

// Shared synthetic PREEXISTING authority fixture. Never a shadow decision.
export async function seedEntitlement(db, scenario, now = new Date('2026-09-27T08:00:00.000Z')) {
  const caseId = `phase6c-booking-${randomUUID()}`
  const previous = scenario.bookingStates.previous
  await db.responsibilityCase.create({ data: {
    id: caseId, bookingId: previous.id, caseType: 'DRIVER_CANCELLATION', state: 'FINAL_UPHELD',
    evidenceVersion: 'test-v1', evidenceHash: 'test-hash', evidenceSnapshot: { timeline: [] }, occurredAt: now,
  } })
  const decision = await db.responsibilityFinalDecision.create({ data: {
    caseId, outcome: 'FINAL_UPHELD', classification: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1',
    evidenceHash: 'test-hash', policyVersion: 'phase6c-test', finalizedAt: now,
  } })
  const liability = await db.responsibilityLiability.create({ data: {
    caseId, finalDecisionId: decision.id, driverId: scenario.driversByGroup.rcs.id,
    bookingId: previous.id, authoritativeFarePaise: 100000, rateBps: 1000, capPaise: 10000,
    amountPaise: 10000, policyVersion: 'phase6c-test', calculatedAt: now,
  } })
  return db.responsibilityCompensation.create({ data: {
    caseId, liabilityId: liability.id, userId: scenario.customer.id, amountPaise: 10000,
  } })
}
