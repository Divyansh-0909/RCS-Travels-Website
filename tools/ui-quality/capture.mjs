import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const stage = process.argv[2] || 'before';
const dir = path.join(root, 'output/handoff/ui', stage); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const result = { stage, at: new Date().toISOString(), screens: [], errors: [] };
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await context.addInitScript(theme => { localStorage.setItem('rcs.website.theme', theme); localStorage.setItem('rcs.website.language', 'en'); }, theme);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push({ width, theme, error: error.message }));
    await page.goto('http://127.0.0.1:1575/dev/settings');
    await page.getByText('Notifications', { exact: true }).first().click();
    await page.getByRole('switch').first().waitFor();
    await page.waitForTimeout(500);
    const screenshot = `settings-notifications-${theme}-${width}.png`;
    await page.screenshot({ path: path.join(dir, screenshot), fullPage: true });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    result.screens.push({ route: '/dev/settings', tab: 'Notifications', theme, width, resolvedTheme: await page.locator('html').getAttribute('data-theme'), screenshot, text: (await page.locator('body').innerText()).slice(0, 1200), switches: await page.getByRole('switch').count(), violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })) });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
