import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { findResponsibilityIncidentDriver } from '../../services/responsibilityIncidentDriver.js';

export async function runCrossClosure({ browser, harness, url, output, contexts, actions, customer, incident }) {
  const bookingUrl = url + '/booking/' + harness.lifecycle.bookingId;
  const shot = (page, name) => page.screenshot({ path: join(output, name + '.png'), fullPage: true });
  const consequenceCounts = async () => ({
    liabilities: await harness.db.responsibilityLiability.count(),
    strikes: await harness.db.reliabilityStrike.count(), blocks: await harness.db.reliabilityBlock.count(),
    executions: await harness.db.responsibilityConsequenceExecution.count(), payouts: await harness.db.driverPayout.count(),
  });
  const noConsequences = { liabilities: 0, strikes: 0, blocks: 0, executions: 0, payouts: 0 };
  await customer.goto(bookingUrl);
  await expect(customer.getByRole('heading', { name: 'Driver assigned', exact: true })).toBeVisible();
  const cancellationNotice = customer.getByRole('button', { name: 'Close driver cancellation notice', exact: true });
  if (await cancellationNotice.isVisible()) await cancellationNotice.click();
  await shot(customer, 'customer-replacement-assigned');
  const owner = await findResponsibilityIncidentDriver(harness.db, incident);
  assert.equal(owner.driverId, harness.actors.captain.id);
  assert.equal((await harness.lifecycle.booking()).driverId, harness.actors.replacement.id);
  actions.push({ actor: 'customer browser', action: 'actual replacement visible; original incident retains its original captain', status: 'PASS' });

  const admin = await createBrowserActor({ browser, url, actor: 'admin', contexts });
  await admin.page.goto(url + '/dashboard/responsibility?case=' + incident.id);
  await expect(admin.page.getByTestId('responsibility-context')).toBeVisible();
  await expect(admin.page.getByRole('heading', { name: 'Model analysis envelope', exact: true })).toBeVisible();
  await expect(admin.page.getByRole('heading', { name: 'Deterministic guarded result', exact: true })).toBeVisible();
  await expect(admin.page.getByLabel('Human decision', { exact: true })).toHaveValue('');
  await expect(admin.page.getByLabel('Final classification', { exact: true })).toHaveValue('');
  for (const [width, height, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    await admin.page.setViewportSize({ width, height });
    await expect.poll(() => admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shot(admin.page, 'admin-human-review-' + label);
  }
  await admin.page.getByLabel('Human decision', { exact: true }).selectOption('WAIVE');
  await admin.page.getByLabel('Final classification', { exact: true }).selectOption('EXTERNAL_OR_UNCERTAIN');
  await admin.page.getByLabel('Review reason', { exact: true }).fill('Synthetic human review: insufficient causal authority; no driver consequence.');
  const reviewPath = '**/api/admin/responsibility/cases/' + encodeURIComponent(incident.id) + '/review';
  let staleInterceptions = 0;
  await admin.page.route(reviewPath, route => {
    staleInterceptions++;
    const body = route.request().postDataJSON();
    return route.continue({ postData: JSON.stringify({ ...body, evidenceHash: '0'.repeat(64) }) });
  });
  await admin.page.getByRole('button', { name: 'Save human review', exact: true }).click();
  await expect(admin.page.getByRole('alert')).toContainText('Evidence changed');
  assert.equal(staleInterceptions, 1, 'The controlled stale identity must reach the actual protected handler');
  assert.equal(await harness.db.responsibilityAdminReview.count(), 0);
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);
  actions.push({ actor: 'admin browser', action: 'controlled stale evidence submission rejected before human authority is saved', status: 'PASS' });
  await admin.page.unroute(reviewPath);
  const beforeHumanReview = await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } });
  await admin.page.getByRole('button', { name: 'Save human review', exact: true }).click({ clickCount: 2 });
  await expect(admin.page.getByText('Human authority is finalized. Review history is retained below.', { exact: true })).toBeVisible();
  assert.equal(await harness.db.responsibilityAdminReview.count(), 1);
  const finalDecision = await harness.db.responsibilityFinalDecision.findFirstOrThrow({ where: { caseId: incident.id } });
  assert.equal(finalDecision.outcome, 'FINAL_WAIVED');
  assert.equal(finalDecision.consequenceLevel, 'LEVEL_0');
  assert.deepEqual(await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } }), beforeHumanReview);
  assert.deepEqual(await consequenceCounts(), noConsequences);
  await shot(admin.page, 'admin-human-waiver-finalized');
  actions.push({ actor: 'admin browser', action: 'explicit synthetic human waiver creates one final LEVEL_0 record; duplicate click has no financial or driver effect', status: 'PASS' });

  await customer.goto(bookingUrl);
  await customer.getByText('Ride details', { exact: true }).click();
  await customer.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await customer.getByRole('button', { name: 'Other / none of these', exact: true }).click();
  await customer.getByRole('button', { name: 'Yes, cancel ride', exact: true }).click();
  await customer.goto(bookingUrl);
  await expect(customer.getByTestId('cancelled-booking')).toBeVisible();
  await expect(customer.getByRole('heading', { name: 'Refund pending', exact: true })).toBeVisible();
  for (const actor of ['captain', 'replacement']) {
    const driver = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors[actor].id } });
    assert.equal(driver.walletBalance, 1000);
    const entries = await harness.db.walletEntry.findMany({ where: { driverId: driver.id, bookingId: harness.lifecycle.bookingId,
      type: { in: ['deposit_hold', 'deposit_refund'] } } });
    assert.equal(entries.length, 2);
    assert.equal(entries.reduce((sum, entry) => sum + entry.amount, 0), 0);
  }
  const afterTerminalOwner = await findResponsibilityIncidentDriver(harness.db, incident);
  assert.equal(afterTerminalOwner.driverId, harness.actors.captain.id);
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Refund pending', exact: true })).toBeVisible();
  await shot(customer, 'customer-replacement-refund-pending-phone');
  const refunds = harness.lifecycle.provider.snapshot().refunds;
  assert.equal(refunds.length, 1);
  harness.lifecycle.provider.setRefundState(refunds[0].id, 'processed');
  const event = harness.lifecycle.provider.queueRefundEvent('refund.processed', refunds[0].id);
  assert.equal((await harness.lifecycle.deliverEvent(event)).status, 200);
  assert.equal((await harness.lifecycle.deliverEvent(event)).status, 200);
  await customer.getByRole('button', { name: 'Refresh payment status', exact: true }).click();
  await expect(customer.getByRole('heading', { name: 'Advance refunded', exact: true })).toBeVisible();
  await shot(customer, 'customer-replacement-refund-processed-phone');
  assert.equal((await harness.lifecycle.booking()).scheduledAdvanceDisposition, 'refunded');
  assert.deepEqual(await consequenceCounts(), noConsequences);
  actions.push({ actor: 'customer browser + signed synthetic provider', action: 'terminal cancellation returns each retained hold to its owner; duplicate refund callback settles once across refresh/mobile', status: 'PASS' });
  return { finalDecision, incidentOwner: owner.driverId, refund: refunds[0], noConsequences };
}
