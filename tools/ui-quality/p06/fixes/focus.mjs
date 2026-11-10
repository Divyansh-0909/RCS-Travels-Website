import path from 'node:path';import {chromium,expect,createCase,out,recordCheck} from '../browser.mjs';import {atomicJson} from '../../../handoff/core.mjs';
if(process.env.RCS_P06_FOLLOWUP!=='2026-10-24')throw Error('Use follow-up evidence scope');
const proof={phase:'P06',scope:'Final address-request and focus ownership regression after preventing late lookups reopening a dismissed field',checks:[],network:[],errors:[]},browser=await chromium.launch({headless:true});let exitCode=1;
async function finish(c,check){proof.checks.push({...check,status:'PASS'});proof.network.push(...c.network);proof.errors.push(...c.errors);await c.context.close();}
try{
  for(const width of [1440,390]){
    const c=await createCase(browser,{width,scenario:'race'}),input=c.page.locator('#pickup-location'),request=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha'),response=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');await input.fill('Alpha');await request;await input.fill('Beta');await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await response;await expect(c.page.getByRole('button',{name:/Alpha Synthetic Place 1/})).toHaveCount(0);await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await finish(c,{issue:'P06-B01-01',width,currentQueryWins:true});
  }
  for(const field of ['pickup','drop']){
    const c=await createCase(browser,{scenario:'race'}),input=c.page.locator('#'+field+'-location'),other=c.page.locator('#'+(field==='pickup'?'drop':'pickup')+'-location'),first=c.page.getByRole('button',{name:/Alpha Synthetic Place 1/}),request=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha'),response=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');await input.fill('Alpha');await request;await other.focus();await response;await expect(other).toBeFocused();await expect(first).toBeHidden();await input.focus();await expect(first).toBeVisible();await input.press('Escape');await expect(first).toBeHidden();await input.fill('Beta');await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await finish(c,{issue:'P06-B01-03',field,lateResponseDoesNotReopenDismissedGroup:true,otherFieldRetainsFocus:true,refocusShowsResolvedResults:true,editingAfterEscapeReopens:true});
  }
  for(const field of ['pickup','drop']){
    const c=await createCase(browser),input=c.page.locator('#'+field+'-location'),first=c.page.getByRole('button',{name:/Aster Synthetic Place 1/});await input.fill('Aster');await expect(first).toBeVisible();await input.press('Tab');await expect(first).toBeVisible();await c.page.keyboard.press('Tab');await expect(first).toBeFocused();await c.page.keyboard.press('Enter');await expect.poll(()=>c.page.evaluate(f=>JSON.parse(sessionStorage.getItem('rcs-data')).state[f+'Coords'],field)).toEqual({lat:28.61,lng:77.21});await finish(c,{issue:'P06-B01-03',field,tabAndEnterSelectCoordinates:true});
  }
  expect(proof.errors).toEqual([]);expect(proof.network.filter(r=>!['GET','HEAD','OPTIONS'].includes(r.method))).toEqual([]);proof.status='PASS';exitCode=0;
}catch(error){proof.status='FAIL';proof.failure=error.message;throw error;}
finally{await browser.close();atomicJson(path.join(out,'P06-fixes-focus-guard.json'),proof);recordCheck('node tools/ui-quality/p06/fixes/focus.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length}));
