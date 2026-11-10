import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { atomicJson, hash, readJson } from '../../handoff/core.mjs';

const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/compact-controls-2026-10-26';
const baseline = process.argv.includes('--baseline'), phase = baseline ? 'before' : 'after';
fs.mkdirSync(path.join(out, phase), { recursive: true });
if (baseline && !fs.existsSync(path.join(out, 'source-before.json'))) {
  const files = ['frontend/src/components/ui/Button.jsx', 'frontend/src/components/ui/DateTimeSelector.jsx', 'frontend/src/components/RideOptions.jsx', 'frontend/src/pages/OnBoarding.jsx', 'frontend/src/index.css', 'output/handoff/consistency-decisions.json'];
  for (const file of files) fs.copyFileSync(file, path.join(out, 'before', path.basename(file)));
  atomicJson(path.join(out, 'source-before.json'), files.map(file => ({ file, sha256: hash(fs.readFileSync(file)) })));
}
const checks = [], attempts = readJson(path.join(out, 'attempts.json'), []);
const browser = await chromium.launch({ headless: true });
let current, active;
async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished)); });
}
async function shot(page, name) { await settled(page); await page.screenshot({ path: path.join(out, phase, name + '.png'), fullPage: true }); }
async function sized(button, { icon = false, multipleLines = false } = {}) {
  if (baseline) return;
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(47.9);
  if (!multipleLines) expect(box.height).toBeCloseTo(48, 1);
  expect(box.width).toBeGreaterThanOrEqual(47.9);
  await expect(button).toHaveCSS('font-size', '16px');
  await expect(button).toHaveCSS('padding-left', icon ? '12px' : '24px');
  await expect(button).toHaveCSS('padding-top', '12px');
}
async function withinViewport(locator, page) {
  const rect = await locator.boundingBox(), size = page.viewportSize();
  expect(rect.x).toBeGreaterThanOrEqual(-1); expect(rect.y).toBeGreaterThanOrEqual(-1);
  expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 1);
}
try {
  const sizes = baseline ? [[390, 844], [1440, 900]] : [[320, 640], [390, 844], [768, 1024], [1440, 900], [680, 360]];
  for (const [width, height] of sizes) for (const theme of baseline ? ['dark'] : ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await ctx.newPage(), errors = []; active = page;
    page.on('pageerror', error => errors.push(error.message));
    current = 'route-' + width + '-' + theme;
    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=' + theme);
    await page.waitForFunction(() => window.__RCS_CONSISTENCY_MEASUREMENT__, null, { timeout: 65000 });
    await page.locator('#pickup-location').press('Escape');
    const later = page.getByRole('button', { name: 'Later', exact: true });
    await later.scrollIntoViewIfNeeded(); await sized(later); await sized(page.getByRole('button', { name: 'One way', exact: true })); await sized(page.getByRole('button', { name: 'Round trip', exact: true }));
    await shot(page, current);
    if (!baseline) {
      const oneWay = page.getByRole('button', { name: 'One way', exact: true }), roundTrip = page.getByRole('button', { name: 'Round trip', exact: true });
      await roundTrip.press('Space'); await expect(roundTrip).toHaveAttribute('aria-pressed', 'true');
      await oneWay.press('Enter'); await expect(oneWay).toHaveAttribute('aria-pressed', 'true');
      expect(await oneWay.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    }
    await later.click();
    const timing = page.getByRole('dialog', { name: 'Choose timing', exact: true });
    await expect(timing).toBeVisible(); await settled(page);
    if (!baseline) {
      await withinViewport(timing, page);
      await sized(page.locator('[data-timing-dialog-control][aria-label]').first(), { icon: true });
      for (const choice of await timing.getByRole('button').all()) if (await choice.getAttribute('aria-pressed') !== null) await sized(choice, { multipleLines: true });
    }
    await shot(page, current + '-timing');
    await timing.getByRole('button', { name: /Ride now/ }).click();
    await expect(later).toHaveCount(0); await expect(page.getByRole('button', { name: 'Now', exact: true })).toBeVisible();
    checks.push({ case: current, status: 'PASS' }); console.log('PASS ' + phase + ' ' + current);
    current = 'calendar-' + width + '-' + theme;
    await page.goto('http://127.0.0.1:1575/dev/home?rcsConsistency=VCB01_ROUTE_ACTION&preference=' + theme);
    const when = page.getByRole('button', { name: /^(When|Edit)$/ });
    await expect(when).toBeVisible({ timeout: 45000 }); await sized(when);
    await when.click();
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirm).toBeVisible(); await settled(page); await sized(confirm);
    if (!baseline) { await withinViewport(confirm, page); await expect(page.locator('button button')).toHaveCount(0); }
    await shot(page, current);
    await confirm.click(); await expect(confirm).toBeHidden();
    checks.push({ case: current, status: 'PASS' }); console.log('PASS ' + phase + ' ' + current);
    current = 'options-' + width + '-' + theme;
    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_VEHICLE_ACTION&theme=' + theme);
    await page.waitForFunction(() => window.__RCS_CONSISTENCY_MEASUREMENT__, null, { timeout: 65000 });
    const trigger = page.getByRole('button', { name: /Ride options/ });
    await sized(trigger, { multipleLines: true }); await trigger.click();
    const heading = page.getByRole('heading', { name: 'Ride options', exact: true });
    await expect(heading).toBeVisible(); await settled(page);
    const switches = page.getByRole('switch'); await expect(switches).toHaveCount(3);
    for (let i = 0; i < 3; i++) { const control = switches.nth(i); await control.scrollIntoViewIfNeeded(); await sized(control, { multipleLines: true }); if (!baseline) await withinViewport(control, page); if (await control.isEnabled()) { const before = await control.getAttribute('aria-checked'); await control.click(); await expect(control).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true'); if (!baseline) { await control.press('Space'); await expect(control).toHaveAttribute('aria-checked', before); } } }
    const close = page.getByRole('button', { name: 'Close ride options', exact: true });
    await sized(close, { icon: true }); if (!baseline) await withinViewport(close, page);
    await shot(page, current); await close.click(); await expect(heading).toBeHidden();
    expect(errors).toEqual([]);
    if (!baseline) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    checks.push({ case: current, status: 'PASS' }); console.log('PASS ' + phase + ' ' + current);
    await ctx.close();
  }
  atomicJson(path.join(out, phase + '.json'), { at: new Date().toISOString(), status: 'PASS', checks, scope: 'Actual local application; synthetic actors/prices, no booking confirmation or provider calls.' });
} catch (error) {
  attempts.push({ at: new Date().toISOString(), phase, case: current, error: error.message, passed: checks.length });
  atomicJson(path.join(out, 'attempts.json'), attempts);
  if (active && !active.isClosed()) await shot(active, 'failure-' + attempts.length);
  throw error;
} finally { await browser.close(); }
