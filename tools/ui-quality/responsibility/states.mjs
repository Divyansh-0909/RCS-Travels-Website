import path from 'node:path';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test');
const origin='http://127.0.0.1:1591',out='output/handoff/responsibility-production-integration-2026-11-05';
const report=[],browser=await chromium.launch();
async function pageFor(theme,width,extra={}){
  const page=await browser.newPage({viewport:{width,height:900},...extra});page.setDefaultTimeout(20000);
  await page.addInitScript(value=>localStorage.setItem('rcs.website.theme',value),theme);
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));return page;
}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));});}
async function toForm(page){
  await page.getByRole('button',{name:'View timeline',exact:true}).click();await page.getByRole('checkbox',{name:/checked the available ride records/}).check();
  await page.getByRole('group',{name:'Review navigation'}).getByRole('button',{name:'Earlier reviews',exact:true}).click();
  await page.getByRole('checkbox',{name:/checked the suggestion and earlier reviews/}).check();
  await page.getByRole('group',{name:'Review navigation'}).getByRole('button',{name:'Your decision',exact:true}).click();
}
try{
  for(const [theme,width] of [['dark',1440],['light',390]]){
    const page=await pageFor(theme,width);
    await page.goto(`${origin}/dashboard/responsibility?case=RCS-0142`,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'View timeline',exact:true}).click();await settle(page);
    await expect(page.locator('.account-message')).toHaveCount(2);
    await expect(page.locator('.account-message[data-speaker=driver] p')).toHaveText('The road near pickup was blocked.');
    await page.keyboard.press('Tab');await page.locator('.account-messages').focus();
    expect(await page.locator('.account-messages').evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
    await page.locator('.stage-title').focus();await settle(page);
    await page.screenshot({path:`${out}/screenshots/final-statements-${theme}-${width}.png`});
    report.push({name:`statement-projection-${theme}-${width}`,result:'PASS'});await page.close();
  }
  const zoom=await pageFor('dark',1440);
  await zoom.goto(`${origin}/dashboard/responsibility?case=QA-ZOOM`,{waitUntil:'domcontentloaded'});await toForm(zoom);
  await zoom.evaluate(()=>document.documentElement.style.fontSize='200%');await settle(zoom);
  expect(await zoom.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const reason=zoom.getByLabel('Reason for your decision',{exact:false});await reason.focus();await reason.fill('A long reason remains readable at 200% text size.');
  await settle(zoom);
  const footer=await zoom.locator('.chapter-actions').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(901);
  await zoom.screenshot({path:`out-placeholder`.replace('out-placeholder',`${out}/screenshots/text-200-percent.png`)});
  report.push({name:'text-200-percent',result:'PASS'});await zoom.close();
  const reduced=await pageFor('dark',390,{reducedMotion:'reduce'});
  await reduced.goto(`${origin}/dashboard/responsibility?case=QA-REDUCED`,{waitUntil:'domcontentloaded'});await toForm(reduced);
  const decision=reduced.getByRole('button',{name:/^Decision:/});await decision.click();await settle(reduced);
  expect(await reduced.locator('.responsibility-dropdown-menu').evaluate(e=>getComputedStyle(e).transform)).toBe('none');
  await reduced.screenshot({path:`${out}/screenshots/reduced-motion-menu.png`});await reduced.keyboard.press('Escape');
  await decision.focus();await reduced.keyboard.press('Enter');
  expect(await reduced.locator('.responsibility-dropdown-menu').evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
  report.push({name:'reduced-motion-and-keyboard-menu',result:'PASS'});await reduced.close();
  const empty=await pageFor('light',390);let calls=0;
  await empty.route('**/api/admin/responsibility/cases?*',async route=>{
    if(!calls++){await new Promise(resolve=>setTimeout(resolve,1500));return route.fulfill({status:503,json:{error:'Synthetic list outage. Please retry.'}});}
    return route.fulfill({json:{items:[],total:0,nextCursor:null,limit:5}});
  });
  await empty.goto(`${origin}/dashboard/responsibility`,{waitUntil:'domcontentloaded'});
  await expect(empty.locator('.case-empty-state [role=status]')).toContainText('Loading cases');
  await expect(empty.locator('.case-empty-state [role=alert]')).toContainText('Couldn’t load cases.');
  await empty.getByRole('button',{name:'Retry',exact:true}).click();await expect(empty.getByText('No open cases',{exact:true})).toBeVisible();
  await empty.screenshot({path:`${out}/screenshots/empty-list.png`});report.push({name:'list-loading-error-retry-empty',result:'PASS'});await empty.close();
  const mismatch=await pageFor('dark',1440);
  await mismatch.route('**/api/admin/responsibility/cases/QA-MISMATCH',route=>route.fulfill({json:{case:{id:'a-different-case'}}}));
  await mismatch.goto(`${origin}/dashboard/responsibility?case=QA-MISMATCH`,{waitUntil:'domcontentloaded'});
  await expect(mismatch.getByRole('alert')).toContainText('does not match');await expect(mismatch.getByRole('button',{name:'View timeline',exact:true})).toHaveCount(0);
  report.push({name:'mismatched-case-response-rejected',result:'PASS'});await mismatch.close();
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await fs.writeFile(`${out}/additional-states.json`,JSON.stringify(report,null,2)+'\n');}
