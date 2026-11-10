import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/VC-B02-implementation-2026-10-26';
const publicImages = 'output/handoff/website-consistency-2026-10-26/images';
const browser = await chromium.launch({ headless: true });
const checks = [], images = [], hits = [], financeColors = [], accessibility = [];
const luminance = color => { const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722; };
let active, current;
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); }); }
async function shot(page, key, width, theme, caption, locator = page) {
  await settle(page); const name = `current-${key}-${width}-${theme}.png`;
  await locator.screenshot({ path: path.join(out, name), animations: 'disabled' });
  fs.copyFileSync(path.join(out, name), path.join(publicImages, name));
  images.push({ key, width, theme, file: name, caption });
}
async function section(page, name) {
  const choice = page.getByRole('button', { name, exact: true }), menu = page.getByRole('button', { name: 'Show sections', exact: true });
  await expect(choice.or(menu).first()).toBeVisible(); if (!await choice.isVisible()) await menu.click(); await choice.click();
}
async function action(button) {
  await expect(button).toHaveAttribute('data-size', 'action');
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(48);
  await expect(button).toHaveCSS('font-size', '16px');
}
try {
  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']]) {
    current = `${width}-${theme}`;
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'admin', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    await ctx.route('**/api/users/me', r => r.fulfill({ json: { id: 'synthetic-admin', role: 'admin', name: 'Synthetic Admin', notifications: {} } }));
    const page = await ctx.newPage(), errors = []; active = page; page.on('pageerror', e => { errors.push(e.message); console.log(e.stack); });
    await page.goto('http://127.0.0.1:1575/dashboard'); await section(page, 'Bookings');
    await page.getByRole('button', { name: 'Filter', exact: true }).click(); await settle(page);
    const pending = page.getByRole('button', { name: 'pending', exact: true }); await expect(pending).toBeVisible();
    const hit = await pending.evaluate(e => { const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, target = document.elementFromPoint(x, y); return { x, y, blocked: target !== e && !e.contains(target), interceptingElement: target?.outerHTML.slice(0, 350) }; });
    const before = await pending.getAttribute('aria-pressed'); await page.mouse.click(hit.x, hit.y); const after = await pending.getAttribute('aria-pressed');
    expect(hit.blocked).toBe(true); expect(after).toBe(before);
    hits.push({ width, theme, ...hit, before, afterPointer: after });
    await shot(page, 'filter-click', width, theme, '03 · Clicking Pending hits the backdrop. The chip stays unselected.');
    await pending.press('Space'); await expect(pending).toHaveAttribute('aria-pressed', 'true');
    await shot(page, 'filter-keyboard', width, theme, '03 · Keyboard Space selects Pending. This confirms the click-layer problem.');

    await ctx.route('**/api/admin/responsibility/cases/synthetic-review', r => r.fulfill({ json: { case: { id: 'synthetic-review', state: 'NEEDS_ADMIN_REVIEW', evidenceVersion: 1, evidenceHash: 'synthetic-evidence' }, history: [] } }));
    await page.goto('http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review');
    const decision = page.getByRole('combobox', { name: 'Human decision', exact: true }); await expect(decision).toBeVisible();
    await decision.selectOption('UPHOLD'); await page.getByRole('combobox', { name: 'Final classification', exact: true }).selectOption('DRIVER_CAUSED');
    await page.getByRole('combobox', { name: 'Consequence level', exact: true }).selectOption('LEVEL_1');
    const reason = page.getByRole('textbox', { name: 'Review reason', exact: true }); await reason.fill('Synthetic review for visual inspection only.');
    const form = page.locator('section[aria-labelledby="human-review-heading"]'); await form.scrollIntoViewIfNeeded(); await reason.focus();
    for (const select of await form.getByRole('combobox').all()) { expect((await select.boundingBox()).height).toBe(48); await expect(select).toHaveCSS('font-size', '16px'); }
    await expect(reason).toHaveCSS('font-size', '16px'); await expect(reason).toHaveCSS('outline-style', 'solid');
    await action(page.getByRole('button', { name: 'Save human review', exact: true }));
    const axe = await new AxeBuilder({ page }).include('section[aria-labelledby="human-review-heading"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    accessibility.push({ width, theme, violations: axe.violations }); expect(axe.violations).toEqual([]);
    await shot(page, 'review-fields', width, theme, '12 / 13 · Shared selects and textarea; 48px review action. No decision submitted.', form);

    const driver = { id: 'synthetic-driver', name: 'Synthetic Captain', phone: '9990000101', vehicleClass: 'hatchback', vehicleNumber: 'SYNTHETIC', verificationStatus: 'pending', group: 'partner', isOnline: false, createdAt: '2026-10-26T00:00:00Z', walletBalance: 0 };
    await ctx.route('**/api/admin/driver?*', r => r.fulfill({ json: { drivers: [driver], total: 1 } }));
    await ctx.route('**/api/admin/drivers/synthetic-driver/documents', r => r.fulfill({ json: { driver, vehicles: [], documents: [], missing: [], conduct: { cancellationCount30Days: 0, benefitRestrictedUntil: null, complaints: [] } } }));
    await ctx.route('**/api/admin/drivers/synthetic-driver/finance', r => r.fulfill({ json: { balances: { available: 500, held: 0, total: 500 }, cacheBalance: 500, openHolds: [], payoutAccount: { upiId: 'synthetic@invalid', verified: false } } }));
    await ctx.route('**/api/admin/finance/reconciliation', r => r.fulfill({ json: { drivers: [{ id: driver.id, inSync: false, drift: 10 }] } }));
    await ctx.route('**/api/admin/finance/payout-batches', r => r.fulfill({ json: { batches: [] } }));
    await page.goto('http://127.0.0.1:1575/dashboard'); await section(page, 'Drivers');
    await page.getByRole('button', { name: /Synthetic Captain/ }).click();
    const amount = page.getByPlaceholder('Amount, e.g. -150 or 250', { exact: true }); await expect(amount).toBeVisible(); await settle(page);
    const finance = amount.locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
    await amount.scrollIntoViewIfNeeded(); await amount.focus();
    expect((await amount.boundingBox()).height).toBe(48); await expect(amount).toHaveCSS('font-size', '16px');
    const post = page.getByRole('button', { name: 'Post adjustment', exact: true }); await action(post);
    const colors = await post.evaluate(e => ({ text: getComputedStyle(e).color, fill: getComputedStyle(e).backgroundColor })); expect(colors.text).not.toBe(colors.fill);
    const light = luminance(colors.text), dark = luminance(colors.fill), contrast = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05); expect(contrast).toBeGreaterThanOrEqual(4.5); financeColors.push({ width, theme, ...colors, contrast });
    await shot(page, 'finance-fields', width, theme, '09 / 12 / 13 · Adaptive finance buttons and shared decimal fields. No financial action executed.');

    await ctx.route('**/api/admin/zones', r => r.fulfill({ json: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Synthetic Zone', fares: { hatchback: 500 }, toll: 50, notes: 'Synthetic area notes' }, geometry: { type: 'Polygon', coordinates: [[[77.20,28.60],[77.24,28.60],[77.24,28.64],[77.20,28.64],[77.20,28.60]]] } }] } }));
    await page.goto('http://127.0.0.1:1575/dashboard'); await section(page, 'Edit Fares');
    await page.getByRole('button', { name: /Synthetic Zone/ }).click({ timeout: 15000 });
    const toll = page.locator('#f-toll'); await expect(toll).toBeVisible(); await settle(page);
    await toll.scrollIntoViewIfNeeded(); await toll.focus(); await expect(toll).toHaveAttribute('type', 'number'); expect((await toll.boundingBox()).height).toBe(48); await expect(toll).toHaveCSS('font-size', '16px');
    await shot(page, 'fare-fields', width, theme, '12 · Actual fare editor: shared native number and textarea styling. Map tiles blocked; no fare saved.');

    await page.goto('http://127.0.0.1:1575/settings');
    for (const [name, role] of [['Theme', 'radio'], ['Language', 'radio']]) {
      await section(page, name); const control = page.getByRole(role).first(); await control.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      await expect(control).toHaveCSS('outline-style', 'solid');
      const color = await control.evaluate(e => { const s = getComputedStyle(e), probe = document.createElement('i'); probe.style.color = s.getPropertyValue('--primary'); e.append(probe); const expected = getComputedStyle(probe).color; probe.remove(); return { actual: s.outlineColor, expected }; }); expect(color.actual).toBe(color.expected);
      await shot(page, 'focus-' + name.toLowerCase(), width, theme, '01 · Keyboard focus uses the existing primary colour.');
    }
    expect(errors).toEqual([]); checks.push({ width, theme, status: 'PASS', scope: ['actual backdrop hit testing', 'shared select/textarea/decimal fields', 'adaptive finance', '48px actions', 'primary focus'] });
    console.log('PASS current review ' + current); await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'current-review.json'), JSON.stringify({ status: 'PASS', checks, images, hits, financeColors, accessibility, aestheticAcceptance: 'AWAITING_OWNER_REVIEW', originalAuditImages: 'Preserved; current-* images are additive.' }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'current-review-attempt-' + Date.now() + '.json'), JSON.stringify({ current, error: error.message, checks, images, hits }, null, 2));
  if (active && !active.isClosed()) await active.screenshot({ path: path.join(out, 'current-review-failure-' + Date.now() + '.png'), animations: 'disabled' }); throw error;
} finally { await browser.close(); }
