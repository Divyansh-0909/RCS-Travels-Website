import fs from 'node:fs';import path from 'node:path';
import {chromium,expect,out,contextFor} from './browser.mjs';import {families,batch} from './catalog.mjs';import {atomicJson} from '../../handoff/core.mjs';
const browser=await chromium.launch({headless:true}),samples=[],attempts=[];
try{
  for(const family of families)for(const occurrence of family.occurrences)for(const width of [390,1440])for(const theme of ['light','dark']){
    const {context,external,network}=await contextFor(browser,{width,height:width===390?844:900,theme}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const name=occurrence.id+'-'+width+'-'+theme;
    try{
      await page.goto('http://127.0.0.1:1575/__review/consistency?occurrence='+occurrence.id+'&theme='+theme,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(id=>window.__RCS_CONSISTENCY_MEASUREMENT__?.id===id,occurrence.id,{timeout:65000});
      const measurement=await page.evaluate(()=>window.__RCS_CONSISTENCY_MEASUREMENT__);
      expect(measurement.rect.width).toBeGreaterThan(0);expect(measurement.rect.height).toBeGreaterThan(0);expect(measurement.preference).toBe(theme);
      const screenshot=name+'.png';await page.screenshot({path:path.join(out,screenshot),fullPage:true});
      const focus=await page.evaluate(async()=>{const element=window.__RCS_CONSISTENCY_TARGET__();element.focus();return {focused:document.activeElement===element,outline:getComputedStyle(element).outline,border:getComputedStyle(element).border,focusVisible:element.matches(':focus-visible')};});
      expect(focus.focused).toBe(true);
      const sample={id:occurrence.id,familyId:family.id,screenId:occurrence.screenId,route:page.url().replace('http://127.0.0.1:1575',''),measurement,focus,screenshot,network,external,errors,status:'OBSERVED'};samples.push(sample);
      console.log(JSON.stringify({sample:name,height:measurement.rect.height,font:measurement.font.renderedSizeEstimate,radius:measurement.shell.radius,overflow:measurement.horizontalOverflow,errors:errors.length}));
    }catch(error){attempts.push({sample:name,error:error.message,network,external,errors});atomicJson(path.join(out,'capture-attempts.json'),attempts);throw error;}
    finally{await context.close();}
    atomicJson(path.join(out,'measurements.json'),{batch,at:new Date().toISOString(),status:'PARTIAL',samples,limitations:['Synthetic prices/places; no Maps or booking writes','Programmatic focus observation is separate from full keyboard/accessibility acceptance','Only eight listed occurrences, not full screen or whole-app consistency coverage']});
  }
  atomicJson(path.join(out,'measurements.json'),{batch,at:new Date().toISOString(),status:'OBSERVED_BOUNDED',samples,attempts,limitations:['Synthetic prices/places; no Maps or booking writes','Programmatic focus observation is separate from full keyboard/accessibility acceptance','Booking LEGACY_FIXED; saved preferences do not establish two booking themes','Only eight listed occurrences; Android and the rest of the canonical tracker are not audited']});
}finally{await browser.close();}
