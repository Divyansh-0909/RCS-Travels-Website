import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentWithReplacement, request } from '../helpers/phase9ReviewHttpFixture.js'

test('replacement cannot receive or appeal the original driver incident; confirmed notice and human appeal waiver remain auditable', async t => {
  const { harness, incident } = await incidentWithReplacement(t)
  const { createPrismaResponsibilityLifecycleRepository } = await import('../../services/responsibilityLifecycleRepository.js')
  const { reviewResponsibilityCase } = await import('../../services/responsibilityReviewService.js')
  const { sendAdverseDecisionNotice, syncAppealWindow, ADVERSE_NOTICE_PURPOSE } = await import('../../services/responsibilityNoticeService.js')
  const repository = createPrismaResponsibilityLifecycleRepository(harness.db)
  await reviewResponsibilityCase({ caseId: incident.id, adminActorId: harness.actors.admin.clerkId,
    decision: 'UPHOLD', classification: 'DRIVER_CAUSED', consequenceLevel: 'LEVEL_1',
    reason: 'Explicit synthetic human provisional authority fixture',
    expectedEvidence: { version: incident.evidenceVersion, hash: incident.evidenceHash } }, { repository, notify: false })
  const recipients = []
  const notice = await sendAdverseDecisionNotice(incident.id, { repository,
    push: async driver => recipients.push(driver.id), whatsapp: async phone => recipients.push(phone) })
  assert.deepEqual(recipients, [harness.actors.captain.id, harness.actors.captain.phone])
  const appealPath = '/api/driver/responsibility-cases/' + incident.id + '/appeal'
  const appealBody = { reason: 'Synthetic original driver contests the provisional review', additionalEvidenceRefs: [] }
  assert.equal((await request(harness, appealPath, 'captain', appealBody)).status, 409)
  const deliveredAt = new Date()
  await harness.db.notificationDelivery.create({ data: { provider: 'push', channel: 'push',
    recipient: harness.actors.captain.id, providerMessageId: 'synthetic-delivered-' + incident.id,
    status: 'delivered', bookingId: incident.bookingId, purpose: ADVERSE_NOTICE_PURPOSE,
    retryKey: notice.window.noticeRetryKey, attemptedAt: deliveredAt, deliveredAt } })
  await syncAppealWindow(incident.id, { repository })
  assert.equal((await request(harness, appealPath, 'replacement', appealBody)).status, 403)
  assert.equal((await request(harness, appealPath, 'foreign', appealBody)).status, 403)
  const appealed = await request(harness, appealPath, 'captain', appealBody)
  assert.equal(appealed.status, 201)
  assert.equal((await request(harness, appealPath, 'captain', appealBody)).status, 200)
  assert.equal(await harness.db.responsibilityAppeal.count(), 1)
  const body = { outcome: 'WAIVE', classification: 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_0',
    reason: 'Synthetic independent appeal review waives unsupported causal authority',
    evidenceVersion: incident.evidenceVersion, evidenceHash: incident.evidenceHash }
  const path = '/api/admin/responsibility/cases/' + incident.id + '/appeal-review'
  assert.equal((await request(harness, path, 'admin', { ...body, evidenceHash: '0'.repeat(64) })).status, 409)
  const wallets = await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } })
  assert.equal((await request(harness, path, 'admin', body)).status, 200)
  assert.equal((await request(harness, path, 'admin', body)).status, 200)
  assert.equal(await harness.db.responsibilityAppealReview.count(), 1)
  const final = await harness.db.responsibilityFinalDecision.findFirstOrThrow()
  assert.equal(final.outcome, 'FINAL_WAIVED')
  assert.equal(final.consequenceLevel, 'LEVEL_0')
  assert.deepEqual(await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } }), wallets)
  assert.equal(await harness.db.responsibilityLiability.count(), 0)
  assert.equal(await harness.db.responsibilityConsequenceExecution.count(), 0)
})
