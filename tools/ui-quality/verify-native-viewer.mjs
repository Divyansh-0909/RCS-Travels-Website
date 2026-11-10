import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from '../handoff/config.mjs';
import { atomicJson } from '../handoff/core.mjs';
const require = createRequire(path.join(config.root, 'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const proof = { author: 'CODEX', phase: 'P02', at: new Date().toISOString(), viewports: [] };
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4317/', { waitUntil: 'domcontentloaded' });
    const preview = page.locator('#site');
    await expect(preview).toHaveAttribute('src', 'http://127.0.0.1:4317/native');
    const frame = page.frameLocator('#site');
    await expect(frame.getByText('Connected Android · synthetic test package only')).toBeVisible();
    await expect.poll(() => frame.locator('#screen').evaluate(node => node.naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);
    await expect(frame.locator('#stamp')).toContainText('Frame received:');
    await expect(page.locator('#heartbeat')).toContainText('live');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const filename = `P02-native-viewer-${viewport.width}.png`;
    await page.screenshot({ path: path.join(config.runtime, filename), fullPage: true });
    await page.selectOption('#page', '/');
    await expect(preview).toHaveAttribute('src', config.previewUrl + '/');
    await page.selectOption('#page', '/outstation');
    await expect(preview).toHaveAttribute('src', config.previewUrl + '/outstation');
    proof.viewports.push({ viewport, filename, actualNativeFrame: true, liveStatus: true, homeAndOutstationSeparate: true, overflow: false });
  }
} finally { await browser.close(); }
atomicJson(path.join(config.runtime, 'P02-viewer-verification.json'), proof);
console.log(JSON.stringify(proof));
