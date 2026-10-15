import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentWithReplacement, request } from '../helpers/phase9ReviewHttpFixture.js'

test('protected review binds current evidence and competing submissions retain one human authority without consequences', async t => {
  const { harness, incident } = await incidentWithReplacement(t)
  const path = '/api/admin/responsibility/cases/' + incident.id + '/review'
  const body = { decision: 'WAIVE', classification: 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_0',
    reason: 'Synthetic independent human review', evidenceVersion: incident.evidenceVersion, evidenceHash: incident.evidenceHash }
  for (const actor of [null, 'customer', 'captain', 'foreign']) {
    assert.ok([401, 403].includes((await request(harness, path, actor, body)).status))
  }
  assert.equal((await request(harness, path, 'admin', body, { exp: 1 })).status, 401)
  const { evidenceHash: unused, ...unbound } = body
  void unused
  assert.equal((await request(harness, path, 'admin', unbound)).status, 400)
  assert.equal((await request(harness, path, 'admin', { ...body, evidenceHash: '0'.repeat(64) })).status, 409)
  assert.equal(await harness.db.responsibilityAdminReview.count(), 0)
  const wallets = await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } })
  const responses = await Promise.all([request(harness, path, 'admin', body), request(harness, path, 'admin', body)])
  assert.deepEqual(responses.map(row => row.status), [200, 200])
  assert.equal(await harness.db.responsibilityAdminReview.count(), 1)
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 1)
  assert.equal((await harness.db.responsibilityFinalDecision.findFirstOrThrow()).outcome, 'FINAL_WAIVED')
  assert.equal((await request(harness, path, 'admin', { ...body, evidenceHash: '0'.repeat(64) })).status, 409)
  assert.deepEqual(await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } }), wallets)
  for (const model of ['responsibilityLiability', 'responsibilityConsequenceExecution', 'reliabilityStrike', 'reliabilityBlock']) {
    assert.equal(await harness.db[model].count(), 0)
  }
})

