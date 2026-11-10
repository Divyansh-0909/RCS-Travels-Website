import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true }), checks = [], measurements = [], external = [];
const out = 'output/handoff/P07-2026-10-29';
let active;
try {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname)) return r.continue(); external.push({ host: u.hostname, method: r.request().method(), blocked: true }); return r.abort(); });
    const page = await ctx.newPage(); active = page;
    for (const mode of ['payment', 'settlement']) for (const phase of ['idle', 'creating', 'opening', 'verifying', 'failed', 'cancelled']) {
      await page.goto(`http://127.0.0.1:1578/__review/p07-component?mode=${mode}&phase=${phase}`);
      const scope = page.locator('[data-p07-component]'); await expect(scope).not.toBeEmpty();
      const busy = ['creating', 'opening', 'verifying'].includes(phase);
      for (const button of await scope.getByRole('button').all()) if (busy) await expect(button).toBeDisabled();
      if (mode === 'payment' && phase === 'failed') await expect(scope.getByRole('alert')).toBeVisible();
      const controls = await scope.getByRole('button').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { text: e.textContent.trim(), width: r.width, height: r.height, font: s.fontSize, radius: s.borderRadius, disabled: e.disabled }; }));
      measurements.push({ width, mode, phase, controls, role: mode === 'payment' ? 'advance payment' : 'ride settlement', context: 'Actual imported component, synthetic props/callbacks; no provider/ledger operation.' });
      if (phase === 'failed') await page.screenshot({ path: `${out}/component-${mode}-failed-${width}.png`, animations: 'disabled' });
    }
    await page.goto('http://127.0.0.1:1578/__review/p07?case=assigned');
    const call = page.getByRole('button', { name: 'Call driver', exact: true }); await expect(call).toBeVisible();
    await call.click(); expect((await page.evaluate(() => window.__p07Intents)).some(x => x.startsWith('tel:'))).toBe(true);
    const message = page.getByRole('button', { name: 'WhatsApp Message', exact: true }); await message.click();
    expect((await page.evaluate(() => [...window.__p07Intents, ...(window.__rcsReviewActions || []).map(a => a.url)])).some(x => /wa\.me|whatsapp/.test(x))).toBe(true);
    checks.push({ width, case: 'contact-intents-intercepted', status: 'PASS' });
    await page.getByRole('button', { name: 'Ride details', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ride Details', exact: true })).toBeVisible();
    await page.screenshot({ path: `${out}/details-${width}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'Back', exact: true }).last().click(); await expect(call).toBeVisible();
    checks.push({ width, case: 'ride-details-open-back', status: 'PASS', excluded: 'No cancellation confirmation or write' });
    await page.goto('http://127.0.0.1:1578/__review/p07?case=advance');
    const pay = page.getByRole('button', { name: /^Pay ₹/ }); await expect(pay).toBeVisible();
    await pay.click(); await expect(page.locator('[data-payment-state=creating]')).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    checks.push({ width, case: 'advance-denied-order-visible-failure', status: 'PASS_CONTROL', scope: 'Denied local order; no checkout/provider called' });
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  const page = await ctx.newPage(); active = page;
  await page.goto('http://127.0.0.1:1578/__review/p07?case=loading');
  await expect(page.getByRole('status', { name: 'Loading ride', exact: true })).toBeVisible();
  await page.screenshot({ path: out + '/initial-loading.png', animations: 'disabled' });
  checks.push({ case: 'initial-loading', status: 'OBSERVED', laterResponse: 'Not awaited; next navigation tests pending-request cancellation' });
  await ctx.close();
} catch (e) { if (active && !active.isClosed()) await active.screenshot({ path: out + '/supplement-failure.png', animations: 'disabled' }); throw e; }
finally { fs.writeFileSync(out + '/supplement.json', JSON.stringify({ checks, measurements, external }, null, 2)); await browser.close(); }
