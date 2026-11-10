import path from 'node:path';
import {chromium,expect,createCase,out,recordCheck} from './browser.mjs';
import {atomicJson} from '../../handoff/core.mjs';
const proof={phase:'P06',at:new Date().toISOString(),scope:'Additional real-renderer lead-time and date-wheel bounds; same-point observation is not a policy verdict',checks:[],network:[],errors:[]};
const browser=await chromium.launch({headless:true});let exitCode=1;
try{
  {
    const c=await createCase(browser,{stage:'timing',clock:'2026-10-23T12:00:00+05:30',guest:true});
    const action=c.page.getByRole('button',{name:'See prices',exact:true}),wheels=c.page.getByRole('listbox');
    await expect(action).toBeEnabled();const initial=await wheels.evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),selected:e.getAttribute('aria-activedescendant')})));
    await wheels.nth(2).press('ArrowUp');await expect(action).toBeDisabled();
    await wheels.nth(2).press('ArrowDown');await expect(action).toBeEnabled();
    await wheels.first().press('ArrowUp');await expect(action).toBeEnabled();
    for(let i=0;i<6;i++)await wheels.first().press('ArrowDown');
    const end=await wheels.first().getAttribute('aria-activedescendant');await wheels.first().press('ArrowDown');expect(await wheels.first().getAttribute('aria-activedescendant')).toBe(end);await expect(action).toBeEnabled();
    proof.checks.push({name:'Lead time and visible day-wheel bounds',status:'PASS',clock:'2026-10-23T12:00:00+05:30',initial,observed:'Today 12:30 valid; minute ArrowUp to 12:15 disabled; return to 12:30 enabled; day index clamps to 0..6',policyLimit:'Source validator permits through day +7 end-of-day; UI exposes today..+6. Intended inclusive day-window interpretation was not resolved or changed.'});
    proof.network.push(...c.network);proof.errors.push(...c.errors);await c.context.close();
  }
  {
    const c=await createCase(browser);
    for(const selector of ['#pickup-location','#drop-location']){await c.page.locator(selector).fill('Aster');await c.page.getByRole('button',{name:/Aster Synthetic Place 1/}).click();}
    await expect.poll(()=>c.page.evaluate(()=>JSON.parse(sessionStorage.getItem('rcs-data')).state.dropCoords)).not.toBeNull();
    const fields=await c.page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('rcs-data')).state;return {pickup:s.pickupLocation,drop:s.dropLocation,pickupCoords:s.pickupCoords,dropCoords:s.dropCoords};});
    expect(fields.pickupCoords).toEqual(fields.dropCoords);
    const action=c.page.getByRole('button',{name:'Set date & time',exact:true});await expect(action).toBeEnabled();await action.click();await expect(c.page.getByRole('heading',{name:'Set date and time',exact:true})).toBeVisible();
    proof.checks.push({name:'Same-point route entry',status:'OBSERVED_UNCLASSIFIED',fields,observed:'Same selected synthetic place can enter the timing step. No quote or booking submitted for this case.',limit:'No backend/provider same-point business decision is established by this in-memory fixture; not classified as a confirmed product defect.'});
    proof.network.push(...c.network);proof.errors.push(...c.errors);await c.context.close();
  }
  expect(proof.errors).toEqual([]);expect(proof.network.some(r=>r.method==='POST')).toBe(false);proof.status='PASS';exitCode=0;
}catch(error){proof.status='INCOMPLETE';proof.failure=error.message;throw error;}
finally{await browser.close();atomicJson(path.join(out,'P06-boundary-evidence.json'),proof);recordCheck('node tools/ui-quality/p06/boundaries.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length}));
