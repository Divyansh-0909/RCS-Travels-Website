import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { atomicJson } from '../handoff/core.mjs';
const common={stage:'APPROVAL_REQUIRED',themePolicy:'Legacy designed sections; account light/dark preference is measured separately',approved:false};
const issues=[
  {id:'P03-H1',route:'/',name:'Home copyright contrast',selector:'footer p:last-child',
    baseline:'Dark preference: #606067 on #121220, 2.97:1; normal text requires 4.5:1.',
    defect:'The copyright line is hard to read against the footer. This same pairing occurs on Outstation.',
    options:['Use existing non-brand muted text at full opacity; retain footer and brand colors.','Choose a different non-brand text or backing treatment.']},
  {id:'P03-H2',route:'/',name:'Carousel step touch targets',selector:'button[aria-label="Go to step 2"]',
    baseline:'Inactive dots 10 × 10px; active dot 12.5 × 12.5px. Closest safe offset 16px; minimum target/spacing test is 24px.',
    defect:'Small closely spaced step controls are difficult to tap accurately.',
    options:['Enlarge the invisible hit box to at least 24px while preserving the dots, colors and hover treatment.','Choose spacing or another hit-area treatment that preserves the composition.']},
  {id:'P03-H3',route:'/',name:'Home mobile width overflow',selector:'.landing-hero',
    baseline:'390px viewport produced a 420px full-page image/document. Hero overflow: clip with overflow-clip-margin: 30px on both axes.',
    defect:'Decorative hero scene bleeds horizontally beyond the mobile page. Transformed off-screen carousel slides also exist and must be distinguished from document overflow.',
    options:['Confine only the horizontal decorative hero overhang and preserve its vertical treatment.','Choose another page-specific clipping/treatment after reviewing the hero; no blanket body overflow rule.']},
  {id:'P03-O1',route:'/outstation',name:'Destination prompt contrast',selector:'button .leading-5',
    baseline:'Dark preference: #121220 on #262636, 1.24:1 at 18px; required 4.5:1. Light preference is measured independently.',
    defect:'“Where are you going?” is nearly invisible in dark preference. Contact booking behavior must remain phone/WhatsApp.',
    options:['Use the existing non-brand text token appropriate to the current surface; preserve branded hues.','Choose a non-brand backing or contextual treatment for this prompt.']},
  {id:'P03-O2',route:'/outstation',name:'Outstation copyright contrast',selector:'footer p:last-child',
    baseline:'Same footer pairing as P03-H1: dark preference 2.97:1 vs 4.5:1 required.',
    defect:'Review the shared footer in this separate page composition before choosing a shared treatment.',
    options:['Apply the same explicitly approved non-brand footer text treatment as H1.','Choose a separate contextual treatment while preserving the Outstation composition.']}
].map(i=>({...common,...i}));
const review={author:'CODEX',phase:'P03',at:new Date().toISOString(),status:'APPROVAL_REQUIRED',issues};
atomicJson(path.join(config.runtime,'review.json'),review);
const state=JSON.parse(fs.readFileSync(path.join(config.runtime,'state.json'),'utf8'));
atomicJson(path.join(state.run.directory,'artifacts','P03-review-queue.json'),review);
console.log('Five real issues queued; no visual fix is approved.');
