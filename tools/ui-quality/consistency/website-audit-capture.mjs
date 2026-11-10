import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { atomicJson, readJson } from '../../handoff/core.mjs';

const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/website-consistency-2026-10-26';
fs.mkdirSync(path.join(out, 'images'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const previous = readJson(path.join(out, 'browser-observations.json'), { observations: [], runs: [], blockedWrites: [] });
const observations = previous.observations, runs = previous.runs.filter(run => run.status === 'OBSERVED'), writes = previous.blockedWrites;
const configurations = [[390, 'light'], [390, 'dark'], [768, 'light'], [1440, 'light'], [1440, 'dark']];

async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); });
}
async function measure(locator) {
  return locator.evaluate(element => {
    const control = element.tagName === 'INPUT' ? element.closest('label') || element : element;
    const rect = element.getBoundingClientRect(), shell = control.getBoundingClientRect(), s = getComputedStyle(element), c = getComputedStyle(control);
    const ancestors = [];
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    for (let e = element, i = 0; e && i < 5; e = e.parentElement, i++) {
      const a = getComputedStyle(e);
      ancestors.push({ tag: e.tagName, background: a.backgroundColor, transform: a.transform, scale: a.scale, border: a.border, shadow: a.boxShadow });
    }
    return {
      tag: element.tagName, text: element.getAttribute('aria-label') || element.placeholder || element.textContent.trim().slice(0, 70),
      rect: { width: rect.width, height: rect.height }, field: { width: shell.width, height: shell.height },
      font: s.fontSize, renderedFontEstimate: parseFloat(s.fontSize) * (element.offsetHeight ? rect.height / element.offsetHeight : 1),
      padding: s.padding, radius: c.borderRadius, background: c.backgroundColor, color: s.color, placeholder: getComputedStyle(element, '::placeholder').color,
      border: c.border, outline: c.outline, shadow: c.boxShadow, disabled: element.disabled || false, readOnly: element.readOnly || false,
      focused: document.activeElement === element, focusVisible: element.matches(':focus-visible'), pressed: element.getAttribute('aria-pressed'), checked: element.getAttribute('aria-checked'),
      accessibleName: element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || '', ancestors,
      pointerBlocked: Boolean(hit && !element.contains(hit) && !control.contains(hit)), hitTarget: hit ? { tag: hit.tagName, classes: typeof hit.className === 'string' ? hit.className : '', label: hit.getAttribute('aria-label') } : null,
    };
  });
}
async function section(page, name) {
  const choice = page.getByRole('button', { name, exact: true });
  const toggle = page.getByRole('button', { name: 'Show sections', exact: true });
  await expect(choice.or(toggle).first()).toBeVisible();
  if (!await choice.isVisible()) await toggle.click();
  await choice.click(); await settled(page);
}
async function collect(page, key, locator, config, { states = true, image = true } = {}) {
  await expect(locator).toBeVisible({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(e => e.blur()); await page.mouse.move(0, 0); await settled(page);
  const values = { default: await measure(locator) };
  if (states && await locator.isEnabled()) {
    if (!values.default.pointerBlocked) { await locator.hover(); await settled(page); values.hover = await measure(locator); }
    await page.keyboard.press('Tab'); await locator.focus(); await settled(page); values.focus = await measure(locator);
    if (!values.default.pointerBlocked) {
      const b = await locator.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      values.active = await measure(locator);
      await page.mouse.move(0, 0); await page.mouse.up();
    }
  }
  let screenshot = null;
  if (image && (config.width === 390 || config.theme === 'light')) {
    screenshot = `images/${key}-${config.width}-${config.theme}.png`;
    const shell = await locator.evaluate(e => Boolean(e.tagName === 'INPUT' && e.closest('label')));
    await (shell ? locator.locator('xpath=ancestor::label[1]') : locator).screenshot({ path: path.join(out, screenshot), animations: 'disabled' });
  }
  observations.push({ key, ...config, states: values, screenshot, url: page.url(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
}
const targets = {
  async auth(page, ctx, config, route) {
    let sendError = false;
    await ctx.route('**/api/auth/check-name', r => r.fulfill({ json: { available: true } }));
    await ctx.route('**/api/auth/send-otp', r => r.fulfill(sendError ? { status: 400, json: { error: 'Number should be exactly 10 digits' } } : { json: { success: true } }));
    await ctx.route('**/api/auth/verify-otp', r => r.fulfill({ status: 400, json: { error: 'Wrong OTP' } }));
    await page.goto('http://127.0.0.1:1575/' + route);
    if (route === 'signup') {
      await collect(page, 'signup-name', page.locator('#username'), config);
      await page.locator('#username').fill('Synthetic Reviewer');
      await page.locator('button[type=submit]').click();
    }
    await collect(page, route + '-phone', page.locator('#phone-number'), config);
    await page.locator('#phone-number').fill('9990000101'); sendError = true;
    await page.locator('button[type=submit]').click();
    await expect(page.getByText('Number should be exactly 10 digits', { exact: true })).toBeVisible();
    await collect(page, route + '-phone-error', page.locator('#phone-number'), config);
    await page.locator('#phone-number').fill('9990000102'); sendError = false;
    await page.locator('button[type=submit]').click();
    const digits = page.locator('input[inputmode=numeric]');
    await expect(digits).toHaveCount(6);
    await collect(page, route + '-otp', digits.first(), config);
    for (let i = 0; i < 6; i++) await digits.nth(i).fill(String(i));
    await page.locator('button[type=submit]').click();
    await expect(page.getByText('Wrong OTP', { exact: true }).first()).toBeVisible();
    await collect(page, route + '-otp-error', digits.first(), config, { states: false });
  },
  async booking(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=' + config.theme);
    await page.waitForFunction(() => window.__RCS_CONSISTENCY_MEASUREMENT__, null, { timeout: 65000 });
    await page.locator('#pickup-location').press('Escape');
    await collect(page, 'booking-pickup', page.locator('#pickup-location'), config);
    await collect(page, 'booking-drop', page.locator('#drop-location'), config);
    await page.locator('#drop-location').press('Escape');
    const one = page.getByRole('button', { name: 'One way', exact: true }), round = page.getByRole('button', { name: 'Round trip', exact: true });
    await collect(page, 'trip-selected', one, config);
    await collect(page, 'trip-unselected', round, config);
    await collect(page, 'trip-group', one.locator('..'), config, { states: false });
    await round.click(); await collect(page, 'trip-round-selected', round, config); await one.click();
    const later = page.getByRole('button', { name: 'Later', exact: true });
    await collect(page, 'timing-pill', later, config); await later.click();
    const dialog = page.getByRole('dialog', { name: 'Choose timing', exact: true });
    await expect(dialog).toBeVisible(); await settled(page);
    await collect(page, 'timing-choice', dialog.locator('button[aria-pressed]').first(), config);
    await collect(page, 'timing-close', page.locator('[data-timing-dialog-control][aria-label]').filter({ visible: true }).first(), config);
  },
  async saved(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_SAVED_ADDRESS&theme=' + config.theme);
    await collect(page, 'saved-name', page.getByRole('textbox', { name: 'Place name', exact: true }), config);
    await collect(page, 'saved-address', page.getByRole('textbox', { name: 'Address', exact: true }), config);
    await collect(page, 'saved-cancel', page.getByRole('button', { name: 'Cancel editing', exact: true }), config);
    await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
    await section(page, 'Notifications');
    await collect(page, 'settings-switch', page.getByRole('switch').first(), config);
    await section(page, 'Language'); await collect(page, 'language-radio', page.getByRole('radio').first(), config);
    await section(page, 'Theme'); await collect(page, 'theme-radio', page.getByRole('radio').first(), config);
  },
  async safety(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/safety');
    await section(page, 'Emergency contact');
    await page.getByRole('button', { name: 'Action', exact: true }).click();
    const field = page.getByPlaceholder('XXXXX XXXXX', { exact: true });
    await collect(page, 'safety-contact', field, config);
    await field.fill('123'); await page.getByRole('button', { name: 'Action', exact: true }).click();
    await collect(page, 'safety-contact-error', field, config);
    await collect(page, 'safety-cancel', field.locator('..').locator('div[role], div.cursor-pointer').last(), config, { states: false });
  },
  async profile(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/manage-account');
    await section(page, 'Account info');
    const row = page.locator('li').filter({ has: page.getByText('Emergency Contact', { exact: true }) });
    await row.getByRole('button').click();
    const field = page.getByPlaceholder('XXXXX XXXXX', { exact: true });
    await field.waitFor({ timeout: 2500 });
    await collect(page, 'profile-contact', field, config);
    await field.fill('123'); await collect(page, 'profile-contact-error', field, config);
    await page.screenshot({ path: path.join(out, `images/profile-panel-${config.width}-${config.theme}.png`), animations: 'disabled' });
    await page.reload(); await section(page, 'Account info'); await page.locator('li').filter({ has: page.getByText('DOB', { exact: true }) }).getByRole('button').click();
    await collect(page, 'profile-dob', page.getByPlaceholder('DD/MM/YYYY', { exact: true }), config);
    await page.reload(); await section(page, 'Ride History');
    const search = page.locator('input').first(); if (await search.isVisible()) await collect(page, 'history-search', search, config);
  },
  async admin(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/dashboard');
    await section(page, 'Bookings');
    await collect(page, 'admin-search', page.getByPlaceholder('Name, phone, location, ID', { exact: true }), config);
    await collect(page, 'admin-sort-pill', page.getByRole('button', { name: 'Sort newest first', exact: true }).or(page.getByRole('button', { name: 'Sort oldest first', exact: true })), config);
    const filter = page.getByRole('button', { name: 'Filter', exact: true });
    await collect(page, 'admin-filter-pill', filter, config); await filter.click(); await settled(page);
    await collect(page, 'filter-chip', page.getByRole('button', { name: 'pending', exact: true }), config);
    await page.getByRole('button', { name: 'Dates', exact: true }).press('Enter');
    await collect(page, 'filter-date', page.getByPlaceholder('YYYY-MM-DD', { exact: true }).first(), config);
  },
  async responsibility(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/dashboard/responsibility');
    await collect(page, 'responsibility-case', page.locator('input').first(), config);
  },
  async vehicle(page, ctx, config) {
    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_VEHICLE_ACTION&theme=' + config.theme);
    await page.waitForFunction(() => window.__RCS_CONSISTENCY_MEASUREMENT__, null, { timeout: 65000 });
    const trigger = page.getByRole('button', { name: /Ride options/ });
    await collect(page, 'ride-options-trigger', trigger, config); await trigger.click();
    await expect(page.getByRole('heading', { name: 'Ride options', exact: true })).toBeVisible();
    await collect(page, 'ride-option-switch', page.getByRole('switch').first(), config);
    await collect(page, 'ride-options-close', page.getByRole('button', { name: 'Close ride options', exact: true }), config);
  },
};
try {
  for (const [width, theme] of configurations) for (const task of ['login', 'signup', 'booking', 'saved', 'safety', 'profile', 'admin', 'responsibility', 'vehicle']) {
    if (runs.some(run => run.task === task && run.width === width && run.theme === theme && run.status === 'OBSERVED')) continue;
    const config = { width, theme }, admin = ['admin', 'responsibility'].includes(task), guest = ['login', 'signup'].includes(task);
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 }, colorScheme: theme, reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.route('**/api/**', r => {
      if (r.request().method() === 'POST' && new URL(r.request().url()).pathname === '/api/fare/estimate') return r.fallback();
      if (!['GET', 'HEAD'].includes(r.request().method())) { writes.push({ task, ...config, method: r.request().method(), url: new URL(r.request().url()).pathname }); return r.fulfill({ status: 409, json: { error: 'Audit is read only' } }); }
      return r.fallback();
    });
    await ctx.addCookies([{ name: 'fixture_actor', value: guest ? 'guest' : admin ? 'admin' : 'customer', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    if (admin) await ctx.route('**/api/users/me', r => r.fulfill({ json: { id: 'p01_synthetic_admin', clerkId: 'user_p01_admin', name: 'Synthetic Admin', role: 'admin', notifications: {} } }));
    const page = await ctx.newPage(), errors = [], begin = observations.length;
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    try {
      if (guest) await targets.auth(page, ctx, config, task); else await targets[task](page, ctx, config);
      runs.push({ task, ...config, status: 'OBSERVED', observations: observations.length - begin, pageErrors: errors });
      console.log('OBSERVED ' + task + ' ' + width + ' ' + theme);
    } catch (error) {
      const screenshot = `images/blocked-${task}-${width}-${theme}.png`;
      await page.screenshot({ path: path.join(out, screenshot), animations: 'disabled' }).catch(() => {});
      runs.push({ task, ...config, status: 'PARTIAL', observations: observations.length - begin, reason: error.message.slice(0, 450), pageErrors: errors, screenshot });
      console.log('PARTIAL ' + task + ' ' + width + ' ' + theme + ': ' + error.message.slice(0, 140));
    } finally {
      const unique = [...new Map(observations.map(item => [[item.key, item.width, item.theme].join(':'), item])).values()];
      atomicJson(path.join(out, 'browser-observations.json'), { at: new Date().toISOString(), runs, observations: unique, blockedWrites: writes, scope: 'Actual application with synthetic local actors. External requests blocked; auth calls mocked, POST fare estimates use the existing read-only synthetic fixture; all other writes refused. Observations are an audit, not approval or whole-site certification.' });
      await ctx.close();
    }
  }
} finally { await browser.close(); }
