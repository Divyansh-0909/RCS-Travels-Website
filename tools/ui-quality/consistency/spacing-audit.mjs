// Read-only layout observation. No application source or review choices change.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const out = 'output/handoff/VC-B02-spacing-audit-2026-10-27';
const browser = await chromium.launch({ headless: true }), observations = [], failures = [];
let current, active;
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)); }); }
async function rect(locator) { await expect(locator).toBeVisible(); return locator.evaluate(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right, marginTop: s.marginTop, marginBottom: s.marginBottom, parentGap: getComputedStyle(e.parentElement).gap, text: (e.textContent || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 100) }; }); }
const gap = (a, b) => Math.round((b.y - a.bottom) * 10) / 10;
async function save(page, key, width, pairs, extra = {}) {
  await settle(page); const elements = {};
  for (const [name, locator] of Object.entries(pairs)) elements[name] = await rect(locator);
  const gaps = {};
  for (const [a, b] of extra.relationships || []) gaps[a + ' → ' + b] = gap(elements[a], elements[b]);
  const file = key + '-' + width + '.png'; await page.screenshot({ path: path.join(out, file), animations: 'disabled' });
  observations.push({ key, width, elements, gaps, screenshot: file, context: extra.context || 'Inline content', url: page.url() });
  console.log('OBSERVED ' + key + ' ' + width);
}
async function auth(page, key, width, input) {
  await settle(page);
  await page.waitForFunction(() => { const form = document.querySelector('form'), action = form?.querySelector('button[type=submit]'); if (!action) return false; const bottom = action.getBoundingClientRect().bottom; return [...form.querySelectorAll('p')].some(e => e.offsetHeight && e.getBoundingClientRect().top >= bottom); });
  const title = page.locator('form h2'), description = title.locator('xpath=following-sibling::p[1]'), action = page.locator('button[type=submit]');
  const fields = { title, description, field: input, action };
  let helper;
  const actionBox = await action.boundingBox();
  for (const p of await page.locator('form p').all()) { if (!await p.isVisible()) continue; const r = await p.boundingBox(); if(r.y >= actionBox.y + actionBox.height && (!helper || r.y < (await helper.boundingBox()).y)) helper = p; }
  const relationships = [['title','description'], ['description','field'], ['field','action']];
  if (helper) { fields.helper = helper; relationships.push(['action','helper']); }
  const expiry = page.locator('form p').filter({ hasText: /OTP expires in/ });
  if (await expiry.isVisible()) { fields.expiry = expiry; relationships.push(['field','expiry'], ['expiry','action']); }
  if (await page.getByRole('alert').count()) { fields.error = page.getByRole('alert').first(); relationships.push(['field','error'], ['error','action']); }
  await save(page, key, width, fields, { relationships });
}
try {
  for (const width of [390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: 'light', reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });
    await ctx.route('**/*', r => ['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await ctx.addCookies([{ name: 'fixture_actor', value: 'guest', url: 'http://127.0.0.1:1575' }]);
    await ctx.addInitScript(() => localStorage.setItem('rcs.website.theme','light'));
    let error = false;
    await ctx.route('**/api/auth/check-name', r => r.fulfill({ json: { available: true } }));
    await ctx.route('**/api/auth/send-otp', r => r.fulfill(error ? { status: 400, json: { error: 'Number should be exactly 10 digits' } } : { json: { success: true } }));
    const page = await ctx.newPage(), errors = []; active = page; page.on('pageerror', e => errors.push(e.message));
    current = 'login-' + width; await page.goto('http://127.0.0.1:1575/login'); await auth(page, 'login', width, page.locator('#phone-number'));
    error = true; await page.locator('#phone-number').fill('9990000101'); await page.locator('button[type=submit]').click(); await expect(page.getByRole('alert').first()).toBeVisible();
    await auth(page, 'login-error', width, page.locator('#phone-number'));
    error = false; await page.locator('#phone-number').fill('9990000102'); await page.locator('button[type=submit]').click(); await expect(page.locator('input[inputmode=numeric]')).toHaveCount(6);
    await auth(page, 'login-otp', width, page.locator('input[inputmode=numeric]').first());
    current = 'signup-' + width; await page.goto('http://127.0.0.1:1575/signup'); await auth(page, 'signup-name', width, page.locator('#username'));
    await page.locator('#username').fill('Synthetic Reviewer'); await page.locator('button[type=submit]').click(); await auth(page, 'signup-phone', width, page.locator('#phone-number'));
    await page.locator('#phone-number').fill('9990000103'); await page.locator('button[type=submit]').click(); await expect(page.locator('input[inputmode=numeric]')).toHaveCount(6);
    await auth(page, 'signup-otp', width, page.locator('input[inputmode=numeric]').first());
    for (const [key, url] of [['route', '/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=light'], ['home-booking','/dev/home?rcsConsistency=VCB01_ROUTE_ACTION&preference=light']]) {
      current = key + '-' + width; await page.goto('http://127.0.0.1:1575' + url);
      await expect(page.locator('#pickup-location')).toBeVisible(); await settle(page); await page.evaluate(() => document.activeElement?.blur());
      const action = page.getByRole('button', { name: 'Set date & time', exact: true });
      const pillHit = page.getByRole('button',{name:'One way',exact:true});
      const fields = { title: page.getByRole('heading', { name:'Find a ride',exact:true }), pill: pillHit.locator('[data-pill-face]'), pillHit, pickup:page.locator('#pickup-location'), drop:page.locator('#drop-location'), action };
      const caption = page.getByText('* 99% guaranteed cab allocation',{exact:true}); if(await caption.isVisible()) fields.caption = caption;
      await save(page,key,width,fields,{ relationships:[['title','pill'],['pill','pickup'],['pickup','drop'],['drop','action'],...(fields.caption?[['caption','action']]:[])],context:key==='route'&&width<640?'Bottom action bar is pinned; drop-to-action includes flexible page space.':'Inline action; caption is a separate relationship.' });
    }
    current = 'timing-' + width; await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_TIMING_ACTION&theme=light');
    await expect(page.getByRole('listbox').first()).toBeVisible();
    await save(page,'timing',width,{title:page.getByRole('heading',{name:'Set date and time',exact:true}),wheel:page.getByRole('listbox').first(),action:page.getByRole('button',{name:'See prices',exact:true})},{relationships:[['title','wheel'],['wheel','action']],context:width<640?'Wheel control has internal padding; action bar is pinned.':'Wheel control has internal padding.'});
    current = 'vehicles-' + width; await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_VEHICLE_ACTION&theme=light');
    const first = page.getByRole('button',{name:/Hatchback/}),second=page.getByRole('button',{name:/Sedan/}),options=page.getByRole('button',{name:/Ride options/}),action=page.getByRole('button',{name:'Book ride',exact:true});
    await expect(first).toBeVisible();
    await save(page,'vehicles',width,{first:first.locator('..'),second:second.locator('..'),options,action},{relationships:[['first','second'],['options','action']],context:width<640?'Rich cards and a pinned action group.':'Rich cards and inline action group.'});
    expect(errors).toEqual([]); await ctx.close();
  }
} catch(e) { failures.push({current,error:e.message}); if(active&&!active.isClosed())await active.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}); throw e; }
finally { fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify({status:failures.length?'PARTIAL':'OBSERVED',observations,failures,measurement:'Visible border-box edge gaps in CSS pixels; screenshots retain normal font line boxes.',scope:'Actual local website; synthetic auth/API responses; no product edits or provider writes.'},null,2)); await browser.close(); }
