import assert from 'node:assert/strict';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { join } from 'node:path';
import { createBrowserActor } from './phase9BrowserActor.mjs';

export async function runBrowserJourneys({ browser, harness, url, output, contexts, actions }) {
  const create = (actor, viewport) => createBrowserActor({ browser, url, actor, contexts, viewport });
  const step = async (actor, name, work) => { await work(); actions.push({ actor, action: name, status: 'PASS' }); console.log(`UI PASS: ${actor} · ${name}`); };
  const shot = (page, name) => page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  const api = async (actor, path, body, method = 'GET') => {
    const response = await fetch(`${harness.apiUrl}${path}`, { method, headers: {
      ...(actor ? { authorization: `Bearer ${harness.auth.token(harness.actors[actor])}` } : {}),
      'content-type': 'application/json',
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };

  const customer = await create('customer');
  const bookingUrl = `${url}/booking/${harness.lifecycle.bookingId}`;
  const providerPayment = harness.lifecycle.provider.snapshot().payments[0];
  harness.lifecycle.provider.setPaymentState(providerPayment.id, 'authorized');
  await step('customer', 'restore authenticated pending booking', async () => {
    await customer.page.goto(bookingUrl);
    await expect(customer.page.getByRole('button', { name: /^Pay ₹/ })).toBeVisible();
    assert.equal((await harness.lifecycle.booking()).scheduledAdvancePaidAmount, 0);
    await shot(customer.page, 'customer-payment-desktop');
  });
  await step('customer', 'controlled payment order outage does not capture money', async () => {
    harness.faults.paymentOrder = true;
    await customer.page.getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(customer.page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
    assert.equal((await harness.lifecycle.booking()).status, 'payment_pending');
    assert.equal((await harness.lifecycle.booking()).scheduledAdvancePaidAmount, 0);
    await shot(customer.page, 'controlled-payment-outage');
  });
  await step('customer', 'retry through synthetic checkout and actual verification route', async () => {
    await customer.page.getByRole('button', { name: 'Retry payment', exact: true }).click();
    await customer.page.getByRole('button', { name: 'Complete synthetic payment', exact: true }).click();
    await expect.poll(async () => (await harness.db.payment.findFirst({ where: { bookingId: harness.lifecycle.bookingId } })).status).toBe('authorized');
    assert.equal((await harness.lifecycle.booking()).scheduledAdvancePaidAmount, 0);
  });
  await step('customer', 'signed webhook after navigation and duplicate delivery confirm one advance', async () => {
    await customer.page.goto(`${url}/manage-account`);
    harness.lifecycle.provider.setPaymentState(providerPayment.id, 'captured');
    const event = harness.lifecycle.provider.queuePaymentEvent('payment.captured', providerPayment.id);
    assert.equal((await harness.lifecycle.deliverEvent(event)).status, 200);
    assert.equal((await harness.lifecycle.deliverEvent(event)).status, 200);
    await customer.page.goto(bookingUrl);
    await expect(customer.page.getByText('Advance paid', { exact: true }).first()).toBeVisible();
    assert.equal((await harness.lifecycle.booking()).scheduledAdvancePaidAmount, 10000);
    assert.equal(await harness.db.payment.count({ where: { bookingId: harness.lifecycle.bookingId, status: 'captured' } }), 1);
  });
  await step('captain API only', 'real worker offer, acceptance, duplicate and cancellation', async () => {
    await harness.lifecycle.offer();
    const offer = await harness.db.rideOffer.findFirstOrThrow({ where: { bookingId: harness.lifecycle.bookingId, driverId: harness.actors.captain.id, status: 'pending' } });
    assert.equal((await api('replacement', `/api/driver/offers/${offer.id}/accept`, {}, 'PATCH')).status, 404);
    assert.equal((await api('captain', `/api/driver/offers/${offer.id}/accept`, {}, 'PATCH')).status, 200);
    assert.equal((await api('captain', `/api/driver/offers/${offer.id}/accept`, {}, 'PATCH')).status, 200);
    await customer.page.reload();
    await expect(customer.page.getByRole('heading', { name: 'Driver assigned', exact: true })).toBeVisible();
    assert.equal((await api('captain', `/api/driver/rides/${harness.lifecycle.bookingId}/cancel`, { reason: 'rider_unreachable' }, 'PATCH')).status, 200);
    await customer.page.reload();
    await expect(customer.page.getByRole('heading', { name: 'Driver cancelled the ride', exact: true })).toBeVisible();
    await shot(customer.page, 'customer-driver-cancellation');
    await customer.page.getByRole('button', { name: 'Close driver cancellation notice', exact: true }).click();
    assert.equal((await harness.lifecycle.booking()).driverId, null);
  });
  const incident = await harness.shadow();
  const stored = await harness.db.responsibilityShadowResult.findFirstOrThrow({ where: { caseId: incident.id } });
  assert.equal(stored.route, 'NEEDS_ADMIN_REVIEW');
  assert.equal(stored.analysisEnvelope.analysisId, stored.analysisProviderId);
  assert.equal(stored.analysisEnvelope.output.suggestedClassification, 'DRIVER_CAUSED');
  assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);

  const admin = await create('admin');
  await step('admin', 'inspect real case, raw envelope, guarded review and absent human authority', async () => {
    await admin.page.goto(`${url}/dashboard/responsibility?case=${incident.id}`);
    await expect(admin.page.getByTestId('responsibility-context')).toBeVisible();
    await expect(admin.page.getByRole('heading', { name: 'Model analysis envelope', exact: true })).toBeVisible();
    await expect(admin.page.getByText('No authorized human review recorded.', { exact: true })).toBeVisible();
    await expect(admin.page.getByText('No final authority recorded.', { exact: true })).toBeVisible();
    await shot(admin.page, 'admin-desktop');
  });
  await step('admin', 'controlled read failure clears stale evidence and refresh recovers', async () => {
    harness.faults.adminRead = true;
    await admin.page.getByRole('button', { name: 'Refresh case', exact: true }).click();
    await expect(admin.page.getByRole('alert')).toContainText('Controlled upstream outage');
    await expect(admin.page.getByTestId('responsibility-context')).toHaveCount(0);
    await shot(admin.page, 'controlled-admin-outage');
    await admin.page.getByRole('button', { name: 'Refresh case', exact: true }).click();
    await expect(admin.page.getByTestId('responsibility-context')).toBeVisible();
  });
  await step('admin', 'unknown case never retains another case evidence', async () => {
    await admin.page.getByLabel('Case ID', { exact: true }).fill('case-not-found');
    await admin.page.getByRole('button', { name: 'Open case', exact: true }).click();
    await expect(admin.page.getByRole('alert')).toContainText('Responsibility case not found');
    await expect(admin.page.getByTestId('responsibility-context')).toHaveCount(0);
    await admin.page.getByLabel('Case ID', { exact: true }).fill(incident.id);
    await admin.page.getByRole('button', { name: 'Open case', exact: true }).click();
    await expect(admin.page.getByTestId('responsibility-context')).toBeVisible();
    for (const [width, height, name] of [[390, 844, 'phone'], [768, 1024, 'tablet'], [1440, 900, 'desktop']]) {
      await admin.page.setViewportSize({ width, height });
      await expect.poll(() => admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await shot(admin.page, `admin-${name}`);
      await admin.page.screenshot({ path: join(output, `admin-${name}-viewport.png`) });
    }
  });
  await step('authorization', 'anonymous, customer and captain cannot read admin evidence; foreign booking is denied', async () => {
    const path = `/api/admin/responsibility/cases/${incident.id}`;
    assert.equal((await api(null, path)).status, 401);
    assert.equal((await api('customer', path)).status, 403);
    assert.equal((await api('captain', path)).status, 403);
    assert.equal((await api('foreign', `/api/bookings/${harness.lifecycle.bookingId}/status`)).status, 403);
    const parts = harness.auth.token(harness.actors.customer).split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const tampered = parts.join('.');
    const rejected = await fetch(`${harness.apiUrl}${path}`, { headers: { authorization: `Bearer ${tampered}` } });
    assert.equal(rejected.status, 401);
    await customer.page.goto(`${url}/dashboard/responsibility?case=${incident.id}`);
    await expect(customer.page).toHaveURL(`${url}/`);
    await expect(customer.page.getByTestId('responsibility-context')).toHaveCount(0);
  });
  await step('customer', 'cancel through UI and reopen pending refund without live driver controls', async () => {
    await customer.page.goto(bookingUrl);
    await customer.page.getByRole('button', { name: 'View booking', exact: true }).click();
    await customer.page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
    await customer.page.getByRole('button', { name: 'Other / none of these', exact: true }).click();
    await customer.page.getByRole('button', { name: 'Yes, cancel ride', exact: true }).click();
    await expect(customer.page).toHaveURL(`${url}/`);
    await customer.page.goto(bookingUrl);
    await expect(customer.page.getByTestId('cancelled-booking')).toBeVisible();
    await expect(customer.page.getByRole('heading', { name: 'Refund pending', exact: true })).toBeVisible();
    await expect(customer.page.getByRole('button', { name: 'Cancel ride', exact: true })).toHaveCount(0);
    await shot(customer.page, 'customer-refund-pending-desktop');
    await customer.page.setViewportSize({ width: 390, height: 844 });
    await customer.page.reload();
    await expect(customer.page.getByRole('heading', { name: 'Refund pending', exact: true })).toBeVisible();
    await shot(customer.page, 'customer-refund-pending-phone');
  });
  await step('customer', 'duplicate signed refund callback and UI refresh show processed settlement once', async () => {
    const refund = harness.lifecycle.provider.snapshot().refunds[0];
    harness.lifecycle.provider.setRefundState(refund.id, 'processed');
    const event = harness.lifecycle.provider.queueRefundEvent('refund.processed', refund.id);
    assert.equal((await harness.lifecycle.deliverEvent(event)).status, 200);
    assert.equal((await harness.lifecycle.deliverEvent(event)).status, 200);
    await customer.page.getByRole('button', { name: 'Refresh payment status', exact: true }).click();
    await expect(customer.page.getByRole('heading', { name: 'Advance refunded', exact: true })).toBeVisible();
    await shot(customer.page, 'customer-refund-processed-phone');
    assert.equal((await harness.lifecycle.booking()).scheduledAdvanceDisposition, 'refunded');
    assert.equal(harness.lifecycle.provider.snapshot().refunds.length, 1);
    const driver = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors.captain.id } });
    assert.equal(driver.walletBalance, 1000);
    assert.equal(await harness.db.responsibilityFinalDecision.count(), 0);
    assert.equal(await harness.db.responsibilityLiability.count(), 0);
  });
  return { incident, stored, contexts, actions };
}
