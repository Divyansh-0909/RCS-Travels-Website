import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-implementation-2026-10-26';
const browser = await chromium.launch({ headless: true }), checks = [];
try {
  for (const [hostWidth, screenWidth] of [[390, 390], [1920, 390], [1920, 1440]]) {
    const ctx = await browser.newContext({ viewport: { width: hostWidth, height: 1080 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:4317/?mode=website&review=VCB02&finding=03&width=${screenWidth}&theme=dark`);
    const panel = page.locator('#current-website-review'); await expect(panel).toBeVisible(); await expect(panel).toHaveAttribute('open', '');
    for (const finding of ['03', '12', '09', '13', '01']) {
      await page.locator('#current-review-finding').selectOption(finding);
      for (const img of await panel.locator('img').all()) { await img.scrollIntoViewIfNeeded(); await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true); }
      expect(await panel.locator('.current-review-images').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(screenWidth === 390 ? 2 : 1);
      if (['03', '12', '13'].includes(finding)) { await panel.evaluate(e => e.scrollTop = 0); await page.screenshot({ path: path.join(out, `reviewer-${finding}-${hostWidth}-${screenWidth}.png`), animations: 'disabled' }); }
    }
    expect(errors).toEqual([]); checks.push({ hostWidth, screenWidth, status: 'PASS', findingGroups: 5, currentImages: 11 });
    await page.goto('http://127.0.0.1:4317/?view=consistency&family=VC-B02-12&width=390&theme=light');
    await expect(page.getByText('Shared field styling implemented. Awaiting owner visual approval. Baseline images below are retained from the audit.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Current Website screenshots', exact: false }).click();
    await expect(panel).toBeVisible(); await expect(panel).toHaveAttribute('open', '');
    expect(errors).toEqual([]); await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'reviewer-results.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
} finally { await browser.close(); }
