import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-implementation-2026-10-26';
const checks = [], observations = [];
const browser = await chromium.launch({ headless: true });
let active, current;
async function section(page, name) {
  const choice = page.getByRole('button', { name, exact: true }), menu = page.getByRole('button', { name: 'Show sections', exact: true });
  await expect(choice.or(menu).first()).toBeVisible(); if (!await choice.isVisible()) await menu.click(); await choice.click();
}
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); }); }
async function shot(page, name) { await settle(page); await page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' }); }
async function field(locator) { await expect(locator).toBeVisible(); await settle(locator.page()); expect((await locator.boundingBox()).height).toBeCloseTo(48, 1); await expect(locator).toHaveCSS('font-size', '16px'); }
async function face(locator, value, kind = 'icon') { await expect(locator).toBeVisible(); expect((await locator.locator(`[data-${kind}-face]`).boundingBox()).height).toBeCloseTo(value, 1); }
async function hit(locator) { return locator.evaluate(e => { const r = e.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { blocked: target !== e && !e.contains(target), target: target?.tagName + '.' + target?.className }; }); }
try {
  for (const [width, theme] of [[390, 'light'], [1440, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'customer', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    const page = await ctx.newPage(), errors = []; active = page; page.on('pageerror', e => errors.push(e.message));
    current = `profile-${width}-${theme}`;
    for (const [label, placeholder] of [['Emergency Contact', 'XXXXX XXXXX'], ['DOB', 'DD/MM/YYYY']]) {
      await page.goto('http://127.0.0.1:1575/manage-account'); await section(page, 'Account info');
      await page.locator('li').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button').click();
      const input = page.getByPlaceholder(placeholder, { exact: true }); await field(input); await settle(page);
      observations.push({ case: current + '-' + label, pointer: await hit(input), note: 'Rendering and keyboard checked; existing backdrop pointer interception remains VC-B02-03.' });
      await input.focus(); await expect(input).toBeFocused();
      const close = page.locator('[role=dialog] [data-size=icon][aria-label=Close]'); await face(close, 40);
      await shot(page, current + '-' + label.replaceAll(' ', '-')); await close.press('Enter'); await expect(input).toBeHidden();
    }
    expect(errors).toEqual([]); checks.push({ case: current, status: 'PASS', scope: 'Import fix, 48px fields, 40px close face, keyboard close. Pointer remains blocked.' });

    current = `safety-${width}-${theme}`;
    await page.goto('http://127.0.0.1:1575/safety'); await section(page, 'Emergency contact');
    await page.locator('li').filter({ has: page.getByText('Emergency contact', { exact: true }) }).getByRole('button', { name: 'Action', exact: true }).click();
    await field(page.getByPlaceholder('XXXXX XXXXX', { exact: true }));
    const cancel = page.getByRole('button', { name: 'Cancel editing', exact: true }); await face(cancel, 40); await shot(page, current); await cancel.click();
    checks.push({ case: current, status: 'PASS' });

    current = `calendar-${width}-${theme}`;
    await page.goto(`http://127.0.0.1:1575/dev/home?rcsConsistency=VCB01_ROUTE_ACTION&preference=${theme}`);
    const when = page.getByRole('button', { name: /^(When|Edit)$/ }); await expect(when).toBeVisible({ timeout: 45000 }); await when.click();
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true }); await expect(confirm).toBeVisible(); await settle(page);
    const calendarClose = page.locator('[data-size=icon]').filter({ has: page.locator('svg') }).filter({ hasNot: page.locator('[aria-label="Back"]') });
    const dialogClose = page.locator('[data-size=icon][aria-label]').filter({ has: page.locator('svg') });
    observations.push({ case: current, iconLabels: await dialogClose.evaluateAll(es => es.filter(e => e.offsetWidth).map(e => e.getAttribute('aria-label'))) });
    await expect(page.locator('button button')).toHaveCount(0); await shot(page, current); await confirm.click(); await expect(confirm).toBeHidden();
    checks.push({ case: current, status: 'PASS' });

    await ctx.route('**/api/users/me', r => r.fulfill({ json: { id: 'synthetic-admin', clerkId: 'user_p01_admin', role: 'admin', name: 'Synthetic Admin', notifications: {} } }));
    await ctx.addCookies([{ name: 'fixture_actor', value: 'admin', url: 'http://127.0.0.1:1575' }]);
    current = `admin-${width}-${theme}`;
    await page.goto('http://127.0.0.1:1575/dashboard'); await section(page, 'Bookings');
    await field(page.getByPlaceholder('Name, phone, location, ID', { exact: true }).locator('..'));
    const filter = page.getByRole('button', { name: 'Filter', exact: true }), sort = page.getByRole('button', { name: /Sort (newest|oldest) first/ });
    await face(filter, 36, 'pill'); await face(sort, 36, 'pill'); await filter.click(); await settle(page);
    const pending = page.getByRole('button', { name: 'pending', exact: true }); await face(pending, 36, 'pill');
    const old = await pending.getAttribute('aria-pressed'); await pending.press('Enter'); await expect(pending).toHaveAttribute('aria-pressed', old === 'true' ? 'false' : 'true');
    observations.push({ case: current, pointer: await hit(pending), note: 'Admin filter layering issue remains. Pill sizing and keyboard tested separately.' });
    await page.getByRole('button', { name: 'Dates', exact: true }).press('Enter'); await field(page.getByPlaceholder('YYYY-MM-DD', { exact: true }).first());
    await shot(page, current); expect(errors).toEqual([]); checks.push({ case: current, status: 'PASS', scope: 'Input/filter geometry and keyboard; known pointer interception recorded separately.' });
    await page.goto('http://127.0.0.1:1575/dashboard/responsibility'); await field(page.locator('input').first());
    checks.push({ case: `responsibility-${width}-${theme}`, status: 'PASS' });
    await ctx.close();
  }

  for (const language of ['hi', 'hi-Latn']) {
    current = `saved-12-places-320-${language}`;
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'customer', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(language => localStorage.setItem('rcs-data', JSON.stringify({ state: { language }, version: 0 })), language);
    await ctx.route('**/api/googleAPI/autocomplete?*', r => r.fulfill({ json: { suggestions: [{ placePrediction: { placeId: 'synthetic-translation', text: { text: 'Synthetic Garden, Fixture City' } } }] } }));
    await ctx.route('**/api/users/me/saved-places', r => r.fulfill({ json: { places: Array.from({ length: 12 }, (_, i) => ({ id: 'synthetic-' + i, label: i === 0 ? 'Home' : i === 1 ? 'Work' : 'Synthetic ' + i, address: 'Synthetic Road ' + i })) } }));
    const page = await ctx.newPage(); active = page; await page.goto('http://127.0.0.1:1575/settings');
    await page.getByRole('button', { name: language === 'hi' ? 'सहेजे गए स्थान' : 'Save ki hui jagah', exact: true }).click();
    const edit = page.locator('ul li').filter({ hasText: 'Synthetic Road 11' }).getByRole('button').last(); await edit.scrollIntoViewIfNeeded(); await edit.click();
    const address = page.getByRole('combobox'); await field(address); await address.fill('Syn'); await expect(page.getByRole('option').first()).toBeVisible();
    await shot(page, current); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await address.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0); await address.press('Escape'); await expect(address).toHaveCount(0);
    checks.push({ case: current, status: 'PASS', states: ['last row scroll', 'translated fields', 'autocomplete', 'Escape closes popup then editor', 'no horizontal overflow'] });
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage(); active = page; current = 'switch-normal-motion';
  await ctx.addCookies([{ name: 'fixture_actor', value: 'customer', url: 'http://127.0.0.1:1575' }]);
  await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await ctx.route('**/api/users/me/preferences', r => r.request().method() === 'GET' ? r.fallback() : r.fulfill({ json: { notifications: { whatsapp: false, push: true, promotions: false } } }));
  await page.goto('http://127.0.0.1:1575/settings'); await section(page, 'Notifications');
  const control = page.getByRole('switch').first(); await expect(control).toBeEnabled();
  await expect(control.locator('[data-switch-thumb]')).toHaveCSS('transition-duration', '0.2s');
  const before = await control.getAttribute('aria-checked'); await control.press('Space'); await expect(control).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await expect(control.locator('[data-switch-thumb]')).toHaveCSS('translate', before === 'true' ? '0px' : '20px');
  checks.push({ case: current, status: 'PASS' }); await ctx.close();
  fs.writeFileSync(path.join(out, 'additional-results.json'), JSON.stringify({ status: 'PASS', checks, observations }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'additional-attempt-' + Date.now() + '.json'), JSON.stringify({ current, error: error.message, checks, observations }, null, 2));
  if (active && !active.isClosed()) await shot(active, 'additional-failure-' + Date.now()); throw error;
} finally { await browser.close(); }
