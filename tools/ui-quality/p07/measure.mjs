import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/P07-2026-10-29';
const matrix = JSON.parse(fs.readFileSync(out + '/matrix.json'));
const localized = JSON.parse(fs.readFileSync(out + '/matrix-localized.json'));
const replacements = new Map(localized.observations.map(o => [o.screenshot, o]));
matrix.observations = matrix.observations.map(o => replacements.get(o.screenshot) || o);
matrix.localizationRecheck = { replaced: replacements.size, prior: 'matrix-before-language-recheck.json', reason: 'Apply both language store and i18n change, matching LanguageSelector; wait for html lang.' };
fs.writeFileSync(out + '/matrix.json', JSON.stringify(matrix, null, 2));
const browser = await chromium.launch({ headless: true }), measurements = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await page.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    for (const key of ['assigned', 'advance', 'completed', 'cash-paid', 'partial-refund-pending']) {
      await page.goto('http://127.0.0.1:1578/__review/p07?case=' + key);
      await expect(page.getByRole('button', { name: 'Back', exact: true }).first()).toBeVisible();
      await page.locator('html').evaluate(async () => { await document.fonts.ready; });
      const sample = await page.evaluate(() => {
        const rgba = s => { const n = s.match(/[\d.]+/g)?.map(Number); return n?.length >= 3 ? [...n.slice(0, 3), n.length > 3 ? n[3] : 1] : [0, 0, 0, 0]; };
        const over = (a, b) => { const alpha = a[3] + b[3] * (1 - a[3]); return [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / (alpha || 1)).concat(alpha); };
        const background = e => { const chain = []; for (let p = e; p; p = p.parentElement) chain.unshift(p); return chain.reduce((color, p) => over(rgba(getComputedStyle(p).backgroundColor), color), [255,255,255,1]); };
        const lum = rgb => rgb.slice(0,3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [.2126,.7152,.0722][i], 0);
        const visible = e => e.offsetWidth && e.offsetHeight && getComputedStyle(e).visibility !== 'hidden';
        const inspect = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(), bg = background(e), fg = rgba(s.color), l = [lum(fg), lum(bg)].sort((a,b) => a-b); return { text: (e.innerText || e.getAttribute('aria-label'))?.trim().slice(0,100), tag:e.tagName, width:r.width,height:r.height, font:s.fontSize,lineHeight:s.lineHeight,weight:s.fontWeight,radius:s.borderRadius,gap:s.gap,padding:s.padding,foreground:fg.slice(0,3),background:bg.slice(0,3).map(Math.round),contrast:+((l[1]+.05)/(l[0]+.05)).toFixed(2),disabled:!!e.disabled,role:e.getAttribute('role') }; };
        return { theme:document.documentElement.dataset.theme, controls:[...document.querySelectorAll('#root button')].filter(visible).map(inspect), headings:[...document.querySelectorAll('#root h1,#root h2,#root h3')].filter(visible).map(inspect),status:[...document.querySelectorAll('#root [role=status],#root [role=alert]')].filter(visible).map(inspect), cards:[...document.querySelectorAll('#root .rounded-2xl')].filter(visible).slice(0,8).map(inspect) };
      });
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return { name:e.getAttribute('aria-label') || e.innerText?.slice(0,50), outline:s.outline, outlineOffset:s.outlineOffset }; });
      measurements.push({ width,case:key,...sample,focus });
    }
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(out + '/measured-families.json', JSON.stringify({ measurements, method:'Computed text color / composited solid ancestor backgrounds; initial enabled state, no hover; backgrounds without images in selected controls. Disabled opacity is excluded from contrast acceptance. Not a global contrast certification.' }, null, 2));
console.log(JSON.stringify({ samples:measurements.length, localizationReplaced:replacements.size, actions:measurements.filter(m=>m.width===390).map(m=>({case:m.case,controls:m.controls.filter(c=>c.height>=48).map(c=>({text:c.text,h:c.height,contrast:c.contrast}))})) }));
