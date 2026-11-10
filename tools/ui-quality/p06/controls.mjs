import path from 'node:path';
import {chromium,expect,createCase,snapshot,out,recordCheck} from './browser.mjs';
import {atomicJson} from '../../handoff/core.mjs';
const proof={phase:'P06',at:new Date().toISOString(),scope:'Bounded real interaction controls and injected service failures; no booking submission',checks:[],network:[],screenshots:[],errors:[]};
const browser=await chromium.launch({headless:true});let exitCode=1;
async function done(c,check){proof.checks.push({...check,status:'PASS'});proof.network.push(...c.network);proof.errors.push(...c.errors);await c.context.close();}
try{
  for(const [scenario,heading]of [['empty','No matching places'],['lookup-error','Suggestions unavailable']]){
    const c=await createCase(browser,{scenario});await c.page.locator('#pickup-location').fill('Aster');await expect(c.page.getByRole('heading',{name:heading,exact:true})).toBeVisible();proof.screenshots.push(await snapshot(c.page,'control-'+scenario));await done(c,{name:scenario,visibleRecoveryMessage:heading});
  }
  {
    const c=await createCase(browser);await expect(c.page.getByRole('button',{name:'Set date & time',exact:true})).toBeDisabled();
    await c.page.locator('#pickup-location').fill('Aster');await c.page.getByRole('button',{name:/Aster Synthetic Place 1/}).click();
    await c.page.locator('#drop-location').fill('Birch');await c.page.getByRole('button',{name:/Birch Synthetic Place 1/}).click();
    await expect.poll(()=>c.page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('rcs-data')).state;return {pickupCoords:s.pickupCoords,dropCoords:s.dropCoords};})).toEqual({pickupCoords:{lat:28.61,lng:77.21},dropCoords:{lat:28.64,lng:77.25}});
    const stored=await c.page.evaluate(()=>JSON.parse(sessionStorage.getItem('rcs-data')).state);expect(stored.pickupCoords).toEqual({lat:28.61,lng:77.21});expect(stored.dropCoords).toEqual({lat:28.64,lng:77.25});
    await c.page.reload();await expect(c.page.locator('#pickup-location')).toHaveValue(/Aster/);await expect(c.page.locator('#drop-location')).toHaveValue(/Birch/);
    await c.page.getByRole('button',{name:'Clear pickup location',exact:true}).click();await expect(c.page.locator('#pickup-location')).toHaveValue('');await expect(c.page.getByRole('button',{name:'Set date & time',exact:true})).toBeDisabled();
    await done(c,{name:'Missing fields, pointer suggestion selection, coordinates, per-tab refresh persistence and clear invalidation',stored});
  }
  {
    const c=await createCase(browser,{stage:'timing',clock:'2026-10-23T23:50:00+05:30',guest:true});
    const days=c.page.getByRole('listbox',{name:'Available booking days',exact:true});await days.focus();await c.page.keyboard.press('ArrowDown');await expect(c.page.getByRole('button',{name:'See prices',exact:true})).toBeEnabled();
    await c.page.getByRole('button',{name:'Back to route details',exact:true}).click();await expect(c.page.locator('#pickup-location')).toHaveValue(/Aster/);
    await done(c,{name:'Keyboard day wheel, midnight manual recovery and return to route details',recovery:'Select tomorrow through ArrowDown'});
  }
  {
    const c=await createCase(browser,{stage:'vehicle',scenario:'estimate-error'});await expect(c.page.getByText('Synthetic quote service unavailable',{exact:true})).toBeVisible();await expect(c.page.getByRole('button',{name:'Book ride',exact:true})).toHaveCount(0);await expect(c.page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();proof.screenshots.push(await snapshot(c.page,'control-quote-error'));await done(c,{name:'Quote service HTTP503 recovery state',bookFormHiddenWithoutFare:true});
  }
  {
    const c=await createCase(browser,{stage:'prepared',scenario:'estimate-slow'}),cta=c.page.locator('button[form="route-details-form"]');let estimates=0;
    c.page.on('request',r=>{if(new URL(r.url()).pathname==='/api/fare/estimate')estimates++;});
    await cta.dblclick();await expect(cta).toBeDisabled();await expect(c.page.getByRole('button',{name:/Hatchback/})).toBeVisible({timeout:30000});expect(estimates).toBe(1);
    await c.page.goBack();await expect(c.page.locator('#pickup-location')).toHaveValue(/Aster/);await expect(c.page.locator('#drop-location')).toHaveValue(/Birch/);
    await done(c,{name:'Slow estimate, rapid double action and browser back',estimates,routePreserved:true});
  }
  expect(proof.errors).toEqual([]);expect(proof.network.filter(r=>!['GET','HEAD','OPTIONS'].includes(r.method)&&!(r.method==='POST'&&r.path==='/api/fare/estimate'))).toEqual([]);proof.status='PASS';exitCode=0;
}catch(error){proof.status='INCOMPLETE';proof.failure=error.message;throw error;}
finally{await browser.close();atomicJson(path.join(out,'P06-control-evidence.json'),proof);recordCheck('node tools/ui-quality/p06/controls.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length}));
