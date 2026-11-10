import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const dir=path.resolve('output/handoff/runs/0b851d1c-7972-490a-8091-e16a38ec67b5/artifacts');
const browser=await chromium.launch();const results=[];
try{for(const width of [360,390,768,1280,1440])for(const preference of ['light','dark']){
const context=await browser.newContext({viewport:{width,height:900},colorScheme:preference,reducedMotion:'reduce'});
await context.addInitScript(t=>{localStorage.setItem('rcs.website.theme',t);window.__p03Open=[];window.open=(...args)=>window.__p03Open.push(args);},preference);
await context.route('**/*',async r=>{
const url=new URL(r.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))return r.abort();
if(url.pathname==='/src/constants/support.js'){const response=await r.fetch();return r.fulfill({response,body:(await response.text()).replace('window.location.href =','window.__p03Tel =')});}return r.continue();});
const page=await context.newPage();await page.goto('http://127.0.0.1:1575/');await page.locator('footer').waitFor();await page.getByRole('button',{name:'Go to step 1',exact:true}).waitFor();
const dots=page.getByRole('button',{name:/Go to step/});
for(let i=0;i<4;i++){await dots.nth(i).focus();await page.keyboard.press(i%2?'Space':'Enter');assert.equal(await dots.nth(i).getAttribute('aria-current'),'true');const box=await dots.nth(i).boundingBox();assert.ok(box.width>=24&&box.height>=24);}
await page.getByRole('button',{name:'Previous step',exact:true}).click();assert.equal(await dots.nth(2).getAttribute('aria-current'),'true');
for(const [selector,timing] of [['.hero-destination-label','Schedule'],['.hero-now','Now']]){
await page.locator(selector).focus();assert.notEqual(await page.locator(selector).evaluate(e=>getComputedStyle(e).outlineStyle),'none');await page.keyboard.press('Enter');await page.waitForURL('**/book');assert.equal(await page.evaluate(()=>history.state.usr.stage),'route');assert.equal(await page.evaluate(()=>history.state.usr.highlightRideNow),timing==='Now');
await page.goto('http://127.0.0.1:1575/');await page.locator('footer').waitFor();}
await page.goto('http://127.0.0.1:1575/outstation');await page.locator('footer').waitFor();
const expected=await page.evaluate(async()=>{const s=await import('/src/constants/support.js');return {tel:'tel:'+s.supportTel(),wa:'https://wa.me/'+s.supportTel().slice(1)+'?text='+encodeURIComponent("Hi, I'd like to book an outstation trip.")};});
await page.getByRole('button',{name:/^Call us/}).click();assert.equal(await page.evaluate(()=>window.__p03Tel),expected.tel);
await page.getByRole('button',{name:/^WhatsApp us/}).click();assert.equal(await page.evaluate(()=>window.__p03Open.at(-1)[0]),expected.wa);
const book=page.getByRole('button',{name:'Book a trip',exact:true});await book.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getAttribute('aria-modal'),'true');
await dialog.getByRole('button',{name:/^Call Raju/}).click();assert.equal(await page.evaluate(()=>window.__p03Tel),expected.tel);await dialog.getByRole('button',{name:/^WhatsApp Raju/}).click();assert.equal(await page.evaluate(()=>window.__p03Open.at(-1)[0]),expected.wa);
const modalAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(modalAxe.violations.map(v=>v.id),[]);
const last=dialog.getByRole('button').last();await last.focus();await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)),'Modal Tab must stay inside dialog');
await dialog.getByRole('button').first().focus();await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)),'Modal Shift+Tab must stay inside dialog');
if([390,1440].includes(width))await page.screenshot({path:path.join(dir,`P03-screenshots/after-outstation-dialog-${preference}-${width}.png`)});
await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.ok(await book.evaluate(e=>e===document.activeElement));
results.push({width,preference,status:'PASS',checks:'Carousel pointer/Enter/Space, 24px targets, city Schedule/Now route and state, contact destinations without sending, dialog axe/focus trap/Escape/restoration'});fs.writeFileSync(path.join(dir,'P03-functional.json'),JSON.stringify(results,null,2));console.log(`${width} ${preference}: functional PASS`);await context.close();
}}finally{await browser.close();}
