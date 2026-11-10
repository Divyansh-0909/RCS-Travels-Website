import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-implementation-2026-10-26';
const browser = await chromium.launch({ headless: true }), checks = [];
try {
  for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'guest', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    const page = await ctx.newPage(); await page.goto('http://127.0.0.1:1575/login'); await expect(page.locator('#phone-number')).toBeVisible();
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const Payment = (await import('/src/components/CustomerPaymentPanel.jsx')).default;
      const Settlement = (await import('/src/components/RideSettlementPanel.jsx')).default;
      document.querySelector('#root').inert = true;
      const host = document.createElement('main'); host.id = 'payment-component-review';
      Object.assign(host.style, { position: 'fixed', inset: 0, zIndex: 1000, overflow: 'auto', padding: '24px', background: 'var(--surface)', color: 'var(--ink)' }); document.body.append(host);
      const root = createRoot(host); window.__syntheticClicks = 0;
      window.__renderPaymentReview = phase => root.render(React.createElement('div', { style: { width: '100%', maxWidth: 600, margin: '0 auto' } },
        React.createElement('p', { style: { fontSize: 12, marginBottom: 16 } }, 'Actual RCS components · isolated synthetic preview'),
        React.createElement(Payment, { purpose: 'advance', financials: { advance: 10000, remaining: 90000, finalFare: 100000, advancePaid: phase === 'paid' ? 10000 : 0, coupon: 0, advancePercentage: 10 }, phase, compact: true, bookingReference: 'SYNTHETIC', onPay: () => window.__syntheticClicks++, onViewBooking: () => window.__syntheticClicks++ }),
        React.createElement('h2', { style: { fontSize: 20, marginTop: 32 } }, 'Ride settlement'),
        React.createElement(Settlement, { ridePayment: { amount: 100000, state: 'pending', upiAvailable: true }, phase, onPayUpi: () => window.__syntheticClicks++, onPayCash: () => window.__syntheticClicks++ })));
      window.__renderPaymentReview('idle');
    });
    const scope = page.locator('#payment-component-review');
    for (const phase of ['idle', 'creating', 'failed', 'cancelled', 'paid']) {
      await page.evaluate(phase => window.__renderPaymentReview(phase), phase);
      await expect(scope.getByRole('button').first()).toBeVisible();
      for (const button of await scope.getByRole('button').all()) {
        await expect(button).toHaveAttribute('data-size', 'action');
        await expect(button).toHaveCSS('font-size', '16px');
        const r = await button.boundingBox(); expect(r.height).toBeGreaterThanOrEqual(48); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(width);
        if (phase === 'creating') await expect(button).toBeDisabled();
      }
      if (phase === 'idle') {
        const before = await page.evaluate(() => window.__syntheticClicks); await scope.getByRole('button', { name: 'Pay with cash', exact: true }).click(); expect(await page.evaluate(() => window.__syntheticClicks)).toBe(before + 1);
        if ([390, 1440].includes(width)) {
          await page.evaluate(() => document.fonts.ready); const name = `current-payment-${width}-${theme}.png`; await page.screenshot({ path: path.join(out, name), animations: 'disabled' }); fs.copyFileSync(path.join(out, name), 'output/handoff/website-consistency-2026-10-26/images/' + name);
        }
      }
    }
    checks.push({ width, theme, status: 'PASS', states: ['idle', 'creating', 'failed', 'cancelled', 'paid'], scope: 'Actual payment/settlement components in an isolated browser harness; callbacks only. No order, payment or cash record created.' }); await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'payment-results.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
} finally { await browser.close(); }
