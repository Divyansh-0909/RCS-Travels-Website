import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const{chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true}),checks=[];
const out='output/handoff/P07-fixes-2026-10-29';
try{
  for(const[host,width]of[[390,390],[1920,390],[1920,1440]]){
    const page=await browser.newPage({viewport:{width:host,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(8000);
    await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    await page.goto(`http://127.0.0.1:4317/p07?issue=P07-B02-02&width=${width}`);
    await expect(page.locator('#issue option')).toHaveCount(4);await expect(page.locator('#name')).toContainText('Fixed');await expect(page.locator('#decision-note')).toContainText('No new implementation approval');
    const actual=page.frameLocator('#actual'),cash=actual.getByRole('button',{name:'Pay with cash',exact:true});await expect(cash).toBeVisible();await page.locator('#actual').scrollIntoViewIfNeeded();await cash.click();await expect(actual.getByRole('alert')).toContainText('Payment not confirmed');
    await expect(actual.getByRole('button',{name:'Refresh payment status',exact:true})).toBeVisible();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+`/screenshots/board-fixed-${host}-${width}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(host+1);
    await page.locator('#issue').selectOption('P07-B02-01');await expect(page.locator('#decision-note')).toContainText('01 remains unresolved');checks.push({host,width,status:'PASS',fixedStatusAndActualFailure:true,issue01Pending:true});await page.close();
  }
}finally{await browser.close();fs.writeFileSync(out+'/board-checks.json',JSON.stringify({checks},null,2));}
console.log(JSON.stringify({checks:checks.length}));
