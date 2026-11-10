import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';
const require=createRequire(path.resolve('frontend/package.json')),{chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true}),checks=[],out='output/handoff/shared-field-review-2026-10-29';
try{
 for(const[host,width]of[[390,390],[1920,390],[1920,1440]]){
  const page=await browser.newPage({viewport:{width:host,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(8000);
  await page.goto(`http://127.0.0.1:4317/?mode=website&review=VCB02&finding=12&width=${width}&theme=dark`);
  const panel=page.locator('#current-website-review');await expect(panel).toHaveAttribute('open','');
  await expect(page.locator('#current-review-live a')).toHaveCount(3);
  for(const link of await page.locator('#current-review-live a').all())await expect(link).toHaveAttribute('href',/127\.0\.0\.1:1575\/dashboard.*fieldReview=/);
  const images=panel.locator('img');await expect(images).toHaveCount(3);for(const img of await images.all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);}
  expect(await panel.locator('.current-review-images').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(width===390?2:1);
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:out+`/gallery-${host}-${width}.png`,animations:'disabled'});checks.push({host,width,status:'PASS',currentImages:3,liveLinks:3});await page.close();
 }
}finally{await browser.close();fs.writeFileSync(out+'/gallery-checks.json',JSON.stringify({checks},null,2));}
console.log(JSON.stringify({checks:checks.length}));
