import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { atomicJson } from '../../handoff/core.mjs';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/website-consistency-2026-10-26', corrections = [], pending = [];
const browser = await chromium.launch({ headless: true });
async function context(width, theme, actor) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
  await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await ctx.route('**/api/**', r => ['GET', 'HEAD'].includes(r.request().method()) ? r.fallback() : r.fulfill({ status: 409, json: { error: 'Audit is read only' } }));
  await ctx.addCookies([{ name: 'fixture_actor', value: actor, url: 'http://127.0.0.1:1575' }]);
  await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
  if (actor === 'admin') await ctx.route('**/api/users/me', r => r.fulfill({ json: { id: 'p01_synthetic_admin', clerkId: 'user_p01_admin', name: 'Synthetic Admin', role: 'admin' } }));
  return { ctx, page: await ctx.newPage() };
}
async function styles(input) {
  return input.evaluate(element => { const s = getComputedStyle(element), r = element.getBoundingClientRect(); return { rect: { width: r.width, height: r.height }, field: { width: r.width, height: r.height }, radius: s.borderRadius, background: s.backgroundColor, border: s.border, outline: s.outline, shadow: s.boxShadow, padding: s.padding, disabled: element.disabled, readOnly: element.readOnly, opacity: s.opacity, ariaBusy: element.getAttribute('aria-busy'), font: s.fontSize, focused: document.activeElement === element, focusVisible: element.matches(':focus-visible') }; });
}
try {
  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [768, 'light'], [1440, 'light'], [1440, 'dark']]) {
    const { ctx, page } = await context(width, theme, 'admin');
    await page.goto('http://127.0.0.1:1575/dashboard/responsibility');
    const input = page.locator('input').first(); await expect(input).toBeVisible();
    await page.evaluate(() => document.fonts.ready); await input.evaluate(e => e.blur());
    const states = { default: await styles(input) };
    await input.hover(); states.hover = await styles(input);
    await page.keyboard.press('Tab'); await input.focus(); states.focus = await styles(input);
    const box = await input.boundingBox(); await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); states.active = await styles(input); await page.mouse.move(0, 0); await page.mouse.up();
    corrections.push({ key: 'responsibility-case', width, theme, states, note: 'Measure the bordered input, excluding its external label. The original capture also retains the enclosing label measurements.' });
    await ctx.close();
  }
  for (const [width, theme] of [[390, 'dark'], [1440, 'light']]) {
    for (const task of ['login', 'saved']) {
      const { ctx, page } = await context(width, theme, task === 'login' ? 'guest' : 'customer');
      let release; const gate = new Promise(resolve => { release = resolve; });
      await ctx.route(task === 'login' ? '**/api/auth/send-otp' : '**/api/users/me/saved-places', async r => {
        if (r.request().method() === 'GET') return r.fallback();
        await gate;
        return r.fulfill({ json: task === 'login' ? { success: true } : { place: { id: 'synthetic-audit-home', label: 'Home', address: 'Synthetic Aster Road' } } });
      });
      try {
        if (task === 'login') {
          await page.goto('http://127.0.0.1:1575/login'); await page.locator('#phone-number').fill('9990000101'); await page.locator('button[type=submit]').click();
          await expect(page.locator('button[type=submit]')).toBeDisabled(); await expect(page.locator('button[type=submit]')).toHaveAttribute('aria-busy', 'true');
        } else {
          await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_SAVED_ADDRESS&theme=' + theme);
          await page.getByRole('textbox', { name: 'Address', exact: true }).fill('Synthetic Aster Road'); await page.getByRole('button', { name: 'Save place', exact: true }).click();
          await expect(page.getByRole('textbox', { name: 'Address', exact: true })).toBeDisabled();
        }
        const input = task === 'login' ? page.locator('#phone-number') : page.getByRole('textbox', { name: 'Address', exact: true });
        await page.evaluate(() => document.fonts.ready);
        const screenshot = `images/${task}-pending-${width}-${theme}.png`;
        await page.screenshot({ path: path.join(out, screenshot), animations: 'disabled' });
        pending.push({ task, width, theme, styles: await styles(input), screenshot });
      } finally { release(); await ctx.close(); }
    }
  }
  atomicJson(path.join(out, 'supplement.json'), { at: new Date().toISOString(), corrections, pending, scope: 'Five input-chrome measurements and four held synthetic requests. No real auth or saved-place mutation.' });
  console.log('OBSERVED 5 input-chrome measurements and 4 pending states');
} finally { await browser.close(); }
