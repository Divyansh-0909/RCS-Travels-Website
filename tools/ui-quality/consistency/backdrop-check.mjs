import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const phase = process.env.BACKDROP_PHASE || 'after';
const motion = process.env.BACKDROP_MOTION || 'reduce';
const touch = process.env.BACKDROP_TOUCH === '1';
const out = 'output/handoff/VC-B02-backdrop-fix-2026-10-29/' + phase;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [], failures = [], unexpectedWrites = [];
let current, active;
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished));
  });
}
async function section(page, name) {
  const choice = page.getByRole('button', { name, exact: true });
  const menu = page.getByRole('button', { name: 'Show sections', exact: true });
  await expect(choice.or(menu).first()).toBeVisible();
  if (!await choice.isVisible()) await menu.click();
  await choice.click();
}
async function hit(control) {
  await expect(control).toBeVisible();
  return control.evaluate(e => {
    const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const target = document.elementFromPoint(x, y), ancestors = [];
    for (let p = e; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.transform !== 'none' || s.zIndex !== 'auto' || s.isolation === 'isolate' || s.willChange !== 'auto' || s.animationName !== 'none') ancestors.push({ tag: p.tagName, class: String(p.className), transform: s.transform, zIndex: s.zIndex, isolation: s.isolation, willChange: s.willChange, animation: s.animationName });
    }
    return { x, y, blocked: target !== e && !e.contains(target), target: target?.outerHTML.slice(0, 250), ancestors };
  });
}
async function checkHit(page, key, control) {
  await settle(page);
  const observation = await hit(control);
  expect(observation.blocked, current + ' ' + key).toBe(phase === 'before');
  await page.screenshot({ path: path.join(out, current + '-' + key + '.png'), animations: 'disabled' });
  checks.push({ case: current, key, ...observation, status: phase === 'before' ? 'REPRODUCED' : 'PASS' });
  return observation;
}
async function closed(page, dialog) {
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('body > div.fixed.inset-0.z-150')).toHaveCount(0);
}
async function click(control) { return touch ? control.tap() : control.click(); }
async function filters(page, key) {
  const trigger = page.getByRole('button', { name: 'Filter', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
  const pending = dialog.getByRole('button', { name: 'pending', exact: true });
  const observation = await checkHit(page, key, pending);
  await pending.press('Space'); await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await pending.press('Space'); await expect(pending).toHaveAttribute('aria-pressed', 'false');
  if (phase === 'before') {
    await page.mouse.click(observation.x, observation.y);
    expect(await pending.getAttribute('aria-pressed')).toBe('false');
    await closed(page, dialog);
    return;
  }
  await click(pending); await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: path.join(out, current + '-' + key + '-selected.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Dates', exact: true }).click();
  const date = dialog.getByPlaceholder('YYYY-MM-DD').first();
  expect((await hit(date)).blocked).toBe(false);
  await date.click(); await expect(date).toBeFocused(); await date.fill('2026-10-29');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await closed(page, dialog);
  await trigger.click();
  await dialog.getByRole('button', { name: 'Status', exact: true }).click();
  await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  await closed(page, dialog);
  await trigger.click(); await expect(pending).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape'); await closed(page, dialog);
  if (page.viewportSize().width >= 640) {
    await trigger.click(); await expect(dialog).toBeVisible(); await settle(page);
    await page.mouse.click(8, 8); await closed(page, dialog);
  }
  // Reopening proves a leaving backdrop cannot become a persistent dead layer.
  await trigger.click(); await expect(pending).toBeVisible();
  await pending.click(); await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await closed(page, dialog);
}
async function editor(page, label, placeholder) {
  await page.locator('li').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button').click();
  const dialog = page.getByRole('dialog'), input = dialog.getByPlaceholder(placeholder, { exact: true });
  const observation = await checkHit(page, label.replaceAll(' ', '-'), input);
  if (phase === 'before') {
    await input.focus(); await expect(input).toBeFocused();
    await page.mouse.click(observation.x, observation.y);
    await closed(page, dialog); return;
  }
  await input.click(); await expect(input).toBeFocused();
  await input.fill(label === 'DOB' ? '01/01/1995' : '9990000109');
  await expect(input).toHaveValue(label === 'DOB' ? '01/01/1995' : '9990000109');
  await page.screenshot({ path: path.join(out, current + '-' + label.replaceAll(' ', '-') + '-edited.png'), animations: 'disabled' });
  await input.press('Tab'); expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await closed(page, dialog);
  await page.locator('li').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button').click();
  await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await closed(page, dialog);
  await page.locator('li').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button').click();
  await expect(dialog).toBeVisible(); await settle(page); await page.mouse.click(4, 4); await closed(page, dialog);
}
try {
  const widths = (process.env.BACKDROP_WIDTHS || '320,390,768,1440').split(',').map(Number);
  const configs = phase === 'before' ? [[390, 'light'], [1440, 'light']] : widths.flatMap(w => ['light', 'dark'].map(t => [w, t]));
  for (const [width, theme] of configs) {
    current = width + '-' + theme;
    const ctx = await browser.newContext({ viewport: { width, height: width < 640 ? 844 : 1000 }, colorScheme: theme, reducedMotion: motion, hasTouch: touch });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.route('**/api/**', r => {
      if (r.request().method() === 'GET') return r.continue();
      unexpectedWrites.push({ case: current, method: r.request().method(), path: new URL(r.request().url()).pathname });
      return r.fulfill({ status: 409, json: { error: 'Documented local test: writes disabled' } });
    });
    await ctx.addCookies([{ name: 'fixture_actor', value: 'admin', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    let actor = 'admin';
    await ctx.route('**/api/users/me', r => r.fulfill({ json: { id: 'synthetic-' + actor, role: actor, name: 'Synthetic Reviewer', notifications: {} } }));
    const page = await ctx.newPage(), errors = []; active = page;
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:1575/dashboard'); await section(page, 'Bookings');
    await filters(page, 'admin-filters');
    if (phase !== 'before' && ((width === 1440 && theme === 'light') || (width === 390 && theme === 'dark'))) {
      for (const [tab, category, choice] of [['Drivers', 'Verification', 'Pending'], ['Users', 'Gender', 'Female']]) {
        await section(page, tab); await page.getByRole('button', { name: 'Filter', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
        await dialog.getByRole('button', { name: category, exact: true }).click();
        const option = dialog.getByRole('button', { name: choice, exact: true });
        expect((await hit(option)).blocked).toBe(false);
        await click(option); await expect(option).toHaveAttribute('aria-pressed', 'true');
        await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await closed(page, dialog);
      }
    }
    actor = 'customer'; await ctx.addCookies([{ name: 'fixture_actor', value: actor, url: 'http://127.0.0.1:1575' }]);
    await page.goto('http://127.0.0.1:1575/manage-account'); await section(page, 'Ride History');
    await filters(page, 'ride-filters');
    await section(page, 'Account info');
    await editor(page, 'Emergency Contact', 'XXXXX XXXXX');
    if (phase !== 'before') {
      await editor(page, 'DOB', 'DD/MM/YYYY');
      await page.locator('li').filter({ has: page.getByText('Gender', { exact: true }) }).getByRole('button').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Not Selected', { exact: true }).click();
      await dialog.getByText('Female', { exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Female', exact: true })).toBeVisible();
      await settle(page);
      expect((await hit(dialog.getByRole('button', { name: 'Update', exact: true }))).blocked).toBe(false);
      await dialog.getByRole('button', { name: 'Update', exact: true }).click({ trial: true });
      await page.keyboard.press('Escape'); await closed(page, dialog);
    }
    expect(errors).toEqual([]); await ctx.close(); console.log('PASS ' + current + ' ' + phase);
  }
  expect(unexpectedWrites).toEqual([]);
} catch (e) {
  failures.push({ current, error: e.message });
  if (active && !active.isClosed()) await active.screenshot({ path: path.join(out, 'failure.png'), animations: 'disabled' });
  throw e;
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ status: failures.length ? 'PARTIAL' : phase === 'before' ? 'REPRODUCED' : 'PASS', phase, motion, touch, checks, failures, unexpectedWrites, scope: 'Actual local React app with synthetic actors; external hosts and product writes blocked. No production/native acceptance.' }, null, 2));
  await browser.close();
}
