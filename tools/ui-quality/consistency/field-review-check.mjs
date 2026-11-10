import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const{chromium,expect}=require('@playwright/test');
const out='output/handoff/shared-field-review-2026-10-29';fs.mkdirSync(out+'/images',{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],network=[],errors=[];
const routes={review:'/dashboard/responsibility?case=synthetic-review',finance:'/dashboard',fares:'/dashboard'};
const kinds=process.env.FIELD_REVIEW_KIND==='review'?['review']:['review','finance','fares'];
async function choose(page,label,value){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
let active;
try{
  for(const width of[390,1440])for(const theme of['light','dark'])for(const kind of kinds){
    const ctx=await browser.newContext({viewport:{width,height:width<640?844:1000},colorScheme:theme,reducedMotion:'reduce'});
    await ctx.route('**/*',r=>{const u=new URL(r.request().url()),local=['127.0.0.1','localhost'].includes(u.hostname);network.push({method:r.request().method(),host:u.hostname,path:u.pathname,blocked:!local});return local?r.continue():r.abort();});
    const page=await ctx.newPage();page.setDefaultTimeout(9000);active=page;page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:1575'+routes[kind]+(kind==='review'?'&workspace=1&':'?')+'fieldReview='+kind+'&theme='+theme;
    await page.goto(url);await expect.poll(()=>page.evaluate(()=>window.__RCS_FIELD_REVIEW__?.ready),{timeout:25000}).toBe(true);
    let field,scope;
    if(kind==='review'){
      await choose(page,'Human decision','Uphold');await choose(page,'Final classification','Driver caused');await choose(page,'Consequence level','Level 1');
      field=page.getByRole('textbox',{name:'Review reason',exact:true});await field.fill('Synthetic review text. Check the padding, focus border and how longer sentences wrap onto another line.');scope=page.locator('section[aria-labelledby="human-review-heading"]');
    }else if(kind==='finance'){
      field=page.getByPlaceholder('Amount, e.g. -150 or 250',{exact:true});await field.fill('-150.50');scope=page.locator('#root');
    }else{field=page.locator('#f-toll');await field.fill('75');scope=page.locator('#root');}
    await field.scrollIntoViewIfNeeded();await field.focus();await page.evaluate(()=>document.fonts.ready);
    const measures=await page.locator('input,select,textarea').filter({visible:true}).evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,type:e.type,name:e.getAttribute('aria-label')||e.placeholder||e.id,height:r.height,font:s.fontSize,radius:s.borderRadius,padding:s.padding,background:s.backgroundColor,border:s.borderColor,outline:s.outline,offset:s.outlineOffset};}));
    const fixture=await page.evaluate(()=>window.__RCS_FIELD_REVIEW__);
    expect(fixture.requests.every(r=>r.method==='GET')).toBe(true);
    const shot=`current-${kind==='review'?'review-fields':kind==='finance'?'finance-fields':'fare-fields'}-${width}-${theme}.png`;
    await scope.screenshot({path:out+'/images/'+shot,animations:'disabled'});
    checks.push({kind,width,theme,url,status:'OBSERVED_FOR_OWNER_REVIEW',measurements:measures,screenshot:shot,syntheticReads:fixture.requests});
    const denied=await page.evaluate(async()=>{const r=await fetch('/api/admin/field-review-write-probe',{method:'POST'});return{status:r.status,body:await r.json()};});expect(denied.status).toBe(409);
    await ctx.close();console.log(kind+' '+width+' '+theme);
  }
  expect(errors).toEqual([]);
}catch(e){if(active&&!active.isClosed())await active.screenshot({path:out+'/failure-'+Date.now()+'.png',animations:'disabled'});throw e;}
finally{await browser.close();fs.writeFileSync(kinds.length===1?'output/handoff/responsibility-redesign-2026-10-29/shared-field-gallery-checks.json':out+'/review-checks.json',JSON.stringify({checks,network,errors,note:kinds.length===1?'Current Responsibility redesign. Synthetic reads and denied writes. Other Item12 fields unchanged.':'Current actual pages with synthetic admin actor and read-only intercepted APIs. Owner visual approval pending; no product styling changed.'},null,2));}
