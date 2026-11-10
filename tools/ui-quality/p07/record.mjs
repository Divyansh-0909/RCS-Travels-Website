import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fields, lists, parse, serialize, validate, summarize } from '../coverage/core.mjs';
import { issues } from './issues.mjs';
const out = 'output/handoff/P07-2026-10-29';
const read = file => JSON.parse(fs.readFileSync(file));
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const csvFile = 'tools/ui-quality/coverage/master-ui-coverage.csv', registeredFile = 'tools/ui-quality/coverage/registered-surfaces.json', issueFile = 'tools/ui-quality/coverage/issues.json';
for (const file of [issueFile]) {
  const dest = out + '/before/' + file.replaceAll('/', '__');
  if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);
}
const folder = 'https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz';
const before = parse(fs.readFileSync(out + '/before/' + csvFile.replaceAll('/', '__'), 'utf8'));
const rows = parse(fs.readFileSync(csvFile, 'utf8'));
const specs = [
  ['PARTIAL-REFUND-REFRESH', 'frontend/src/lib/paymentUi.js', 'export const paymentNeedsRefresh', 'Supported partial refund pending stops automatic refresh'],
  ['SETTLEMENT-FAILURE', 'frontend/src/components/RideSettlementPanel.jsx', 'const busy = paymentIsBusy', 'Denied cash confirmation returns to choices without failure feedback'],
  ['RECOVERED-NOTICE-FOCUS', 'frontend/src/components/ui/RefreshNotice.jsx', 'const [lastNotice', 'Successful read hides a stale notice but leaves its Dismiss tabbable'],
  ['TERMINAL-LARGE-TEXT', 'frontend/src/pages/TrackingPage.jsx', 'Driver asking extra?', 'Completed support action intercepted by receipt at 1440px and 200% root text'],
];
const newRows = specs.map(([suffix, file, token, state], index) => {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/), line = lines.findIndex(l => l.includes(token));
  assert(line >= 0, file + ' missing ' + token);
  const issue = issues[index], id = 'W.TRACKING.' + suffix;
  return { ...Object.fromEntries(fields.map(f => [f, lists.includes(f) ? [] : ''])), id, platform:'website', role:'rider', parent_id:'W.TRACKING', screen:issue.name, kind:'state_group', route:'/booking/:id', aliases:[], source_file:file, source_line:line+1, source_token:lines[line].trim(), state, theme_policy:'LEGACY_FIXED', theme_basis:'Observed actual /booking/:id fixed legacy composition under both saved preferences; not global component theme acceptance', targets:index===3?['1440','200% root text']:['390','1440'], entry_path:'Actual /booking/:id through isolated P07 read fixture; no production record', reachability:'SYNTHETIC_REACHABLE', preview_path:issue.route, preview_actor:'synthetic rider', navigation_steps:issue.steps, audit_status:'AUDITED', audit_dimensions:index===3?['responsive_render','pointer_reachability','visual_consistency']:index===2?['keyboard_controls','stale_update_recovery','accessibility','visual_consistency']:['fixture_functional','async_state_changes','visual_consistency'], issue_ids:[issue.id], issue_severity:issue.severity, owner_decision:'OWNER_REVIEW_REQUIRED', implementation_status:'NOT_CHANGED', verification_status:'FAIL', verification_levels:['SOURCE_ONLY','FIXTURE_RENDER','BROWSER_INTERACTION',...(index===2?['KEYBOARD']:[])], inventory_phase:'P07',last_review_phase:'P07', last_review_date:'2026-10-29',evidence_urls:[folder],blocker:'A reproduced defect awaits an exact owner fix choice. Audit authorization is not product-fix authorization. No aesthetic acceptance claimed.',next_action:'Review ' + issue.id + ' in the P07 live comparison board and select A or B before product implementation' };
});
for (const row of newRows) {
  const at = rows.findIndex(r => r.id === row.id); if (at >= 0) rows[at] = row; else rows.push(row);
}
const currentIssues = read(issueFile);
const registered = read(registeredFile);
const additions = issues.map((issue, index) => ({ ...issue, screenId:'W.TRACKING', childId:newRows[index].id, owner_decision:'OWNER_REVIEW_REQUIRED', implementation_status:'NOT_CHANGED',verification_status:'FAIL',baseline:'Reproduced twice with actual React renderer and local synthetic reads/denied writes; see P07 evidence. No product fix applied.',evidence_urls:[folder] }));
for (const issue of additions) {
  for (const collection of [currentIssues, registered.issues]) {
    const at=collection.findIndex(i=>i.id===issue.id); if(at>=0)collection[at]=issue;else collection.push(issue);
  }
}
for (const row of newRows) { const at = registered.surfaces.findIndex(r => r.id===row.id); if(at>=0)registered.surfaces[at]=row;else registered.surfaces.push(row); }
registered.phase = 'P07';
registered.phaseNotes = { ...(registered.phaseNotes || {}), P07:'Four bounded real child-state defects audited. All 351 predecessor rows, parent/sibling statuses and owner deferrals preserved. Item 12 ON HOLD; no product fixes or new standards approved.' };
for (const old of before) assert.deepEqual(rows.find(r=>r.id===old.id),old,'Pre-existing row changed: '+old.id);
json(issueFile,currentIssues); json(registeredFile,registered); fs.writeFileSync(csvFile,serialize(rows));
const validation=validate(rows,{issues:currentIssues,routes:read('tools/ui-quality/coverage/discovered-routes.json')});
const inventoryFile='docs/ui-quality/component-consistency-inventory.json',inventory=read(inventoryFile);
inventory.phaseAssessments = { ...(inventory.phaseAssessments || {}), P07:{ date:'2026-10-29',status:'APPROVAL_REQUIRED',scope:['W.TRACKING','W.SHARED.CUSTOMER-PAYMENT-PANEL','W.SHARED.RIDE-SETTLEMENT-PANEL','W.SHARED.CANCELLED-BOOKING-PANEL'], evidence:folder, families:[
  {id:'VC-P07-ACTIONS',semanticRole:'primary payment or recovery action',classification:'CONSISTENT',measurement:'Normal text: 48px minimum height, 16px/24px label, 12px outer radius, 12px 24px inner padding; narrow/large text expands height. White/primary computed contrast 4.68:1 in actual legacy theme.',reference:'Existing ActionControl/Button; prior owner-selected sizing preserved',scope:'Sampled advance, settlement, refund and payment failure controls; not all Button callers'},
  {id:'VC-P07-FAILURE-FEEDBACK',semanticRole:'failed customer payment attempt',classification:'CONFIRMED_INCONSISTENCY',issue:'P07-B02-02',measurement:'Advance failure has role=alert, explanation and Retry payment; denied settlement returns to unchanged enabled methods and zero alerts.',choices:['A inline announced failure and safe refresh','B adapt existing failure card'],approval:'OWNER_REVIEW_REQUIRED'},
  {id:'VC-P07-TERMINAL-CARDS',semanticRole:'paid/refund outcome',classification:'INTENTIONAL_VARIANT',measurement:'Paid and refund cards both use background-muted; paid compact radius16/padding16, cancellation outcome radius16/padding20; heading size follows terminal vs embedded hierarchy.',rationale:'Paid receipt confirms collection; refund panel distinguishes pending from processed, and must not be converted to a payment-success claim.'},
  {id:'VC-P07-RECEIPT',semanticRole:'itemized ride outcome',classification:'CONSISTENT_WITH_RESPONSIVE_DEFECT',issue:'P07-B02-04',measurement:'Read-only amount rows remain separate from action controls; completed two-column layout fails support-link reachability at 1440px/root32px.',rationale:'No fare arithmetic or policy change authorized; fix choice remains pending.'},
  {id:'VC-P07-ICONS-PILLS',semanticRole:'navigation and contextual actions',classification:'INTENTIONAL_VARIANT',measurement:'Back uses circular44px control at normal text; action buttons minimum48px. Compact Share/Ride details/support contexts differ deliberately; no new global standard selected.'},
  {id:'VC-P07-STALE-FEEDBACK',semanticRole:'read recovery notice',classification:'CONFIRMED_ACCESSIBILITY_INCONSISTENCY',issue:'P07-B02-03',measurement:'Normal focus outline measured primary rgb(48,103,253) solid2px; hidden recovered notice opacity0 still receives Tab. No broad redesign of feedback styles.'},
  {id:'VC-P07-OTHER-THEMES',semanticRole:'whole-page light/dark reconciliation',classification:'UNVERIFIED',rationale:'Tracking is legacy fixed under both saved preferences; counterpart not forced. Item12 stays ON HOLD. No Android comparison.'}
] } };
json(inventoryFile,inventory);
const protectedBefore=read(out+'/source-before.json'), allowed=[csvFile,registeredFile,inventoryFile];
const sourceChecks=protectedBefore.map(p=>({...p,after:sha(p.file),changed:sha(p.file)!==p.sha256,authorizedMetadata:allowed.includes(p.file)}));
assert(sourceChecks.every(p=>!p.changed||p.authorizedMetadata),'Unexpected protected source mutation');
const gitBefore=read(out+'/git-before.json'),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),indexFile=execFileSync('git',['rev-parse','--git-path','index'],{encoding:'utf8'}).trim();
assert.equal(head,gitBefore.head);assert.equal(sha(indexFile),gitBefore.index);
json(out+'/source-preservation.json',{status:'PASS',productionFiles:sourceChecks.filter(p=>/^(frontend|driver-app|shared)\//.test(p.file)).length,checks:sourceChecks,headUnchanged:true,indexUnchanged:true,noCommitPushMerge:true,scope:'Recorded source inputs only; does not assert every unrelated editor file was snapshotted.'});
json(out+'/tracker-validation.json',{...validation,priorRows:before.length,preservedPriorRows:before.length,addedRows:newRows.map(r=>r.id),before:summarize(before),after:summarize(rows),ownerPatternsAndChoiceRegistriesUnchanged:sourceChecks.filter(p=>/owner-approved-patterns|consistency.*decisions/.test(p.file)).every(p=>!p.changed),parentAndSiblingRowsUnchanged:true});
console.log(JSON.stringify({validation,added:newRows.map(r=>r.id),productionFilesUnchanged:sourceChecks.filter(p=>/^(frontend|driver-app|shared)\//.test(p.file)).length}));
