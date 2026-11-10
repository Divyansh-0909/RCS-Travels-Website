import path from 'node:path';
import {chromium,expect,createCase,snapshot,out,recordCheck} from '../browser.mjs';import {atomicJson} from '../../../handoff/core.mjs';
if(process.env.RCS_P06_FOLLOWUP!=='2026-10-24')throw Error('Use the separate follow-up evidence directory');
const proof={phase:'P06',date:'2026-10-24',scope:'Actual /book regression for the four explicitly approved fixes, synthetic places/quotes only',checks:[],screenshots:[],network:[],errors:[]};
const browser=await chromium.launch({headless:true}),active=new Set();let exitCode=1;
async function open(options){const c=await createCase(browser,options);active.add(c);return c;}
async function done(c,check){proof.checks.push({...check,status:'PASS'});proof.network.push(...c.network);proof.errors.push(...c.errors);active.delete(c);await c.context.close();console.log(JSON.stringify(proof.checks.at(-1)));}
try{
  for(const width of [1440,390]){
    const c=await open({width,scenario:'race'}),input=c.page.locator('#pickup-location');
    const firstRequest=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha'),firstResponse=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');
    await input.fill('Alpha');await firstRequest;await input.fill('Beta');await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await firstResponse;
    await expect(c.page.getByRole('button',{name:/Alpha Synthetic Place 1/})).toHaveCount(0);await expect(input).toHaveValue('Beta');
    const secondRequest=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha'),secondResponse=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');
    await input.fill('Alpha');await secondRequest;await input.fill('Beta');await secondResponse;await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await expect(c.page.getByRole('button',{name:/Alpha Synthetic Place 1/})).toHaveCount(0);
    proof.screenshots.push(await snapshot(c.page,'fix-B01-01-race-'+width));
    const clearRequest=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha'),clearResponse=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');await input.fill('Alpha');await clearRequest;await input.fill('');await clearResponse;await expect(input).toHaveValue('');await expect(c.page.getByRole('button',{name:/Alpha Synthetic Place 1/})).toHaveCount(0);
    await done(c,{id:'P06-B01-01',width,latestQuery:'Beta',staleSuccessIgnored:true,cachedLatestQueryProtected:true,clearedValueProtected:true});
  }
  {
    const c=await open(),input=c.page.locator('#pickup-location');
    await c.page.route('**/api/googleAPI/autocomplete?*',async route=>{if(new URL(route.request().url()).searchParams.get('input')==='Alpha'){await new Promise(r=>setTimeout(r,1200));await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic obsolete request failure'})});}else await route.continue();});
    const request=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha'),response=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');await input.fill('Alpha');await request;await input.fill('Beta');await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await response;await expect(c.page.getByRole('heading',{name:'Suggestions unavailable',exact:true})).toHaveCount(0);await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();await done(c,{id:'P06-B01-01',width:1440,staleFailureIgnored:true});
  }
  for(const width of [1440,390]){
    const c=await open({width,stage:'timing',clock:'2026-10-23T23:50:00+05:30',guest:true});await expect(c.page.getByRole('button',{name:'See prices',exact:true})).toBeEnabled();const days=c.page.getByRole('listbox',{name:'Available booking days',exact:true});await expect(days).toHaveAttribute('aria-activedescendant','available-booking-days-1');
    const selected=await c.page.getByRole('listbox').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),selected:[...e.querySelectorAll('[aria-selected="true"]')].map(x=>x.textContent)})));
    proof.screenshots.push(await snapshot(c.page,'fix-B01-02-midnight-'+width));await done(c,{id:'P06-B01-02',width,clock:'2026-10-23T23:50:00+05:30',selected,seePricesEnabled:true,tomorrowSelected:true});
  }
  for(const [clock,day,minute]of [['2026-10-31T23:50:00+05:30',1,'30'],['2026-12-31T23:50:00+05:30',1,'30'],['2026-10-24T12:00:00.001+05:30',0,'45'],['2026-10-24T12:00:45+05:30',0,'45'],['2026-10-24T12:00:00+05:30',0,'30']]){
    const c=await open({stage:'timing',clock,guest:true});await expect(c.page.getByRole('button',{name:'See prices',exact:true})).toBeEnabled();await expect(c.page.getByRole('listbox',{name:'Available booking days',exact:true})).toHaveAttribute('aria-activedescendant','available-booking-days-'+day);await expect(c.page.getByRole('listbox',{name:'Minute',exact:true}).locator('[aria-selected="true"]')).toHaveText(minute);await done(c,{id:'P06-B01-02',clock,dayIndex:day,minute,rolloverOrLeadTimeBoundary:true});
  }
  for(const field of ['pickup','drop']){
    const c=await open(),input=c.page.locator('#'+field+'-location'),first=c.page.getByRole('button',{name:/Aster Synthetic Place 1/}),second=c.page.getByRole('button',{name:/Aster Synthetic Place 2/});await input.fill('Aster');await expect(first).toBeVisible();await input.press('Tab');await expect(c.page.getByRole('button',{name:'Clear '+field+' location',exact:true})).toBeFocused();await expect(first).toBeVisible();await c.page.keyboard.press('Tab');await expect(first).toBeFocused();await c.page.keyboard.press('Shift+Tab');await c.page.keyboard.press('Shift+Tab');await expect(input).toBeFocused();await input.press('ArrowDown');await expect(first).toBeFocused();await c.page.keyboard.press('ArrowDown');await expect(second).toBeFocused();await c.page.keyboard.press('ArrowUp');await expect(first).toBeFocused();proof.screenshots.push(await snapshot(c.page,'fix-B01-03-'+field+'-keyboard'));await c.page.keyboard.press('Enter');await expect(input).toHaveValue('Aster Synthetic Place 1');await expect.poll(()=>c.page.evaluate(f=>JSON.parse(sessionStorage.getItem('rcs-data')).state[f+'Coords'],field)).toEqual({lat:28.61,lng:77.21});
    await input.focus();await expect(first).toBeVisible();await input.press('ArrowDown');await c.page.keyboard.press('Escape');await expect(input).toBeFocused();await expect(first).toBeHidden();await input.blur();await input.focus();await expect(first).toBeVisible();await input.press('Shift+Tab');await expect(first).toBeHidden();
    await done(c,{id:'P06-B01-03',field,width:1440,tabRetainsPanel:true,shiftTabWorks:true,arrowNavigation:true,enterSelectsCoordinates:true,escapeReturnsToInputAndCloses:true,outsideFocusCloses:true});
  }
  for(const width of [1440,390]){
    const c=await open({width,stage:'vehicle'}),cards=c.page.locator('button:has(h4)');await expect(cards).toHaveCount(4);await expect(c.page.getByRole('button',{name:/Hatchback/})).toHaveAttribute('aria-pressed','true');
    for(const name of ['Sedan','SUV','Premium SUV','Hatchback']){const card=cards.filter({has:c.page.getByRole('heading',{name,exact:true})});await card.focus();await c.page.keyboard.press(name==='SUV'?'Enter':'Space');await expect(card).toHaveAttribute('aria-pressed','true');await expect(c.page.locator('button:has(h4)[aria-pressed="true"]')).toHaveCount(1);await expect.poll(()=>card.evaluate(e=>e.parentElement.classList.contains('outline-2'))).toBe(true);}
    await c.page.getByRole('button',{name:/Sedan/}).click();proof.screenshots.push(await snapshot(c.page,'fix-B01-04-selection-'+width));await done(c,{id:'P06-B01-04',width,allFourCardsExposeBooleanPressed:true,exactlyOneSelected:true,keyboardEnterAndSpace:true,pointerWorks:true});
  }
  expect(proof.errors).toEqual([]);expect(proof.network.filter(r=>!['GET','HEAD','OPTIONS'].includes(r.method)&&!(r.method==='POST'&&r.path==='/api/fare/estimate'))).toEqual([]);proof.status='PASS';exitCode=0;
}catch(error){proof.status='FAIL';proof.failure=error.message;throw error;}
finally{for(const c of active){try{proof.screenshots.push(await snapshot(c.page,'fix-regression-incomplete'));}catch{}await c.context.close();}await browser.close();atomicJson(path.join(out,'P06-fixes-regression.json'),proof);recordCheck('node tools/ui-quality/p06/fixes/regression.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,issues:[...new Set(proof.checks.map(c=>c.id))]}));
