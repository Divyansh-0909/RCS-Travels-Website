import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/VC-B02-implementation-2026-10-26';
fs.mkdirSync(out, { recursive: true });
const checks = [], axe = [], dimensions = [];
const browser = await chromium.launch({ headless: true });
let current = '', active;
async function context(width, height, theme, guest = false) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });
  await ctx.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await ctx.addCookies([{ name: 'fixture_actor', value: guest ? 'guest' : 'customer', url: 'http://127.0.0.1:1575' }]);
  await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); active = page;
  return { ctx, page, errors };
}
async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); });
}
async function shot(page, name) { await settled(page); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true, animations: 'disabled' }); }
async function within(locator, page) {
  const r = await locator.boundingBox(), v = page.viewportSize(); expect(r).not.toBeNull();
  expect(r.x).toBeGreaterThanOrEqual(-1); expect(r.x + r.width).toBeLessThanOrEqual(v.width + 1);
  expect(r.y).toBeGreaterThanOrEqual(-1); expect(r.y + r.height).toBeLessThanOrEqual(v.height + 1);
  return r;
}
async function field(locator) {
  await expect(locator).toBeVisible();
  expect((await locator.boundingBox()).height).toBeCloseTo(48, 1);
  await expect(locator).toHaveCSS('font-size', '16px');
}
async function pill(locator, page) {
  expect((await within(locator, page)).height).toBeGreaterThanOrEqual(44);
  expect((await locator.locator('[data-pill-face]').boundingBox()).height).toBeCloseTo(36, 1);
  await expect(locator.locator('[data-pill-face]')).toHaveCSS('font-size', '14px');
}
async function icon(locator, face, page) {
  const r = await within(locator, page); expect(r.height).toBeCloseTo(44, 1); expect(r.width).toBeCloseTo(44, 1);
  expect((await locator.locator('[data-icon-face]').boundingBox()).height).toBeCloseTo(face, 1);
}
async function section(page, name) {
  const choice = page.getByRole('button', { name, exact: true });
  const toggle = page.getByRole('button', { name: 'Show sections', exact: true });
  await expect(choice.or(toggle).first()).toBeVisible();
  if (!await choice.isVisible()) await toggle.click();
  await choice.click();
}
async function audit(page, selector, name) {
  const result = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  axe.push({ case: name, violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })) });
  expect(result.violations).toEqual([]);
}
function pass(extra = {}) { checks.push({ case: current, status: 'PASS', ...extra }); console.log('PASS ' + current); }
try {
  for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1440, 900], [680, 360]]) for (const theme of ['light', 'dark']) {
    let { ctx, page, errors } = await context(width, height, theme);
    current = `route-${width}-${theme}`;
    await page.goto(`http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=${theme}`);
    await page.waitForFunction(() => window.__RCS_CONSISTENCY_MEASUREMENT__, null, { timeout: 65000 });
    await settled(page);
    await field(page.locator('#pickup-location')); await field(page.locator('#drop-location'));
    const one = page.getByRole('button', { name: 'One way', exact: true }), round = page.getByRole('button', { name: 'Round trip', exact: true }), later = page.getByRole('button', { name: 'Later', exact: true });
    for (const p of [one, round, later]) await pill(p, page);
    await round.press('Space'); await expect(round).toHaveAttribute('aria-pressed', 'true');
    await one.press('Enter'); await expect(one).toHaveAttribute('aria-pressed', 'true');
    await expect(one).toHaveCSS('outline-style', 'solid');
    await shot(page, current);
    await later.click();
    const timing = page.getByRole('dialog', { name: 'Choose timing', exact: true });
    await expect(timing).toBeVisible(); await settled(page); await within(timing, page);
    const close = page.locator('[data-size=icon][aria-label="Close timing options"]');
    await icon(close, width < 640 ? 36 : 40, page); await shot(page, current + '-timing');
    await timing.getByRole('button', { name: /Ride now/ }).click();
    await expect(page.getByRole('button', { name: 'Now', exact: true })).toBeVisible();
    expect(errors).toEqual([]); pass({ states: ['36px faces', '44px targets', 'keyboard', 'timing dropdown', 'selection'] });
    current = `options-${width}-${theme}`;
    await page.goto(`http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_VEHICLE_ACTION&theme=${theme}`);
    await page.waitForFunction(() => window.__RCS_CONSISTENCY_MEASUREMENT__, null, { timeout: 65000 });
    const trigger = page.getByRole('button', { name: /Ride options/ });
    dimensions.push({ case: current, trigger: await trigger.boundingBox() });
    await trigger.click(); await expect(page.getByRole('heading', { name: 'Ride options', exact: true })).toBeVisible();
    await settled(page);
    const switches = page.getByRole('switch'); await expect(switches).toHaveCount(3);
    for (const control of await switches.all()) {
      await control.scrollIntoViewIfNeeded(); await within(control, page);
      const track = control.locator('[data-switch-track]'), thumb = control.locator('[data-switch-thumb]');
      expect((await track.boundingBox()).width).toBe(48); expect((await track.boundingBox()).height).toBe(28);
      await expect(thumb).toHaveCSS('transition-property', 'none');
      if (await control.isEnabled()) {
        const before = await control.getAttribute('aria-checked'); await control.press('Space');
        await expect(control).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
      }
    }
    await icon(page.locator('[data-size=icon][aria-label="Close ride options"]'), width < 640 ? 36 : 40, page);
    await shot(page, current);
    await expect(page.locator('button button')).toHaveCount(0);
    await page.locator('[data-size=icon][aria-label="Close ride options"]').click();
    expect(errors).toEqual([]); pass({ states: ['Settings switch visuals', 'keyboard', 'disabled', 'reduced motion'] });
    await ctx.close();

    ({ ctx, page, errors } = await context(width, height, theme, true));
    current = `auth-${width}-${theme}`;
    await ctx.route('**/api/auth/check-name', r => r.fulfill({ json: { available: true } }));
    await ctx.route('**/api/auth/send-otp', r => r.fulfill({ json: { success: true } }));
    for (const route of ['login', 'signup']) {
      await page.goto('http://127.0.0.1:1575/' + route);
      if (route === 'signup') { await field(page.locator('#username')); await page.locator('#username').fill('Synthetic Reviewer'); await page.locator('button[type=submit]').click(); }
      const phone = page.locator('#phone-number'); await field(phone); await phone.fill('9990000101');
      await icon(page.getByRole('button', { name: 'Back', exact: true }), 40, page);
      if (height >= 640) await shot(page, current + '-' + route);
      await page.locator('button[type=submit]').click();
      const digits = page.locator('input[inputmode=numeric]'); await expect(digits).toHaveCount(6);
      for (const digit of await digits.all()) { expect((await digit.boundingBox()).height).toBe(48); expect((await digit.boundingBox()).width).toBe(48); }
      if (height >= 640) await shot(page, current + '-' + route + '-otp');
    }
    expect(errors).toEqual([]); pass(); await ctx.close();

    ({ ctx, page, errors } = await context(width, height, theme));
    current = `saved-${width}-${theme}`;
    let places = [{ id: 'synthetic-home', label: 'Home', address: 'Aster Road' }, { id: 'synthetic-work', label: 'Work', address: 'Birch Road' }], payload;
    let failSave = false, holdDetails, delayDetails = false, detailsFail = false, autoFail = false;
    await ctx.route('**/api/users/me/saved-places', async r => {
      if (r.request().method() === 'GET') return r.fulfill({ json: { places } });
      payload = r.request().postDataJSON();
      if (failSave) return r.fulfill({ status: 400, json: { error: 'Synthetic save failure' } });
      const place = { ...payload, id: payload.id || 'synthetic-new' };
      places = [...places.filter(p => p.id !== place.id), place];
      return r.fulfill({ json: { place } });
    });
    await ctx.route('**/api/googleAPI/autocomplete?*', r => autoFail ? r.fulfill({ status: 503, json: { error: 'Synthetic lookup failure' } }) : r.fulfill({ json: { suggestions: [{ placePrediction: { placeId: 'synthetic-place', text: { text: 'Cedar Synthetic Road, Fixture City' } } }] } }));
    await ctx.route('**/api/googleAPI/details/*', async r => {
      if (delayDetails) await new Promise(resolve => { holdDetails = resolve; });
      return detailsFail ? r.fulfill({ status: 400, json: { error: 'Synthetic details failure' } }) : r.fulfill({ json: { lat: 28.61, lng: 77.21 } });
    });
    await page.goto('http://127.0.0.1:1575/settings'); await section(page, 'Saved places');
    await page.getByRole('button', { name: 'Edit place Home', exact: true }).click();
    let name = page.getByRole('textbox', { name: 'Place name', exact: true }), address = page.getByRole('combobox', { name: 'Address', exact: true }), save = page.getByRole('button', { name: 'Save place', exact: true });
    await field(name); await field(address); await expect(save).toBeEnabled();
    await name.fill('   '); await expect(save).toBeDisabled();
    await name.fill('N'.repeat(41)); await expect(name).toHaveValue('N'.repeat(40));
    await name.fill('Gym'); await address.fill('Arbitrary location text'); await expect(save).toBeDisabled();
    let option = page.getByRole('option', { name: 'Cedar Synthetic Road, Fixture City', exact: true }); await expect(option).toBeVisible();
    await within(page.locator('[role=listbox]').locator('..'), page); await expect(page.getByText('Google Maps', { exact: true })).toBeVisible();
    await shot(page, current + '-suggestions');
    delayDetails = true;
    await address.press('ArrowDown'); await address.press('Enter');
    await expect(address).toHaveAttribute('aria-busy', 'true'); await expect(save).toBeDisabled();
    await expect.poll(() => Boolean(holdDetails)).toBe(true); holdDetails(); delayDetails = false;
    await expect(save).toBeEnabled(); await expect(address).toHaveValue('Cedar Synthetic Road, Fixture City');
    failSave = true; await save.click(); await expect(page.getByRole('alert')).toHaveText('Synthetic save failure'); await expect(name).toHaveValue('Gym');
    failSave = false; await save.click(); await expect(name).toHaveCount(0);
    expect(payload).toMatchObject({ id: 'synthetic-home', label: 'Gym', address: 'Cedar Synthetic Road, Fixture City', lat: 28.61, lng: 77.21 });
    await page.getByRole('button', { name: 'Edit place Gym', exact: true }).click();
    name = page.getByRole('textbox', { name: 'Place name', exact: true }); address = page.getByRole('combobox', { name: 'Address', exact: true }); save = page.getByRole('button', { name: 'Save place', exact: true });
    await name.fill('Home renamed'); await expect(save).toBeEnabled(); await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
    await page.getByRole('button', { name: 'Add a place', exact: true }).click();
    name = page.getByRole('textbox', { name: 'Place name', exact: true }); address = page.getByRole('combobox', { name: 'Address', exact: true }); save = page.getByRole('button', { name: 'Save place', exact: true });
    await expect(save).toBeDisabled(); await name.fill('New place'); autoFail = true; await address.fill('Lookup failure');
    await expect(page.getByText("Couldn't load places. Try again.", { exact: true })).toBeVisible();
    autoFail = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(option).toBeVisible();
    detailsFail = true; await option.click(); await expect(page.getByText("Couldn't confirm that address. Choose another result.", { exact: true })).toBeVisible(); await expect(save).toBeDisabled();
    detailsFail = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(option).toBeVisible(); await option.click(); await expect(save).toBeEnabled();
    await address.fill('Changed after selection'); await expect(save).toBeDisabled(); await expect(option).toBeVisible();
    delayDetails = true; holdDetails = null; await option.click(); await expect.poll(() => Boolean(holdDetails)).toBe(true);
    await address.fill('New draft'); holdDetails(); delayDetails = false; await expect(option).toBeVisible(); await expect(save).toBeDisabled(); await expect(address).toHaveValue('New draft');
    await option.click(); await expect(save).toBeEnabled();
    await within(name, page); await within(address, page); await icon(page.getByRole('button', { name: 'Cancel editing', exact: true }), 40, page);
    await shot(page, current + '-ready');
    if ([390, 1440].includes(width)) await audit(page, 'ul:has(#saved-place-name)', current);
    await save.click(); expect(payload).toMatchObject({ label: 'New place', lat: 28.61, lng: 77.21 });
    await expect(page.getByRole('button', { name: 'Edit place New place', exact: true })).toBeVisible();
    await section(page, 'Notifications');
    const settingSwitch = page.getByRole('switch').first(); await expect(settingSwitch).toBeEnabled();
    expect((await settingSwitch.boundingBox()).height).toBe(44); expect((await settingSwitch.locator('[data-switch-track]').boundingBox()).width).toBe(48);
    await shot(page, current + '-switches');
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    pass({ states: ['name bounds', 'legacy rename', 'new location', 'keyboard suggestions', 'coordinates', 'pending details', 'lookup/detail/save failures', 'retry', 'draft retained', 'stale details ignored', 'selection invalidated', 'synthetic persistence'] });
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ status: 'PASS', at: new Date().toISOString(), checks, axe, dimensions, scope: 'Local synthetic UI; external requests blocked; no real Google/customer/OTP/provider writes.' }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'browser-attempt-' + Date.now() + '.json'), JSON.stringify({ current, error: error.message, checks, axe }, null, 2));
  if (active && !active.isClosed()) await shot(active, 'failure-' + Date.now());
  throw error;
} finally { await browser.close(); }
