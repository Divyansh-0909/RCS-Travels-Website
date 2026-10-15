import test from 'node:test'
import assert from 'node:assert/strict'
import { phase9ObservedReplayRecipes } from '../helpers/phase9ReplayScenarios.js'
import { sealPhase9Scenario } from '../helpers/phase9ReplayContract.js'
import { executePhase9Scenario } from '../helpers/phase9ReplayExecutor.js'
import { assertPhase9Environment } from '../helpers/phase9Isolation.js'
import { createTestDatabase } from '../helpers/database.js'
import { createPhase9Lifecycle, phase9FinancialSnapshot } from '../helpers/phase9Lifecycle.js'
import { cancelCustomerWithEvidenceInTransaction } from '../../services/customerLifecycleIncidents.js'

assertPhase9Environment(process.env)

test('Phase 9 observed lifecycle: incident persistence failure rolls back cancellation and deposit returns', async () => {
  const database = await createTestDatabase()
  let s
  try {
    s = await createPhase9Lifecycle(database)
    assert.equal((await s.deliver()).status, 200)
    await s.offer()
    assert.equal(await s.accept(), 'claimed')
    const booking = await s.booking()
    const before = await phase9FinancialSnapshot(s.db)
    await s.db.$executeRawUnsafe(`CREATE FUNCTION phase9_case_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'PHASE9_CASE_PERSISTENCE_FAILURE'; END $$`)
    await s.db.$executeRawUnsafe(`CREATE TRIGGER phase9_case_failure BEFORE INSERT ON responsibility_cases
      FOR EACH ROW EXECUTE FUNCTION phase9_case_failure()`)
    await assert.rejects(s.db.$transaction(tx => cancelCustomerWithEvidenceInTransaction(tx,
      { booking, cancellationCharge: 0, advanceDisposition: 'refund_pending' }, { clock: s.clock })))
    assert.deepEqual(await phase9FinancialSnapshot(s.db), before)
    assert.equal((await s.booking()).status, 'assigned')
    assert.equal(await s.db.responsibilityCase.count(), 0)
    assert.equal(await s.db.responsibilityAdjudicationWork.count(), 0)
  } finally {
    if (s) await s.close()
    await database.close()
  }
})
for (const recipe of phase9ObservedReplayRecipes) {
  test(`Phase 9 observed lifecycle: ${recipe.id}`, async () => {
    const result = await executePhase9Scenario(await sealPhase9Scenario(recipe))
    const state = result.final
    for (const key of ['finality', 'liabilities', 'compensation', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) {
      assert.equal(state.financial[key], 0, `${key}: observed incident cannot create authority`)
    }
    for (const incident of state.cases) assert.equal(incident.state, 'NEEDS_ADMIN_REVIEW')
    for (const outcome of state.shadowResults) assert.equal(outcome.route, 'NEEDS_ADMIN_REVIEW')
    assert.ok(state.cases.every(row => ['DRIVER_CANCELLATION', 'RIDER_CANCELLATION', 'DRIVER_LATE'].includes(row.caseType)))
    assert.equal(new Set(state.cases.map(row => row.sourceKey)).size, state.cases.length)
    if (recipe.id.startsWith('gps-')) {
      const location = state.cases[0].evidenceSnapshot.timeline.find(row => row.category === 'location')
      if (recipe.id.includes('missing')) assert.equal(location.availability, 'unknown')
      const cancellation = result.events.find(row => row.type === 'customer_cancel').outcome
      assert.equal(cancellation.charge, recipe.id.includes('fresh') ? 10_000 : 0)
    }
    if (recipe.id === 'traffic-worsens-after-acceptance') {
      assert.equal(state.routes.length, 2)
      assert.deepEqual(state.routes.map(row => row.trafficDurationSeconds).sort((a, b) => a - b), [360, 1800])
      assert.equal(state.cases[0].evidenceSnapshot.timeline.find(row => row.category === 'feasibility').value.assessment, 'UNASSESSED')
    }
    if (recipe.id === 'delivery-after-cancellation') {
      assert.equal(state.booking.status, 'cancelled')
      assert.equal(state.notifications[0].status, 'read')
      const saved = state.cases[0].evidenceSnapshot.timeline.find(row => row.category === 'notification').value
      assert.equal(saved.status, 'accepted', 'later callback cannot rewrite immutable incident evidence')
    }
    if (recipe.id.includes('ten-minute')) {
      assert.equal(state.cases.filter(row => row.caseType === 'DRIVER_LATE').length, 1)
      assert.equal(state.financial.wallets.filter(row => row.type === 'deposit_refund').length, 2)
    }
  })
}
