import fs from 'node:fs';
import path from 'node:path';
import{createRequire}from'node:module';
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test');
const out='output/handoff/responsibility-redesign-2026-10-29';fs.mkdirSync(out+'/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
let active;
try{for(const[width,theme]of[[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]){
 const ctx=await browser.newContext({viewport:{width,height:width<640?844:1000},colorScheme:theme,reducedMotion:'reduce'});await ctx.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 const page=await ctx.newPage();active=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(`http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=${theme}`);
 await expect(page.getByRole('heading',{name:'Responsibility review',exact:true})).toBeVisible({timeout:25000});await expect(page.getByRole('combobox',{name:'Human decision',exact:true})).toBeVisible({timeout:15000});await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:out+`/screenshots/initial-${width}-${theme}.png`,animations:'disabled'});
 await page.screenshot({path:out+`/screenshots/initial-full-${width}-${theme}.png`,animations:'disabled',fullPage:true});
 await page.getByRole('combobox',{name:'Human decision',exact:true}).click();await expect(page.getByRole('option',{name:'Uphold',exact:true})).toBeVisible();await page.screenshot({path:out+`/screenshots/select-${width}-${theme}.png`,animations:'disabled'});await page.keyboard.press('Escape');
 expect(errors).toEqual([]);checks.push({width,theme,errors,bodyWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});await ctx.close();
}}catch(e){if(active&&!active.isClosed()){await active.screenshot({path:out+'/screenshots/probe-failure.png'});console.log(JSON.stringify({url:active.url(),errors,body:(await active.locator('body').innerText()).slice(0,500)}));}throw e;}finally{await browser.close();fs.writeFileSync(out+'/probe.json',JSON.stringify({checks,errors},null,2));}
console.log(JSON.stringify(checks));
