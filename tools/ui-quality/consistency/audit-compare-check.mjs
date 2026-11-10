import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { atomicJson, readJson, hash } from '../../handoff/core.mjs';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const out = 'output/handoff/compare-audit-2026-10-26';
const checks = [], attempts = readJson(path.join(out, 'attempts.json'), []);
const browser = await chromium.launch({ headless: true });
let current = '', active;
async function choose(page, id, value) {
  const trigger = page.locator('#' + id + '-trigger'); await trigger.scrollIntoViewIfNeeded(); await trigger.click();
  const label = await page.locator('#' + id).evaluate((select, value) => [...select.options].find(option => option.value === value)?.textContent, value);
  await page.locator('#' + id + '-trigger-listbox').getByRole('option', { name: label, exact: true }).click();
  await expect(page.locator('#' + id)).toHaveValue(value);
}
async function images(page) {
  for (const image of await page.locator('.audit-image').all()) { await image.scrollIntoViewIfNeeded(); await expect.poll(() => image.evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true); }
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
}
try {
  for (const [width, theme] of [[320, 'light'], [390, 'dark'], [768, 'light'], [1440, 'light'], [1440, 'dark']]) {
    current = width + '-' + theme;
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
    await ctx.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await ctx.newPage(), errors = []; active = page; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4317/?view=consistency&family=VC-B02-04&width=390&theme=' + theme);
    await expect(page.locator('#consistency-family option')).toHaveCount(17);
    await expect(page.locator('.audit-pane')).toHaveCount(2);
    await images(page); await shot(page, 'inputs-' + current);
    for (let index = 1; index <= 14; index++) {
      const id = 'VC-B02-' + String(index).padStart(2, '0');
      await choose(page, 'consistency-family', id); await expect(page.locator('.audit-pane')).toHaveCount(2); await images(page);
      expect(await page.locator('#consistency-options input').count()).toBeGreaterThanOrEqual(3);
      expect(await page.locator('#consistency-screens input:checked').count()).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await page.locator('.consistency-readout').allTextContents()).not.toContain('LIVE');
      if ([2, 9, 12].includes(index)) await expect(page.locator('.consistency-readout').last()).toContainText('SOURCE ONLY');
      if (index === 6) {
        await expect(page.locator('#consistency-facts')).toContainText('60px'); await expect(page.locator('#consistency-facts')).toContainText('40px');
        await choose(page, 'consistency-occurrence-1', 'proposal:40'); await expect(page.locator('#consistency-facts')).toContainText('44px');
        const group = page.getByRole('group', { name: '40px sample trip type' }); await group.getByRole('button', { name: 'Round trip', exact: true }).click(); await expect(group.getByRole('button', { name: 'Round trip', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await choose(page, 'consistency-occurrence-1', 'proposal:36');
        await shot(page, 'pills-' + current);
      }
      if (width === 1440 && theme === 'dark' && [1, 2, 3, 9, 12, 14].includes(index)) await shot(page, id + '-dark');
    }
    await choose(page, 'consistency-family', 'VC-B02-04');
    await choose(page, 'consistency-occurrence-0', 'signup-phone'); await choose(page, 'consistency-occurrence-1', 'booking-pickup');
    await choose(page, 'consistency-state', 'focus');
    await expect(page.locator('#consistency-occurrence-0')).toHaveValue('signup-phone'); await expect(page.locator('#consistency-occurrence-1')).toHaveValue('booking-pickup');
    const phoneLayout = await page.locator('.consistency-pair').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length); expect(phoneLayout).toBe(2);
    await choose(page, 'consistency-width', '1440'); await expect(page.locator('.consistency-readout').first()).toContainText('1440px');
    expect(await page.locator('.consistency-pair').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(1);
    await images(page); await shot(page, 'desktop-evidence-' + current);
    if (width === 1440) {
      let submitted, fail = true;
      await ctx.route('http://127.0.0.1:4319/api/consistency/audit-decision', async route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4317', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
        submitted = route.request().postDataJSON();
        await route.fulfill({ status: fail ? 503 : 200, headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4317' }, json: fail ? { error: 'Synthetic save failure' } : { revision: submitted.revision + 1, saved: { ...submitted, ownerDecision: 'OWNER_SELECTED', implementationStatus: 'NOT_CHANGED', aestheticAcceptance: 'NOT_RECORDED' } } });
      });
      await page.locator('[name=pattern][value=CUSTOM]').check();
      await page.locator('#consistency-note').fill('Synthetic UI-only comparison instruction');
      for (const checkbox of await page.locator('[name=screen]').all()) if (await checkbox.inputValue() !== 'W.LOGIN') await checkbox.uncheck();
      await page.locator('#consistency-save').click(); await expect(page.locator('#consistency-save-status')).toContainText('Could not save'); await expect(page.locator('#consistency-note')).toHaveValue('Synthetic UI-only comparison instruction');
      fail = false; await page.locator('#consistency-save').click(); await expect(page.locator('#consistency-save-status')).toContainText('Choice saved');
      expect(submitted).toMatchObject({ familyId: 'VC-B02-04', choice: 'CUSTOM', screenIds: ['W.LOGIN'] });
      await choose(page, 'consistency-family', 'VC-B02-06'); await choose(page, 'consistency-family', 'VC-B02-04');
      await expect(page.locator('#consistency-note')).toHaveValue('Synthetic UI-only comparison instruction'); await expect(page.locator('[name=screen]:checked')).toHaveCount(1);
    }
    await choose(page, 'consistency-family', 'VC-B02-09');
    const sourceAxe = await new AxeBuilder({ page }).analyze(); atomicJson(path.join(out, 'axe-source-' + current + '.json'), { violations: sourceAxe.violations }); expect(sourceAxe.violations).toEqual([]);
    await choose(page, 'consistency-family', 'VC-B02-06');
    const pillAxe = await new AxeBuilder({ page }).analyze(); atomicJson(path.join(out, 'axe-pills-' + current + '.json'), { violations: pillAxe.violations }); expect(pillAxe.violations).toEqual([]);
    await choose(page, 'consistency-family', 'VC-B01-ADDRESS'); await expect(page.locator('#consistency-save-status')).toContainText('Implemented');
    await expect(page.locator('#consistency-audit-state')).toBeHidden();
    expect(errors).toEqual([]);
    checks.push({ width, theme, status: 'PASS', findings: 14, legacyChoices: 'PRESERVED', evidenceLabels: 'PASS', choiceForm: 'PASS', keyboardAndPrototype: 'PASS', axeViolations: 0, errors });
    console.log('PASS Compare audit ' + current); atomicJson(path.join(out, 'browser-progress.json'), { checks }); await ctx.close();
  }
  const baseline = readJson(path.join(out, 'baseline.json'));
  expect(hash(fs.readFileSync('output/handoff/consistency-decisions.json'))).toBe(baseline.files.find(item => item.file.endsWith('consistency-decisions.json')).sha256);
  const changes = baseline.productFiles.filter(item => hash(fs.readFileSync(item.file)) !== item.sha256).map(item => item.file); expect(changes).toEqual([]);
  const registry = await (await fetch('http://127.0.0.1:4319/api/consistency/audit')).json(); expect(registry.registry.decisions.some(item => item.note.includes('Synthetic UI-only'))).toBe(false);
  atomicJson(path.join(out, 'browser-validation.json'), { status: 'PASS', at: new Date().toISOString(), checks, productFilesUnchanged: baseline.productFiles.length, existingChoicesUnchanged: true, syntheticUiSavesPersisted: false });
} catch (error) {
  if (active && !active.isClosed()) await active.screenshot({ path: path.join(out, 'failure-' + current + '-' + (attempts.length + 1) + '.png'), animations: 'disabled' });
  attempts.push({ current, at: new Date().toISOString(), error: error.message, passed: checks.length }); atomicJson(path.join(out, 'attempts.json'), attempts); throw error;
} finally { await browser.close(); }
