import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium,firefox,webkit,expect}=require('@playwright/test');
const origin='http://127.0.0.1:1591',out='output/handoff/responsibility-production-integration-2026-11-05';
await fs.mkdir(`${out}/screenshots`,{recursive:true});
const report=process.argv.includes('--resume')?JSON.parse(await fs.readFile(`${out}/browser-checks.json`,'utf8')):[];
async function settle(page){await page.evaluate(async()=>{
  await document.fonts.ready;
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await frame();await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));await frame();
});}
async function createPage(browser,theme,width,options={}){
  const page=await browser.newPage({viewport:{width,height:900},...options});page.setDefaultTimeout(25000);
  await page.addInitScript(theme=>{localStorage.setItem('rcs.website.theme',theme);window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied.push(value);}}});},theme);
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  return page;
}
const nav=page=>page.getByRole('group',{name:'Review navigation',exact:true});
async function open(page,id='RCS-0142'){
  await page.goto(`${origin}/dashboard/responsibility?case=${encodeURIComponent(id)}`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'View timeline',exact:true}).waitFor();await settle(page);
}
async function throughReviews(page){
  await nav(page).getByRole('button',{name:'View timeline',exact:true}).click();
  await page.getByRole('checkbox',{name:/checked the available ride records/}).check();
  await nav(page).getByRole('button',{name:'Earlier reviews',exact:true}).click();
  await page.getByRole('checkbox',{name:/checked the suggestion and earlier reviews/}).check();
  await nav(page).getByRole('button',{name:'Your decision',exact:true}).click();await settle(page);
}
async function choose(page,label,option){
  await page.getByRole('button',{name:new RegExp(`^${label}:`)}).click();
  await page.getByRole('menuitemradio',{name:option,exact:true}).click();
}
async function fillWaiver(page){
  await choose(page,'Decision','Take no action against the driver');
  await choose(page,'Cause of the issue','Outside cause or unclear');
  await page.getByLabel('Reason for your decision',{exact:false}).fill('The saved records support this independent human review.');
}
async function shot(page,name){await settle(page);await page.screenshot({path:`${out}/screenshots/${name}.png`});}
async function assertColors(page){
  const actual=await page.locator('.responsibility-story').evaluate(e=>{
    const probe=document.createElement('span');e.appendChild(probe);probe.style.color='var(--ink-muted)';const secondary=getComputedStyle(probe).color;probe.remove();
    return {secondary,main:getComputedStyle(e).color,descriptions:[...e.querySelectorAll('.event-content p')].map(p=>getComputedStyle(p).color),driver:e.querySelector('[data-speaker=driver] p')&&getComputedStyle(e.querySelector('[data-speaker=driver] p')).color,rider:e.querySelector('[data-speaker=rider] p')&&getComputedStyle(e.querySelector('[data-speaker=rider] p')).color};
  });
  for(const color of actual.descriptions)expect(color).toBe(actual.secondary);
  expect(actual.driver).toBe(actual.main);expect(actual.rider).toBe('rgb(255, 255, 255)');
}
async function walkthrough(browser,engine,theme,width){
  const page=await createPage(browser,theme,width),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const name=`${engine}-${theme}-${width}`;
  try{
    await page.goto(`${origin}/dashboard/responsibility`,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Review case RCS-0142',exact:true}).waitFor();
    await shot(page,`${name}-list`);
    const copy=page.getByRole('button',{name:'Copy case ID RCS-0142',exact:true});await copy.click();
    await expect(copy).toHaveAttribute('data-copy-state','success');
    expect(await page.evaluate(()=>window.__copied)).toEqual(['RCS-0142']);
    const nextPage=page.getByRole('button',{name:'Next',exact:true});
    if(await nextPage.isEnabled()){
      const first=await page.locator('.case-id-link').first().textContent();
      await nextPage.click();
      await expect.poll(async()=>{const ids=await page.locator('.case-id-link').allTextContents();return ids.length>0&&ids[0]!==first;}).toBe(true);
      await page.getByRole('button',{name:'Previous',exact:true}).click();
      await expect(page.locator('.case-id-link').first()).toHaveText(first);
    }
    await page.getByRole('button',{name:'Filter',exact:false}).click();await shot(page,`${name}-filters`);
    const filter=page.locator('.case-filter-popover');
    const pageBg=await page.locator('.responsibility-story').evaluate(e=>getComputedStyle(e).backgroundColor);
    expect(await filter.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(pageBg);
    await page.getByRole('combobox',{name:'Review status',exact:true}).click();
    await page.getByRole('option',{name:'Needs review',exact:true}).click();
    await page.getByRole('button',{name:'Apply filters',exact:true}).click();
    await expect(page.getByRole('button',{name:'Review case RCS-0141',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:/^Filter/}).click();await page.getByRole('button',{name:'Reset',exact:true}).click();
    const search=page.getByRole('combobox',{name:'Search cases',exact:true});await search.fill('0142');
    const suggestion=page.getByRole('option').filter({hasText:'RCS-0142'});await expect(suggestion).toBeVisible();
    expect(await suggestion.evaluate(e=>getComputedStyle(e).cursor)).toBe('pointer');
    await shot(page,`${name}-suggestions`);await suggestion.click();
    await page.getByRole('button',{name:'View timeline',exact:true}).waitFor();
    await expect(page.getByRole('button',{name:/^Filter/})).toHaveCount(0);
    await shot(page,`${name}-step1`);
    await nav(page).getByRole('button',{name:'View timeline',exact:true}).click();await page.getByRole('heading',{name:'Follow what happened',exact:true}).waitFor();await settle(page);await assertColors(page);
    await shot(page,`${name}-step2`);
    const next=nav(page).getByRole('button',{name:'Earlier reviews',exact:true});await expect(next).toBeDisabled();
    const record=page.getByRole('button',{name:'View record 1',exact:true});await record.click();
    const dialog=page.getByRole('dialog',{name:'Ride accepted',exact:true});await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(pageBg);
    await shot(page,`${name}-record`);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(record).toBeFocused();
    await page.getByRole('checkbox',{name:/checked the available ride records/}).check();await next.click();await page.getByRole('heading',{name:'Check the earlier reviews',exact:true}).waitFor();await settle(page);
    const cards=await page.locator('.earlier-reviews-panels > [data-slot=card]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
    expect(Math.abs(cards[0].width-cards[1].width)).toBeLessThan(2);if(Math.abs(cards[0].y-cards[1].y)<2)expect(Math.abs(cards[0].height-cards[1].height)).toBeLessThan(2);
    await page.getByRole('button',{name:'See the records behind this',exact:true}).click();
    const listColors=await page.locator('.basis-content li').evaluateAll(es=>es.map(e=>({text:getComputedStyle(e).color,marker:getComputedStyle(e,'::marker').color})));
    for(const item of listColors)expect(item.text).toBe(item.marker);
    await shot(page,`${name}-step3`);
    await page.getByRole('checkbox',{name:/checked the suggestion and earlier reviews/}).check();await nav(page).getByRole('button',{name:'Your decision',exact:true}).click();
    await expect(nav(page).getByRole('button',{name:'Save decision',exact:true})).toBeDisabled();
    await fillWaiver(page);await expect(nav(page).getByRole('button',{name:'Save decision',exact:true})).toBeEnabled();
    await shot(page,`${name}-step4`);
    await page.getByRole('button',{name:'Refresh cases',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Record your decision',exact:true})).toBeVisible();
    await expect(page.getByLabel('Reason for your decision',{exact:false})).toHaveValue('The saved records support this independent human review.');
    let writes=0;
    await page.route('**/api/admin/responsibility/cases/*/review',route=>{writes++;return route.fulfill({status:503,json:{error:'Synthetic save failure. Your entries are unchanged.'}});});
    await nav(page).getByRole('button',{name:'Save decision',exact:true}).click();
    const confirmation=page.getByRole('dialog',{name:'Save this decision?',exact:true});await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button',{name:'Save decision',exact:true}).click();
    await expect(confirmation.getByRole('alert')).toContainText('Synthetic save failure');
    expect(writes).toBe(1);await shot(page,`${name}-save-error`);
    await confirmation.getByRole('button',{name:'Keep editing',exact:true}).click();
    await expect(page.getByLabel('Reason for your decision',{exact:false})).toHaveValue('The saved records support this independent human review.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const notifications=errors.filter(value=>value==='ResizeObserver loop completed with undelivered notifications.');
    expect(errors.filter(value=>!notifications.includes(value))).toEqual([]);
    report.push({name,result:'PASS',states:9,browserNotifications:notifications});console.log(`${name}: PASS`);
  }catch(error){
    await fs.writeFile(`${out}/${name}-diagnostic.json`,JSON.stringify(await page.evaluate(()=>({
      scroll:{x:scrollX,y:scrollY},bodyStyle:document.body.getAttribute('style'),
      elements:[...document.querySelectorAll('.review-main,.step-content,.earlier-reviews-panels,.earlier-reviews-panels > [data-slot=card]')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),opacity:getComputedStyle(e).opacity,visibility:getComputedStyle(e).visibility,display:getComputedStyle(e).display,align:getComputedStyle(e).alignSelf,position:getComputedStyle(e).position,columns:getComputedStyle(e).gridTemplateColumns})),
      animations:document.getAnimations().map(a=>({play:a.playState,timing:a.effect?.getComputedTiming()})),
    })),null,2));
    await page.screenshot({path:`${out}/screenshots/${name}-failure.png`}).catch(()=>{});throw error;}
  finally{await page.close();}
}

async function safetyChecks(browser){
  const page=await createPage(browser,'dark',1440),name=`QA-${Date.now()}`;
  try{
    await open(page,name);await throughReviews(page);
    await choose(page,'Decision','Hold the driver responsible');await choose(page,'Cause of the issue','Driver responsible');
    await page.getByLabel('Reason for your decision',{exact:false}).fill('Independent human review with an explicit policy action level.');
    await expect(nav(page).getByRole('button',{name:'Save decision',exact:true})).toBeDisabled();
    await choose(page,'Action level','Level 1');
    const requests=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/responsibility/'))requests.push({url:request.url(),body:request.postDataJSON()});});
    await nav(page).getByRole('button',{name:'Save decision',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Save decision',exact:true}).evaluate(element=>{element.click();element.click();});
    await expect(page.getByRole('heading',{name:'Your decision is saved',exact:true})).toBeVisible();
    expect(requests).toHaveLength(1);expect(requests[0].body).toMatchObject({decision:'UPHOLD',classification:'DRIVER_CAUSED',consequenceLevel:'LEVEL_1',evidenceVersion:'responsibility-evidence-v1',evidenceHash:'a'.repeat(64)});
    await expect(page.getByText('Notification or appeal steps may still be needed before this case is complete.')).toBeVisible();
    await shot(page,'save-success-provisional');
    await page.getByRole('navigation',{name:'Review steps',exact:true}).getByRole('button',{name:/What happened/}).click();
    await expect(page.getByRole('heading',{name:'Follow what happened',exact:true})).toBeVisible();
    await page.getByRole('navigation',{name:'Review steps',exact:true}).getByRole('button',{name:/Your decision/}).click();
    await expect(nav(page).getByRole('button',{name:'Save decision',exact:true})).toBeDisabled();
    await open(page,`RCS-APPEAL-${Date.now()}`);await throughReviews(page);await fillWaiver(page);
    await nav(page).getByRole('button',{name:'Save appeal decision',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Save decision',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Your decision is saved',exact:true})).toBeVisible();
    expect(requests.at(-1).url.endsWith('/appeal-review')).toBe(true);expect(requests.at(-1).body.outcome).toBe('WAIVE');expect(requests.at(-1).body.decision).toBeUndefined();
    await open(page,'RCS-FINAL');await throughReviews(page);await expect(nav(page).getByRole('button',{name:'Save decision',exact:true})).toBeDisabled();await expect(page.getByRole('heading',{name:'Final decision saved',exact:true})).toBeVisible();
    let reads=0;await page.route('**/api/admin/responsibility/cases/QA-STALE',async route=>{const response=await route.fetch();const data=await response.json();if(reads++)data.case.evidenceHash='b'.repeat(64);await route.fulfill({response,json:data});});
    await open(page,'QA-STALE');await throughReviews(page);await fillWaiver(page);await page.getByRole('button',{name:'Refresh cases',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Review this ride',exact:true})).toBeVisible();await expect(nav(page).getByRole('button',{name:'View timeline',exact:true})).toBeVisible();
    await open(page,'RCS-LONG');await nav(page).getByRole('button',{name:'View timeline',exact:true}).click();await settle(page);
    const scrolling=page.locator('.timeline-scroll');await expect(scrolling).toHaveAttribute('data-scrollable','true');await scrolling.focus();await page.keyboard.press('PageDown');
    await expect.poll(()=>scrolling.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);await shot(page,'long-timeline');
    report.push({name:'decision-safety',result:'PASS',checks:['required-action-level','evidence-bound-save','one-post-on-double-click','provisional-success-wording','saved-case-revisit-readonly','appeal-payload','final-case-readonly','changed-evidence-resets-draft','long-timeline-keyboard-scroll']});console.log('decision-safety: PASS');
  }finally{await page.close();}
}

const browser=await chromium.launch();
try{
  for(const width of [1440,768,390])for(const theme of ['dark','light'])if(!report.some(item=>item.name===`chromium-${theme}-${width}`))await walkthrough(browser,'chromium',theme,width);
  if(!report.some(item=>item.name==='decision-safety'))await safetyChecks(browser);
}finally{await browser.close();await fs.writeFile(`${out}/browser-checks.json`,JSON.stringify(report,null,2)+'\n');}
if(process.argv.includes('--cross-browser'))for(const [engine,type] of [['firefox',firefox],['webkit',webkit]]){
  const browser=await type.launch();try{await walkthrough(browser,engine,'dark',1440);await walkthrough(browser,engine,'light',390);}finally{await browser.close();await fs.writeFile(`${out}/browser-checks.json`,JSON.stringify(report,null,2)+'\n');}
}
