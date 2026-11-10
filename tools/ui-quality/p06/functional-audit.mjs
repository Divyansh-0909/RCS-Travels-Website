import fs from 'node:fs';import path from 'node:path';
import {chromium,expect,createCase,snapshot,out,recordCheck} from './browser.mjs';
import {atomicJson} from '../../handoff/core.mjs';
const proof={phase:'P06',at:new Date().toISOString(),scope:'Actual /book route/timing/vehicle renderer with read-only synthetic place/quote fixtures; reproduction success is not product correctness',findings:[],controls:[],network:[],external:[],errors:[],screenshots:[]};
const browser=await chromium.launch({headless:true});let exitCode=1;
const active=new Set();async function open(options){const c=await createCase(browser,options);active.add(c);return c;}
async function close(c){proof.network.push(...c.network);proof.external.push(...c.external);proof.errors.push(...c.errors);active.delete(c);await c.context.close();}
try{
  for(const width of [1440,390]){
    const c=await open({width,scenario:'race'}),input=c.page.locator('#pickup-location');
    const oldRequest=c.page.waitForRequest(r=>new URL(r.url()).searchParams.get('input')==='Alpha');
    const oldResponse=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Alpha');
    await input.fill('Alpha');await oldRequest;
    const newResponse=c.page.waitForResponse(r=>new URL(r.url()).searchParams.get('input')==='Beta');
    await input.fill('Beta');await newResponse;await expect(c.page.getByRole('button',{name:/Beta Synthetic Place 1/})).toBeVisible();
    await oldResponse;await expect(c.page.getByRole('button',{name:/Alpha Synthetic Place 1/})).toBeVisible();await expect(input).toHaveValue('Beta');
    const screenshot=await snapshot(c.page,'B01-01-race-'+width);proof.screenshots.push(screenshot);
    proof.findings.push({id:'P06-B01-01',screen:'W.BOOKING.ROUTE',width,savedPreference:'light',theme:'legacy',result:'FAIL_REPRODUCED',input:await input.inputValue(),staleVisible:'Alpha Synthetic Place 1',newResponseBeforeOld:true,screenshot});await close(c);
  }
  for(const width of [1440,390]){
    const c=await open({width,stage:'timing',clock:'2026-10-23T23:50:00+05:30',guest:true});
    await expect(c.page.getByRole('button',{name:'See prices',exact:true})).toBeDisabled();
    const selections=await c.page.locator('[role="listbox"]').evaluateAll(list=>list.map(e=>({label:e.getAttribute('aria-label'),selected:[...e.querySelectorAll('[aria-selected="true"]')].map(x=>x.textContent)})));
    expect(selections.some(s=>s.selected.includes('Today'))).toBe(true);
    const screenshot=await snapshot(c.page,'B01-02-midnight-'+width);proof.screenshots.push(screenshot);
    proof.findings.push({id:'P06-B01-02',screen:'W.BOOKING.TIMING',width,savedPreference:'light',theme:'legacy',result:'FAIL_REPRODUCED',clock:'2026-10-23 23:50 Asia/Kolkata',selections,seePricesDisabled:true,guestPublicRoute:true,screenshot});await close(c);
  }
  {
    const c=await open({stage:'timing',clock:'2026-10-23T23:00:00+05:30',guest:true});await expect(c.page.getByRole('button',{name:'See prices',exact:true})).toBeEnabled();proof.controls.push({name:'Normal 23:00 scheduler default',status:'PASS',validDefault:true});await close(c);
  }
  for(let repeat=0;repeat<2;repeat++){
    const c=await open(),input=c.page.locator('#pickup-location');await input.fill('Aster');
    await expect(c.page.getByRole('button',{name:/Aster Synthetic Place 1/})).toBeVisible();await input.focus();await c.page.keyboard.press('Tab');
    await expect(c.page.getByRole('button',{name:/Aster Synthetic Place 1/})).toBeHidden();
    const focused=await c.page.evaluate(()=>({tag:document.activeElement.tagName,name:document.activeElement.getAttribute('aria-label'),text:document.activeElement.textContent}));
    const screenshot=await snapshot(c.page,'B01-03-keyboard-'+repeat);proof.screenshots.push(screenshot);
    proof.findings.push({id:'P06-B01-03',screen:'W.BOOKING.ROUTE',width:1440,savedPreference:'light',theme:'legacy',result:'FAIL_REPRODUCED',repeat,action:'Tab from populated pickup while suggestions are visible',focused,suggestionDismissed:true,screenshot});await close(c);
  }
  for(const width of [1440,390]){
    const c=await open({width,stage:'vehicle'}),sedan=c.page.getByRole('button',{name:/Sedan/});await sedan.focus();await c.page.keyboard.press('Space');
    await expect.poll(()=>sedan.evaluate(e=>e.parentElement.classList.contains('outline-2'))).toBe(true);
    const cards=await c.page.locator('button:has(h4)').evaluateAll(list=>list.map(e=>({name:e.querySelector('h4').textContent,pressed:e.getAttribute('aria-pressed'),checked:e.getAttribute('aria-checked'),current:e.getAttribute('aria-current'),role:e.getAttribute('role'),visualSelected:e.parentElement.classList.contains('outline-2')})));
    expect(cards.length).toBe(4);expect(cards.filter(c=>c.visualSelected).map(c=>c.name)).toEqual(['Sedan']);expect(cards.every(c=>c.pressed===null&&c.checked===null&&c.current===null&&c.role===null)).toBe(true);
    const screenshot=await snapshot(c.page,'B01-04-selection-'+width);proof.screenshots.push(screenshot);
    proof.findings.push({id:'P06-B01-04',screen:'W.BOOKING.VEHICLES',width,savedPreference:'light',theme:'legacy',result:'FAIL_REPRODUCED',cards,keyboardSelectionWorks:true,selectionNotProgrammaticallyExposed:true,screenshot});await close(c);
  }
  expect(proof.network.filter(r=>!['GET','HEAD','OPTIONS'].includes(r.method)&&!(r.method==='POST'&&r.path==='/api/fare/estimate'))).toEqual([]);
  expect(proof.errors).toEqual([]);proof.status='AUDIT_REPRODUCTIONS_COMPLETE';proof.productStatus='FOUR_UNFIXED_FINDINGS_FOR_OWNER_REVIEW';exitCode=0;
}catch(error){proof.status='INCOMPLETE';proof.failure=error.message;throw error;}
finally{for(const c of active){if(proof.status==='INCOMPLETE')try{await snapshot(c.page,'functional-incomplete');}catch{}await close(c);}await browser.close();atomicJson(path.join(out,'P06-functional-evidence.json'),proof);recordCheck('node tools/ui-quality/p06/functional-audit.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,reproductions:proof.findings.length,controls:proof.controls.length,unexpectedErrors:proof.errors.length}));
