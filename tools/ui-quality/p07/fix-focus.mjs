import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true}),checks=[];
const out='output/handoff/P07-fixes-2026-10-29';
const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'});
await ctx.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
const page=await ctx.newPage();page.setDefaultTimeout(7000);
const notice=(message)=>page.evaluate(async message=>{const{useRefreshNotice}=await import('/src/hooks/useRefreshNotice.js');if(message)useRefreshNotice.getState().notifyRefreshFailed(message);else useRefreshNotice.getState().clearRefreshNotice();},message);
const focusDismiss=async dismiss=>{await expect(page.locator('[role="status"]').filter({has:dismiss})).not.toHaveAttribute('inert','');await dismiss.focus();await expect(dismiss).toBeFocused();};
try{
  await page.goto('http://127.0.0.1:1578/__review/p07?case=assigned');const origin=page.getByRole('button',{name:'Call driver',exact:true});await expect(origin).toBeVisible();await origin.focus();
  await notice('P07 closing focus test');const root=page.locator('[role="status"]').filter({hasText:'P07 closing focus test'});const dismiss=page.locator('button[aria-label="Dismiss"]');await expect(dismiss).toBeVisible();await focusDismiss(dismiss);await notice(null);
  await expect(root).toHaveAttribute('aria-hidden','true');await expect(root).toHaveAttribute('inert','');await expect(origin).toBeFocused();await page.keyboard.press('Tab');expect(await dismiss.evaluate(e=>e===document.activeElement)).toBe(false);
  await expect(root).toHaveCount(0);checks.push({case:'normal-motion-exit-is-inert-before-unmount',status:'PASS'});
  await origin.focus();await notice('P07 replacement A');await expect(dismiss).toBeVisible();await notice(null);await page.waitForTimeout(100);await notice('P07 replacement B');await page.waitForTimeout(350);await expect(page.getByText('P07 replacement B',{exact:true})).toBeVisible();await expect(dismiss).toBeVisible();await notice(null);await expect(dismiss).toHaveCount(0);checks.push({case:'replacement-during-exit-survives-old-timer',status:'PASS'});
  await origin.focus();await notice('P07 fallback focus');await expect(dismiss).toBeVisible();await focusDismiss(dismiss);
  await page.evaluate(()=>{window.__p07FocusTrail=[];const focus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(...args){const result=focus.apply(this,args);window.__p07FocusTrail.push({target:this.tagName,id:this.id,label:this.getAttribute('aria-label'),disabled:this.disabled,active:document.activeElement?.tagName,activeId:document.activeElement?.id});return result;};});
  await origin.evaluate(e=>{e.disabled=true;});await notice(null);await expect(dismiss).toHaveCount(0);
  const fallback=await page.evaluate(()=>{const expected=document.querySelector('main')??document.getElementById('root');return{focused:document.activeElement===expected,expected:expected?.tagName,active:document.activeElement?.tagName,tabindex:expected?.getAttribute('tabindex'),trail:window.__p07FocusTrail};});
  checks.push({case:'disabled-focus-origin-uses-page-fallback-without-permanent-tabindex',fallback});expect(fallback.focused).toBe(true);expect(fallback.tabindex).toBe('-1');await page.keyboard.press('Tab');expect(await page.locator('#root').getAttribute('tabindex')).toBe(null);checks.at(-1).status='PASS';
  for(const route of ['/','/outstation','/book']){await page.goto('http://127.0.0.1:1578'+route);await expect(page.locator('#root')).not.toBeEmpty();await notice('P07 caller '+route);await expect(page.getByText('P07 caller '+route,{exact:true})).toBeVisible();await notice(null);await expect(dismiss).toHaveCount(0);checks.push({case:'shared-mount-cascade',route,status:'PASS',scope:'Notice lifecycle only; no page redesign or booking action'});}
}finally{await browser.close();fs.writeFileSync(out+'/focus-exit.json',JSON.stringify({checks},null,2));}
console.log(JSON.stringify({checks:checks.length}));
