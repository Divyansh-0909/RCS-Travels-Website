import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const out='output/handoff/P07-fixes-2026-10-29';
const read=n=>JSON.parse(fs.readFileSync(out+'/'+n+'.json'));
const report='docs/ui-quality/P07-approved-fixes-02-04-2026-10-29.md';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const source=read('source-preservation'),tracker=read('tracker-validation'),reg=read('regression'),focus=read('focus-exit'),recheck=read('notice-recheck');
assert.equal(reg.checks.length,48);assert.equal(focus.checks.length,6);assert.equal(recheck.checks.length,5);assert.equal(reg.errors.length,0);assert.equal(recheck.errors.length,0);
const content=`# P07 — Approved fixes02A,03A and04A

29 October 2026 IST. **02A/03A/04A IMPLEMENTED AND TECHNICALLY VERIFIED. P07 remains PARTIAL because01 is unresolved.**

The owner explicitly selected the recommended treatments for the three findings in this chat. For01, the owner asked whether five-second polling could overload the server and whether WebSockets cost money; that discussion is not recorded as approval of a transport implementation. No polling, WebSocket, payment API, auth or provider code was changed.

[Current live comparison](http://127.0.0.1:4317/p07?issue=P07-B02-02&width=390) · [Follow-up evidence folder](https://drive.google.com/drive/folders/1h1mgl7VDO8yKKJH4DqWxpta-iU9O6Avk). Original P07 reports, failure screenshots and the frozen audit archive remain historical evidence.

## Implemented behavior

| Finding | Approved change | Verified boundary |
|---|---|---|
| P07-B02-02 — settlement failure feedback | An inline role=alert says Payment not confirmed and explains that status should be refreshed before trying again. Existing payment choices remain. Refresh payment status uses the existing authenticated GET/poll path; it never submits a payment. During that read, actions disable. A paid read replaces the failure with the paid presentation. Hindi/Hinglish translations are additive. | Denied cash confirmation and UPI order; pending/paid/failed refresh outcomes; duplicate click while busy; mobile/desktop. No raw backend error, failed-charge claim or promise that cash was collected. |
| P07-B02-03 — invisible notice focus | A closing notice is immediately inert/aria-hidden, then unmounts after its existing300ms exit. Reduced motion removes the wait. Auto-expiry, close, recovery and Retry all remove the hidden descendants. Focus returns only if the notice owned it; an unavailable origin uses the page fallback, whose temporary tabindex=-1 is removed on blur. New notices cancel older exit timers. | Normal/reduced motion, actual focus entry, auto-expiry, retry once, replacement during exit, unrelated focus preserved and unavailable origin. The same global mount was exercised on tracking, Account, Safety, Settings, Home, Outstation and booking; these are notice-lifecycle checks, not full caller audits. |
| P07-B02-04 — enlarged-text support link | Only tracking's support NoticePill wraps. Completed columns can shrink, and tall completed content scrolls from a reachable top instead of centering a tall error panel above the viewport. Desktop columns and financial semantics stay the same. | Actual native click actionability and centre hit tests at320/360/390/768/1280/1440px, normal and200% root text, idle and failed settlement. Hindi320 and Hinglish390/enlarged text also checked. |

The live board labels these three fixes as implemented, preserves references and distinguishes the unresolved01. The already-running main issue queue is the original audit snapshot; use /p07 for current follow-up status. No second implementation approval is requested for02A/03A/04A. Final owner pixel inspection is separate from technical checks.

## Validation and evidence

| Command/evidence | Result |
|---|---|
| node tools/ui-quality/p07/fixes.mjs | Exit0;48 browser records, including12 repeated settlement outcome checks, UPI denial,28 responsive state/config checks,2 scoped axe runs and shared notice checks. Zero page errors or React prop warnings. |
| P07_FIX_SCOPE=notice, P07_FIX_RESULT=notice-recheck.json; node tools/ui-quality/p07/fixes.mjs | Exit0;5 final notice/cascade records after strengthening focus-entry assertions; normal and reduced motion auto-expiry included. These repeat the notice scope rather than increasing the48-record denominator. |
| node tools/ui-quality/p07/fix-focus.mjs | Exit0;6 targeted exit/fallback/cascade checks; focus really enters the notice after inert is removed. |
| node tools/ui-quality/p07/fix-board.mjs | Exit0;3 host/screen combinations, updated fixed labels, actual denied-write failure message, safe refresh control,01 pending and no host document overflow. |
| node --test frontend/tests/paymentUi.test.js frontend/tests/cancelledAdvanceSummary.test.js frontend/tests/bookingReadSafety.test.js | Exit0;25/25 PASS. |
| node --test tools/ui-quality/p07/fixture.test.mjs | Exit0;4/4 PASS; finite allowlist, all product writes denied409, local actor and provider/contact interception. |
| node --test tools/ui-quality/coverage/coverage.test.mjs tools/ui-quality/consistency/consistency.test.mjs tools/ui-quality/consistency/audit-compare.test.mjs | Exit0;19/19 PASS; canonical/source/status/choice boundaries. |
| npm --prefix frontend run build | Exit0; final build7.06s; existing large-bundle advisory retained. |
| node tools/ui-quality/p07/fix-record.mjs | Exit0;355 source traces, zero duplicate/orphan IDs, no missing discovered routes, CSV round trip. |

Two new scoped axe scans at390/1440 in the failed-settlement state returned zero violations. Actual 200% root text is a browser stress test, not certification of native keyboards/safe areas or every OS/browser zoom combination. Provider checkout, real payment/refund/ledger success and spoken assistive technology were NOT_RUN. Source-defined receipt/fare/refund policy is preserved. Backend and captain suites were NOT_RUN because neither surface changed.

Visual inspection caught tall enlarged-text failure content initially reaching above the viewport; completed-panel scrolling was corrected and the full responsive sweep repeated. Top and support-action screenshots show both ends remain reachable. The first paid-result assertion selected the hidden desktop twin on mobile (exit1); the corrected selector targets the visible occurrence. Initial fallback probes tried to focus the notice before its entrance had removed inert (exit1); final probes explicitly assert real focus entry and verify focus restoration and fallback cleanup. Attempt records remain in the follow-up output. A scoped ESLint command returned exit1 because this checkout has no frontend eslint.config file for its installed ESLint9; no lint PASS is claimed and no unrelated lint configuration was introduced.

## Preservation and tracker

Exactly5 recorded product files changed: TrackingPage.jsx, RideSettlementPanel.jsx, RefreshNotice.jsx and the two Hindi/Hinglish websiteCopy catalogues. All other299 of304 recorded frontend/driver/shared inputs are byte-identical. Existing translation entries are identical; each catalogue adds only3 keys. HEAD and staged-index hashes remain unchanged. This preserves the dirty working tree within the recorded inventory, not every unrelated editor file.

All355 stable tracker IDs and parents remain. Three bounded child states change from FAIL/OWNER_REVIEW_REQUIRED/NOT_CHANGED to VERIFIED/APPROVED_FOR_FIX/VERIFIED, with the original FAIL baseline kept in fixHistory and snapshots. Six unchanged source anchors are relocated through exact-line matching. Parent/sibling audit and verification statuses remain unchanged;01 stays FAIL/OWNER_REVIEW_REQUIRED/NOT_CHANGED. No global visual standard is invented: the original owner-pattern and choice registries remain unchanged, and component consistency receives an additive follow-up assessment.

Item03 Account backdrop repair remains accepted in its original scope. Item12 stays ON HOLD without a new approval request. P03 Home/Outstation KEEP CURRENT, P04 native outcomes, P06 fixes and approved inputs/buttons/focus/spacing remain protected. No P08, provisioning, customer/provider operation, commit, push, merge or deployment.

## Issue01 — transport discussion remains open

Current tracking uses a five-second status GET; the partial pending disposition is still missing from its refresh predicate. Each real status request reads the user and booking/payment/driver data (backend/routes/bookings.js:380 onward), so repeated reads have real cost. Pure request-rate arithmetic is100 open pages≈20 requests/sec and1000≈200/sec at five seconds; this is not measured server capacity or a load-test result.

The proposed smaller alternative was refund-only polling15→30→60 seconds, paused when hidden and refreshed on return. The owner has not selected it. At60 seconds,1000 continuously open pages average16.7 requests/sec before read latency/backoff; real concurrency, retries and traffic patterns vary.

WebSockets can push changes without repeated polling ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)). They have no inherent per-use protocol fee; hosting still consumes compute/memory and bandwidth. Render documents that outgoing WebSocket messages count as outbound bandwidth and that connection load can require larger/multiple instances ([Render](https://render.com/docs/websocket)). Self-hosting does not require a separate managed-realtime subscription. Existing-plan capacity and future scaling determine incremental cost; no monthly-price estimate or free-hosting promise is made. A suitable app-wide design would use authenticated booking subscriptions, an initial authoritative read and reconnect/catch-up reads because disconnections can miss events ([Socket.IO](https://socket.io/docs/v4/tutorial/handling-disconnections)). This is a proposal, not an implemented backend channel or financial-event guarantee.
`;
fs.writeFileSync(report,content);
const modified=source.changedProductInputs;
const patches=modified.map(file=>{const r=spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--',out+'/before/'+file.replaceAll('/','__'),file],{encoding:'utf8'});assert([0,1].includes(r.status),r.stderr);return r.stdout;}).join('\n');fs.writeFileSync(out+'/approved-source-diff.patch',patches);
const tools=['fixes.mjs','fix-focus.mjs','fix-record.mjs','fix-board.mjs','fix-report.mjs','sync-board.mjs'].map(f=>'tools/ui-quality/p07/'+f);
for(const f of tools){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
for(const f of [...tools,...modified,report])assert(!/[\t ]+\r?$/m.test(fs.readFileSync(f,'utf8')),'Trailing whitespace: '+f);
for(const p of source.checks)assert.equal(sha(p.file),p.after,'Recorded input changed after final preservation check: '+p.file);
fs.writeFileSync(out+'/quality.json',JSON.stringify({syntaxFiles:tools,explicitWhitespace:'PASS',recordedSourceBindings:'PASS',eslint:{exit:1,status:'NOT_RUN_CONFIGURATION_MISSING'},reportSha256:sha(report)},null,2));
fs.writeFileSync(out+'/deliverables.json',JSON.stringify({report,folder:'1h1mgl7VDO8yKKJH4DqWxpta-iU9O6Avk',status:'02A/03A/04A VERIFIED;01 unresolved',productFiles:modified},null,2));
console.log(JSON.stringify({report,changedProductInputs:modified.length,browserRecords:reg.checks.length,focusProbes:focus.checks.length,finalNoticeRechecks:recheck.checks.length,sourceTraces:tracker.sourceTraces}));
