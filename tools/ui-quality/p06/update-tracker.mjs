import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {issues as findings} from './issues.mjs';import {parse} from '../coverage/core.mjs';import {readJson,atomicJson,hash} from '../../handoff/core.mjs';
const run=readJson('output/handoff/state.json').run;assert.equal(run.phase,'P06');
const receipt=readJson(path.join(run.directory,'publication.json')),out=path.join(run.directory,'artifacts');
const names=['P06-functional-evidence.json','P06-responsive-accessibility-evidence.json','P06-control-evidence.json','P06-viewer-verification.json'];
const links=names.map(name=>{const file=receipt.artifacts.find(a=>a.name===name);assert(file&&file.sha256===hash(fs.readFileSync(path.join(out,name))),'Verified evidence required: '+name);return file.url;});
const baseline=parse(fs.readFileSync(path.join(run.directory,'coverage-before.csv'),'utf8')),byId=new Map(baseline.map(r=>[r.id,r]));
const specs={
  'P06-B01-01':{id:'W.BOOKING.ROUTE.ASYNC-SUGGESTIONS',file:'frontend/src/pages/OnBoarding.jsx',token:'const timer = setTimeout(async () => {',state:'In-flight Alpha autocomplete response completes after Beta response'},
  'P06-B01-02':{id:'W.BOOKING.TIMING.MIDNIGHT-DEFAULT',file:'frontend/src/components/ui/DateTimeSelector.jsx',token:'const [date, setDate] = React.useState',state:'Default date/time at simulated 23:50 Asia/Kolkata'},
  'P06-B01-03':{id:'W.BOOKING.ROUTE.KEYBOARD-SUGGESTIONS',file:'frontend/src/pages/OnBoarding.jsx',token:'function onBlur() {',state:'Desktop keyboard Tab from pickup while suggestions are visible'},
  'P06-B01-04':{id:'W.BOOKING.VEHICLES.SELECTED-STATE',file:'frontend/src/pages/VehicleSelect.jsx',token:'onClick={() => setVehicleClass(cls)}',state:'Sedan selected by keyboard; visual outline and accessible state compared'},
};
const dims=['fixture_functional','keyboard_controls','responsive_render','horizontal_overflow','sampled_axe_wcag22'];
const updates=findings.reduce((map,issue)=>{const row=map.get(issue.screenId)||{...byId.get(issue.screenId),audit_status:'AUDITED',audit_dimensions:dims,issue_ids:[],owner_decision:'OWNER_REVIEW_REQUIRED',implementation_status:'NOT_CHANGED',verification_status:'FAIL',verification_levels:['BROWSER_INTERACTION','KEYBOARD','AXE'],last_review_phase:'P06',last_review_date:'2026-10-23',evidence_urls:links,preview_path:'/book',reachability:'SYNTHETIC_REACHABLE',blocker:'P06 uses synthetic places/quote responses and no Maps provider. Broader live eligibility/pricing, booking and child-state acceptance are not established; use the specific issue links for state replay.',next_action:'Inspect the real P06 issue replay and explicitly approve a bounded treatment or defer'};row.issue_ids.push(issue.id);row.issue_severity=issue.severity==='MEDIUM'?'MEDIUM':row.issue_severity==='MEDIUM'?'MEDIUM':'LOW';map.set(issue.screenId,row);return map;},new Map());
const surfaces=findings.map(issue=>{
  const spec=specs[issue.id],lines=fs.readFileSync(spec.file,'utf8').split(/\r?\n/),index=lines.findIndex(l=>l.includes(spec.token));assert(index>=0);
  const keyboard=issue.id!=='P06-B01-01',desktopOnly=issue.id==='P06-B01-03';
  return {...updates.get(issue.screenId),id:spec.id,parent_id:issue.screenId,screen:issue.name,kind:'state_group',state:spec.state,source_file:spec.file,source_line:index+1,source_token:lines[index].trim().slice(0,180),issue_ids:[issue.id],issue_severity:issue.severity,inventory_phase:'P06',audit_dimensions:['fixture_functional',...(keyboard?['keyboard_controls']:[]),...(desktopOnly?[]:['responsive_render']),...(issue.id==='P06-B01-04'?['accessible_selected_state']:[])],verification_levels:['BROWSER_INTERACTION',...(keyboard?['KEYBOARD']:[])],targets:desktopOnly?['1440']:['390','1440'],navigation_steps:[issue.manualEntry,...issue.steps],entry_path:'Actual /book → '+issue.screenId+' → '+spec.state};
});
atomicJson('tools/ui-quality/coverage/registered-surfaces.json',{phase:'P06',surfaces,updates:[...updates.values()],issues:findings.map(issue=>({...issue,childId:specs[issue.id].id,description:issue.defect,owner_decision:'OWNER_REVIEW_REQUIRED',implementation_status:'NOT_CHANGED',verification_status:'FAIL',evidence_urls:links}))});
console.log(JSON.stringify({registeredSourceCases:surfaces.length,explicitlyAuditedParents:updates.size,verifiedEvidenceLinks:links.length}));
