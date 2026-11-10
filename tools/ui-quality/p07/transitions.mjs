import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { base } from './cases.mjs';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/P07-2026-10-29';
const browser = await chromium.launch({ headless: true }), checks = [], network = [], errors = [];
let active;
async function make() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()), local = ['localhost', '127.0.0.1'].includes(u.hostname); network.push({ method: r.request().method(), host: u.hostname, path: u.pathname, blocked: !local }); return local ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); active = page; page.on('pageerror', e => errors.push(e.message)); return { ctx, page };
}
const status = page => page.evaluate(async () => (await import('/src/hooks/useData.js')).useData.getState().status);
const online = page => page.evaluate(() => dispatchEvent(new Event('online')));
async function shot(page, file) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: out + '/' + file + '.png', animations: 'disabled' }); }
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    {
      const { ctx, page } = await make(); let calls = 0, lateAborted = false;
      await ctx.route('**/api/bookings/*/status', async r => {
        const n = ++calls; if (n === 1) await new Promise(resolve => setTimeout(resolve, 1000));
        try { await r.fulfill({ json: { ...base, bookingId: 'p07-assigned--race', status: n === 1 ? 'assigned' : 'en_route' } }); }
        catch { lateAborted = true; }
      });
      await page.goto('http://127.0.0.1:1577/booking/p07-assigned--race');
      await expect.poll(() => calls).toBe(1); await online(page);
      await expect.poll(() => status(page)).toBe('en_route'); await page.waitForTimeout(1300);
      expect(await status(page)).toBe('en_route');
      checks.push({ repeat, case: 'late-old-poll', status: 'PASS', calls, lateAborted }); await ctx.close();
    }
    {
      const { ctx, page } = await make(); let calls = 0;
      const data = [
        { ...base, status: 'completed', ridePayment: { amount: 90000, state: 'pending', upiAvailable: true } },
        { ...base, status: 'completed', ridePayment: { amount: 80000, state: 'pending', upiAvailable: true } },
        { ...base, status: 'completed', ridePayment: { amount: 80000, state: 'paid', method: 'upi', upiAvailable: true } },
      ];
      await ctx.route('**/api/bookings/*/status', r => r.fulfill({ json: { ...data[Math.min(calls++, data.length - 1)], bookingId: 'p07-completed--updates' } }));
      await page.goto('http://127.0.0.1:1577/booking/p07-completed--updates');
      await expect(page.getByRole('button', { name: 'Pay with cash', exact: true })).toBeVisible();
      expect(await page.locator('body').innerText()).toContain('₹900');
      await online(page); await expect.poll(async () => (await page.locator('body').innerText()).includes('₹800')).toBe(true);
      await online(page); await expect(page.getByRole('status').getByText('Paid by UPI', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Pay with cash', exact: true })).toHaveCount(0);
      await online(page); await expect.poll(() => calls).toBeGreaterThanOrEqual(4);
      await expect(page.getByRole('status').getByText('Paid by UPI', { exact: true })).toBeVisible();
      checks.push({ repeat, case: 'amount-method-duplicate-updates', status: 'PASS', calls, limitation: 'Presentation follows controlled response changes; no settlement/ledger correctness inference.' }); await shot(page, 'paid-update-' + repeat); await ctx.close();
    }
    {
      const { ctx, page } = await make();
      await page.goto('http://127.0.0.1:1577/__review/p07?case=recovery');
      await expect(page.getByText("Couldn't load your ride", { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Try again|Retry/ }).first().click();
      await expect.poll(() => status(page)).toBe('assigned');
      await expect(page.getByText('Synthetic Captain', { exact: false }).first()).toBeVisible();
      checks.push({ repeat, case: 'initial-read-retry', status: 'PASS' }); await ctx.close();
    }
    {
      const { ctx, page } = await make(); let calls = 0;
      await ctx.route('**/api/bookings/*/status', r => {
        const n = ++calls; return r.fulfill(n === 2 ? { status: 503, json: { error: 'Synthetic stale poll' } } : { json: { ...base, bookingId: 'p07-assigned--stale', status: n < 3 ? 'en_route' : 'started' } });
      });
      await page.goto('http://127.0.0.1:1577/booking/p07-assigned--stale'); await expect.poll(() => status(page)).toBe('en_route');
      await online(page); await expect(page.getByText(/Showing the last update we got/)).toBeVisible(); expect(await status(page)).toBe('en_route');
      await shot(page, 'stale-notice-' + repeat); await online(page); await expect.poll(() => status(page)).toBe('started');
      const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
      await expect.poll(() => dismiss.evaluate(e => getComputedStyle(e.closest('[role=status]')).opacity)).toBe('0');
      await page.evaluate(() => document.activeElement?.blur());
      let reachedHidden = false, tabs = 0;
      for (; tabs < 30; tabs++) { await page.keyboard.press('Tab'); if (await dismiss.evaluate(e => e === document.activeElement)) { reachedHidden = true; break; } }
      expect(reachedHidden).toBe(true);
      checks.push({ repeat, case: 'stale-status-and-recovery', status: 'PASS_VISUAL_RECOVERY', calls });
      checks.push({ repeat, case: 'P07-B02-03-hidden-notice-tabstop', status: 'ISSUE_REPRODUCED', reachedHidden, tabs, opacity: 0 });
      await shot(page, 'hidden-stale-notice-' + repeat); await ctx.close();
    }
    {
      const { ctx, page } = await make();
      await page.goto('http://127.0.0.1:1577/booking/p07-assigned--history'); await expect.poll(() => status(page)).toBe('assigned');
      await page.evaluate(() => { history.pushState({ usr: null, key: 'p07-next', idx: (history.state?.idx || 0) + 1 }, '', '/booking/p07-denied--history'); dispatchEvent(new PopStateEvent('popstate')); });
      await expect(page.getByText("Couldn't load your ride", { exact: true })).toBeVisible();
      await expect(page.getByText('Synthetic Captain', { exact: false })).toHaveCount(0);
      await page.goBack(); await expect.poll(() => status(page)).toBe('assigned');
      await page.goForward(); await expect(page.getByText("Couldn't load your ride", { exact: true })).toBeVisible();
      await page.reload(); await expect(page.getByText("Couldn't load your ride", { exact: true })).toBeVisible();
      checks.push({ repeat, case: 'route-id-back-forward-refresh-denial', status: 'PASS' }); await ctx.close();
    }
  }
  expect(errors).toEqual([]);
} catch (e) { if (active && !active.isClosed()) await shot(active, 'transition-failure-' + Date.now()); throw e; }
finally { fs.writeFileSync(out + '/transitions.json', JSON.stringify({ checks, network, errors }, null, 2)); await browser.close(); }
