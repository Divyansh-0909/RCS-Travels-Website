import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-input-refinement-2026-10-27';
const baseline = process.argv.includes('--baseline'), phase = baseline ? 'before' : 'after';
const records = [], checks = [];
const browser = await chromium.launch({ headless: true });
let active, current;
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); }); }
async function measure(input) { return input.evaluate(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, font: s.fontSize, radius: s.borderRadius, padding: s.padding, border: s.border, outline: s.outline, outlineOffset: s.outlineOffset, shadow: s.boxShadow }; }); }
async function capture(page, input, key, width, theme) {
  await expect(input).toBeVisible(); await settle(page);
  await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(180);
  await input.evaluate(e => e.blur()); const rest = await measure(input);
  await input.click(); const pointer = await measure(input);
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Tab'); await input.focus(); await expect(input).toBeFocused(); expect(await input.evaluate(e => e.matches(':focus-visible'))).toBe(true); const keyboard = await measure(input);
  const rect = await input.boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); const pressed = await measure(input); await page.mouse.up();
  const record = { key, width, theme, rest, pointer, keyboard, pressed }; records.push(record);
  if (!baseline) {
    for (const state of [rest, pointer, keyboard, pressed]) { expect(state.height).toBeCloseTo(48, 1); expect(state.font).toBe('16px'); expect(state.radius).toBe('12px'); }
    for (const state of [pointer, keyboard, pressed]) { expect(state.outlineOffset).toBe('0px'); expect(state.outline).toMatch(/none/); expect(state.shadow).toBe('none'); }
    await expect(input).toHaveCSS('border-top-color', 'rgb(36, 58, 251)');
  }
  if ([390, 1440].includes(width) && !key.endsWith('drop') && key !== 'signup-phone') await page.screenshot({ path: path.join(out, `${phase}-${key}-${width}-${theme}.png`), animations: 'disabled' });
  return record;
}
try {
  for (const width of [320, 390, 600, 768, 1440]) for (const theme of ['light', 'dark']) {
    current = width + '-' + theme;
    const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'guest', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    await ctx.route('**/api/auth/check-name', r => r.fulfill({ json: { available: true } }));
    const page = await ctx.newPage(), errors = []; active = page; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:1575/login');
    const login = await capture(page, page.locator('#phone-number'), 'login', width, theme);
    await page.goto('http://127.0.0.1:1575/signup');
    await capture(page, page.locator('#username'), 'signup-name', width, theme);
    await page.locator('#username').fill('Synthetic Reviewer'); await page.locator('button[type=submit]').click();
    await capture(page, page.locator('#phone-number'), 'signup-phone', width, theme);
    for (const [key, route] of [['booking', `/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=${theme}`], ['home', `/dev/home?rcsConsistency=VCB01_ROUTE_ACTION&preference=${theme}`]]) {
      await page.goto('http://127.0.0.1:1575' + route);
      for (const name of ['pickup', 'drop']) {
        const input = page.locator('#' + name + '-location');
        const result = await capture(page, input, key + '-' + name, width, theme);
        if (!baseline) expect(result.rest.width).toBeCloseTo(login.rest.width, 1);
      }
    }
    expect(errors).toEqual([]); checks.push({ width, theme, status: baseline ? 'OBSERVED' : 'PASS' }); console.log(phase + ' ' + current); await ctx.close();
  }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify({ phase, status: baseline ? 'OBSERVED' : 'PASS', checks, records, scope: 'Actual login/signup, /book and /dev/home booking fields. Synthetic actors and places; external calls blocked.' }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'attempt-' + Date.now() + '.json'), JSON.stringify({ phase, current, error: error.message, checks, records }, null, 2));
  if (active && !active.isClosed()) await active.screenshot({ path: path.join(out, 'failure-' + Date.now() + '.png'), animations: 'disabled' }); throw error;
} finally { await browser.close(); }
