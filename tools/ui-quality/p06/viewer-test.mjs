import path from 'node:path';
import {chromium,expect,out,recordCheck} from './browser.mjs';
import {issues} from './issues.mjs';import {atomicJson} from '../../handoff/core.mjs';
const proof={phase:'P06',at:new Date().toISOString(),scope:'Actual /book issue replay in existing viewer at desktop/mobile outer viewports; legacy queues and view-only Android mode preserved',checks:[],screenshots:[],errors:[]};
const browser=await chromium.launch({headless:true});let exitCode=1;
try{
  const context=await browser.newContext({timezoneId:'Asia/Kolkata'}),page=await context.newPage();page.on('pageerror',e=>proof.errors.push(e.message));
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const issue of issues){
      const width=issue.id==='P06-B01-03'?1440:390;
      await page.goto('http://127.0.0.1:4317/?mode=website&issue='+issue.id+'&width='+width+'&theme=light');
      await expect(page.locator('#screen')).toContainText(issue.id);await expect(page.locator('#frame-label')).toContainText('SYNTHETIC SAMPLE PRICES');
      await expect(page.locator('#decision')).toContainText('OWNER CHOICE NEEDED — P06');
      const frame=page.frameLocator('#site');await expect(frame.locator('html')).toHaveAttribute('data-theme','legacy',{timeout:45000});
      if(issue.id==='P06-B01-01'){
        await expect(page.locator('#safe-action')).toContainText('REPRODUCED:',{timeout:30000});await expect(frame.locator('#pickup-location')).toHaveValue('Beta');await expect(frame.getByRole('button',{name:/Alpha Synthetic Place 1/})).toBeVisible();
      }else if(issue.id==='P06-B01-02'){
        await expect(page.locator('#safe-action')).toContainText('POSITIONED:',{timeout:30000});await expect(frame.getByRole('heading',{name:'Set date and time',exact:true})).toBeVisible();await expect(frame.getByRole('button',{name:'See prices',exact:true})).toBeDisabled();
      }else if(issue.id==='P06-B01-03'){
        await expect(page.locator('#safe-action')).toContainText('READY FOR MANUAL REPLAY:',{timeout:30000});await expect(frame.getByRole('button',{name:/Aster Synthetic Place 1/})).toBeVisible();await frame.locator('#pickup-location').press('Tab');await expect(frame.getByRole('button',{name:/Aster Synthetic Place 1/})).toBeHidden();
      }else{
        await expect(page.locator('#safe-action')).toContainText('POSITIONED:',{timeout:30000});const sedan=frame.getByRole('button',{name:/Sedan/});await expect.poll(()=>sedan.evaluate(e=>e.parentElement.classList.contains('outline-2'))).toBe(true);expect(await sedan.getAttribute('aria-pressed')).toBeNull();
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const file='P06-viewer-'+issue.id+'-'+viewport.width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});proof.screenshots.push(file);
      proof.checks.push({issue:issue.id,outerViewport:viewport,actualFrameWidth:width,actualRoute:'/book',status:'PASS',productFixApplied:false});console.log(JSON.stringify(proof.checks.at(-1)));
    }
  }
  await page.goto('http://127.0.0.1:4317/?mode=website&issue=P03-O1&width=390&theme=dark');await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575/outstation');await expect(page.locator('#decision')).toContainText('owner chose to keep');
  await page.locator('#android').click();await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');await page.locator('#website').click();await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575/outstation');proof.legacyModesPreserved=true;
  expect(proof.errors).toEqual([]);proof.status='PASS';exitCode=0;
}catch(error){proof.status='FAIL';proof.failure=error.message;throw error;}
finally{await browser.close();atomicJson(path.join(out,'P06-viewer-verification.json'),proof);recordCheck('node tools/ui-quality/p06/viewer-test.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,legacyModesPreserved:proof.legacyModesPreserved}));
