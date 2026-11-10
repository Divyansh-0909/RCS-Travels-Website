import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {atomicJson,readJson,hash} from '../../handoff/core.mjs';
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test'),AxeBuilder=require('@axe-core/playwright').default;
const out=process.env.RCS_REVIEWER_EVIDENCE||'output/handoff/reviewer-controls-2026-10-25',checks=[],attempts=readJson(path.join(out,'attempts.json'),[]);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});let current='startup';
const errors=[],requests=[];
async function context(options={}){const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',...options});await ctx.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));ctx.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/')&&!['GET','HEAD'].includes(request.method()))requests.push({method:request.method(),path:url.pathname});});return ctx;}
async function check(name,fn){current=name;await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png')});}
async function choose(page,id,value){if(['theme','consistency-theme'].includes(id)){if(await page.locator('#'+id).inputValue()!==value)await page.locator('#dock-theme').click();await expect(page.locator('#'+id)).toHaveValue(value);return;}const trigger=page.locator('#'+id+'-trigger');await trigger.scrollIntoViewIfNeeded();await trigger.click();const text=await page.locator('#'+id).evaluate((select,value)=>[...select.options].find(option=>option.value===value)?.textContent,value);assert(text,'Known option '+id+' '+value);await page.locator('#'+id+'-trigger-listbox').getByRole('option',{name:text,exact:true}).click();await expect(page.locator('#'+id)).toHaveValue(value);await expect(trigger).toHaveAttribute('aria-expanded','false');}
async function live(page){for(let i=0;i<2;i++){await page.locator('.consistency-pane').nth(i).scrollIntoViewIfNeeded();await expect(page.locator('.consistency-readout').nth(i)).toContainText('LIVE',{timeout:60000});}}
async function menuBounds(page){const box=await page.locator('.review-select-popup:not([hidden])').boundingBox(),size=page.viewportSize();expect(box.x).toBeGreaterThanOrEqual(11);expect(box.y).toBeGreaterThanOrEqual(11);expect(box.x+box.width).toBeLessThanOrEqual(size.width-11);expect(box.y+box.height).toBeLessThanOrEqual(size.height-10);}
async function issue(page,id){if(!await page.locator('#review-issues').evaluate(element=>element.open))await page.locator('#queue-title').click();await page.locator('#queue button[data-issue="'+id+'"]').click();await expect(page.locator('#screen')).toContainText(id);}
async function previewBounds(page){const stage=await page.locator('#site-stage').boundingBox(),frame=await page.locator('#site').boundingBox();expect(frame.x).toBeGreaterThanOrEqual(stage.x-1);expect(frame.y).toBeGreaterThanOrEqual(stage.y-1);expect(frame.x+frame.width).toBeLessThanOrEqual(stage.x+stage.width+1);expect(frame.y+frame.height).toBeLessThanOrEqual(stage.y+stage.height+1);}
try{
  const ctx=await context(),page=await ctx.newPage();
  await page.goto('http://127.0.0.1:4317/?view=consistency&width=390&theme=light');await live(page);
  await check('comparison selects and dock controls share clone styling',async()=>{
    await expect(page.locator('.review-select-trigger:visible')).toHaveCount(4);await expect(page.locator('#consistency-occurrence-1-trigger')).toBeDisabled();await expect(page.locator('#dock-theme')).toBeVisible();
    for(const id of ['consistency-family','consistency-width','consistency-occurrence-0']){
      const trigger=page.locator('#'+id+'-trigger');await trigger.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);await trigger.click();await expect(trigger).toHaveAttribute('aria-expanded','true');await menuBounds(page);
      const style=await page.locator('#'+id+'-trigger-listbox').evaluate(element=>({background:getComputedStyle(element).backgroundColor,radius:getComputedStyle(element).borderRadius,border:getComputedStyle(element).borderColor}));expect(style).toEqual({background:'rgb(36, 36, 36)',radius:'14px',border:'rgb(65, 65, 65)'});expect(await page.evaluate(()=>scrollY)).toBe(y);
      await shot(page,'dropdown-'+id);await trigger.press('Escape');await expect(trigger).toBeFocused();await expect(trigger).toHaveAttribute('aria-expanded','false');
    }
  });
  await check('menu keyboard, typeahead, cancellation, Tab and outside click',async()=>{
    const trigger=page.locator('#consistency-family-trigger');await trigger.focus();await trigger.press('Enter');await trigger.press('End');await trigger.press('Enter');await expect(page.locator('#consistency-family')).toHaveValue('VC-B01-SELECTION');
    await trigger.press('a');await trigger.press('Enter');await expect(page.locator('#consistency-family')).toHaveValue('VC-B01-ADDRESS');
    await trigger.press('ArrowDown');await trigger.press('Home');await trigger.press('Escape');await expect(page.locator('#consistency-family')).toHaveValue('VC-B01-ADDRESS');
    await trigger.click();await trigger.press('Tab');await expect(trigger).toHaveAttribute('aria-expanded','false');expect(await page.evaluate(()=>document.activeElement.id)).not.toBe(trigger.id);
    await trigger.click();await page.locator('#consistency-title').click();await expect(trigger).toHaveAttribute('aria-expanded','false');
    await choose(page,'consistency-family','VC-B01-ACTIONS');await live(page);
    await trigger.click();await page.frameLocator('iframe[data-occurrence=VCB01_ROUTE_ACTION]').locator('#pickup-location').evaluate(element=>element.focus());await expect(trigger).toBeFocused();await expect(trigger).toHaveAttribute('aria-expanded','true');
    await page.locator('.review-menu-frame-shields>div').first().click();await expect(trigger).toHaveAttribute('aria-expanded','false');
  });
  await check('all family views, pane selection and preference controls',async()=>{
    for(const family of ['VC-B01-ACTIONS','VC-B01-ADDRESS','VC-B01-SELECTION']){await choose(page,'consistency-family',family);await live(page);await page.evaluate(()=>scrollTo(0,0));await shot(page,'family-'+family);}
    await choose(page,'consistency-family','VC-B01-ADDRESS');await choose(page,'consistency-occurrence-0','VCB01_DROP');await expect(page.locator('iframe[data-occurrence=VCB01_DROP]')).toBeVisible();await live(page);
    await choose(page,'consistency-theme','dark');await live(page);await expect(page.locator('#dock-theme')).toHaveAttribute('aria-pressed','true');await choose(page,'consistency-theme','light');await live(page);
    await choose(page,'consistency-family','VC-B01-ACTIONS');await choose(page,'consistency-occurrence-0','VCB01_TIMING_ACTION');await live(page);
  });
  await check('inspector scrolling, popup collision and pinned save footer',async()=>{
    await page.setViewportSize({width:1440,height:620});await page.locator('#consistency-width-trigger').click();await menuBounds(page);await shot(page,'short-inspector-menu');await page.locator('#consistency-width-trigger').press('Escape');
    const scrollY=await page.evaluate(()=>window.scrollY);await page.locator('.consistency-heading').hover();await page.mouse.wheel(0,160);await expect.poll(()=>page.locator('.consistency-content').evaluate(element=>element.scrollTop)).toBeGreaterThan(0);expect(await page.evaluate(()=>window.scrollY)).toBe(scrollY);
    const footer=await page.locator('.consistency-footer').boundingBox();await page.locator('.consistency-content').evaluate(element=>element.scrollTop=element.scrollHeight);const after=await page.locator('.consistency-footer').boundingBox();expect(Math.abs(footer.y-after.y)).toBeLessThan(1);expect(after.y+after.height).toBeLessThanOrEqual(605);
    await page.locator('.consistency-content').evaluate(element=>element.scrollTop=0);await page.setViewportSize({width:1440,height:1000});
  });
  await check('save validation, draft preservation, busy state, retry and stale review',async()=>{
    let calls=0;await page.route('**/api/consistency/decision',async route=>{calls++;const body=route.request().postDataJSON();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic failed save'})});});
    await page.locator('[name=pattern][value=CUSTOM]').check();await page.locator('#consistency-note').fill('');await page.locator('#consistency-save').click();await expect(page.locator('#consistency-save-status')).toContainText('Add a note');expect(calls).toBe(0);
    await page.locator('#consistency-note').fill('Test only. Exclude vehicles.');await page.locator('[name=screen][value="W.BOOKING.VEHICLES"]').uncheck();await choose(page,'consistency-width','1440');await expect(page.locator('#consistency-note')).toHaveValue('Test only. Exclude vehicles.');await expect(page.locator('[name=screen][value="W.BOOKING.VEHICLES"]')).not.toBeChecked();
    await page.locator('#consistency-save').click();await expect(page.locator('#consistency-save-status')).toContainText('Could not save');await expect(page.locator('#consistency-save')).toBeEnabled();await expect(page.locator('#consistency-note')).toHaveValue('Test only. Exclude vehicles.');await shot(page,'save-failure');
    await page.unroute('**/api/consistency/decision');let finish,submission;const pending=new Promise(resolve=>finish=resolve);await page.route('**/api/consistency/decision',async route=>{submission=route.request().postDataJSON();await pending;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:submission.revision+1,saved:submission})});});
    await page.locator('#consistency-save').click();await expect(page.locator('#consistency-save')).toBeDisabled();await expect(page.locator('#consistency-save')).toContainText('Saving');await shot(page,'save-pending');finish();await expect(page.locator('#consistency-save-status')).toContainText('Choice saved');expect(submission.screenIds.sort()).toEqual(['W.BOOKING.ROUTE','W.BOOKING.TIMING']);
    await page.unroute('**/api/consistency/decision');await page.route('**/api/consistency/decision',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Synthetic stale revision'})}));await page.locator('#consistency-save').click();await expect(page.locator('#consistency-save-status')).toContainText('Choices changed');await shot(page,'save-stale');
  });
  await check('comparison accessibility with open styled listbox',async()=>{
    await choose(page,'consistency-width','390');await live(page);await page.locator('#consistency-family-trigger').click();const result=await new AxeBuilder({page}).exclude('iframe').analyze();atomicJson(path.join(out,'comparison-axe.json'),{violations:result.violations,incomplete:result.incomplete.map(rule=>({id:rule.id,nodes:rule.nodes.length}))});expect(result.violations).toEqual([]);await page.locator('#consistency-family-trigger').press('Escape');
  });
  await check('comparison layouts stay correct across viewport sizes',async()=>{
    for(const width of [390,768,1440]){
      await choose(page,'consistency-width',String(width));await live(page);const panes=await page.locator('.consistency-pane').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      if(width===390){expect(Math.abs(panes[0].y-panes[1].y)).toBeLessThan(2);expect(panes[1].x).toBeGreaterThan(panes[0].right);}else{expect(panes[1].y).toBeGreaterThan(panes[0].bottom);}
      for(const frame of page.frames().filter(frame=>frame.url().includes('rcsConsistency=')))expect(await frame.evaluate(()=>innerWidth)).toBe(width);
      await page.evaluate(()=>scrollTo(0,0));await shot(page,'layout-'+width);
    }
  });
  await page.locator('#website').click();await expect(page.locator('#queue button')).not.toHaveCount(0);
  await check('every website issue loads its actual page and replay',async()=>{
    const review=await(await page.request.get('http://127.0.0.1:4317/api/review')).json();
    for(const finding of review.issues){
      await issue(page,finding.id);await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575'+finding.route);
      const frame=page.frameLocator('#site');await expect(frame.locator('#root')).not.toBeEmpty({timeout:45000});if(finding.phase==='P06')await expect(page.locator('#safe-action')).toContainText(/FIX VERIFIED|READY FOR MANUAL REPLAY/,{timeout:45000});
      await shot(page,'issue-'+finding.id);
    }
  });
  await check('website page, size and preference dropdowns',async()=>{
    await issue(page,'P06-B01-04');await expect(page.locator('#safe-action')).toContainText('FIX VERIFIED',{timeout:45000});
    for(const width of ['360','390','768','1280','1440']){await choose(page,'width',width);await expect(page.frameLocator('#site').locator('#root')).not.toBeEmpty({timeout:45000});const frame=page.frames().find(frame=>frame.url().startsWith('http://127.0.0.1:1575'));expect(await frame.evaluate(()=>innerWidth)).toBe(Number(width));await previewBounds(page);}
    for(const theme of ['dark','light']){const frame=page.frames().find(frame=>frame.url().startsWith('http://127.0.0.1:1575')),stored=await frame.evaluate(()=>localStorage.getItem('rcs.website.theme'));if(stored!==theme)await Promise.all([page.waitForEvent('framenavigated',{predicate:next=>next===frame}),choose(page,'theme',theme)]);else await choose(page,'theme',theme);await expect(page.frameLocator('#site').getByRole('heading',{name:'Choose a ride',exact:true})).toBeVisible({timeout:45000});await expect(page.locator('#dock-theme')).toHaveAttribute('data-mode',theme);}
    await expect(page.frameLocator('#site').getByRole('heading',{name:'Choose a ride',exact:true})).toBeVisible({timeout:45000});
    await page.locator('#page-trigger').click();const labels=await page.locator('#page-trigger-listbox [role=option]').allTextContents();expect(new Set(labels).size).toBe(labels.length);await shot(page,'website-page-menu');await page.locator('#page-trigger').press('Escape');
    for(const [route,heading,name] of [['/','A ride for wherever','home'],['/outstation','Going further than a city ride?','outstation']]){await choose(page,'page',route);await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575'+route);await expect(page.frameLocator('#site').getByRole('heading',{name:new RegExp(heading.replace('?','\\?'))})).toBeVisible({timeout:45000});await shot(page,'website-'+name);}
  });
  await check('coverage search, every filter, safe navigation and unavailable states',async()=>{
    await page.locator('#coverage-browser summary').click();await page.locator('#coverage-search').fill('___no_review_match___');await expect(page.locator('#coverage-list button')).toHaveCount(0);await page.locator('#coverage-search').fill('');
    const filters=await page.locator('#coverage-filter option').evaluateAll(options=>options.map(option=>option.value));for(const filter of filters){await choose(page,'coverage-filter',filter);await expect(page.locator('#coverage-filter')).toHaveValue(filter);}
    await choose(page,'coverage-filter','all');
    for(const id of ['W.SETTINGS.APPEARANCE','W.SAFETY.CONTACT','W.HELP.FAQ','W.ACCOUNT.PROFILE']){await page.locator('#coverage-search').fill(id);await page.locator('[data-coverage="'+id+'"]').click();await expect(page.locator('#screen')).toContainText(id);await expect(page.frameLocator('#site').locator('#root')).not.toBeEmpty({timeout:45000});await expect(page.locator('#measurement')).toContainText('ACTUAL WEBSITE',{timeout:45000});await expect(page.locator('#page-trigger')).toBeDisabled();await shot(page,'coverage-'+id);}
    await page.locator('#coverage-search').fill('');await choose(page,'coverage-filter','unavailable');if(await page.locator('#coverage-list button').count()){await page.locator('#coverage-list button').first().click();await expect(page.locator('#site')).toBeHidden();await expect(page.locator('#open')).toHaveAttribute('aria-disabled','true');await shot(page,'coverage-unavailable');}
    await choose(page,'coverage-filter','all');await page.locator('#coverage-search').fill('');
  });
  await check('website inspector accessibility with an open filter menu',async()=>{
    await page.locator('#coverage-filter-trigger').click();const result=await new AxeBuilder({page}).exclude('iframe').analyze();atomicJson(path.join(out,'website-axe.json'),{violations:result.violations,incomplete:result.incomplete.map(rule=>({id:rule.id,nodes:rule.nodes.length}))});expect(result.violations).toEqual([]);await page.locator('#coverage-filter-trigger').press('Escape');
  });
  await check('Android view-only mode, issue selection and honest offline state',async()=>{
    await page.locator('#android').click();await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');const native=await(await page.request.get('http://127.0.0.1:4317/api/native/status')).json();
    for(const id of ['P04-A1','P04-A2'])await issue(page,id);
    if(!native.live){await expect(page.frameLocator('#site').locator('#state')).toContainText('offline',{timeout:10000});await expect(page.frameLocator('#site').locator('#screen')).toBeHidden();}
    await shot(page,'android-status');atomicJson(path.join(out,'native-observation.json'),{live:native.live,status:native.status,scope:'Browser status view only; no device interaction or native UI certification'});
    await page.locator('#consistency').click();await expect(page.locator('#consistency-title')).toHaveText('Compare');
  });
  await ctx.close();
  await check('Android status page accessibility',async()=>{
    const nativeContext=await context(),nativePage=await nativeContext.newPage();await nativePage.goto('http://127.0.0.1:4317/native');await expect(nativePage.locator('#stamp')).not.toContainText('Checking');const result=await new AxeBuilder({page:nativePage}).analyze();atomicJson(path.join(out,'native-status-axe.json'),{violations:result.violations,incomplete:result.incomplete.map(rule=>({id:rule.id,nodes:rule.nodes.length}))});expect(result.violations).toEqual([]);await nativeContext.close();
  });
  await check('touch menus and viewport edges on narrow and short screens',async()=>{
    const touch=await context({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await touch.newPage();await p.goto('http://127.0.0.1:4317/?view=consistency&width=390&theme=light');await live(p);
    await expect(p.locator('#consistency-family-count')).toHaveCSS('white-space','nowrap');
    for(const id of ['consistency-family','consistency-width']){const trigger=p.locator('#'+id+'-trigger');await trigger.scrollIntoViewIfNeeded();await expect(trigger).toHaveCSS('-webkit-tap-highlight-color','rgba(0, 0, 0, 0)');await trigger.tap();await menuBounds(p);await shot(p,'touch-'+id);await p.locator('#'+id+'-trigger-listbox [role=option][aria-selected=true]').tap();await expect(trigger).toHaveAttribute('aria-expanded','false');}
    await p.locator('#dock-theme').tap();await expect(p.locator('#dock-theme')).toHaveAttribute('data-mode','dark');await live(p);
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await p.setViewportSize({width:680,height:320});await p.locator('#consistency-width-trigger').click();await menuBounds(p);await shot(p,'landscape-menu');await p.locator('#consistency-width-trigger').press('Escape');await touch.close();
  });
  const baseline=readJson(path.join(out,'baseline.json')),changed=baseline.productFiles.filter(item=>hash(fs.readFileSync(item.file))!==item.sha256).map(item=>({file:item.file,after:hash(fs.readFileSync(item.file))}));
  atomicJson(path.join(out,'source-observation.json'),{at:new Date().toISOString(),baselineFiles:baseline.productFiles.length,unchanged:baseline.productFiles.length-changed.length,concurrentChanges:changed,reviewerTaskProductEdits:0,note:'Application edits outside this reviewer work continued during the walkthrough. They are recorded and preserved; source equality is not a reviewer UI acceptance gate.'});expect(errors).toEqual([]);expect(requests.every(request=>['/api/fare/estimate','/api/consistency/decision'].includes(request.path))).toBe(true);
  atomicJson(path.join(out,'walkthrough.json'),{status:'PASS',at:new Date().toISOString(),checks,errors,requests,productFilesUnchanged:baseline.productFiles.length-changed.length,concurrentProductChanges:changed,productFilesEditedByReviewerWork:0,scope:'Entire local reviewer: styled menus, Compare families, all website issues, website controls, coverage browser, Android status, touch/keyboard and save states. Save requests intercepted; no owner decision was written. Concurrent application edits are preserved separately.',attempts});console.log(JSON.stringify({status:'PASS',checks:checks.length,productFilesUnchanged:baseline.productFiles.length-changed.length,concurrentProductChanges:changed.length}));
}catch(error){const diagnostics=[];for(const ctx of browser.contexts())for(const page of ctx.pages()){try{diagnostics.push(await page.evaluate(()=>({url:location.href,focused:document.activeElement?.tagName,focusedId:document.activeElement?.id,menus:[...document.querySelectorAll('.review-select-popup')].map(menu=>({id:menu.id,hidden:menu.hidden,dismissed:menu.dataset.dismissed})),open:[...document.querySelectorAll('.review-select[data-open=true]')].map(element=>element.dataset.select)})));await shot(page,'failure-'+(attempts.length+1));}catch{}}
  attempts.push({stage:current,at:new Date().toISOString(),error:error.message,errors,diagnostics});atomicJson(path.join(out,'attempts.json'),attempts);throw error;}finally{await browser.close();}
