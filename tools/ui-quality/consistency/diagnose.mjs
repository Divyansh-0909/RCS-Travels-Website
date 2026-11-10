import path from 'node:path';import {chromium,expect,out,contextFor} from './browser.mjs';import {atomicJson} from '../../handoff/core.mjs';
const browser=await chromium.launch({headless:true}),{context}=await contextFor(browser,{width:390,height:844}),page=await context.newPage();
try{
  await page.goto('http://127.0.0.1:4317/?view=consistency');await expect(page.locator('.consistency-readout').first()).toContainText('LIVE ·',{timeout:65000});await expect(page.locator('.consistency-readout').nth(1)).toContainText('LIVE ·',{timeout:65000});
  for(const family of ['VC-B01-ADDRESS','VC-B01-SELECTION','VC-B01-ACTIONS']){
    await page.locator('#consistency-family').selectOption(family);await expect(page.locator('.consistency-readout').first()).toContainText('LIVE ·',{timeout:65000});await expect(page.locator('.consistency-readout').nth(1)).toContainText('LIVE ·',{timeout:65000});
  }
  await page.locator('#consistency-occurrence-0').selectOption('VCB01_TIMING_ACTION');
  try{await expect(page.locator('.consistency-readout').first()).toContainText('LIVE ·',{timeout:60000});}catch{}
  const frames=[];for(const frame of page.frames().slice(1))frames.push(await frame.evaluate(()=>({url:location.pathname+location.search,review:window.__RCS_CONSISTENCY_CASE__,measurement:window.__RCS_CONSISTENCY_MEASUREMENT__,buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent.trim(),disabled:e.disabled})),headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent),stored:JSON.parse(sessionStorage.getItem('rcs-data')||'null')})));
  atomicJson(path.join(out,'mobile-switch-diagnostic.json'),{frames,status:await page.locator('.consistency-readout').allTextContents()});console.log(JSON.stringify({frames:frames.map(f=>({url:f.url,review:f.review,heading:f.headings,buttons:f.buttons,measurement:!!f.measurement})),status:await page.locator('.consistency-readout').allTextContents()}));
}finally{await context.close();await browser.close();}
