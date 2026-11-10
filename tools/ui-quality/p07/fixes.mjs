import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {base,cases} from './cases.mjs';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const out='output/handoff/P07-fixes-2026-10-29';
fs.mkdirSync(out+'/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],network=[],errors=[],warnings=[];
let active;
async function make(width=390,motion='reduce'){
  const ctx=await browser.newContext({viewport:{width,height:width<640?844:1000},reducedMotion:motion});
  await ctx.route('**/*',r=>{const u=new URL(r.request().url()),local=['localhost','127.0.0.1'].includes(u.hostname);network.push({method:r.request().method(),host:u.hostname,path:u.pathname,blocked:!local});return local?r.continue():r.abort();});
  const page=await ctx.newPage();page.setDefaultTimeout(7000);active=page;page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/non-boolean|does not recognize|Invalid value for prop/.test(m.text()))warnings.push(m.text());});return{ctx,page};
}
async function open(page,key){await page.goto('http://127.0.0.1:1578/__review/p07?case='+key);await expect(page.getByRole('button',{name:'Back',exact:true}).first()).toBeVisible();await page.evaluate(()=>document.fonts.ready);}
const shot=(page,name)=>page.screenshot({path:out+'/screenshots/'+name+'.png',animations:'disabled'});
const store=(page,action)=>page.evaluate(async action=>{const {useRefreshNotice}=await import('/src/hooks/useRefreshNotice.js');if(action==='clear')useRefreshNotice.getState().clearRefreshNotice();else useRefreshNotice.getState().notifyRefreshFailed(action,()=>{window.__p07RetryCount=(window.__p07RetryCount||0)+1;});},action);
try{
  if(process.env.P07_FIX_SCOPE!=='notice'){
  for(let repeat=1;repeat<=2;repeat++)for(const width of [390,1440]){
    for(const outcome of ['pending','paid','failed-read']){
      const {ctx,page}=await make(width);let reads=0,posts=0;
      await ctx.route('**/api/bookings/*/status',async r=>{const n=++reads;if(n>1)await new Promise(resolve=>setTimeout(resolve,350));return r.fulfill(n>1&&outcome==='failed-read'?{status:503,json:{error:'Synthetic read unavailable',status:503}}:{json:{...cases.completed.data,bookingId:new URL(r.request().url()).pathname.split('/')[3],ridePayment:{...cases.completed.data.ridePayment,...(n>1&&outcome==='paid'?{state:'paid',method:'cash'}:{})}}});});
      page.on('response',r=>{if(r.request().method()==='POST'&&r.url().endsWith('/cash')){expect(r.status()).toBe(409);posts++;}});
      await open(page,'completed');const cash=page.getByRole('button',{name:'Pay with cash',exact:true});
      await cash.dblclick();await expect(page.getByRole('alert')).toContainText('Payment not confirmed');await expect(cash).toBeEnabled();expect(posts).toBe(1);
      const refresh=page.getByRole('button',{name:'Refresh payment status',exact:true});await expect(refresh).toBeVisible();
      if(outcome==='pending')await shot(page,`02-failed-${width}-${repeat}`);
      await refresh.click();await expect(cash).toBeDisabled();await expect.poll(()=>reads).toBe(2);
      if(outcome==='paid'){await expect(page.getByText('Paid in cash',{exact:true}).filter({visible:true}).first()).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);await expect(cash).toHaveCount(0);}
      else{await expect(refresh).toBeEnabled();await expect(page.getByRole('alert')).toContainText('Payment not confirmed');}
      expect(posts).toBe(1);checks.push({issue:'P07-B02-02',repeat,width,outcome,status:'PASS',reads,deniedCashPosts:posts,safeRefreshDoesNotResubmit:true});await ctx.close();
    }
  }
  {
    const{ctx,page}=await make();await open(page,'completed');await page.getByRole('button',{name:'Pay with UPI',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Payment not confirmed');checks.push({issue:'P07-B02-02',case:'denied-UPI-order',status:'PASS'});await ctx.close();
  }
  }
  // Actual global primitive: recovery, explicit close, retry, replacement and
  // timeout. Settings/Account callers exercise the same shared mount too.
  for(const motion of ['reduce','no-preference']){
    const{ctx,page}=await make(390,motion);await open(page,'assigned');
    const origin=page.getByRole('button',{name:'Call driver',exact:true});await origin.focus();
    await store(page,'P07 owned-focus recovery');const dismiss=page.locator('button[aria-label="Dismiss"]');await expect(dismiss).toBeVisible();await expect(page.locator('[role="status"]').filter({has:dismiss})).not.toHaveAttribute('inert','');await dismiss.focus();await expect(dismiss).toBeFocused();await store(page,'clear');
    await expect(dismiss).toHaveCount(0);await expect(origin).toBeFocused();
    await store(page,'P07 explicit close');await expect(dismiss).toBeVisible();await dismiss.click();await expect(dismiss).toHaveCount(0);await expect(origin).toBeFocused();
    await store(page,'P07 retry action');const retry=page.getByRole('button',{name:'Retry',exact:true});await retry.click();await expect(dismiss).toHaveCount(0);expect(await page.evaluate(()=>window.__p07RetryCount)).toBe(1);await expect(origin).toBeFocused();
    await store(page,'P07 notice A');await expect(dismiss).toBeVisible();await store(page,'clear');await store(page,'P07 notice B');await expect(page.getByText('P07 notice B',{exact:true})).toBeVisible();await page.waitForTimeout(400);await expect(dismiss).toBeVisible();
    await origin.focus();await store(page,'clear');await expect(dismiss).toHaveCount(0);await expect(origin).toBeFocused();
    await store(page,'P07 auto expiry');await expect(dismiss).toBeVisible();await expect(page.locator('[role="status"]').filter({has:dismiss})).not.toHaveAttribute('inert','');await dismiss.focus();await expect(dismiss).toBeFocused();await expect(dismiss).toHaveCount(0,{timeout:9500});await expect(origin).toBeFocused();
    await shot(page,'03-recovered-'+motion);checks.push({issue:'P07-B02-03',motion,status:'PASS',cases:['owned focus','dismiss','retry once','replacement survives old exit','unrelated focus preserved','auto expiry'],warnings:[]});await ctx.close();
  }
  for(const route of ['/settings','/manage-account','/safety']){
    const{ctx,page}=await make();await page.goto('http://127.0.0.1:1578'+route);await expect(page.locator('#root')).not.toBeEmpty();await store(page,'P07 cascade '+route);await expect(page.getByText('P07 cascade '+route,{exact:true})).toBeVisible();await store(page,'clear');await expect(page.locator('button[aria-label="Dismiss"]')).toHaveCount(0);checks.push({issue:'P07-B02-03',route,scope:'shared notice show/recovery lifecycle, not full caller journey',status:'PASS'});await ctx.close();
  }
  const configs=[...([320,360,390,768,1280,1440].flatMap(width=>[16,32].map(size=>({width,size,language:'en'})))),{width:320,size:16,language:'hi'},{width:390,size:32,language:'hi-Latn'}];
  for(const c of process.env.P07_FIX_SCOPE==='notice'?[]:configs){
    const{ctx,page}=await make(c.width);await open(page,'completed');
    await page.evaluate(async c=>{const{useData}=await import('/src/hooks/useData.js');useData.getState().setLanguage(c.language);await(await import('/src/i18n.js')).default.changeLanguage(c.language);document.documentElement.style.fontSize=c.size+'px';},c);
    for(const failed of [false,true]){
      if(failed){const cash=page.locator('button[data-size="action"]').filter({hasText:/Pay with cash|नकद|cash/i}).last();const exact=page.getByRole('button',{name:'Pay with cash',exact:true});if(c.language==='en')await exact.click();else await cash.click();await expect(page.getByRole('alert')).toBeVisible();}
      const title=page.getByRole('heading').filter({hasText:/Ride completed|सवारी पूरी|Sawari poori/i}).first();
      if(c.language==='en'){
        await title.scrollIntoViewIfNeeded();
        const top=await title.boundingBox();expect(top.y).toBeGreaterThanOrEqual(0);
        if(c.width===1440&&c.size===32)await shot(page,`04-${c.width}-${c.size}-${failed?'failed':'idle'}-top`);
      }
      // Use the source-scoped handler's underline, independent of translation.
      const link=page.locator('button.underline').filter({visible:true}).last();
      await link.click({trial:true,timeout:2500});
      const target=await link.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{reachable:hit===e||e.contains(hit),x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth};});
      expect(target.reachable).toBe(true);expect(target.documentWidth).toBeLessThanOrEqual(c.width+1);expect(target.x).toBeGreaterThanOrEqual(-1);expect(target.x+target.width).toBeLessThanOrEqual(c.width+1);
      if(c.language==='en'&&[390,1440].includes(c.width))await shot(page,`04-${c.width}-${c.size}-${failed?'failed':'idle'}`);
      if(c.size===16&&c.language==='en'&&[390,1440].includes(c.width)&&failed){const axe=await new AxeBuilder({page}).include('#root').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(axe.violations).toEqual([]);checks.push({case:'axe-settlement-failed',width:c.width,status:'PASS',violations:axe.violations,incomplete:axe.incomplete});}
      checks.push({issue:'P07-B02-04',...c,failed,status:'PASS',target});
    }
    await ctx.close();
  }
  expect(errors).toEqual([]);expect(warnings).toEqual([]);
}catch(e){if(active&&!active.isClosed())await shot(active,'failure-'+Date.now());throw e;}
finally{fs.writeFileSync(out+'/'+(process.env.P07_FIX_RESULT||'regression.json'),JSON.stringify({checks,network,errors,warnings,scope:'Approved02A/03A/04A. Read-only synthetic route, writes409, contacts intercepted. 01 remains pending transport choice.'},null,2));await browser.close();}
console.log(JSON.stringify({checks:checks.length,errors:errors.length,warnings:warnings.length}));
