import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readJson, atomicJson } from '../../handoff/core.mjs';
const require=createRequire(path.resolve('frontend/package.json'));
export const {chromium,expect}=require('@playwright/test');
export const AxeBuilder=require('@axe-core/playwright').default;
export const run=readJson('output/handoff/state.json').run;
if(process.env.RCS_P06_FOLLOWUP&&process.env.RCS_P06_FOLLOWUP!=='2026-10-24')throw Error('Unknown P06 follow-up evidence scope');
const evidenceDirectory=path.join(run.directory,...(process.env.RCS_P06_FOLLOWUP?['fixes-2026-10-24']:[]));
export const out=path.join(evidenceDirectory,'artifacts');fs.mkdirSync(out,{recursive:true});
export async function createCase(browser,{width=1440,height=1000,theme='light',scenario='default',stage='route',clock=null,guest=false}={}){
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme,timezoneId:'Asia/Kolkata',reducedMotion:'reduce'}),network=[],external=[],errors=[];
  await context.addCookies([{name:'p06_scenario',value:scenario,url:'http://127.0.0.1:1575'},{name:'fixture_actor',value:guest?'guest':'customer',url:'http://127.0.0.1:1575'}]);
  await context.addInitScript(({theme,stage,clock})=>{
    localStorage.setItem('rcs.website.theme',theme);
    if(!sessionStorage.getItem('__p06_seeded')){
      const state=stage==='route'?{}:{pickupLocation:'Aster Synthetic Place 1, Fixture City',dropLocation:'Birch Synthetic Place 1, Fixture City',pickupCoords:{lat:28.61,lng:77.21},dropCoords:{lat:28.64,lng:77.25},timing:stage==='timing'?'Schedule':'Now',vehicleClass:'hatchback'};
      sessionStorage.setItem('rcs-data',JSON.stringify({state,version:0}));sessionStorage.setItem('__p06_seeded','true');
    }
    if(clock){const NativeDate=Date,epoch=new NativeDate(clock).getTime();globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};}
    window.__P06_SYNTHETIC_REVIEW__=true;
  },{theme,stage,clock});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost',''].includes(url.hostname)){external.push({host:url.hostname,path:url.pathname});return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const req=r.request(),url=new URL(r.url());if(url.pathname.startsWith('/api/'))network.push({method:req.method(),path:url.pathname,query:url.search,status:r.status(),fixture:r.headers()['x-rcs-fixture']||null,body:req.method()==='POST'?req.postDataJSON():undefined});});
  await page.goto('http://127.0.0.1:1575/book',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#pickup-location')).toBeVisible({timeout:45000});
  if(stage==='timing'){await page.getByRole('button',{name:'Set date & time',exact:true}).click();await expect(page.getByRole('heading',{name:'Set date and time',exact:true})).toBeVisible();}
  if(stage==='vehicle'){await page.getByRole('button',{name:'See prices',exact:true}).click();await expect(page.getByRole('button',{name:/Hatchback/}).first()).toBeVisible({timeout:30000});}
  return {context,page,network,external,errors};
}
export async function snapshot(page,name){
  await page.locator('body').evaluate(async()=>{await Promise.allSettled(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished));});
  const file='P06-'+name+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});return file;
}
export function recordCheck(command,exitCode,scope){const f=path.join(evidenceDirectory,'checks.json');atomicJson(f,[...readJson(f,[]),{command,exitCode,scope,at:new Date().toISOString()}]);}
