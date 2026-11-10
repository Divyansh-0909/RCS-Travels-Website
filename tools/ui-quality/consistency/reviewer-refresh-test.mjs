import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {atomicJson,hash,readJson} from '../../handoff/core.mjs';
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test'),AxeBuilder=require('@axe-core/playwright').default;
const out='output/handoff/reviewer-refresh-2026-10-25';fs.mkdirSync(out,{recursive:true});
const checks=[],attempts=readJson(path.join(out,'attempts.json'),[]),browser=await chromium.launch({headless:true});
const cases=[{outer:1440,height:1000,width:390},{outer:1440,height:1000,width:1440},{outer:1920,height:1080,width:1440},{outer:768,height:1024,width:390},{outer:768,height:1024,width:1440},{outer:390,height:844,width:390},{outer:390,height:844,width:1440}];
try{
  for(const item of cases){
    const context=await browser.newContext({viewport:{width:item.outer,height:item.height},reducedMotion:'reduce',colorScheme:item.outer===768?'dark':'light'}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
    try{
      await page.goto('http://127.0.0.1:4317/?view=consistency&family=VC-B01-ACTIONS&width='+item.width+'&theme=light',{waitUntil:'domcontentloaded'});
      for(let index=0;index<2;index++){await page.locator('.consistency-pane').nth(index).scrollIntoViewIfNeeded();await expect(page.locator('.consistency-readout').nth(index)).toContainText('LIVE',{timeout:60000});}
      const geometry=await page.evaluate(()=>{
        const panes=[...document.querySelectorAll('.consistency-pane')].map(element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width};});
        const panel=document.querySelector('.consistency-choice'),style=getComputedStyle(panel),button=document.querySelector('#consistency-save').getBoundingClientRect();
        return {panes,panel:{background:style.backgroundColor,radius:style.borderRadius,width:panel.getBoundingClientRect().width,top:panel.getBoundingClientRect().top},saveBottom:button.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,detailsOpen:document.querySelector('.consistency-details').open,words:document.querySelector('#consistency-view').innerText.trim().split(/\s+/).length};
      });
      const [a,b]=geometry.panes;
      if(item.width===390){expect(Math.abs(a.top-b.top)).toBeLessThan(2);expect(b.left).toBeGreaterThanOrEqual(a.right-1);}else{expect(Math.abs(a.left-b.left)).toBeLessThan(2);expect(b.top).toBeGreaterThanOrEqual(a.bottom-1);}
      expect(geometry.overflow).toBe(false);expect(geometry.panel.background).toBe('rgb(16, 16, 16)');expect(geometry.detailsOpen).toBe(false);
      if(item.outer>1000){expect(geometry.panel.width).toBe(352);expect(geometry.panel.radius).toBe('28px');expect(geometry.saveBottom).toBeLessThanOrEqual(item.height-16);}
      for(const frame of page.frames().filter(frame=>frame.url().includes('rcsConsistency=')))expect(await frame.evaluate(()=>innerWidth)).toBe(item.width);
      await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:path.join(out,'outer-'+item.outer+'-preview-'+item.width+'.png')});
      if(item.outer===1440&&item.width===390){
        const axe=await new AxeBuilder({page}).include('#consistency-choice').analyze();atomicJson(path.join(out,'reviewer-axe.json'),{violations:axe.violations,incomplete:axe.incomplete.map(rule=>({id:rule.id,nodes:rule.nodes.length}))});expect(axe.violations).toEqual([]);
        const before=await page.locator('.consistency-footer').boundingBox();await page.locator('.consistency-content').evaluate(element=>element.scrollTop=element.scrollHeight);const after=await page.locator('.consistency-footer').boundingBox();expect(Math.abs(before.y-after.y)).toBeLessThan(1);
        await page.locator('.consistency-details summary').click();await expect(page.locator('#consistency-sources')).toBeVisible();
        let submission;await page.route('**/api/consistency/decision',async route=>{submission=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,saved:submission})});});
        await page.locator('[name=pattern][value=CUSTOM]').check();await page.locator('[name=screen][value="W.BOOKING.VEHICLES"]').uncheck();await page.locator('#consistency-note').fill('Test only: route and timing, excluding vehicle action.');
        await page.locator('#consistency-width').selectOption('1440');await expect(page.locator('#consistency-note')).toHaveValue('Test only: route and timing, excluding vehicle action.');await expect(page.locator('[name=pattern][value=CUSTOM]')).toBeChecked();await expect(page.locator('[name=screen][value="W.BOOKING.VEHICLES"]')).not.toBeChecked();
        await page.locator('#consistency-width').selectOption('390');await page.getByRole('button',{name:'Save choice',exact:true}).click();await expect(page.locator('#consistency-save-status')).toContainText('Choice saved');expect(submission.screenIds.sort()).toEqual(['W.BOOKING.ROUTE','W.BOOKING.TIMING']);
        await page.locator('#consistency-family').selectOption('VC-B01-ADDRESS');for(let index=0;index<2;index++)await expect(page.locator('.consistency-readout').nth(index)).toContainText('LIVE',{timeout:60000});
        await page.locator('#consistency-occurrence-0').selectOption('VCB01_DROP');await expect(page.locator('iframe[data-occurrence=VCB01_DROP]')).toBeVisible();await expect(page.locator('.consistency-readout').first()).toContainText('LIVE',{timeout:60000});
        await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'address-fields.png')});
        await page.locator('#consistency-family').selectOption('VC-B01-SELECTION');for(let index=0;index<2;index++)await expect(page.locator('.consistency-readout').nth(index)).toContainText('LIVE',{timeout:60000});
        const sedan=page.frameLocator('iframe[data-occurrence=VCB01_VEHICLE_CARD]').getByRole('button',{name:/Sedan/}).first();await sedan.click();await expect(sedan).toHaveAttribute('aria-pressed','true');
        checks.push({case:'controls-and-accessibility',axeViolations:0,pinnedFooter:true,detailsAccessible:true,customChoiceAndExclusion:true,draftPreservedAcrossPreviewChanges:true,submissionIntercepted:true,addressSwitch:true,vehicleInteraction:true});
      }
      expect(errors).toEqual([]);checks.push({case:'layout',...item,layout:item.width===390?'side-by-side':'stacked',geometry});console.log(JSON.stringify({outer:item.outer,preview:item.width,layout:item.width===390?'side-by-side':'stacked',status:'PASS'}));
    }catch(error){attempts.push({at:new Date().toISOString(),...item,error:error.message,errors});atomicJson(path.join(out,'attempts.json'),attempts);await page.screenshot({path:path.join(out,'failure-'+attempts.length+'.png')}).catch(()=>{});throw error;}
    finally{await context.close();}
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  await page.goto('http://127.0.0.1:4317/?issue=P06-B01-04&width=390&theme=light');await expect(page.locator('#safe-action')).toContainText('FIX VERIFIED',{timeout:60000});expect(await page.locator('main>aside').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(16, 16, 16)');await page.screenshot({path:path.join(out,'website-issues.png')});
  await page.locator('#android').click();await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');checks.push({case:'website-and-Android-review-modes-preserved',nativePolicy:'VIEW-ONLY; no native UI changes'});await context.close();
  const baseline=readJson(path.join(out,'baseline.json'));assert(baseline.productFiles.every(item=>hash(fs.readFileSync(item.file))===item.sha256));
  atomicJson(path.join(out,'verification.json'),{status:'PASS',at:new Date().toISOString(),checks,productFilesUnchanged:baseline.productFiles.length,scope:'Reviewer layout/copy only. Phone previews side by side; tablet/laptop previews stacked. Actual iframe viewport retained when fitted. Test choices intercepted; no owner decision was written.',attempts});console.log(JSON.stringify({status:'PASS',checks:checks.length,productFilesUnchanged:baseline.productFiles.length}));
}finally{await browser.close();}
