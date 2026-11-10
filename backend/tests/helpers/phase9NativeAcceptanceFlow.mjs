import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMaestroTrigger } from './phase9MaestroTrigger.mjs';
import { captureNativeHierarchy } from './phase9NativeHierarchy.mjs';

export async function verifyNativeAcceptance(harness, native, output, { theme = null } = {}) {
  if (theme) {
    assert.ok(['light', 'dark'].includes(theme));
    await native.maestro('select-' + theme + '-theme', `- tapOn: "Account"\n- scrollUntilVisible:\n    element: "Appearance"\n    direction: DOWN\n    visibilityPercentage: 100\n    centerElement: true\n- tapOn: "Appearance"\n- tapOn:\n    text: "${theme === 'light' ? 'Light' : 'Dark'}"\n    index: 0\n- takeScreenshot: appearance-${theme}\n- scrollUntilVisible:\n    element: "Home"\n    direction: UP\n- tapOn: "Home"\n- assertVisible: "No ride scheduled"\n`);
  }
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const booking = await harness.lifecycle.booking();
  let offer;
  const trigger = await createMaestroTrigger(async () => {
    await harness.lifecycle.offer();
    offer = await harness.db.rideOffer.findFirstOrThrow({ where: { bookingId: booking.id, driverId: harness.actors.captain.id } });
  });
  await writeFile(join(output, 'setup-offer.js'), `var result = http.post(${JSON.stringify(trigger.url)}, {body: ''});\nif (!result.ok) throw new Error('Synthetic offer setup failed: ' + result.status);\nconsole.log('Offer seeded after Maestro readiness');\n`);
  try {
    await native.maestro('accept-failure-and-retry', `- runScript: setup-offer.js
- extendedWaitUntil:
    visible: "Accept"
    timeout: 90000
- takeScreenshot: incoming-offer
- tapOn:
    text: "Accept"
    waitToSettleTimeoutMs: 500
- assertVisible: "Controlled acceptance outage. Please retry."
- takeScreenshot: acceptance-failure
- extendedWaitUntil:
    notVisible: "Controlled acceptance outage. Please retry."
    timeout: 45000
- takeScreenshot: panel-expired
- tapOn:
    text: "Notifications"
    waitToSettleTimeoutMs: 500
- assertVisible: "Notifications"
- assertVisible: "Accept"
- takeScreenshot: retained-notification
- tapOn:
    text: "Accept"
    waitToSettleTimeoutMs: 500
- extendedWaitUntil:
    visible: "Contact the rider"
    timeout: 30000
- takeScreenshot: accepted
`);
    // The Maestro instrumentation process has ended, so a separate Android UI
    // dump can collect the final accessible tree without competing for it.
    const hierarchy = await captureNativeHierarchy(native.device);
    await writeFile(join(output, 'acceptance-final-hierarchy.xml'), hierarchy);
    const assigned = await harness.lifecycle.booking();
    assert.equal(assigned.driverId, harness.actors.captain.id);
    assert.equal(assigned.status, 'assigned');
    assert.equal(native.gateway.faults.length, 1);
    assert.equal(native.gateway.faults[0].driverAssigned, false);
    assert.equal(native.gateway.faults[0].walletBalance, 1000);
    const owner = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors.captain.id } });
    assert.equal(owner.walletBalance, 900);
    return { booking, owner, assigned };
  } finally {
    await writeFile(join(output, 'acceptance-timeline.json'), JSON.stringify({
      theme, events: trigger.events,
      offer: offer ? { id: offer.id, status: offer.status, createdAt: offer.createdAt, panelDeadline: new Date(offer.createdAt.getTime() + 30000) } : null,
      responses: native.gateway.timeline || [], offerSnapshots: native.gateway.offerSnapshots || [], faults: native.gateway.faults,
    }, null, 2));
    await trigger.close();
  }
}
