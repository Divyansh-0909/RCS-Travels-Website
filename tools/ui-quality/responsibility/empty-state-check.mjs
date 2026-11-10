import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const pw = require('@playwright/test'), { expect } = pw;
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/responsibility-empty-state-2026-10-30';
const checks = [], errors = [];
function address(theme, caseId = '') {
  return `http://127.0.0.1:1575/dashboard/responsibility?fieldReview=review&workspace=1&theme=${theme}${caseId ? '&case=' + caseId : ''}`;
}
async function scaleText(page) {
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll('[data-testid="responsibility-page"] *')]
      .filter(el => el instanceof HTMLElement && !el.dataset.emptyStateScaled)
      .map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
    for (const [el, size, line] of sizes) {
      el.style.fontSize = `${parseFloat(size) * 2}px`;
      if (line !== 'normal') el.style.lineHeight = `${parseFloat(line) * 2}px`;
      el.dataset.emptyStateScaled = 'true';
    }
  });
}
async function emptyLayout(page, config) {
  const heading = page.getByRole('heading', { name: 'Open a case to begin', exact: true });
  await expect(heading).toBeVisible();
  const metrics = await heading.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const header = el.closest('[data-slot="card-header"]');
    const description = header.querySelector('[data-slot="card-description"]');
    const descriptionRange = document.createRange(); descriptionRange.selectNodeContents(description);
    return { headingWidth: el.getBoundingClientRect().width, headingLines: range.getClientRects().length, headerWidth: header.getBoundingClientRect().width, descriptionLines: descriptionRange.getClientRects().length, documentWidth: document.documentElement.scrollWidth };
  });
  expect(metrics.headingWidth, 'Readable text column').toBeGreaterThanOrEqual(200);
  expect(metrics.headingLines, 'Title must not stack letter by letter').toBeLessThanOrEqual(config.text200 ? 4 : config.width >= 768 ? 1 : 2);
  expect(metrics.descriptionLines).toBeLessThanOrEqual(config.text200 ? 12 : 5);
  expect(metrics.documentWidth).toBeLessThanOrEqual(config.width + 1);
  await expect(page.getByTestId('responsibility-context')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open case', exact: true })).toBeDisabled();
  return metrics;
}
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const browser = await pw[engine].launch({ headless: true });
  let active;
  const configs = (engine === 'chromium' ? [320, 390, 768, 1440] : [390, 1440])
    .flatMap(width => ['light', 'dark'].map(theme => ({ width, theme, text200: false })));
  if (engine === 'chromium') configs.push(...[320, 1440].flatMap(width => ['light', 'dark'].map(theme => ({ width, theme, text200: true }))));
  try {
    for (const config of configs) {
      const { width, theme, text200 } = config;
      const key = `${engine}-${width}-${theme}${text200 ? '-text200' : ''}`;
      const ctx = await browser.newContext({ viewport: { width, height: width < 640 ? 844 : 1000 }, reducedMotion: 'reduce' });
      await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
      const page = await ctx.newPage(); active = page;
      page.on('pageerror', error => errors.push({ key, message: error.message }));
      await page.goto(address(theme));
      await expect(page.getByRole('heading', { name: 'Open a case to begin', exact: true })).toBeVisible({ timeout: 25000 });
      await page.evaluate(() => document.fonts.ready);
      if (text200) await scaleText(page);
      const direct = await emptyLayout(page, config);
      await page.getByRole('textbox', { name: 'Case ID', exact: true }).fill('   ');
      await expect(page.getByRole('button', { name: 'Open case', exact: true })).toBeDisabled();
      await page.getByRole('textbox', { name: 'Case ID', exact: true }).fill('');
      await page.screenshot({ path: `${out}/screenshots/${key}.png`, fullPage: true, animations: 'disabled' });
      if (engine === 'chromium' && width === 1440 && !text200) {
        const axe = await new AxeBuilder({ page }).include('[data-testid="responsibility-page"]').analyze();
        fs.writeFileSync(`${out}/axe-${theme}.json`, JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete.map(r => ({ id: r.id, nodes: r.nodes.length })) }, null, 2));
        expect(axe.violations.map(r => r.id)).toEqual([]);
      }
      await page.goto(address(theme, 'synthetic-review'));
      await expect(page.getByTestId('responsibility-context')).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Clear case', exact: true }).click();
      if (text200) await scaleText(page);
      const cleared = await emptyLayout(page, config);
      expect(new URL(page.url()).searchParams.has('case')).toBe(false);
      expect(await page.evaluate(() => window.__RCS_FIELD_REVIEW__.requests.every(r => r.method === 'GET'))).toBe(true);
      checks.push({ key, ...config, status: 'PASS', direct, cleared, whitespaceSubmitDisabled: true });
      console.log('PASS ' + key);
      await ctx.close();
    }
  } catch (error) {
    checks.push({ engine, status: 'FAIL', message: error.message });
    if (active && !active.isClosed()) await active.screenshot({ path: `${out}/screenshots/failure-${engine}.png`, fullPage: true });
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  }
}
expect(errors).toEqual([]);
