import path from 'node:path';
import {createRequire} from 'node:module';
import {readJson,atomicJson} from '../../handoff/core.mjs';
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test');
const out=path.join(readJson('output/handoff/state.json').run.directory,'artifacts');
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:4317/?coverage=W.SETTINGS.NOTIFICATIONS&mode=website&width=390&theme=light');
  const frame=page.frameLocator('#site');await expect(frame.getByRole('heading',{name:'Notifications',level:3,exact:true})).toBeVisible({timeout:30000});
  await frame.locator('body').evaluate(async()=>{await Promise.allSettled(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished));});
  const result=await frame.locator('body').evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},switches:[...document.querySelectorAll('[role="switch"]')].map(e=>{const parents=[];let p=e;for(let i=0;p&&i<7;i++,p=p.parentElement){const r=p.getBoundingClientRect(),s=getComputedStyle(p);parents.push({tag:p.tagName,cls:p.className,rect:{x:r.x,y:r.y,w:r.width,h:r.height},opacity:s.opacity,transform:s.transform,display:s.display,overflow:s.overflow});}return parents;})}));
  result.frame=await page.locator('#site').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),parent:e.parentElement.getBoundingClientRect().toJSON()}));
  atomicJson(path.join(out,'P05-coverage-diagnostic.json'),result);await page.screenshot({path:path.join(out,'P05-coverage-diagnostic.png'),fullPage:true});console.log(JSON.stringify(result));
}finally{await browser.close();}
