import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readJson, atomicJson } from '../../handoff/core.mjs';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const run=readJson('output/handoff/state.json').run,out=path.join(run.directory,'artifacts');
const proof={phase:'P05',at:new Date().toISOString(),scope:'Coverage reviewer and safe synthetic website navigation; product audits are not inferred',checks:[],screenshots:[]};
const browser=await chromium.launch({headless:true});
let code=1;
try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[],writes=[],estimates=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().startsWith('http://127.0.0.1:1575/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())){const record={method:r.method(),url:r.url()};if(new URL(r.url()).pathname==='/api/fare/estimate')estimates.push(record);else writes.push(record);}});
  async function select(id,query){
    if(!await page.locator('#coverage-browser').evaluate(e=>e.open))await page.locator('#coverage-browser summary').click();
    await page.locator('#coverage-filter').selectOption('all');await page.locator('#coverage-search').fill(query);
    await page.locator('[data-coverage="'+id+'"]').click();await expect(page.locator('#screen')).toContainText(id);
  }
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4317/?mode=website&coverage=W.SETTINGS.NOTIFICATIONS&width=390&theme=light');
    await expect(page.locator('#screen')).toContainText('W.SETTINGS.NOTIFICATIONS');
    let frame=page.frameLocator('#site');
    await expect(frame.getByRole('heading',{name:'Notifications',level:3,exact:true})).toBeVisible({timeout:45000});
    await expect(frame.getByRole('switch')).toHaveCount(3);
    await expect(page.locator('#measurement')).toContainText('ACTUAL WEBSITE');
    await expect(page.locator('#frame-label')).toContainText('SYNTHETIC FIXTURE');
    await select('W.SAFETY.HELPLINE','Helpline');
    await expect(frame.getByRole('heading',{name:'Helpline',level:3,exact:true})).toBeVisible({timeout:30000});
    await select('W.ADMIN.DRIVERS','Drivers');
    await expect(frame.getByRole('heading',{name:'Drivers',level:3,exact:true})).toBeVisible({timeout:30000});
    await expect(page.locator('#site')).toHaveAttribute('src',/actor=admin/);
    await select('W.SETTINGS.LANGUAGE','Language');
    await expect(frame.getByRole('heading',{name:'Language',level:3,exact:true})).toBeVisible({timeout:30000});
    await expect(page.locator('#site')).toHaveAttribute('src',/actor=customer/);
    await select('W.BOOKING.VEHICLES','Vehicle / route');
    await expect(page.locator('#site')).toHaveAttribute('src',/to=%2Fdev%2Fvehicle/);
    await expect(frame.locator('body')).toContainText(/ride|Ride/,{timeout:30000});
    await select('W.SHARED-TRIP','SHARED-TRIP');
    await expect(page.locator('#site')).toBeHidden();await expect(page.locator('#frame-label')).toContainText('NOT_RUN');
    await expect(page.locator('#open')).not.toHaveAttribute('href');
    await select('W.HOME.P03-H3','P03-H3');
    await expect(page.locator('#decision')).toContainText('recorded defect remains FAIL');
    await expect(frame.locator('html')).toHaveAttribute('data-theme','legacy',{timeout:30000});
    await expect(frame.locator('#how-it-works')).toBeVisible({timeout:30000});
    const homeWidth=await frame.locator('html').evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    proof.checks.push({viewport,websiteSectionNavigation:['Notifications','Helpline','Drivers','Language'],actors:'existing isolated customer/admin fixture only',vehicleFixture:true,unavailableDynamicRouteHidden:true,homeMeasured:homeWidth,historicalHomeOverhang:'P03 +30px remains deferred; no product CSS changed'});
    await select('W.SETTINGS.NOTIFICATIONS','Notifications');
    await expect(frame.getByRole('heading',{name:'Notifications',level:3,exact:true})).toBeVisible({timeout:30000});
    await frame.locator('body').evaluate(async()=>{
      await Promise.allSettled(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished));
    });
    await expect(frame.getByRole('switch').first()).toBeInViewport();
    await expect(frame.getByRole('switch').last()).toBeInViewport();
    await expect(page.locator('#coverage-count')).toContainText('website');
    if(!await page.locator('#coverage-browser').evaluate(e=>e.open))await page.locator('#coverage-browser summary').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const file='P05-coverage-viewer-'+viewport.width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});proof.screenshots.push(file);
    await page.locator('#android').click();
    await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');
    await page.locator('#website').click();
    await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575/outstation');
    await expect(page.locator('#page')).toHaveValue('/outstation');
    await expect(page.locator('#screen')).toContainText('P03-O1');
    await expect(page.locator('#site')).toBeVisible();
    await expect(frame.locator('body')).toContainText(/outstation/i,{timeout:30000});
    proof.checks.push({viewport,websiteCoverageToAndroidToWebsite:true,legacyRouteRestored:'/outstation'});
  }
  await page.locator('#android').click();await select('A.ACCOUNT','A.ACCOUNT');
  await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');
  await expect(page.locator('#measurement')).toContainText('ANDROID NOT LIVE',{timeout:15000});
  await expect(page.frameLocator('#site').locator('#screen')).toBeHidden();
  await page.reload();await expect(page.locator('#screen')).toContainText('A.ACCOUNT');
  const offline='P05-android-offline.png';await page.screenshot({path:path.join(out,offline),fullPage:true});proof.screenshots.push(offline);
  proof.checks.push({androidOffline:true,actualNativeEndpoint:true,staleImageHidden:true,noFakeNativeBrowserScreen:true,querySelectionPersists:true});
  await page.locator('#website').click();await page.locator('[data-issue="P03-O1"]').click();
  await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:1575/outstation');
  await expect(page.locator('#decision')).toContainText('owner chose to keep');
  proof.checks.push({existingWebsiteIssueQueuePreserved:true,outstationRoutePreserved:true,productApiWrites:writes.length,readOnlyFareEstimateAttempts:estimates.length,estimateFixture:'The existing preview denies unimplemented POST endpoints; this does not verify prices or bookings'});
  expect(writes).toEqual([]);expect(errors).toEqual([]);proof.pageErrors=errors;proof.status='PASS';code=0;
}catch(error){proof.status='FAIL';proof.failure=error.message;throw error;}
finally{
  await browser.close();atomicJson(path.join(out,'P05-browser-verification.json'),proof);
  const checks=path.join(run.directory,'checks.json');atomicJson(checks,[...readJson(checks,[]),{command:'node tools/ui-quality/coverage/browser-test.mjs',exitCode:code,scope:proof.scope,at:new Date().toISOString()}]);
}
console.log(JSON.stringify(proof));
