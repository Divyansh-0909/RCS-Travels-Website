import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true}), checks=[];
try {
  for(let repeat=1;repeat<=2;repeat++){
    const page=await browser.newPage({viewport:{width:390,height:844}}),attempts=[];
    await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    page.on('response',r=>{if(r.request().method()==='POST'&&r.url().endsWith('/cash'))attempts.push({path:new URL(r.url()).pathname,status:r.status()});});
    await page.goto('http://127.0.0.1:1578/__review/p07?case=completed');
    const cash=page.getByRole('button',{name:'Pay with cash',exact:true});await expect(cash).toBeEnabled();
    await cash.dblclick();await expect(cash).toBeEnabled();
    expect(attempts).toHaveLength(1);expect(attempts[0].status).toBe(409);
    checks.push({repeat,case:'native-cash-double-click',status:'PASS_BOUNDED',attempts,note:'Two native clicks create one denied local request while busy; not idempotency proof across completed attempts or provider success.'});
    await page.close();
  }
} finally {await browser.close();fs.writeFileSync('output/handoff/P07-2026-10-29/duplicate-click.json',JSON.stringify({checks},null,2));}
console.log(JSON.stringify({checks:checks.length}));
