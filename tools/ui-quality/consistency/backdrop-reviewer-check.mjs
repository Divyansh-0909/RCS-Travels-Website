// Read-only review renderer: no handoff engine, polling worker or dispatch starts.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { viewerHandler } from '../../handoff/viewer-server.mjs';
import { auditHandler } from './audit-server.mjs';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-backdrop-fix-2026-10-29';
const config = { root: process.cwd(), runtime: path.resolve('output/handoff'), port: 4317, previewUrl: 'http://127.0.0.1:1575' };
const engine = { state: { state: 'REVIEW_ONLY', action: 'Inspecting the backdrop fix', connections: {}, run: null } };
const app = viewerHandler(config, engine);
const viewer = http.createServer((req, res) => {
  if (req.method !== 'GET') return res.writeHead(405).end();
  app(req, res);
});
const sidecar = http.createServer((req, res) => {
  if (req.method !== 'GET') return res.writeHead(405).end();
  if (!auditHandler({ ...config, port: 4319 }, req, res)) res.writeHead(404).end();
});
async function listen(server, port) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
}
const checks = [], browser = await chromium.launch({ headless: true });
try {
  await listen(viewer, 4317); await listen(sidecar, 4319);
  for (const [hostWidth, screenWidth] of [[390, 390], [1920, 390], [1920, 1440]]) {
    const ctx = await browser.newContext({ viewport: { width: hostWidth, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:4317/?mode=website&review=VCB02&finding=03&width=${screenWidth}&theme=dark`);
    const panel = page.locator('#current-website-review');
    await expect(panel).toBeVisible(); await expect(panel).toHaveAttribute('open', '');
    await expect(panel).toContainText('Fixed 29 October');
    for (const img of await panel.locator('img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true);
    }
    expect(await panel.locator('img').count()).toBe(2);
    expect(await panel.locator('.current-review-images').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(screenWidth === 390 ? 2 : 1);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `reviewer-${hostWidth}-${screenWidth}.png`), animations: 'disabled' });
    await page.goto('http://127.0.0.1:4317/?view=consistency&family=VC-B02-03&width=390&theme=light');
    await expect(page.getByText(/Implemented 29 October: filters and account editors/)).toBeVisible();
    expect(errors).toEqual([]); checks.push({ hostWidth, screenWidth, status: 'PASS' });
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'reviewer-results.json'), JSON.stringify({ status: 'PASS', checks, runtime: 'Temporary GET-only reviewer renderer; watcher/dispatch never started; servers closed afterwards.' }, null, 2));
} finally {
  await browser.close();
  await Promise.all([viewer, sidecar].map(s => new Promise(resolve => s.close(resolve))));
}
