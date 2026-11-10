import path from 'node:path';
import {chromium,expect,AxeBuilder,createCase,snapshot,out,recordCheck} from './browser.mjs';
import {atomicJson} from '../../handoff/core.mjs';
const proof={phase:'P06',at:new Date().toISOString(),scope:'Five widths and both saved account preferences; /book deliberately retains LEGACY_FIXED styling. Axe is sampled separately; synthetic map fallback is not Maps/provider verification.',rows:[],network:[],errors:[],screenshots:[]};
const browser=await chromium.launch({headless:true});let exitCode=1;
try{
  for(const width of [360,390,768,1280,1440])for(const theme of ['light','dark'])for(const stage of ['route','timing','vehicle']){
    const c=await createCase(browser,{width,height:width<640?844:1000,theme,stage});
    try{
      await expect(c.page.locator('html')).toHaveAttribute('data-theme','legacy');
      const geometry=await c.page.evaluate(()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,headings:[...document.querySelectorAll('h1')].map(e=>e.textContent),targets:[...document.querySelectorAll('button,input,[role="listbox"]')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {name:(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.textContent).trim().slice(0,90),width:r.width,height:r.height,disabled:e.disabled||false,inViewport:r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};})}));
      let axe=null;
      if([390,1440].includes(width)){
        const result=await new AxeBuilder({page:c.page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
        axe={violations:result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary,any:n.any.map(a=>({id:a.id,data:a.data}))}))})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:result.passes.length};
      }
      const screenshot=await snapshot(c.page,'matrix-'+stage+'-'+width+'-'+theme);proof.screenshots.push(screenshot);
      proof.rows.push({width,savedPreference:theme,theme:'legacy',stage,status:geometry.documentWidth>geometry.width?'OVERFLOW_OBSERVED':'RENDER_OBSERVED',geometry,axe,screenshot,unexpectedErrors:c.errors});
      proof.network.push(...c.network);proof.errors.push(...c.errors);
      console.log(JSON.stringify({width,theme,stage,documentWidth:geometry.documentWidth,axe:axe?.violations.map(v=>({id:v.id,nodes:v.nodes.length}))}));
    }finally{await c.context.close();}
  }
  expect(proof.errors).toEqual([]);expect(proof.network.filter(r=>!['GET','HEAD','OPTIONS'].includes(r.method)&&!(r.method==='POST'&&r.path==='/api/fare/estimate'))).toEqual([]);
  proof.status='MATRIX_EXECUTED';exitCode=0;
}catch(error){proof.status='INCOMPLETE';proof.failure=error.message;throw error;}
finally{await browser.close();atomicJson(path.join(out,'P06-responsive-accessibility-evidence.json'),proof);recordCheck('node tools/ui-quality/p06/matrix.mjs',exitCode,proof.scope);}
console.log(JSON.stringify({status:proof.status,rows:proof.rows.length,axeSamples:proof.rows.filter(r=>r.axe).length}));
