import fs from 'node:fs';
import { issues } from './issues.mjs';
const file = 'tools/ui-quality/p07/board.html';
const current = JSON.parse(fs.readFileSync('tools/ui-quality/coverage/issues.json', 'utf8'));
const followups = {
  'P07-B02-02': { defect: 'Fixed02A: a denied confirmation now shows an announced Payment not confirmed message and a read-only Refresh payment status action. Payment choices stay visible. Click Pay with cash in the synthetic example to see it; no payment is accepted.', steps: ['Open completed ride', 'Click Pay with cash: the fixture denies it', 'Read the inline failure and refresh payment status', 'Compare the existing advance-payment failure presentation'] },
  'P07-B02-03': { defect: 'Fixed03A: a recovered notice becomes inert during exit and is removed after the animation. Focus returns to its prior control when appropriate. A replacement notice survives the previous exit timer.', steps: ['Wait two poll cycles (~10 seconds)', 'The failed middle read raises a stale notice; the next read recovers', 'The notice exits and unmounts', 'Tab through the page: there is no invisible Dismiss stop'] },
  'P07-B02-04': { defect: 'Fixed04A: the support row wraps within its column and remains clickable at1440px/200% text. The completed panel scrolls when the failure message and enlarged text need more height. Columns and receipt semantics stay the same.', steps: ['Choose Laptop1440px', 'Observed/current example uses200% text; reference uses normal text', 'Scroll if needed and activate Contact support (intercepted locally)', 'Click Pay with cash to check the large-text failure presentation too'] },
};
const display = issues.map(issue => {
  const record = current.find(i => i.id === issue.id);
  if(record?.owner_decision==='OWNER_DEFERRED')return{...issue,name:'Deferred · '+issue.name,defect:issue.defect+' The owner has postponed the shared WebSocket channel. This defect remains unresolved; no alternative polling change is approved.',reviewNote:'Owner deferred the shared WebSocket channel.01 remains an unresolved FAIL.02A/03A/04A are implemented and verified. Item12 is open for visual review only.'};
  if (record?.status !== 'VERIFIED') return { ...issue, defect: issue.defect + ' Owner is discussing WebSocket costs and delivery design; no polling or WebSocket change is implemented.', reviewNote: '01 remains unresolved. Transport design is under discussion; the original audit options are unapproved.02A,03A and04A are already implemented. Item12 stays on hold.' };
  const titles = { 'P07-B02-02': 'Payment failure feedback', 'P07-B02-03': 'Notice focus cleanup', 'P07-B02-04': 'Support link with enlarged text' };
  return { ...issue, ...followups[issue.id], name: 'Fixed · ' + (titles[issue.id] ?? issue.name), source: record.fixSource ?? issue.source, choices: issue.choices.map(c => ({ ...c, label: (c.id === record.ownerChoice ? 'Approved and implemented · ' : 'Not selected · ') + c.label })), reviewNote: 'Owner-approved A is implemented and technically verified. Review the current app against its reference; the original before evidence is in the P07 Drive archive. No new implementation approval is requested for this fix. Item12 stays on hold.' };
});
let html = fs.readFileSync(file, 'utf8');
html = html.replace(/<script id="p07-issues" type="application\/json">[\s\S]*?<\/script>/, '');
html = html.replace('<script>\nconst byId', '<script id="p07-issues" type="application/json">' + JSON.stringify(display).replaceAll('<', '\\u003c') + '</script><script>\nconst byId');
html = html.replace("fetch('/p07/issues.json').then(r=>r.json())", "Promise.resolve(JSON.parse(byId('p07-issues').textContent))");
html = html.replace('<p class="foot muted">Choose the issue IDs and option letters in the chat after reviewing. Product changes need those exact choices. Item 12 stays on hold.</p>', '<p id="decision-note" class="foot muted"></p>');
html = html.replace("byId('source').textContent=item.source;", "byId('source').textContent=item.source;byId('decision-note').textContent=item.reviewNote||'Original P07 audit options';");
html = html.replace('Observed behavior</h2>', 'Current app</h2>');
html = html.replace(/<p class="notice muted">[^<]+<\/p>/, '<p class="notice muted">Synthetic data · Writes denied ·02A/03A/04A verified ·01 under discussion.</p>');
html = html.replace('Open the existing issue reviewer', 'Original audit queue');
fs.writeFileSync(file, html);
