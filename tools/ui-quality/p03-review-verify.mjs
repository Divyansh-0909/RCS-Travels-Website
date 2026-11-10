import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from '../handoff/config.mjs';
import { readJson, atomicJson } from '../handoff/core.mjs';
const require=createRequire(path.join(config.root,'frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const state=readJson(path.join(config.runtime,'state.json')),dir=path.join(state.run.directory,'artifacts');
const proof={author:'CODEX',phase:'P03',at:new Date().toISOString(),checks:[],knownFindings:[],screenshots:[]};
const browser=await chromium.launch();
try {
 const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1920,height:1080}});
 const external=[];await context.route('**/*',r=>{const u=new URL(r.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){external.push(u.origin);return r.abort();}return r.continue();});
 const page=await context.newPage();const errors=[],hmr=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('websocket',socket=>socket.on('framereceived',event=>hmr.push(String(event.payload))));
 await page.goto('http://127.0.0.1:4317/?issue=P03-O1&width=390&theme=dark');
 const frame=()=>page.frameLocator('#site');
 await expect(page.locator('#measurement')).toContainText('LIVE:',{timeout:60000});
 const issues=readJson(path.join(config.runtime,'review.json')).issues;
 for(const issue of issues){
   await page.locator(`[data-issue="${issue.id}"]`).click();
   await expect(page.locator('#screen')).toContainText(issue.id);
   await expect(page.locator('#measurement')).toContainText('LIVE:',{timeout:30000});
   await expect(frame().locator('#__rcs-review-marker')).toBeVisible();
   expect(await frame().locator('#__rcs-review-marker').evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');
   const selected=frame().locator(issue.selector).first();await expect(selected).toBeInViewport();
   proof.checks.push({issue:issue.id,directElement:true,overlayNonblocking:true});
 }
 await page.locator('[data-issue="P03-O1"]').click();
 for(const width of [360,390,768,1280,1440])for(const theme of ['dark','light']){
   await page.selectOption('#width',String(width));await page.selectOption('#theme',theme);
   await expect(page.locator('#measurement')).toContainText('LIVE:',{timeout:30000});
   await expect.poll(()=>frame().locator('html').evaluate(()=>innerWidth).catch(()=>null),{timeout:30000}).toBe(width);
   await expect.poll(()=>frame().locator('html').evaluate(()=>localStorage.getItem('rcs.website.theme')).catch(()=>null),{timeout:30000}).toBe(theme);
   await expect(page.locator('#measurement')).toContainText('Preference '+theme,{timeout:30000});
   proof.checks.push({width,preference:theme,actualRootTheme:await frame().locator('html').getAttribute('data-theme'),viewportCorrect:true});
 }
 await page.selectOption('#width','390');await page.selectOption('#theme','dark');
 await expect(frame().getByRole('button',{name:/^Call us/})).toBeVisible();
 await frame().getByRole('button',{name:/^Call us/}).click();
 await expect(page.locator('#safe-action')).toContainText('nothing sent');
 await frame().getByRole('button',{name:/^WhatsApp us/}).click();
 const action=await frame().locator('body').evaluate(()=>window.__rcsReviewActions);
 expect(action.at(-2).url).toMatch(/^tel:\+/);expect(action.at(-1).url).toMatch(/^https:\/\/wa\.me\//);
 expect(action.every(a=>a.sent===false)).toBe(true);expect(external.some(u=>/wa\.me|whatsapp/.test(u))).toBe(false);
 const book=frame().getByRole('button',{name:/^Book an outstation trip/});await book.focus();
 await page.keyboard.press('Enter');const dialog=frame().getByRole('dialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:/^Call Raju/}).click();await dialog.getByRole('button',{name:/^WhatsApp Raju/}).click();
 await dialog.getByRole('button').last().focus();await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
 await dialog.getByRole('button').first().focus();await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(await book.evaluate(e=>e===document.activeElement)).toBe(true);
 proof.checks.push({outstationContacts:'intercepted without sending',modalKeyboard:'Tab/Shift+Tab/Escape/focus restoration PASS'});
 await page.locator('[data-issue="P03-H2"]').click();await expect(frame().locator('footer')).toBeAttached();
 const dots=frame().getByRole('button',{name:/Go to step/});
 for(let i=0;i<4;i++){await dots.nth(i).focus();await page.keyboard.press(i%2?'Space':'Enter');await expect(dots.nth(i)).toHaveAttribute('aria-current','true');}
 for(const [selector,now] of [['.hero-destination-label',false],['.hero-now',true]]){
   await frame().locator(selector).focus();await page.keyboard.press('Enter');
   await expect.poll(()=>frame().locator('html').evaluate(()=>location.pathname)).toBe('/book');
   await expect.poll(()=>frame().locator('html').evaluate(()=>history.state.usr).catch(()=>null),{timeout:15000}).toMatchObject({stage:'route',highlightRideNow:now});
   // A status refresh must not redirect the owner's working page back to Home.
   await page.waitForTimeout(2200);expect(await frame().locator('html').evaluate(()=>location.pathname)).toBe('/book');
   await page.locator('[data-issue="P03-O1"]').click();await expect.poll(()=>frame().locator('html').evaluate(()=>location.pathname).catch(()=>null)).toBe('/outstation');await expect(frame().locator('footer')).toBeAttached();
   await page.locator('[data-issue="P03-H2"]').click();await expect.poll(()=>frame().locator('html').evaluate(()=>location.pathname).catch(()=>null)).toBe('/');await expect(frame().locator('.landing-hero')).toBeAttached();
 }
 proof.checks.push({cityBooking:'Schedule and Now preserve route state; no booking submitted',carouselKeyboard:'PASS'});
 for(const viewport of [{width:1920,height:1080},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.locator('[data-issue="P03-O1"]').click();await expect(page.locator('#measurement')).toContainText('LIVE:');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
   await page.evaluate(()=>scrollTo(0,0));const name=`P03-viewer-website-${viewport.width}.png`;
   await page.screenshot({path:path.join(dir,name),fullPage:true});proof.screenshots.push(name);
 }
 await page.setViewportSize({width:1920,height:1080});
 const source=path.join(config.root,'frontend/src/pages/Outstation.jsx'),original=fs.readFileSync(source,'utf8');
 const transient=original+'\n// P03 transient nonvisual HMR transport verification\n';
 try{fs.writeFileSync(source,transient);await expect.poll(()=>hmr.some(message=>message.includes('Outstation.jsx')&&message.includes('update')),{timeout:30000}).toBe(true);}
 finally{if(fs.readFileSync(source,'utf8')!==transient)throw Error('Source changed during HMR probe; preserving it for inspection');fs.writeFileSync(source,original);}
 await expect(frame().locator('footer')).toBeAttached();
 proof.checks.push({actualSourceHmr:'PASS — nonvisual source comment emitted an Outstation HMR update; exact bytes restored'});
 await page.locator('#android').click();await expect(page.locator('#site')).toHaveAttribute('src','http://127.0.0.1:4317/native');
 await expect(frame().getByText(/DEVICE · VIEW-ONLY/)).toBeVisible();
 const native=await fetch('http://127.0.0.1:4317/api/native/status').then(r=>r.json());
 if(native.live){await expect(frame().locator('#screen')).toBeVisible({timeout:15000});expect(await frame().locator('#screen').evaluate(e=>e.naturalWidth)).toBe(native.width);}
 else{await expect(frame().locator('#screen')).toBeHidden();await expect(frame().locator('#state')).toContainText('ANDROID NOT LIVE');}
 await expect(page.locator('#screen')).toContainText('Actual captain Android');
 await expect(page.locator('#measurement')).toContainText('VIEW-ONLY',{timeout:10000});
 const name='P03-viewer-android.png';await page.screenshot({path:path.join(dir,name),fullPage:true});proof.screenshots.push(name);proof.native=native;
 const statusUrl='http://127.0.0.1:4317/api/native/status';
 const disconnect=route=>route.fulfill({json:{...native,live:false,status:'DISCONNECTED — browser test',connected:false}});
 await context.route(statusUrl,disconnect);
 await expect(frame().locator('#state')).toContainText('ANDROID NOT LIVE',{timeout:10000});
 await expect(frame().locator('#screen')).toBeHidden();
 await expect(frame().locator('#screen')).not.toHaveAttribute('src',/native-screen/);
 await context.unroute(statusUrl,disconnect);
 proof.checks.push({browserDisconnectTest:'PASS — hides stale image and removes its source; test interception removed'});
 proof.checks.push({androidSource:native.source,live:native.live,truthfulViewOnly:true});
 expect(errors).toEqual([]);proof.pageErrors=errors;proof.status='PASS';
} catch(error){proof.status='FAIL';proof.failure=error.message;throw error;}
finally{atomicJson(path.join(dir,'P03-viewer-verification.json'),proof);await browser.close();}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,native:proof.native?.status,screenshots:proof.screenshots}));
