import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-spacing-implementation-2026-10-28/responsive';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [], failures = [];
let current, active;
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished));
  });
}
async function prepare(page, config) {
  await page.evaluate(async ({ language, textSize }) => {
    const { useData } = await import('/src/hooks/useData.js');
    useData.getState().setLanguage(language);
    document.documentElement.style.fontSize = textSize + 'px';
  }, config);
  await settle(page);
}
async function reachable(locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await expect.poll(() => locator.evaluate(e => {
    const r = e.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return e === target || e.contains(target);
  })).toBe(true);
}
async function capture(page, key, config, controls = []) {
  for (const control of controls) await expect(control).toBeVisible();
  await settle(page);
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    language: document.documentElement.lang,
    textSize: getComputedStyle(document.documentElement).fontSize,
  }));
  expect(geometry.documentWidth, key + ' horizontal overflow').toBeLessThanOrEqual(config.width + 1);
  const bounds = [];
  for (const control of controls) {
    await reachable(control);
    const r = await control.boundingBox();
    expect(r.x).toBeGreaterThanOrEqual(-.2);
    expect(r.x + r.width).toBeLessThanOrEqual(config.width + .2);
    bounds.push(r);
  }
  if (key === 'login') {
    const overlaps = await page.evaluate(() => {
      const back = document.querySelector('button[data-size=icon]')?.getBoundingClientRect();
      const brand = document.querySelector('.rcs-wordmark');
      const range = document.createRange(); range.selectNodeContents(brand);
      return [...range.getClientRects()].some(r => r.width && r.left < back.right && r.right > back.left && r.top < back.bottom && r.bottom > back.top);
    });
    expect(overlaps, 'auth brand must clear the back target').toBe(false);
  }
  await page.screenshot({ path: path.join(out, current + '-' + key + '.png'), animations: 'disabled' });
  observations.push({ key, ...config, geometry, bounds, status: 'PASS' });
  console.log('PASS ' + current + ' ' + key);
}
const configs = [
  { width: 320, height: 640, language: 'en', textSize: 16 },
  { width: 390, height: 844, language: 'en', textSize: 32 },
  { width: 1440, height: 900, language: 'en', textSize: 32 },
  { width: 320, height: 640, language: 'hi', textSize: 16 },
  { width: 390, height: 844, language: 'hi-Latn', textSize: 16 },
  { width: 768, height: 1024, language: 'hi', textSize: 16 },
];
try {
  for (const config of configs) {
    current = config.width + '-' + config.language + '-' + config.textSize;
    const ctx = await browser.newContext({ viewport: config, colorScheme: 'dark', reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'guest', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(() => localStorage.setItem('rcs.website.theme', 'dark'));
    await ctx.route('**/api/auth/check-name', r => r.fulfill({ json: { available: true } }));
    await ctx.route('**/api/auth/send-otp', r => r.fulfill({ json: { success: true } }));
    const page = await ctx.newPage(), errors = []; active = page;
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:1575/login'); await prepare(page, config);
    const phone = page.locator('#phone-number'), submit = page.locator('button[type=submit]');
    await capture(page, 'login', config, [phone, submit]);
    await phone.fill('9990000101'); await submit.click();
    const digits = page.locator('input[inputmode=numeric]');
    await expect(digits).toHaveCount(6); await settle(page);
    for (const digit of await digits.all()) await reachable(digit);
    await digits.first().fill('1'); await expect(digits.nth(1)).toBeFocused();
    await digits.nth(1).press('ArrowRight'); await expect(digits.nth(2)).toBeFocused();
    await expect(digits.nth(2)).toHaveCSS('outline-style', 'none');
    await capture(page, 'login-otp', config, [digits.last(), submit]);

    await page.goto('http://127.0.0.1:1575/signup'); await prepare(page, config);
    const name = page.locator('#username');
    await capture(page, 'signup-name', config, [name, submit]);
    await name.fill('Synthetic Reviewer With A Long Name'); await submit.click();
    await expect(phone).toBeVisible(); await settle(page);
    await capture(page, 'signup-phone', config, [phone, submit]);

    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=dark'); await prepare(page, config);
    const pickup = page.locator('#pickup-location'), drop = page.locator('#drop-location');
    await expect(pickup).toBeVisible(); await settle(page);
    await capture(page, 'route', config, [pickup, drop, page.locator('button[form=route-details-form]')]);
    await page.evaluate(() => document.activeElement?.blur());
    const later = page.locator('#route-details-form button[aria-haspopup=dialog]');
    await later.click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await capture(page, 'timing-dropdown', config, [dialog.locator('button').last()]);
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    await pickup.fill('Synthetic long pickup address, ' + 'District avenue building landmark '.repeat(5));
    await page.evaluate(() => document.activeElement?.blur());
    await drop.fill('Synthetic long drop address, ' + 'Station interchange road landmark '.repeat(5));
    await page.evaluate(() => document.activeElement?.blur());
    await capture(page, 'long-addresses', config, [pickup, drop]);

    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_TIMING_ACTION&theme=dark'); await prepare(page, config);
    const wheel = page.getByRole('listbox').first();
    await expect(wheel).toBeVisible(); await wheel.focus();
    const before = await wheel.getAttribute('aria-activedescendant');
    await wheel.press('ArrowDown');
    await expect(wheel).not.toHaveAttribute('aria-activedescendant', before);
    await capture(page, 'timing', config, [wheel, page.locator('button[data-size=action]').last()]);

    await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_VEHICLE_ACTION&theme=dark'); await prepare(page, config);
    await capture(page, 'vehicles', config, [page.locator('button[form=vehicle-book-form]')]);
    expect(errors).toEqual([]);
    await ctx.close();
  }
} catch (e) {
  failures.push({ current, error: e.message });
  if (active && !active.isClosed()) await active.screenshot({ path: path.join(out, 'failure.png'), animations: 'disabled' });
  throw e;
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ status: failures.length ? 'PARTIAL' : 'PASS', observations, failures, scope: 'Actual local pages with synthetic API responses. 200% root text size is a browser stress check, not physical keyboard/native-device evidence.' }, null, 2));
  await browser.close();
}
