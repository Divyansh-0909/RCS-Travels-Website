import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { caseIds } from './cases.mjs';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/P07-2026-10-29';
fs.mkdirSync(out + '/matrix', { recursive: true });
const browser = await chromium.launch({ headless: true }), observations = [], failures = [], network = [];
const selected = ['assigned', 'en_route', 'reached', 'started', 'searching', 'confirmed', 'advance', 'payment-missing', 'completed', 'completed-scheduled', 'cash-paid', 'upi-paid', 'cash-only', 'cancel-no-advance', 'refund-pending', 'partial-refund-pending', 'refunded', 'partial-refunded', 'retained', 'no-driver', 'failure', 'denied'];
const configs = process.env.P07_CONFIGS ? JSON.parse(process.env.P07_CONFIGS) : [320, 360, 390, 768, 1280, 1440].map(width => ({ width, height: width < 640 ? 844 : 1000, language: 'en', textSize: 16 }));
if (!process.env.P07_CONFIGS) configs.push({ width: 390, height: 844, language: 'en', textSize: 32 }, { width: 1440, height: 1000, language: 'en', textSize: 32 }, { width: 320, height: 844, language: 'hi', textSize: 16 }, { width: 390, height: 844, language: 'hi-Latn', textSize: 16 });
let active, current;
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Long searching progress is product state, not an entrance animation.
    await Promise.allSettled(document.getAnimations().filter(a => { const t = a.effect?.getComputedTiming().endTime; return Number.isFinite(t) && t <= 2000; }).map(a => a.finished));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function sample(page, key, config) {
  await settle(page);
  const data = await page.evaluate(() => {
    const rect = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, font: s.fontSize, lineHeight: s.lineHeight, radius: s.borderRadius, padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], color: s.color, fill: s.backgroundColor, text: e.innerText?.trim().slice(0, 120) }; };
    const visible = e => e.offsetHeight && e.offsetWidth && getComputedStyle(e).visibility !== 'hidden';
    return { theme: document.documentElement.dataset.theme, appearance: document.documentElement.dataset.appearance, language: document.documentElement.lang, documentWidth: document.documentElement.scrollWidth, body: document.body.innerText, headings: [...document.querySelectorAll('#root h1,#root h2,#root h3')].filter(visible).map(rect), controls: [...document.querySelectorAll('#root button,#root a')].filter(visible).map(e => ({ ...rect(e), disabled: e.disabled, tag: e.tagName, ariaLabel: e.getAttribute('aria-label') })), statuses: [...document.querySelectorAll('#root [role=status],#root [role=alert]')].filter(visible).map(e => ({ role: e.getAttribute('role'), text: e.innerText.trim().slice(0, 300) })) };
  });
  const reachability = [];
  for (const button of await page.locator('#root button').all()) {
    if (!await button.isVisible()) continue;
    await button.scrollIntoViewIfNeeded().catch(() => {});
    reachability.push(await button.evaluate(e => {
      const r = e.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { text: e.innerText || e.getAttribute('aria-label'), disabled: e.disabled, reachable: target === e || e.contains(target), x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }));
  }
  const useAxe = config.textSize === 16 && config.language === 'en' && [390, 1440].includes(config.width) && ['assigned', 'advance', 'completed', 'refunded', 'partial-refund-pending', 'failure'].includes(key);
  const axe = useAxe ? await new AxeBuilder({ page }).include('#root').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze() : null;
  const file = `matrix/${config.width}-${config.language}-${config.textSize}-${key}.png`;
  await page.screenshot({ path: path.join(out, file), animations: 'disabled' });
  observations.push({ case: key, ...config, ...data, reachability, axe: axe ? { violations: axe.violations, incomplete: axe.incomplete, passes: axe.passes.length } : null, screenshot: file, url: page.url(), status: 'OBSERVED' });
  console.log('OBSERVED ' + current);
}
try {
  for (const config of configs) {
    const ctx = await browser.newContext({ viewport: config, reducedMotion: 'reduce', colorScheme: 'dark', hasTouch: config.width < 640 });
    await ctx.route('**/*', r => { const u = new URL(r.request().url()), local = ['127.0.0.1', 'localhost'].includes(u.hostname); network.push({ method: r.request().method(), host: u.hostname, path: u.pathname, blocked: !local }); return local ? r.continue() : r.abort(); });
    const page = await ctx.newPage(), errors = []; active = page; page.on('pageerror', e => errors.push(e.message));
    const cases = process.env.P07_CASES ? process.env.P07_CASES.split(',') : [390, 1440].includes(config.width) && config.textSize === 16 && config.language === 'en' ? selected : ['assigned', 'advance', 'completed', 'partial-refund-pending', 'failure'];
    for (const key of cases) {
      current = config.width + '-' + config.language + '-' + config.textSize + '-' + key;
      const response = page.waitForResponse(r => /\/api\/bookings\/[^/]+\/status$/.test(new URL(r.url()).pathname));
      await page.goto('http://127.0.0.1:1577/__review/p07?case=' + key); await response;
      await expect(page.locator('[aria-label="Loading ride"]')).toHaveCount(0, { timeout: 15000 });
      await page.evaluate(async c => { const { useData } = await import('/src/hooks/useData.js'); useData.getState().setLanguage(c.language); await (await import('/src/i18n.js')).default.changeLanguage(c.language); document.documentElement.style.fontSize = c.textSize + 'px'; }, config);
      await expect(page.locator('html')).toHaveAttribute('lang', config.language);
      await sample(page, key, config);
    }
    // Both saved preferences use the actual fixed legacy booking composition.
    if ([390, 1440].includes(config.width) && config.textSize === 16 && config.language === 'en') {
      await page.evaluate(() => { localStorage.setItem('rcs.website.theme', 'light'); });
      await page.reload(); await expect(page.locator('[aria-label="Loading ride"]')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'legacy');
    }
    expect(errors).toEqual([]); await ctx.close();
  }
} catch (e) { failures.push({ current, error: e.message }); if (active && !active.isClosed()) await active.screenshot({ path: out + '/matrix-failure.png', animations: 'disabled' }); throw e; }
finally { fs.writeFileSync(out + '/' + (process.env.P07_MATRIX_RESULT || 'matrix.json'), JSON.stringify({ observations, failures, network, supportedCases: caseIds, scope: 'Actual route and components; legacy theme, synthetic data and denied writes. OBSERVED is not a functional/a11y PASS.' }, null, 2)); await browser.close(); }
