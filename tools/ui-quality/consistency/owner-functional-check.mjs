import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { atomicJson, readJson } from '../../handoff/core.mjs';

const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const savedOnly = process.env.RCS_OWNER_SAVED_ONLY === '1';
const output = process.env.RCS_OWNER_EVIDENCE || 'output/handoff/consistency-implementation-2026-10-26';
fs.mkdirSync(output, { recursive: true });
const checks = [], attempts = readJson(path.join(output, 'functional-attempts.json'), []);
const browser = await chromium.launch({ headless: true });
let current = '', currentPage;
async function context(width, theme, guest = false) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1024 }, colorScheme: theme, reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await ctx.addCookies([{ name: 'fixture_actor', value: guest ? 'guest' : 'customer', url: 'http://127.0.0.1:1575' }]);
  await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
  const page = await ctx.newPage(), errors = [];
  currentPage = page;
  page.on('pageerror', error => errors.push(error.message));
  return { ctx, page, errors };
}
async function action(button, width) {
  await expect(button).toBeVisible({ timeout: 45000 });
  await expect(button).toHaveAttribute('data-size', 'action');
  const box = await button.boundingBox();
  expect(box.height).toBeCloseTo(48, 1);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  await expect(button).toHaveCSS('font-size', '16px');
  await expect(button).toHaveCSS('padding', '12px 24px');
}
async function screenshot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished)); });
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
}
try {
  for (const width of (savedOnly ? [320, 360, 390, 768, 1440] : [360, 390, 768, 1440])) for (const theme of ['light', 'dark']) {
    for (const [name, id, label] of (savedOnly ? [] : [['route', 'VCB01_ROUTE_ACTION', 'Set date & time'], ['timing', 'VCB01_TIMING_ACTION', 'See prices'], ['vehicle', 'VCB01_VEHICLE_ACTION', 'Book ride']])) {
      current = name + '-' + width + '-' + theme;
      const { ctx, page, errors } = await context(width, theme);
      await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=' + id + '&theme=' + theme);
      await page.waitForFunction(id => window.__RCS_CONSISTENCY_MEASUREMENT__?.id === id, id, { timeout: 65000 });
      const button = page.getByRole('button', { name: label, exact: true });
      await action(button, width);
      if (name === 'route') {
        const color = await page.locator('#pickup-location').evaluate(element => ({ actual: getComputedStyle(element).backgroundColor, expected: getComputedStyle(element).getPropertyValue('--background-muted').trim() }));
        const normalized = await page.evaluate(value => { const probe = document.createElement('span'); probe.style.backgroundColor = value; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; }, color.expected);
        expect(color.actual).toBe(normalized);
        await expect(page.locator('#drop-location')).toHaveCSS('background-color', normalized);
        await button.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(button).toBeFocused();
        expect(await button.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
        await page.getByRole('button', { name: 'Clear drop location', exact: true }).click();
        await expect(button).toBeDisabled();
      }
      if (name === 'vehicle') {
        const sedan = page.getByRole('button', { name: /Sedan/ });
        await sedan.click();
        await expect(sedan).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('button', { name: /Hatchback/ })).toHaveAttribute('aria-pressed', 'false');
      }
      if ([390, 1440].includes(width)) await screenshot(page, current);
      expect(errors).toEqual([]);
      checks.push({ case: current, status: 'PASS' });
      console.log('PASS ' + current);
      await ctx.close();
    }
    for (const route of (savedOnly ? [] : ['login', 'signup'])) {
      current = route + '-' + width + '-' + theme;
      const { ctx, page, errors } = await context(width, theme, true);
      await ctx.route('**/api/auth/check-name', r => r.fulfill({ json: { available: true } }));
      await page.goto('http://127.0.0.1:1575/' + route);
      let button = page.locator('button[data-size=action][type=submit]');
      await action(button, width);
      await expect(button).toBeDisabled();
      if (route === 'signup') {
        await page.locator('#username').fill('Synthetic Reviewer');
        await button.click();
      }
      await page.locator('#phone-number').fill('9990000101');
      await expect(button).toBeEnabled();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      let calls = 0;
      await ctx.route('**/api/auth/send-otp', async r => { calls++; await gate; await r.fulfill({ json: { success: true } }); });
      await button.click();
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await action(button, width);
      release();
      await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(6, { timeout: 15000 });
      button = page.locator('button[data-size=action][type=submit]');
      await action(button, width);
      await expect(button).toBeDisabled();
      await ctx.route('**/api/auth/verify-otp', r => r.fulfill({ status: 400, json: { error: 'Wrong OTP' } }));
      const digits = page.locator('input[inputmode="numeric"]');
      for (let i = 0; i < 6; i++) await digits.nth(i).fill(String(i));
      await button.click();
      await expect(page.getByText('Wrong OTP', { exact: true }).first()).toBeVisible();
      await action(button, width);
      expect(calls).toBe(1);
      if ([390, 1440].includes(width)) await screenshot(page, current + '-otp-error');
      expect(errors).toEqual([]);
      checks.push({ case: current, status: 'PASS', states: ['disabled', 'ready', 'loading', 'OTP', 'error'], syntheticRequests: calls + 1 });
      console.log('PASS ' + current);
      await ctx.close();
    }
    current = 'saved-' + width + '-' + theme;
    const { ctx, page, errors } = await context(width, theme);
    const places = [{ id: 'synthetic-home', label: 'Home', address: 'Aster Road' }, { id: 'synthetic-work', label: 'Work', address: 'Birch Road' }, { id: 'synthetic-custom', label: 'Gym', address: 'Cedar Road' }];
    await ctx.route('**/api/users/me/saved-places', r => r.request().method() === 'GET' ? r.fulfill({ json: { places } }) : r.fallback());
    await page.goto('http://127.0.0.1:1575/settings');
    await page.getByRole('button', { name: 'Saved places', exact: true }).click();
    const edit = page.getByRole('button', { name: 'Edit place Home', exact: true });
    await expect(edit).toBeVisible();
    const before = await edit.locator('xpath=ancestor::li').boundingBox();
    const openerBox = await edit.boundingBox();
    await edit.click();
    const label = page.getByRole('textbox', { name: 'Place name', exact: true }), address = page.getByRole('textbox', { name: 'Address', exact: true });
    const row = label.locator('xpath=ancestor::li');
    const during = await row.boundingBox();
    expect(during.width).toBeCloseTo(before.width, 1);
    expect(during.height).toBeCloseTo(width < 900 ? 144 : 92, 1);
    await expect(row).toHaveCSS('border-radius', '24px');
    const nameField = label.locator('xpath=..'), addressField = address.locator('xpath=..');
    const nameBox = await nameField.boundingBox(), addressBox = await addressField.boundingBox();
    expect(nameBox.height).toBe(48); expect(addressBox.height).toBe(48);
    if (width < 900) { expect(addressBox.y - nameBox.y).toBe(56); expect(addressBox.width).toBe(nameBox.width); }
    else { expect(addressBox.y).toBe(nameBox.y); expect(addressBox.x).toBeGreaterThan(nameBox.x + nameBox.width); }
    await nameField.getByText('Place name', { exact: true }).click();
    await expect(label).toBeFocused();
    await expect(nameField).toHaveCSS('box-shadow', /2px/);
    await label.press('Tab'); await expect(address).toBeFocused();
    await address.press('Tab'); await expect(page.getByRole('button', { name: 'Save place', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    const cancel = page.getByRole('button', { name: 'Cancel editing', exact: true });
    await expect(cancel).toBeFocused();
    await expect(cancel).toHaveCSS('background-color', 'rgb(255, 255, 255)'); await expect(cancel).toHaveCSS('color', 'rgb(0, 0, 0)');
    const cancelBox = await cancel.boundingBox();
    expect(cancelBox.x).toBeCloseTo(openerBox.x, 1); expect(Math.abs(cancelBox.y - openerBox.y)).toBeLessThanOrEqual(2);
    const accessibility = await new AxeBuilder({ page }).include('li[aria-busy]').analyze();
    expect(accessibility.violations).toEqual([]);
    await screenshot(page, current + '-editor');
    await label.fill(''); await page.getByRole('button', { name: 'Save place', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a place name');
    await expect(label).toHaveAttribute('aria-invalid', 'true');
    await expect(label).toHaveAttribute('aria-describedby', 'saved-place-error');
    await label.fill('Parents'); await address.fill(''); await page.getByRole('button', { name: 'Save place', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await address.fill('Aster Avenue');
    await ctx.route('**/api/users/me/saved-places', r => r.request().method() === 'PUT' ? r.fulfill({ status: 503, json: { error: 'Synthetic save failed' } }) : r.fallback());
    await page.getByRole('button', { name: 'Save place', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Synthetic save failed');
    await expect(label).toHaveValue('Parents'); await expect(address).toHaveValue('Aster Avenue');
    expect(await cancel.boundingBox()).toEqual(cancelBox);
    await ctx.unroute('**/api/users/me/saved-places');
    let submitted, release, calls = 0;
    const pending = new Promise(resolve => { release = resolve; });
    await ctx.route('**/api/users/me/saved-places', async r => { if (r.request().method() !== 'PUT') return r.fulfill({ json: { places } }); calls++; submitted = r.request().postDataJSON(); await pending; await r.fulfill({ json: { place: { ...submitted, id: submitted.id || 'synthetic-new' } } }); });
    await page.getByRole('button', { name: 'Save place', exact: true }).click();
    await expect(cancel).toBeDisabled(); await expect(label).toBeDisabled();
    release();
    await expect(page.getByRole('button', { name: 'Edit place Parents', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Edit place / })).toHaveCount(3);
    expect(submitted).toMatchObject({ id: 'synthetic-home', label: 'Parents', address: 'Aster Avenue' }); expect(calls).toBe(1);
    for (const name of ['Work', 'Gym']) {
      await page.getByRole('button', { name: 'Edit place ' + name, exact: true }).click();
      await expect(label).toHaveValue(name); await label.fill('A'.repeat(40)); await address.fill('A'.repeat(200));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await address.press('Escape');
      await expect(page.getByRole('button', { name: 'Edit place ' + name, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Add a place', exact: true }).click();
    await label.fill('Library'); await address.fill('Synthetic Long Address, Fixture City');
    if ([390, 1440].includes(width)) await screenshot(page, current + '-custom');
    await address.press('Enter'); await expect(page.getByRole('button', { name: 'Edit place Library', exact: true })).toBeVisible();
    expect(submitted).toMatchObject({ label: 'Library', address: 'Synthetic Long Address, Fixture City' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    checks.push({ case: current, status: 'PASS', states: ['Home rename', 'responsive labelled fields', 'stable trailing actions', 'keyboard order and focus', 'validation', 'failed save retains draft', 'pending', 'same ID', 'Work cancel', 'custom cancel', 'custom save', 'Enter', 'Escape'], fieldHeight: 48, editorHeight: during.height, axeViolations: accessibility.violations.length });
    console.log('PASS ' + current);
    await ctx.close();
  }
  atomicJson(path.join(output, 'functional.json'), { status: 'PASS', at: new Date().toISOString(), checks, scope: 'All writes fulfilled inside isolated browser contexts. No real OTP, booking, customer or provider operation.' });
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await screenshot(currentPage, 'functional-failure-' + (attempts.length + 1));
  attempts.push({ case: current, error: error.message, at: new Date().toISOString(), passed: checks.length });
  atomicJson(path.join(output, 'functional-attempts.json'), attempts);
  throw error;
} finally { await browser.close(); }
