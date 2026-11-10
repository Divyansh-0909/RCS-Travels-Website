import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const stage=process.argv[2]||'before';
const dir=path.resolve('output/handoff/runs/0b851d1c-7972-490a-8091-e16a38ec67b5/artifacts');
fs.mkdirSync(path.join(dir,'P03-screenshots'),{recursive:true});
const browser=await chromium.launch(); const records=[];
try {
for(const route of ['/','/outstation']) for(const width of [360,390,768,1280,1440]) for(const preference of ['dark','light']) {
const context=await browser.newContext({viewport:{width,height:900},colorScheme:preference,reducedMotion:'reduce'});
await context.addInitScript(t=>{localStorage.setItem('rcs.website.theme',t);localStorage.setItem('rcs.website.language','en');},preference);
await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:1575'+route);await page.locator('footer').waitFor();await page.locator(route==='/'?'.landing-hero':'button .leading-5').waitFor();await page.waitForTimeout(500);await page.evaluate(()=>document.fonts.ready);
const geometry=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left< -1);}).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,selector:e.id?'#'+e.id:'.'+String(e.className).split(' ').slice(0,3).join('.'),left:r.left,right:r.right,width:r.width,transform:s.transform,overflow:s.overflow,clipMargin:s.overflowClipMargin};})}));
const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
const violations=axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary,checks:[...n.any,...n.all,...n.none].map(c=>({id:c.id,data:c.data}))}))}));
const targets=await page.locator('button,a').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent.trim(),label:e.getAttribute('aria-label'),class:e.className,width:r.width,height:r.height,color:s.color,background:s.backgroundColor};}));
const focus=[];for(let i=0;i<8;i++){await page.keyboard.press('Tab');focus.push(await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent.trim().slice(0,70),outline:getComputedStyle(document.activeElement).outlineStyle})));}
await page.evaluate(()=>window.scrollTo(0,0));
const screenshot=`P03-screenshots/${stage}-${route==='/'?'home':'outstation'}-${preference}-${width}.png`;
await page.screenshot({path:path.join(dir,screenshot),fullPage:true});const bytes=fs.readFileSync(path.join(dir,screenshot));
const entry={route,width,preference,actualTheme:await page.locator('html').getAttribute('data-theme'),geometry,targets,focus,violations,errors,screenshot,imageWidth:bytes.readUInt32BE(16),imageHeight:bytes.readUInt32BE(20)};records.push(entry);
fs.writeFileSync(path.join(dir,`P03-${stage}-metrics.json`),JSON.stringify(records,null,2));
console.log(`${route} ${width} ${preference}: png=${entry.imageWidth} scroll=${geometry.scroll} axe=${violations.map(v=>v.id).join(',')} errors=${errors.length}`);await context.close();
}
if(stage==='after')for(const r of records){assert.equal(r.violations.length,0,`${r.route} ${r.width} ${r.preference} axe`);assert.equal(r.imageWidth,r.width);assert.equal(r.geometry.scroll,r.width);assert.equal(r.errors.length,0);}
}finally{await browser.close();}
