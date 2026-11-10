import fs from 'node:fs';import path from 'node:path';import {chromium,expect,out,contextFor} from './browser.mjs';import {families,batch} from './catalog.mjs';import {atomicJson} from '../../handoff/core.mjs';
const browser=await chromium.launch({headless:true}),checks=[],attempts=[];
try{
  for(const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844}]){
    const {context,network}=await contextFor(browser,viewport),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto('http://127.0.0.1:4317/?view=consistency');
      await expect(page.locator('#consistency-family option')).toHaveCount(3);
      for(const family of families){
        await page.locator('#consistency-family').selectOption(family.id);
        const outputs=page.locator('.consistency-readout');await expect(outputs.nth(0)).toContainText('LIVE ·',{timeout:65000});await expect(outputs.nth(1)).toContainText('LIVE ·',{timeout:65000});
        await expect(page.locator('[name=pattern]:checked')).toHaveCount(0);
        const expected=[...new Set(family.occurrences.map(item=>item.screenId))].sort();expect(await page.locator('[name=screen]').evaluateAll(elements=>elements.map(e=>e.value).sort())).toEqual(expected);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
        for(let index=0;index<2;index++){
          const pane=page.locator('.consistency-pane').nth(index);await pane.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await page.screenshot({path:path.join(out,'reviewer-'+family.id+'-'+viewport.width+'-pane'+index+'.png')});
        }
        checks.push({case:'actual-paired-review',familyId:family.id,viewport,screenIds:expected,livePanes:2,noDefaultApproval:true,noOuterOverflow:true});
      }
      await page.locator('#consistency-family').selectOption('VC-B01-ACTIONS');
      await page.locator('#consistency-occurrence-0').selectOption('VCB01_TIMING_ACTION');
      await expect(page.locator('.consistency-readout').first()).toContainText('LIVE ·',{timeout:65000});
      if(viewport.width===1440){
        await page.locator('#consistency-width').selectOption('1440');await page.locator('#consistency-theme').selectOption('dark');
        await expect(page.locator('.consistency-readout').first()).toContainText('1440px · dark preference',{timeout:65000});
        await expect(page.locator('.consistency-readout').nth(1)).toContainText('1440px · dark preference',{timeout:65000});
        const iframe=page.frameLocator('iframe[data-occurrence=VCB01_VEHICLE_ACTION]');
        const sedan=iframe.getByRole('button',{name:/Sedan/}).first();await sedan.click();await expect(sedan).toHaveAttribute('aria-pressed','true');
        const hatch=iframe.getByRole('button',{name:/Hatchback/}).first();await expect(hatch).toHaveAttribute('aria-pressed','false');
        checks.push({case:'actual-width-preference-and-card-interaction',viewport,frameWidth:1440,preference:'dark',selectionState:'Sedan pressed; Hatchback not pressed'});
      }
      let submission;
      await page.route('**/api/consistency/decision',async route=>{submission=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,saved:{...submission,implementationStatus:'NOT_CHANGED'},message:'Test-only intercepted choice; product NOT CHANGED'})});});
      await page.locator('[name=pattern][value=CUSTOM]').check();await page.locator('[name=screen][value="W.BOOKING.VEHICLES"]').uncheck();await page.locator('#consistency-note').fill('Test-only scope: preserve vehicle action; inspect route/timing later.');
      await page.getByRole('button',{name:'Save review choice',exact:true}).click();await expect(page.locator('#consistency-save-status')).toContainText('Test-only intercepted');
      expect(submission.screenIds.sort()).toEqual(['W.BOOKING.ROUTE','W.BOOKING.TIMING']);checks.push({case:'explicit-custom-choice-with-screen-exclusion',viewport,intercepted:true,authoritativeRegistryChanged:false});
      expect(errors).toEqual([]);
      expect(network.filter(item=>!['GET','HEAD'].includes(item.method)&&!['/api/fare/estimate','/api/consistency/decision'].includes(item.path))).toEqual([]);
    }catch(error){const frames=[];for(const frame of page.frames().slice(1)){try{frames.push(await frame.evaluate(()=>({url:location.pathname+location.search,review:window.__RCS_CONSISTENCY_CASE__,measurement:window.__RCS_CONSISTENCY_MEASUREMENT__,headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent)})));}catch{}}
      attempts.push({viewport,error:error.message,errors,network,frames});const file=path.join(out,'viewer-attempts.json');const prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];atomicJson(file,[...prior,...attempts]);throw error;}
    finally{await context.close();}
  }
  const {context}=await contextFor(browser,{width:1440,height:1000}),page=await context.newPage();
  await page.goto('http://127.0.0.1:4317/?issue=P06-B01-04&width=390&theme=light');
  await expect(page.locator('#screen')).toContainText('P06-B01-04');await expect(page.locator('#safe-action')).toContainText('FIX VERIFIED',{timeout:65000});
  const native=await(await page.request.get('http://127.0.0.1:4317/api/native/status')).json();
  await page.locator('#android').click();await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');
  checks.push({case:'existing-P06-issue-and-Android-modes-preserved',nativeStatus:native.status,nativeLive:native.live,androidPolicy:'VIEW-ONLY; no new Android audit'});await context.close();
  atomicJson(path.join(out,'viewer-verification.json'),{batch,status:'PASS',at:new Date().toISOString(),checks,attempts,scope:'Reviewer and browser interactions only; test choices intercepted, no owner selection fabricated'});
  console.log(JSON.stringify({status:'PASS',checks:checks.length}));
}finally{await browser.close();}
