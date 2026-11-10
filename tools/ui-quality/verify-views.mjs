import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const directory = path.join(root, 'output/handoff/ui/viewer'); fs.mkdirSync(directory, { recursive: true });
const proof = { author: 'CODEX', phase: 'P01', at: new Date().toISOString(), viewer: [], storybook: [] };
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  const page = await context.newPage();
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4317/', { waitUntil: 'domcontentloaded' });
    await page.selectOption('#page', '/dev/settings');
    const frame = page.frameLocator('#site');
    await frame.getByText('Notifications', { exact: true }).first().click();
    await expect(frame.getByRole('switch', { name: 'Ride updates', exact: true })).toBeVisible();
    await expect(frame.getByRole('switch', { name: 'Ride updates', exact: true })).toBeEnabled();
    await page.waitForTimeout(900);
    await expect(page.locator('#fixed')).toContainText('FIXED — VERIFIED');
    await expect(page.locator('#heartbeat')).toContainText('live');
    const screenshot = `P01-live-viewer-${viewport.width}.png`;
    await page.screenshot({ path: path.join(directory, screenshot), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    proof.viewer.push({ viewport, screenshot, actualAppInteractive: true, statusAndHeartbeat: true, overflow });
  }
  for (const [story, theme] of [['switches', 'light'], ['switches-dark', 'dark']]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=rcs-existing-controls--${story}&viewMode=story`, { waitUntil: 'domcontentloaded' });
    const control = page.getByRole('switch', { name: 'Ride updates' });
    await expect(control).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('switch', { name: 'Unavailable setting' })).toBeDisabled();
    await control.focus(); await page.keyboard.press('Space'); await expect(control).toHaveAttribute('aria-checked', 'false');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations).toEqual([]);
    const screenshot = `P01-storybook-switches-${theme}.png`;
    await page.screenshot({ path: path.join(directory, screenshot), fullPage: true });
    proof.storybook.push({ story, theme, screenshot, keyboardInteraction: true, violations: [] });
  }
  await context.close();
} finally { await browser.close(); }
fs.writeFileSync(path.join(directory, 'views-verification.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
