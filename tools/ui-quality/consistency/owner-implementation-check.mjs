import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { atomicJson, hash } from '../../handoff/core.mjs';

const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const output = 'output/handoff/consistency-implementation-2026-10-26';
const baseline = process.argv.includes('--baseline');
const phase = baseline ? 'before' : 'after';
fs.mkdirSync(path.join(output, phase), { recursive: true });
const files = ['frontend/src/components/ui/Button.jsx', 'frontend/src/pages/SettingsPage.jsx', 'frontend/src/pages/OnBoarding.jsx', 'frontend/src/pages/VehicleSelect.jsx', 'frontend/src/pages/LoginPage.jsx', 'frontend/src/pages/SignUpPage.jsx', 'frontend/src/components/ui/DateTimeSelector.jsx', 'frontend/src/components/ui/Input.jsx', 'output/handoff/consistency-decisions.json'];
if (baseline) {
  for (const file of files) fs.copyFileSync(file, path.join(output, 'before', path.basename(file)));
  atomicJson(path.join(output, 'source-before.json'), files.map(file => ({ file, sha256: hash(fs.readFileSync(file)) })));
}
const cases = [
  ['route', 'VCB01_ROUTE_ACTION'], ['timing', 'VCB01_TIMING_ACTION'],
  ['vehicle', 'VCB01_VEHICLE_ACTION'], ['saved', 'VCB01_SAVED_ADDRESS'], ['login', null],
];
const browser = await chromium.launch({ headless: true });
const samples = [], attempts = [];
try {
  for (const width of [390, 1440]) for (const [name, occurrence] of cases) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce', colorScheme: 'dark', timezoneId: 'Asia/Kolkata' });
    const errors = [];
    await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await context.addCookies([{ name: 'fixture_actor', value: name === 'login' ? 'guest' : 'customer', url: 'http://127.0.0.1:1575' }]);
    await context.addInitScript(() => localStorage.setItem('rcs.website.theme', 'dark'));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(occurrence ? 'http://127.0.0.1:1575/__review/consistency?occurrence=' + occurrence + '&theme=dark' : 'http://127.0.0.1:1575/login', { waitUntil: 'domcontentloaded' });
      if (occurrence) await page.waitForFunction(id => window.__RCS_CONSISTENCY_MEASUREMENT__?.id === id, occurrence, { timeout: 65000 });
      else await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible({ timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      const measurement = occurrence ? await page.evaluate(() => window.__RCS_CONSISTENCY_MEASUREMENT__) : await page.getByRole('button', { name: 'Continue', exact: true }).evaluate(element => { const r = element.getBoundingClientRect(), s = getComputedStyle(element); return { rect: { width: r.width, height: r.height }, font: { size: s.fontSize }, padding: s.padding }; });
      const screenshot = name + '-' + width + '-dark.png';
      await page.screenshot({ path: path.join(output, phase, screenshot), fullPage: true });
      expect(errors).toEqual([]);
      samples.push({ name, width, measurement, screenshot, errors });
      console.log('PASS ' + phase + ' ' + name + ' ' + width);
    } catch (error) {
      attempts.push({ name, width, error: error.message, errors });
      await page.screenshot({ path: path.join(output, phase, 'failure-' + name + '-' + width + '.png'), fullPage: true });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  atomicJson(path.join(output, phase + '.json'), { at: new Date().toISOString(), samples, attempts, scope: 'Actual website, synthetic actors and prices. No production operation.' });
  await browser.close();
}
