import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/P07-2026-10-29';
const browser = await chromium.launch({ headless: true }), observations = [], network = [], errors = [];
let page;
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', r => {
    const request = r.request(), url = new URL(request.url()), local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    network.push({ method: request.method(), host: url.hostname, path: url.pathname, externalBlocked: !local });
    return local ? r.continue() : r.abort();
  });
  page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); return ctx;
}
async function shot(name) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' }); }
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const ctx = await context();
    for (const variant of ['refund-pending', 'partial-refund-pending']) {
      let reads = 0; const listener = r => { if (/\/status$/.test(new URL(r.url()).pathname)) reads++; }; page.on('request', listener);
      await page.goto('http://127.0.0.1:1577/__review/p07?case=' + variant);
      await expect(page.getByRole('heading', { name: variant === 'refund-pending' ? 'Refund pending' : 'Partial refund pending', exact: true })).toBeVisible();
      await page.waitForTimeout(5800);
      const body = await page.locator('body').innerText();
      if (variant === 'refund-pending') { expect(reads).toBeGreaterThanOrEqual(2); expect(body).toContain('Advance refunded'); }
      else { expect(reads).toBe(1); expect(body).toContain('Partial refund pending'); await shot('P07-B02-01-stalled-' + repeat); }
      observations.push({ repeat, case: variant, reads, body, result: variant === 'refund-pending' ? 'CONTROL_PASS' : 'ISSUE_REPRODUCED' });
      if (variant === 'partial-refund-pending') {
        await page.getByRole('button', { name: 'Refresh payment status', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Partial advance refunded', exact: true })).toBeVisible();
        await shot('P07-B02-01-manual-refresh-' + repeat);
      }
      page.off('request', listener);
    }
    await page.goto('http://127.0.0.1:1577/__review/p07?case=completed');
    const cash = page.getByRole('button', { name: 'Pay with cash', exact: true }); await expect(cash).toBeVisible();
    const before = await page.locator('body').innerText();
    const start = network.length; await cash.click(); await expect(cash).toBeDisabled();
    await expect(cash).toBeEnabled();
    const after = await page.locator('body').innerText();
    expect(after).toBe(before); expect(await page.getByRole('alert').count()).toBe(0);
    const attempts = network.slice(start).filter(r => /\/cash$/.test(r.path)); expect(attempts.length).toBe(1);
    await shot('P07-B02-02-hidden-cash-failure-' + repeat);
    observations.push({ repeat, case: 'cash-denied', result: 'ISSUE_REPRODUCED', attempts, visibleFailure: false, before, after });
    await page.goto('http://127.0.0.1:1577/__review/p07-component?mode=payment&phase=failed');
    await expect(page.getByRole('alert')).toBeVisible(); await shot('payment-failure-reference-' + repeat);
    observations.push({ repeat, case: 'payment-failure-reference', result: 'CONTROL_PASS', body: await page.locator('body').innerText() });
    await ctx.close();
  }
  expect(errors).toEqual([]);
} catch (e) { if (page && !page.isClosed()) await shot('functional-failure-' + Date.now()); throw e; }
finally { fs.writeFileSync(path.join(out, 'functional.json'), JSON.stringify({ observations, network, errors, synthetic: true }, null, 2)); await browser.close(); }
