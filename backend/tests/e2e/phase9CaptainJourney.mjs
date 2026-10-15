import assert from 'node:assert/strict';

const wait = (text, timeout = 30000) => '- extendedWaitUntil:\n    visible: "' + text + '"\n    timeout: ' + timeout + '\n';
const tap = text => '- tapOn: "' + text + '"\n';
const accept = '- tapOn:\n    text: "Accept"\n    waitToSettleTimeoutMs: 500\n';

export async function runCaptainJourney({ harness, native, actions }) {
  const booking = await harness.lifecycle.booking();
  const dispatchAt = new Date(booking.scheduledAt.getTime() - 30 * 60 * 1000).toISOString();
  await harness.lifecycle.offer({ at: dispatchAt });
  await native.maestro('accept-acknowledgement-loss', wait('Accept', 90000) + accept
    + wait('Ride details') + '- takeScreenshot: acknowledgement-loss-reconciled\n');
  assert.equal((await harness.lifecycle.booking()).driverId, harness.actors.captain.id);
  assert.equal(native.gateway.faults.length, 1);
  assert.equal(native.gateway.faults[0].kind, 'acceptance-acknowledgement-lost');
  const originalHolds = await harness.db.walletEntry.findMany({ where: { driverId: harness.actors.captain.id, type: 'deposit_hold' } });
  assert.equal(originalHolds.length, 1);
  assert.ok(originalHolds[0].amount < 0);
  const original = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors.captain.id } });
  assert.equal(original.walletBalance, 1000 + originalHolds[0].amount);
  actions.push({ actor: 'physical captain', action: 'native acceptance; lost acknowledgement reconciles actual assignment without another debit', status: 'PASS' });
  await native.reopen();
  await native.maestro('reopen-and-cancel', wait('Ride details', 90000) + tap('Ride details')
    + '- assertVisible: "' + booking.reference + '"\n- takeScreenshot: recovered-assignment\n'
    + '- scrollUntilVisible:\n    element: "Cancel ride"\n    direction: DOWN\n'
    + tap('Cancel ride') + tap('Rider cannot be contacted') + tap('Cancel ride'));
  await native.untilState(async () => (await harness.lifecycle.booking()).driverId === null, 'native cancellation', 30000);
  const retained = await harness.db.driver.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(retained.walletBalance, original.walletBalance);
  assert.equal(retained.vehicleCapacity, 4);
  actions.push({ actor: 'physical captain', action: 'process restart restores actual ride; native cancellation retains the original owner reservation', status: 'PASS' });
  await harness.lifecycle.offer({ at: dispatchAt });
  await native.reopen('replacement');
  await native.maestro('replacement-accept', tap('Notifications') + wait('Accept', 90000) + accept
    + wait('Contact the rider') + '- takeScreenshot: replacement-accepted\n');
  assert.equal((await harness.lifecycle.booking()).driverId, harness.actors.replacement.id);
  for (const actor of ['captain', 'replacement']) {
    const holds = await harness.db.walletEntry.findMany({ where: { driverId: harness.actors[actor].id, type: 'deposit_hold' } });
    assert.equal(holds.length, 1);
    const driver = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors[actor].id } });
    assert.equal(driver.walletBalance, 1000 + holds[0].amount);
  }
  actions.push({ actor: 'physical replacement captain', action: 'separate signed session accepts actual replacement; both owners retain independent holds', status: 'PASS' });
  const incident = await harness.shadow();
  const shadow = await harness.db.responsibilityShadowResult.findFirstOrThrow({ where: { caseId: incident.id } });
  assert.equal(shadow.route, 'NEEDS_ADMIN_REVIEW');
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);
  assert.equal(await harness.db.responsibilityLiability.count(), 0);
  return { incident, shadow, dispatchAt };
}
