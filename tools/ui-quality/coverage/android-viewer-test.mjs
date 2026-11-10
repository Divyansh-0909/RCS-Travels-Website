import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readJson, atomicJson } from '../../handoff/core.mjs';

const directory='output/handoff/p05-android-followup-2026-10-23',out=path.join(directory,'artifacts');
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test');
const proof={phase:'P05',at:new Date().toISOString(),scope:'Actual connected isolated Android stream in the existing read-only reviewer; desktop/mobile selection, freshness, stale hiding/recovery and website mode preservation',checks:[],screenshots:[]};
const browser=await chromium.launch({headless:true});let exitCode=1;
try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const status=()=>fetch('http://127.0.0.1:4317/api/native/status').then(r=>r.json());
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4317/?mode=android&coverage=A.ACCOUNT&width=390&theme=light');
    await expect(page.locator('#screen')).toContainText('A.ACCOUNT');
    await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');
    const frame=page.frameLocator('#site');
    await expect(frame.locator('#state')).toContainText('ANDROID LIVE',{timeout:30000});
    await expect(frame.locator('#screen')).toBeVisible();
    await expect(page.locator('#measurement')).toContainText('The actual isolated device stream is live');
    await expect(page.locator('#measurement')).not.toContainText('NOT_RUN while disconnected');
    const first=await status();expect(first.live).toBe(true);expect(first.source).toBe('DEVICE');expect(first.interaction).toBe('VIEW-ONLY');
    await expect.poll(async()=>(await status()).at,{timeout:20000}).not.toBe(first.at);
    if(!await page.locator('#coverage-browser').evaluate(e=>e.open))await page.locator('#coverage-browser summary').click();
    await page.locator('#coverage-search').fill('Language');
    await page.locator('#coverage-filter').selectOption('unavailable');
    await expect(page.locator('[data-coverage="A.ACCOUNT.LANGUAGE"]')).toHaveCount(0);
    await page.locator('#coverage-filter').selectOption('all');
    await page.locator('[data-coverage="A.ACCOUNT.LANGUAGE"]').click();
    await expect(page.locator('#screen')).toContainText('A.ACCOUNT.LANGUAGE');
    await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');
    await expect(page.locator('#safe-action')).toContainText('no device action is triggered');
    await page.reload();await expect(page.locator('#screen')).toContainText('A.ACCOUNT.LANGUAGE');
    await expect(frame.locator('#screen')).toBeVisible({timeout:30000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const image=await frame.locator('#screen').boundingBox(),iframe=await page.locator('#site').boundingBox();
    expect(image.width).toBeGreaterThan(0);expect(image.height).toBeGreaterThan(0);
    expect(image.width).toBeLessThanOrEqual(iframe.width+1);expect(image.height).toBeLessThanOrEqual(iframe.height+1);
    const file='P05-android-viewer-'+viewport.width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});proof.screenshots.push(file);
    proof.checks.push({viewport,realDeviceLive:true,framesAdvance:true,searchableNativeInventory:true,observedEntryNotUnavailable:true,selectionDoesNotControlDevice:true,queryPersists:true,imageFitsViewport:true});
  }
  const live=await status();
  await context.route('**/api/native/status',route=>route.fulfill({json:{...live,live:false,status:'STALE / CAPTURE STOPPED',ageMs:16000}}));
  await expect(page.frameLocator('#site').locator('#screen')).toBeHidden({timeout:12000});
  await expect(page.locator('#measurement')).toContainText('ANDROID NOT LIVE');
  const stale='P05-android-viewer-stale.png';await page.screenshot({path:path.join(out,stale),fullPage:true});proof.screenshots.push(stale);
  await context.unroute('**/api/native/status');
  await expect(page.frameLocator('#site').locator('#screen')).toBeVisible({timeout:20000});
  await expect(page.locator('#measurement')).toContainText('The actual isolated device stream is live');
  proof.checks.push({staleFrameHidden:true,freshFrameRecovers:true,staleTest:'Browser-only intercepted status; the actual fixture and phone were not disconnected or altered'});
  await page.locator('#website').click();
  await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575/outstation');
  await expect(page.locator('#screen')).toContainText('P03-O1');
  proof.checks.push({websiteModeAndOwnerDeferredIssuePreserved:true});
  expect(errors).toEqual([]);proof.pageErrors=errors;proof.status='PASS';exitCode=0;
}catch(error){proof.status='FAIL';proof.failure=error.message;throw error;}
finally{
  await browser.close();atomicJson(path.join(out,'P05-android-viewer-verification.json'),proof);
  const file=path.join(directory,'checks.json');atomicJson(file,[...readJson(file,[]),{command:'node tools/ui-quality/coverage/android-viewer-test.mjs',exitCode,scope:proof.scope,at:new Date().toISOString()}]);
}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,screenshots:proof.screenshots}));
