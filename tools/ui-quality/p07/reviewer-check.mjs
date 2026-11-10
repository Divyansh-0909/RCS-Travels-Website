import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true }), checks = [], errors = [];
const out = 'output/handoff/P07-2026-10-29';
try {
  for (const [hostWidth, screenWidth] of [[390, 390], [1920, 390], [1920, 1440]]) {
    const ctx = await browser.newContext({ viewport: { width: hostWidth, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:4317/p07?width=${screenWidth}`);
    await expect(page.locator('#issue option')).toHaveCount(4);
    for (const id of ['P07-B02-01', 'P07-B02-02', 'P07-B02-03', 'P07-B02-04']) {
      await page.locator('#issue').selectOption(id);
      await expect(page.locator('#choices .option')).toHaveCount(2);
      await expect(page.locator('#actual')).toHaveAttribute('src', /127\.0\.0\.1:1578/);
      const actual = page.frameLocator('#actual'), reference = page.frameLocator('#reference');
      // Auth's loading splash also makes #root nonempty. Wait for the actual
      // audited state before capturing the comparison.
      if (id === 'P07-B02-01') {
        await expect(actual.getByRole('button', { name: 'Refresh payment status', exact: true })).toBeVisible();
        await expect(reference.getByRole('button', { name: 'Refresh payment status', exact: true })).toBeVisible();
      } else if (id === 'P07-B02-02') {
        await expect(actual.getByRole('button', { name: 'Pay with cash', exact: true })).toBeVisible();
        await expect(reference.getByRole('alert')).toBeVisible();
      } else {
        await expect(actual.getByRole('button', { name: 'Contact support', exact: true })).toBeVisible();
        await expect(reference.getByRole('button', { name: 'Contact support', exact: true })).toBeVisible();
      }
      await actual.locator('html').evaluate(async () => { await document.fonts.ready; });
      await reference.locator('html').evaluate(async () => { await document.fonts.ready; });
      await expect(page.locator('#frames')).toHaveClass(screenWidth >= 640 ? /stack/ : /frames/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(hostWidth + 1);
      if (id === 'P07-B02-02') {
        const cash = actual.getByRole('button', { name: 'Pay with cash', exact: true }); await expect(cash).toBeVisible();
        // Bring the containing iframe into view before waiting on its rAF-based
        // actionability checks; offscreen iframe frames can be throttled.
        await page.locator('#actual').scrollIntoViewIfNeeded();
        await cash.click(); await expect(cash).toBeDisabled(); await expect(cash).toBeEnabled();
        expect(await actual.getByRole('alert').count()).toBe(0); await expect(reference.getByRole('alert')).toBeVisible();
      }
      await page.evaluate(() => scrollTo(0, 0));
      if (id !== 'P07-B02-03') await page.screenshot({ path: out + `/board-${id}-${hostWidth}-${screenWidth}.png`, animations: 'disabled' });
    }
    await page.goto('http://127.0.0.1:4317/?mode=website&issue=P07-B02-01&width=390&theme=dark');
    await expect(page.locator('#screen')).toContainText('P07-B02-01'); await expect(page.locator('#safe-action')).toContainText('Wait 7 seconds');
    const measurements = page.locator('#measurement'); await expect(measurements).not.toHaveText('Locating the real element…');
    await page.screenshot({ path: out + `/existing-reviewer-${hostWidth}.png`, animations: 'disabled' });
    expect(errors).toEqual([]); checks.push({ hostWidth, screenWidth, status: 'PASS', issues: 4, safeFailureReplayed: true }); await ctx.close();
  }
} finally { fs.writeFileSync(out + '/reviewer-checks.json', JSON.stringify({ checks, errors, note: 'UI choices are displayed; exact approvals remain chat instructions. No automatic dispatch.' }, null, 2)); await browser.close(); }
