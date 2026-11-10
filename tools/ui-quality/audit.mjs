import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const directory = path.join(root, 'output/handoff/ui/audit'); fs.mkdirSync(directory, { recursive: true });
const scenarios = [
  ['/', 'Home-Landing', 'legacy'], ['/outstation', 'Outstation', 'legacy'],
  ['/dev/home', 'Booking-form-fixture', 'both'], ['/dev/vehicle', 'Vehicle-select-fixture', 'both'], ['/dev/tracking', 'Tracking-fixture', 'both'],
  ['/dev/settings', 'Settings', 'both'], ['/dev/safety', 'Safety', 'both'], ['/dev/help', 'Help', 'both'],
  ['/dev/account', 'Account', 'both'], ['/dev/admin', 'Admin', 'both'], ['/dev/states', 'Feedback-states', 'both'],
  ['/terms', 'Terms', 'both'], ['/privacy', 'Privacy', 'both'], ['/refunds', 'Refunds', 'both'], ['/grievance', 'Grievance', 'both'],
];
const browser = await chromium.launch();
const only = process.argv[2];
const result = only ? JSON.parse(fs.readFileSync(path.join(directory, 'audit.json'), 'utf8')) : { author: 'CODEX', phase: 'P01', at: new Date().toISOString(), fixtureBoundary: 'Actual frontend; synthetic Clerk/API; third-party network blocked; no production requests', captures: [] };
try {
  for (const [route, screen, policy] of scenarios) for (const width of [390, 1440]) for (const theme of policy === 'legacy' ? ['dark'] : ['light', 'dark']) {
    if (only && screen !== only) continue;
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await context.addInitScript(theme => localStorage.setItem('rcs.website.theme', theme), theme);
    await context.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const entry = { route, screen, width, preference: theme, policy, errors, status: 'NOT_RUN' };
    try {
      await page.goto('http://127.0.0.1:1575' + route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(900);
      entry.renderedText = (await page.locator('body').innerText()).slice(0, 450);
      entry.actualTheme = await page.locator('html').getAttribute('data-theme');
      entry.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      entry.screenshot = `${screen}-${theme}-${width}.png`;
      await page.screenshot({ path: path.join(directory, entry.screenshot), fullPage: true, timeout: 20_000 });
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      entry.violations = axe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
      entry.status = errors.length ? 'RENDERED_WITH_ERRORS' : 'CAPTURED_NOT_APPROVED';
    } catch (error) { entry.status = 'BLOCKED'; entry.error = error.message.slice(0, 300); }
    result.captures = result.captures.filter(c => !(c.screen === screen && c.width === width && c.preference === theme)); result.captures.push(entry);
    fs.writeFileSync(path.join(directory, 'audit.json'), JSON.stringify(result, null, 2));
    console.log(`${screen} ${width} ${theme}: ${entry.status}, overflow=${entry.overflow}, axe=${entry.violations?.length ?? 'not-run'}`);
    await context.close();
  }
} finally { await browser.close(); }
