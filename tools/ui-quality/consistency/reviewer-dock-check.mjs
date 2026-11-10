import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { atomicJson, readJson, hash } from '../../handoff/core.mjs';

const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/reviewer-dock-2026-10-26';
const checks = [], attempts = readJson(path.join(out, 'dock-attempts.json'), []);
const registry = 'output/handoff/consistency-decisions.json', registryHash = hash(fs.readFileSync(registry));
const browser = await chromium.launch({ headless: true });
let current, page;
async function check(name, fn) { current = name; await fn(); checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
async function live(p) {
  for (let i = 0; i < 2; i++) await expect(p.locator('.consistency-readout').nth(i)).toContainText('LIVE', { timeout: 65000 });
}
async function choose(p, id, value) {
  const text = await p.locator('#' + id).evaluate((element, value) => [...element.options].find(option => option.value === value).textContent, value);
  await p.locator('#' + id + '-trigger').click();
  await p.locator('#' + id + '-trigger-listbox').getByRole('option', { name: text, exact: true }).click();
  await expect(p.locator('#' + id)).toHaveValue(value);
}
async function bounds(p, selector) {
  const rect = await p.locator(selector).boundingBox(), size = p.viewportSize();
  expect(rect.x).toBeGreaterThanOrEqual(11); expect(rect.y).toBeGreaterThanOrEqual(11);
  expect(rect.x + rect.width).toBeLessThanOrEqual(size.width - 11);
  expect(rect.y + rect.height).toBeLessThanOrEqual(size.height - 11);
  return rect;
}
async function shot(p, name) { await p.screenshot({ path: path.join(out, 'dock-' + name + '.png') }); }
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  return ctx;
}
try {
  const ctx = await context(); page = await ctx.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4317/?view=consistency&width=390&theme=light'); await live(page);
  await check('screen and theme controls are in the graphicUI-style dock', async () => {
    await expect(page.locator('.review-dock #consistency-width-trigger')).toBeVisible();
    await expect(page.locator('.review-dock #dock-theme')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.consistency-content')).not.toContainText('Preference');
    await expect(page.locator('.consistency-content')).not.toContainText('Preview');
    await bounds(page, '.review-dock'); await shot(page, 'desktop-light');
  });
  await check('all six presets change the icon and actual iframe viewport', async () => {
    await page.locator('#consistency-note').fill('Dock test draft; do not save.');
    for (const [value, kind, height] of [['360', 'phone', 844], ['390', 'phone', 844], ['768', 'tablet', 1024], ['1280', 'laptop', 900], ['1440', 'laptop', 900], ['1920', 'desktop', 1080]]) {
      await choose(page, 'consistency-width', value); await live(page);
      await expect(page.locator('#consistency-width-trigger')).toHaveAttribute('data-device', kind);
      await expect(page.locator('#consistency-note')).toHaveValue('Dock test draft; do not save.');
      for (const frame of page.frames().filter(frame => frame.url().includes('rcsConsistency='))) expect(await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: Number(value), height });
      const panes = await page.locator('.consistency-pane').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, bottom: r.bottom }; }));
      if (kind === 'phone') expect(Math.abs(panes[0].y - panes[1].y)).toBeLessThan(2); else expect(panes[1].y).toBeGreaterThan(panes[0].bottom);
    }
    await page.evaluate(() => scrollTo(0, 0)); await shot(page, 'desktop-preset');
  });
  await check('device menu opens upward and supports keyboard and Escape', async () => {
    const trigger = page.locator('#consistency-width-trigger'); await trigger.click();
    const menu = await bounds(page, '#consistency-width-trigger-listbox'), button = await trigger.boundingBox();
    expect(menu.y + menu.height).toBeLessThan(button.y); await expect(page.locator('.review-device-option-icon')).toHaveCount(6);
    await shot(page, 'device-menu'); await trigger.press('Home'); await trigger.press('Escape');
    await expect(page.locator('#consistency-width')).toHaveValue('1920'); await expect(trigger).toBeFocused();
    await trigger.press('Enter'); await trigger.press('Home'); await trigger.press('Enter'); await live(page);
    await expect(trigger).toHaveAttribute('data-device', 'phone');
  });
  await check('sun/moon toggle updates preview preference and canvas without losing drafts', async () => {
    await page.locator('#dock-theme').click(); await live(page);
    await expect(page.locator('#dock-theme')).toHaveAttribute('data-mode', 'dark'); await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(22, 22, 22)');
    await expect(page.locator('#consistency-note')).toHaveValue('Dock test draft; do not save.');
    expect(new URL(page.url()).searchParams.get('theme')).toBe('dark');
    for (const frame of page.frames().filter(frame => frame.url().includes('rcsConsistency='))) expect(await frame.evaluate(() => localStorage.getItem('rcs.website.theme'))).toBe('dark');
    await page.evaluate(() => scrollTo(0, 0)); await shot(page, 'desktop-dark');
  });
  await check('comparison dock accessibility with the device menu open', async () => {
    await page.locator('#consistency-width-trigger').click();
    const result = await new AxeBuilder({ page }).exclude('iframe').analyze(); atomicJson(path.join(out, 'dock-axe.json'), { violations: result.violations, incomplete: result.incomplete }); expect(result.violations).toEqual([]);
    await page.locator('#consistency-width-trigger').press('Escape');
  });
  await check('website mode preserves size and theme and exposes one dock control set', async () => {
    await choose(page, 'consistency-width', '1920'); await live(page); await page.locator('#website').click();
    await expect(page.locator('.review-dock #width-trigger')).toBeVisible(); await expect(page.locator('#width')).toHaveValue('1920'); await expect(page.locator('#dock-theme')).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('#website-controls')).not.toContainText(/Width|Preference/);
    await expect.poll(async () => { const frame = page.frames().find(frame => frame.url().startsWith('http://127.0.0.1:1575')); return frame?.evaluate(() => ({ width: innerWidth, height: innerHeight })); }).toEqual({ width: 1920, height: 1080 });
    await choose(page, 'width', '768'); await expect(page.locator('#width-trigger')).toHaveAttribute('data-device', 'tablet'); await shot(page, 'website-tablet');
    await page.locator('#dock-theme').click(); await expect(page.locator('#theme')).toHaveValue('light');
  });
  await check('native view stays device-controlled and returning to Compare retains settings', async () => {
    await page.locator('#android').click(); await expect(page.locator('.dock-preview-tools')).toBeHidden();
    await expect(page.locator('#site')).toHaveAttribute('src', 'http://127.0.0.1:4317/native');
    await page.locator('#consistency').click(); await live(page);
    await expect(page.locator('#consistency-width')).toHaveValue('768'); await expect(page.locator('#consistency-theme')).toHaveValue('light');
  });
  await check('touch dock and upward menu fit narrow, tablet and landscape screens', async () => {
    const touch = await context({ hasTouch: true, isMobile: true }); const p = await touch.newPage();
    await p.goto('http://127.0.0.1:4317/?view=consistency&width=390&theme=light'); await live(p);
    for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [680, 320]]) {
      await p.setViewportSize({ width, height }); await bounds(p, '.review-dock');
      await p.locator('#consistency-width-trigger').tap(); await bounds(p, '#consistency-width-trigger-listbox'); await shot(p, 'touch-' + width);
      await p.locator('#consistency-width-trigger').press('Escape');
      const mode = await p.locator('#consistency-theme').inputValue(); await p.locator('#dock-theme').tap(); await live(p); await expect(p.locator('#consistency-theme')).toHaveValue(mode === 'light' ? 'dark' : 'light');
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => scrollTo(0, 0)); await shot(p, 'phone-final'); await touch.close();
  });
  expect(errors).toEqual([]); assert.equal(hash(fs.readFileSync(registry)), registryHash, 'Owner choices must not change');
  atomicJson(path.join(out, 'dock-checks.json'), { status: 'PASS', at: new Date().toISOString(), checks, errors, ownerChoicesUnchanged: true });
} catch (error) {
  attempts.push({ at: new Date().toISOString(), case: current, error: error.message, passed: checks.length }); atomicJson(path.join(out, 'dock-attempts.json'), attempts);
  if (page && !page.isClosed()) await shot(page, 'failure-' + attempts.length); throw error;
} finally { await browser.close(); }
