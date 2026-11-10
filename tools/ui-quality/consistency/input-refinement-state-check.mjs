import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-input-refinement-2026-10-27', checks = [];
const browser = await chromium.launch({ headless: true });
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); }); }
async function singleBorder(input) { await input.focus(); await expect(input).toHaveCSS('outline-style', 'none'); await expect(input).toHaveCSS('outline-offset', '0px'); await expect(input).toHaveCSS('border-top-width', '1px'); }
try {
  for (const [width, height] of [[320, 640], [600, 844], [768, 1024]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await ctx.newPage(); await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=dark');
    await expect(page.locator('#pickup-location')).toBeVisible(); await settle(page);
    for (const input of [page.locator('#pickup-location'), page.locator('#drop-location')]) { const r = await input.boundingBox(); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(width); expect(r.height).toBe(48); }
    const later = page.getByRole('button', { name: 'Later', exact: true }); await later.click();
    const timing = page.getByRole('dialog', { name: 'Choose timing', exact: true }); await expect(timing).toBeVisible();
    const r = await timing.boundingBox(); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(width);
    await page.locator('[data-size=icon][aria-label="Close timing options"]').click();
    await expect(timing).toBeHidden();
    await page.screenshot({ path: path.join(out, `after-booking-layout-${width}.png`), animations: 'disabled' });
    checks.push({ width, height, status: 'PASS', scope: 'Field bounds and timing popup after field-rail alignment' }); await ctx.close();
  }
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'guest', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    let fail = true; await ctx.route('**/api/auth/send-otp', r => r.fulfill(fail ? { status: 400, json: { error: 'Number should be exactly 10 digits' } } : { json: { success: true } }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:1575/login'); const phone = page.locator('#phone-number');
    await phone.fill('9990000101'); await page.locator('button[type=submit]').click();
    await expect(page.getByText('Number should be exactly 10 digits', { exact: true })).toBeVisible(); await singleBorder(phone);
    expect(await phone.evaluate(e => getComputedStyle(e).borderTopColor)).not.toBe('rgb(36, 58, 251)');
    await page.screenshot({ path: path.join(out, `after-error-${width}-${theme}.png`), animations: 'disabled' });
    fail = false; await phone.fill('9990000102'); await page.locator('button[type=submit]').click();
    const digits = page.locator('input[inputmode=numeric]'); await expect(digits).toHaveCount(6); await settle(page);
    await singleBorder(digits.first()); expect((await digits.first().boundingBox()).width).toBe(48); await expect(digits.first()).toHaveCSS('font-size', '24px');
    await digits.first().fill('1'); await digits.first().press('ArrowRight'); await expect(digits.nth(1)).toBeFocused(); await singleBorder(digits.nth(1));
    await page.screenshot({ path: path.join(out, `after-otp-${width}-${theme}.png`), animations: 'disabled' });
    await ctx.addCookies([{ name: 'fixture_actor', value: 'admin', url: 'http://127.0.0.1:1575' }]);
    await ctx.route('**/api/users/me', r => r.fulfill({ json: { id: 'synthetic-admin', role: 'admin', name: 'Synthetic Admin' } }));
    await page.goto('http://127.0.0.1:1575/dashboard/responsibility'); const field = page.locator('input').first();
    await singleBorder(field); await expect(field).toHaveCSS('border-top-color', 'rgb(36, 58, 251)'); await field.fill('synthetic-case');
    const action = page.getByRole('button', { name: 'Open case', exact: true }); await page.keyboard.press('Tab'); await action.focus();
    await expect(action).toHaveCSS('outline-style', 'solid'); await expect(action).toHaveCSS('outline-offset', '2px'); await expect(action).toHaveCSS('outline-color', 'rgb(36, 58, 251)');
    expect(errors).toEqual([]); checks.push({ width, theme, status: 'PASS', scope: 'Error border retained, OTP focus/geometry, other shared field focus, button outline retained' }); await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'state-checks.json'), JSON.stringify({ status: 'PASS', checks, scope: 'Local synthetic API responses; no real OTP/provider writes.' }, null, 2));
} finally { await browser.close(); }
