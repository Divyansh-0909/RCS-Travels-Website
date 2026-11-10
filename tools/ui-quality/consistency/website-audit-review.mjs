import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import http from 'node:http';
import { atomicJson, readJson, hash } from '../../handoff/core.mjs';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/website-consistency-2026-10-26', checks = [], violations = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4318/');
    await expect(page.getByRole('heading', { name: 'Website consistency', exact: true })).toBeVisible();
    await expect(page.locator('#findings article')).toHaveCount(14);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const [index, expectedHeight] of [[0, 36], [1, 40]]) {
      const group = page.getByRole('group', { name: 'Sample ' + (index ? 'b' : 'a') + ' trip type' });
      const one = group.getByRole('button', { name: 'One way', exact: true }), round = group.getByRole('button', { name: 'Round trip', exact: true });
      const box = await one.boundingBox(), face = await one.locator('.face').boundingBox();
      expect(box.height).toBe(44); expect(face.height).toBe(expectedHeight);
      await round.click(); await expect(round).toHaveAttribute('aria-pressed', 'true'); await expect(one).toHaveAttribute('aria-pressed', 'false');
      await one.focus(); await one.press('Space'); await expect(one).toHaveAttribute('aria-pressed', 'true'); await expect(one).toHaveCSS('outline-style', 'solid');
    }
    await page.screenshot({ path: path.join(out, `report-${width}.png`), animations: 'disabled' });
    for (const name of ['Inputs', 'Pills', 'Focus', 'Other', 'All']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await page.locator('#findings article').count()).toBeGreaterThan(0);
    }
    for (const config of ['390:dark', '390:light', '768:light', '1440:dark', '1440:light']) {
      await page.locator('#evidence').selectOption(config);
      await page.locator('#state').selectOption('focus');
      await expect(page.locator('#measurements')).toContainText('Login phone');
      const columns = await page.locator('#VC-B02-04 .examples').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(config.startsWith('390') ? 2 : 1);
      for (const img of await page.locator('#findings img').all()) {
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true);
      }
    }
    await page.locator('#evidence').selectOption(width >= 768 ? '1440:light' : '390:dark');
    await page.getByRole('button', { name: 'Pills', exact: true }).click();
    await page.locator('#VC-B02-06').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `report-pills-${width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: 'All', exact: true }).click();
    const axe = await new AxeBuilder({ page }).analyze();
    atomicJson(path.join(out, `report-axe-${width}.json`), { width, violations: axe.violations });
    violations.push({ width, violations: axe.violations }); expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
    checks.push({ width, status: 'PASS', filters: 5, evidenceConfigs: 5, responsiveComparison: 'PASS', nativeSampleTargets: 44, pageErrors: errors });
    atomicJson(path.join(out, 'review-progress.json'), { checks, violations });
    console.log('PASS audit report ' + width);
    await ctx.close();
  }
  const base = 'http://127.0.0.1:4318';
  expect((await fetch(base, { method: 'POST' })).status).toBe(405);
  expect((await fetch(base + '/backend/.env')).status).toBe(404);
  const invalidHost = await new Promise((resolve, reject) => { http.get(base, { headers: { Host: 'not-local.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
  expect(invalidHost).toBe(403);
  const baseline = readJson(path.join(out, 'baseline.json'));
  const changes = baseline.files.filter(item => hash(fs.readFileSync(item.file)) !== item.sha256).map(item => item.file);
  expect(changes).toEqual([]);
  expect(readJson('output/handoff/consistency-decisions.json')).toEqual(baseline.decisions);
  atomicJson(path.join(out, 'review-validation.json'), { at: new Date().toISOString(), status: 'PASS', checks, violations, protectedInputs: baseline.files.length, changedProductInputs: changes, ownerChoicesUnchanged: true, serverMethods: 'GET/HEAD only', sourceFindings: readJson('tools/ui-quality/consistency/website-audit-findings.json').length, productBuildAndTests: 'NOT_RUN: audit tooling only, no product source changed' });
} finally { await browser.close(); }
