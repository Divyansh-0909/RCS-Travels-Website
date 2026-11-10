import fs from 'node:fs';import path from 'node:path';
import {chromium,expect,createCase,out,run,recordCheck} from './browser.mjs';import {atomicJson,hash} from '../../handoff/core.mjs';
const browser=await chromium.launch({headless:true});let exitCode=1;
try{
  const c=await createCase(browser,{guest:true});await c.context.tracing.start({screenshots:true,snapshots:true,sources:false});
  await c.page.locator('#pickup-location').fill('Aster');await expect(c.page.getByRole('button',{name:/Aster Synthetic Place 1/})).toBeVisible();await c.page.locator('#pickup-location').press('Tab');await expect(c.page.getByRole('button',{name:/Aster Synthetic Place 1/})).toBeHidden();
  const privateDir=path.join(run.directory,'private');fs.mkdirSync(privateDir,{recursive:true});const zip=path.join(privateDir,'P06-keyboard-trace.zip');await c.context.tracing.stop({path:zip});
  const probes=[];
  for(const target of ['/api/bookings','/api/bookings/synthetic/payment','/api/users/me']){
    const r=await fetch('http://127.0.0.1:1575'+target,{method:target==='/api/users/me'?'DELETE':'POST',headers:{cookie:'p06_scenario=default','content-type':'application/json'},body:'{}'});expect(r.status).toBe(409);probes.push({path:target,status:r.status,fixture:r.headers.get('x-rcs-fixture')});
  }
  const csp=await fetch('http://127.0.0.1:1575/book').then(r=>r.headers.get('content-security-policy'));expect(csp).toContain("connect-src 'self'");
  atomicJson(path.join(out,'P06-network-safety.json'),{phase:'P06',at:new Date().toISOString(),status:'PASS',probes,csp,rawTrace:{path:zip,sha256:hash(fs.readFileSync(zip)),disposition:'PRIVATE / NOT UPLOADED; publish allowlisted action-event projection only'},pricing:'Constant synthetic fixture; opaque quote intentionally unusable for real booking',scope:'No production service client or database exists in this preview handler. API proxy targets its loopback in-memory fixture.'});
  await c.context.close();exitCode=0;
}finally{await browser.close();recordCheck('node tools/ui-quality/p06/trace.mjs',exitCode,'Actual private Playwright keyboard trace; served-preview negative mutation probes and CSP network boundary');}
