import assert from 'node:assert/strict'

// Current-policy witness v1. Original Phase 5/7 sources and executions are retained
// in output/phase9d-1-sql-broker-2026-10-13/historical-source and prior manifests.
export function assertIndependentReview(decision,persistedCase) {
  assert.equal(decision.route, 'NEEDS_ADMIN_REVIEW')
  if ('humanReviewRequired' in decision) assert.equal(decision.humanReviewRequired, true)
  else {
    assert.equal(persistedCase?.id,decision.caseId)
    assert.equal(persistedCase?.state,'NEEDS_ADMIN_REVIEW')
  }
  assert.ok(decision.failedGates.some(gate => gate.code === 'INDEPENDENT_ROUTE_AUTHORITY'))
}

export async function consequenceState(client) {
  const names = ['payment','walletEntry','driverPayout','driverPayoutBatch',
    'responsibilityLiability','responsibilityLiabilityEntry','responsibilityCompensation',
    'responsibilityCompensationAllocation','reliabilityStrike','reliabilityBlock']
  const counts = Object.fromEntries(await Promise.all(names.map(async name => [name,await client[name].count()])))
  const bookings = await client.booking.findMany({select:{id:true,status:true,driverId:true},orderBy:{id:'asc'}})
  const drivers = await client.driver.findMany({select:{id:true,walletBalance:true},orderBy:{id:'asc'}})
  return {counts,bookings,drivers}
}

export async function assertNoAutomaticAuthority(client,caseId) {
  for(const name of ['responsibilityFinalDecision','responsibilityAdminReview','responsibilityAppealWindow']) {
    assert.equal(await client[name].count({where:{caseId}}),0,name)
  }
}
