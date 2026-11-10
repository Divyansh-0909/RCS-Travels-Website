import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { issues } from './issues.mjs';
const out='output/handoff/P07-2026-10-29', dir='docs/ui-quality';
const read=name=>JSON.parse(fs.readFileSync(`${out}/${name}.json`));
const matrix=read('matrix'), functional=read('functional'), transition=read('transitions'), supplement=read('supplement'), tracker=read('tracker-validation'), preservation=read('source-preservation'), measured=read('measured-families');
const folder='https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz';
const board=(id,width=390)=>`http://127.0.0.1:4317/p07?issue=${id}&width=${width}`;
const header=title=>`# P07 — ${title}\n\n29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**\n\nApproved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](${folder}). Local raw evidence: \`${out}/\`. This is P07, separate from the earlier unnumbered consistency work.\n\n`;
const guard='Item 03 Account backdrop repair remains accepted and unchanged. Item 12 remains OWNER_VISUAL_REVIEW_PENDING / ON HOLD at the owner’s request; no choice or standard is inferred. P03 Home/Outstation KEEP CURRENT, P04 native results, P06 fixes and approved input/button/focus/spacing choices are preserved. No P08, Android, provider operation, commit, push, merge or deployment.';
const names=['execution-report','tracking-outcome-audit','accessibility-responsive-matrix','visual-consistency-audit','live-review-board','synthetic-fixture-safety','coverage-tracker-delta'];
const write=(name,body)=>fs.writeFileSync(`${dir}/P07-${name}.md`,body.trimEnd()+'\n');
const findingTable='| ID | Finding | Severity | Evidence |\n|---|---|---|---|\n'+issues.map((i,n)=>`| ${i.id} | ${i.name} | ${i.severity} | ${['functional.json (twice)','functional.json (twice)','transitions.json (twice)','large-text-support.json (twice)'][n]} |`).join('\n');
const visualRows=measured.measurements.filter(m=>m.width===390).flatMap(m=>m.controls.filter(c=>['Call driver','Pay ₹90','Pay with UPI','Pay with cash','Refresh payment status','Back to home'].includes(c.text)).map(c=>`| ${m.case} | ${c.text} | ${c.height}px | ${c.font} / ${c.lineHeight} | ${c.radius} | ${c.padding} | ${c.contrast}:1 |`)).join('\n');
write('execution-report',header('execution report')+`The owner approved execution of the document’s P07 v1 audit. Its safe-replay items 4–5 require exact owner choices before any visual, copy, navigation or product logic changes. This phase added isolated fixtures, tests, live review and audit metadata only. Four real defects remain unresolved pending those choices.

## Source and route map

| Existing stable ID | Actual source / entry | Audited slice |
|---|---|---|
| W.TRACKING | frontend/src/main.jsx actual /booking/:id → frontend/src/pages/TrackingPage.jsx | Actual route with synthetic ID; loading, active ride, read failures/recovery, terminal outcomes, receipt and RideDetails |
| W.SHARED.CUSTOMER-PAYMENT-PANEL | frontend/src/components/CustomerPaymentPanel.jsx, TrackingPage advance branch | Amount presentation, busy/failed/cancelled/paid presentations; imported component reference for otherwise provider-dependent phases |
| W.SHARED.RIDE-SETTLEMENT-PANEL | frontend/src/components/RideSettlementPanel.jsx:7, completed branch | Pending UPI/cash choices, disabled/busy, denied cash confirmation, paid cash/UPI, missing capability |
| W.SHARED.CANCELLED-BOOKING-PANEL | frontend/src/components/CancelledBookingPanel.jsx:5; lib/cancelledAdvanceSummary.js | No advance, refund/partial refund pending and processed, retained advance, manual refresh |

Actual nested primitives include Button/ActionControl, IconButton, PillControl, BackgroundPanel, NoticePill, FailureState/ErrorPanel/EmptyState, Skeleton, OtpDisplay, RideDetails and the global RefreshNotice used by tracking. Source discovery does not make every nested interaction audited. Maps/native gestures and cancellation writes are excluded.

## Execution and results

Commands below run from the repository root unless noted. Successful browser script completion is exit 0 and means its explicit assertions completed; OBSERVED is not full journey acceptance.

| Command | Final exit / evidence |
|---|---|
| node tools/ui-quality/p07/checkpoint.mjs | 0; protected source/git/metadata snapshots before work |
| node tools/ui-quality/p07/serve.mjs | Long-running isolated app; final instance P07_PREVIEW_PORT=1578. Earlier audit instance1577 retained |
| node tools/ui-quality/p07/functional.mjs | 0; 8 records, four repeated scenarios, two defects repeated2×; errors[] |
| node tools/ui-quality/p07/matrix.mjs | 0; 84 state/config observations, zero harness failures; 12 scoped axe samples |
| P07_CONFIGS=[{"width":320,"height":844,"language":"hi","textSize":16},{"width":390,"height":844,"language":"hi-Latn","textSize":16}], P07_CASES=assigned,advance,completed,partial-refund-pending,failure, P07_MATRIX_RESULT=matrix-localized.json; node tools/ui-quality/p07/matrix.mjs | 0; 10 localized replacements, actual html language verified; environment values shown literally, no new denominator |
| node tools/ui-quality/p07/transitions.mjs | 0; 12 repeated transition records, including two reproduced invisible focus failures |
| node tools/ui-quality/p07/supplement.mjs | 0; 7 interaction/loading checks; 24 actual imported-component presentation samples; external[] |
| node tools/ui-quality/p07/measure.mjs | 0; 10 computed-style samples; merged10 corrected localization rows into84 |
| node tools/ui-quality/p07/final-check.mjs | 0; native cash double click creates one denied request while busy, repeated2×; not provider idempotency proof |
| node tools/ui-quality/p07/sync-board.mjs | 0; static board now includes all4 issues; no watcher or approval dispatcher |
| node tools/ui-quality/p07/reviewer.mjs | Long-running GET-only reviewer4317; existing viewer plus /p07 comparison board |
| node tools/ui-quality/p07/reviewer-check.mjs | 0; all4 examples in3 host/screen configurations, safe failure replay and no page overflow; captures wait for actual state rather than auth splash |
| node --test tools/ui-quality/p07/fixture.test.mjs frontend/tests/paymentUi.test.js frontend/tests/cancelledAdvanceSummary.test.js frontend/tests/bookingReadSafety.test.js | 0; 29/29 PASS; targeted-tests.txt |
| node --test tools/ui-quality/coverage/coverage.test.mjs tools/ui-quality/consistency/consistency.test.mjs tools/ui-quality/consistency/audit-compare.test.mjs | 0; 19/19 PASS; tooling-tests.txt |
| npm --prefix frontend run build | 0; build.txt, 8.69s; existing large-bundle advisory retained |
| node tools/ui-quality/p07/record.mjs | 0; 355 validated source traces, zero duplicate/orphan IDs or missing discovered routes; CSV round trip |

The large-text two-repeat probe is retained in large-text-support.json and screenshots, including exact bounds and the receipt hit target; it was an inline Playwright probe rather than an invented package command. Late old polling responses did not replace the newer state in the tested ordering (lateAborted=false); this does not prove every request is aborted or every concurrency pattern is safe.

## Retained unsuccessful attempts

The initial component loader lacked the React refresh preamble (exit1); Vite transformIndexHtml repaired only fixture HTML. A matrix attempt waited on a five-minute searching animation and was stopped; final harness waits only finite entrance animations ≤2s. A theme assertion ran before mount (exit1), and the initial localization attempt changed store language without i18n: corrected to the actual LanguageSelector sequence and html-lang wait. Old10 observations/PNGs remain in matrix-before-language-recheck.json and matrix-language-attempt/. Transition strict-text and assumed-unmount checks failed (exit1); corrected selectors preserved the discovered invisible-focus defect. Board attempts exposed its own13px source-text overflow and offscreen iframe actionability waits (exit1); fixed in review tooling. A screenshot wait on nonempty root captured an auth splash; final captures wait for each actual audited state. Supplement recorder/back-selector failures (exit1) were fixture assumptions; final combines intercepted intent stores and selects the overlaid Back control. Initial metadata recording failed on an export token before registry writes (exit1); the exact source token was corrected.

Automatic approval review rejected one combined stop/restart command with the sole reason “blocked by policy”, before execution. No browser-opening policy diagnosis is inferred. The running1577 service was kept; a separate final app1578 and GET-only reviewer were started successfully. Retained attempt logs/results are not selected as successful evidence.

## Preservation and limits

${preservation.productionFiles}/${preservation.productionFiles} recorded frontend/driver/shared source inputs unchanged; HEAD and staging index hashes unchanged. Authorized registry changes are separate from product sources. The original dirty tree was preserved within this recorded inventory; no claim covers every unrelated editor file. Backend typecheck/full suite and native lint/device suites were NOT_RUN for this website audit. No real booking, backend ownership, payment provider, ledger, refund, financial policy or dispatch acceptance is claimed.

${guard}`);
write('tracking-outcome-audit',header('tracking and outcome audit')+findingTable+`

## Journey/state coverage

| Source-backed state family | Exercised fixture | Result / boundary |
|---|---|---|
| Initial loading | delayed status GET | Loading ride status and skeleton observed; later response intentionally not awaited in that one capture |
| Assigned / arrival / underway | assigned, en_route, reached, started | Actual headings, driver/contact controls, OTP and status-dependent copy observed; contact intents intercepted |
| Unassigned / scheduled | searching(pending), confirmed | Actual searching/confirmed branch observed; no driver allocation or dispatch |
| Advance needed / missing financial fields | advance, payment-missing | Amount/capability follows response; no advance order/provider success; denied local order shows failure |
| Completed / remaining amount | completed, completed-scheduled | Receipt and payment choices visible; response-controlled amounts only |
| Cash-only / paid methods | cash-only, cash-paid, upi-paid | Capability omitted/false fails closed for UPI; paid state has status feedback and removes pay controls |
| Cancelled without advance | cancel-no-advance | Ride ended, no active assignment; no fabricated refund card |
| Refund dispositions | refund-pending, partial-refund-pending, refunded, partial-refunded, retained | Pending vs processed text distinct. Partial pending stops polling: issue01; manual refresh recovers |
| No driver | no-driver | Actual source branch observed; no dispatch promise inferred |
| Initial API failure / denial | failure503, denied404 | Actual failure presentation; initial failure→retry→assigned tested2×; denial does not retain old ride |
| Stale update / recovery | existing data→503→started | Existing state retained with notice; success clears visual notice, but hidden Dismiss remains tabbable: issue03 |
| Concurrent response order | delayed older assigned vs newer started | Newer started state retained in selected ordering2×; not exhaustive concurrency proof |
| Duplicate activation | native double click on cash choice | One local409 attempt while busy2×; no idempotency claim for a later deliberate retry/provider |
| Amount/method/duplicate updates | completed→changed amount→paid method→repeat | UI follows authoritative synthetic read and duplicate presentation is stable; no financial validation |
| Navigation | distinct synthetic IDs, Back/Forward/reload, denial | Repeated2×; old state does not leak across tested IDs; RideDetails opens and closes at390/1440 |
| No-ID/no-status empty branch | source TrackingPage:989 | NOT_RUN through real /booking/:id: route requires an ID. Not invented as reachable customer journey |
| Cancellation confirmation / provider / external share | source-traced only where applicable | Writes/real external dialogs NOT_RUN; exact native back/gesture/keyboard behavior not certified |

## Reproducible findings and owner choices

${issues.map((i,n)=>`### ${i.id} — ${i.name}\n\n**${i.severity}; ${i.category}; reproduced2×.** ${i.defect}\n\nSource: ${i.source}. [Actual/reference board](${board(i.id,n===3?1440:390)}).\n\n${i.steps.map((s,j)=>`${j+1}. ${s}`).join('\n')}\n\nExpected: ${['Every supported pending disposition continues refreshing until processed or an explicit manual-refresh policy is communicated.','A denied attempt visibly explains what happened and offers a safe recovery without claiming money was collected.','A visually removed notice leaves no invisible keyboard focus target.','Enlarged text preserves the support action’s click target and the receipt’s readable order.'][n]}\n\nImpact: ${['Riders can miss a processed partial refund until manually refreshing.','Riders cannot distinguish a denied settlement attempt from an ignored click and may retry without useful guidance.','Tab users lose their visible location in the page after recovery.','Users with enlarged text cannot activate this support action by pointer at the reproduced size.'][n]}\n\n${i.options.map(s=>'- '+s).join('\n')}\n\nSelector: \`${i.selector}\`. For04 choose1440px and200% text; a generic button selector is not an automated fix locator. All fixes remain NOT_CHANGED; recommended A is a proposal, not approval.`).join('\n\n')}

## Customer comprehension

Ride vs payment states are distinct: Ride completed can still show Total due; paid methods say received only from a supplied paid state. Advance wording says it is part of the fare. Cancellation pending copy says processed is not yet confirmed, while processed/retained outcomes have separate explanations. These are presentation observations, not proof of payment/refund execution. Main action comprehension breaks at denied settlement feedback (02) and delayed partial-refund freshness (01). Receipt labels remain source-defined; no fare, refund policy, legal promise or copy rewrite is approved. Hindi/Hinglish is mixed where existing payment copy has no translation; this is an observed localization limitation, not a newly approved rewrite.

${guard}`);
const axe=matrix.observations.filter(o=>o.axe);
write('accessibility-responsive-matrix',header('accessibility and responsive matrix')+`## Measured coverage

| Configurations | Samples | What was checked |
|---|---|---|
| 390/1440px ×22 source-backed states | 44 | Rendered headings/status/actions, geometry, scroll, document overflow and centre hit probes |
| 320/360/768/1280px ×5 core states | 20 | assigned, advance, completed, partial-refund-pending, failure |
| 390/1440px ×5 core states, root font32px | 10 | 200% text stress, wrapping and reachability |
| 320px Hindi /390px Hinglish ×5 core states | 10 | Actual store+i18n language change; translated and fallback text; long labels |
| Total | **84 OBSERVED** | Not84 fully passing journeys; no document horizontal overflow does not rule out overlap |
| Scoped axe normal text at390/1440 | **${axe.length} runs; ${axe.reduce((n,o)=>n+o.axe.violations.length,0)} violations** | assigned, advance, completed, refunded, partial pending, failure; wcag2a/2aa/21aa scoped to #root |

Tracking is the actual fixed legacy composition under both saved light/dark preferences. Themes were not forced into unsupported counterpart pages. Whole-page theme reconciliation stays deferred; shared component themes outside this route are not accepted by these checks.

## Keyboard, pointer and announcements

Actual Tab reaches normal controls with a2px primary outline (rgb48,103,253 in this legacy composition); source Button uses the shared primary token. Successful visual stale recovery still leaves an opacity0 Dismiss Tab stop2×: P07-B02-03. At1440/root32px Contact support is covered by receipt2× despite no document overflow: P07-B02-04. Both remain FAIL. Normal sized primary actions use minimum48px height and expand for wrapped text; circular Back is44px, context pills are deliberate smaller variants. This audit does not silently enlarge these owner-approved variants.

CustomerPaymentPanel failed state exposes role=alert; paid/cancelled/busy and settlement-paid presentations use status/live semantics where implemented. A denied settlement has no alert:02. Heading hierarchy and computed sizes are captured in measured-families.json/matrix.json. No spoken screen reader announcement timing or full modal focus trap certification is claimed. The full-screen Go back dismiss control and off-viewport/opacity0 nodes can appear in raw geometry probes; they are not all separate bugs. Confirmed issues use actual pointer or Tab reproduction, not geometry alone.

Measured enabled white-on-primary action contrast is4.68:1; white on legacy page19.59:1; white on muted card14.86:1; muted heading example8.83:1. Computation uses text colors and composited solid ancestor backgrounds, not screenshot color guessing. Transparent/invisible full-screen dismiss controls and disabled opacity are excluded from normal-text acceptance. Axe incomplete nodes remain in raw output; zero scoped violations does not certify every state or transient overlay.

Touch contexts at narrow sizes and browser scroll were exercised; safe-area CSS rendered with desktop browser insets. Physical mobile safe areas, Android/iOS native maps, OS keyboards, native gestures, actual TalkBack/VoiceOver, browser zoom at every DPI and provider checkout accessibility are NOT_RUN. Root32px is explicit text stress, not a claim about real OS text scaling. Translation remains partial for existing financial copy. No data-specific financial correctness is tested.

Evidence: matrix.json, matrix-before-language-recheck.json, matrix-localized.json, measured-families.json, transitions.json, large-text-support.json, supplement.json and their PNGs. [Live04](${board('P07-B02-04',1440)}).`);
write('visual-consistency-audit',header('visual consistency audit')+`The comparison groups controls by semantic purpose. Matching every rectangle is not a standard. Existing approved tokens/primitives are the reference; no global palette, input, pill, theme or sizing change is proposed here.

| Family / scope IDs | Classification | Measurements / rationale | Decision |
|---|---|---|---|
| Primary actions: W.TRACKING +CustomerPaymentPanel +RideSettlementPanel +CancelledBookingPanel | CONSISTENT in sampled normal text | Existing Button/ActionControl: minimum48px, label16px/24px, radius12px, padding12px24px; wraps taller at narrow/large text | Preserve current approved sizing |
| Equivalent failed payment feedback: CustomerPaymentPanel vs RideSettlementPanel | CONFIRMED_INCONSISTENCY | Actual advance failure: heading, explanation, role=alert, retry. Settlement denied: unchanged choices, no alert, despite FAILED phase |02 A inline failure or B existing card; no aesthetic approval yet |
| Outcome cards: settlement paid vs cancellation refund | INTENTIONAL_VARIANT | Both muted surface/radius16; paid padding16; cancellation padding20. Pending refund differs from processed collection semantically | Keep distinction and source-defined promises |
| Receipt/amount rows: completed receipt vs advance breakdown | CONSISTENT hierarchy; confirmed responsive defect | Monetary rows are read-only; total emphasized, actions separate. Desktop200% text covers support link |04 wrap notice(A) or adaptive stack(B); no arithmetic edits |
| Icon controls, Share, Ride details, support | INTENTIONAL_VARIANT | Circular Back44px; primary actions48px minimum; compact top controls/support are contextual variants, not competing CTAs | Preserve unless specific future choice |
| Read feedback: skeleton, FailureState, RefreshNotice | CONSISTENT purposes; accessibility failure | Loader vs blocking initial failure vs nonblocking stale notice are different roles. Hidden recovered notice remains focusable |03 remove after exit(A) or inert hidden state(B) |
| Typography / hierarchy | CONSISTENT in normal samples | Mobile active title30px bold, supporting heading18px/24.75; terminal labels and receipt totals have separate emphasis. Enlarged receipt wrapping is captured rather than a new type scale | No type standard change |
| Whole-page themes / provider modal | UNVERIFIED | Legacy fixed tracking; provider checkout denied. Item12 is ON HOLD, not a P07 standard choice | No forced counterpart or provider-fidelity claim |

## Actual action measurements at390px / normal text

| State | Control | Height | Font / line | Radius | Padding | Text contrast |
|---|---|---|---|---|---|---|
${visualRows}

These are actual DOM measurements from the selected enabled initial state. Button fill is on its outer wrapper, so contrast composites the ancestor backgrounds. Motion/hover colors and disabled opacity are not certified by initial-state ratios. On320px a wrapping Call driver becomes72px high, preserving the shared minimum rather than clipping the label; large text expands further. No fabricated blanket fixed48px guarantee.

Source anchors: components/ui/Button.jsx:6,45; components/ui/IconButton.jsx; CustomerPaymentPanel.jsx:76; RideSettlementPanel.jsx:7–48; CancelledBookingPanel.jsx:8–20; TrackingPage.jsx:655–670,1344–1429; components/ui/RefreshNotice.jsx:50–98. Source ID and full bounds/style tuples are in measured-families.json and canonical rows. Safe paired occurrences are in the live board: actual settlement vs actual advance failure component; actual partial/full refund; hidden recovered vs assigned control;200% vs normal completed route. These are observed/reference states, not implementations of future choices.

The consistency inventory receives additive phaseAssessments.P07, keeping its existing families, catalogRevision, prior occurrences and owner choice history unchanged. Owner-approved-patterns.json and both choice registries remain byte-identical. Visual consistency is a separate tracker dimension; functional verification and owner aesthetic approval are not interchangeable.

${guard}`);
write('live-review-board',header('live review board')+`[Open P07 live comparison board](${board('P07-B02-01')}). The existing loopback issue reviewer remains at http://127.0.0.1:4317/?mode=website&issue=P07-B02-01&width=390&theme=dark. The dedicated /p07 board contains all four findings, including the later enlarged-text issue; the already-running main queue contains the first three. No watcher, dispatch, choices POST or automatic implementation is running.

The inspector uses the existing Mori type/theme assets and black reference-panel treatment. Choose Phone for side-by-side comparison; tablet/laptop previews stack to preserve readable size. On a narrow host, the side-by-side preview rail scrolls horizontally without overflowing the document. Screenshots are evidence; the iframes are actual current React routes/components with synthetic data. Screens320/390/768/1440 are selectable. The broader audit includes360/1280 too.

${issues.map((i,n)=>`## ${i.id}\n\n[Open ${i.name}](${board(i.id,n===3?1440:390)}).\n\n${i.steps.map((s,j)=>`${j+1}. ${s}`).join('\n')}\n\n${i.options.map(s=>'- '+s).join('\n')}`).join('\n\n')}

The actual/reference frames are not “before/after fixes”: all product sources are unchanged. For03, wait two poll cycles (~10s), then Tab; Locate in the existing reviewer can mark the real hidden bounds. For04, select Laptop1440; observed frame applies200% root text and reference uses normal text. A phone-width04 view is not the reproduced desktop condition. Restart both examples reloads synthetic read sequences only; it does not retry a real payment.

After reviewing, give exact issue IDs plus A/B in the chat, or explicitly defer an issue. Recommended choices are01A,02A,03A,04A. Those recommendations are not saved approvals. P07 safe-replay items4–5 explicitly require these exact future decisions before product edits. Item12 is not part of this request. No P08 starts automatically.

Runtime: final app http://127.0.0.1:1578, audit app1577 retained, reviewer4317 GET-only. Tools: node tools/ui-quality/p07/serve.mjs with P07_PREVIEW_PORT=1578, then node tools/ui-quality/p07/reviewer.mjs if not already listening. On Windows launch background processes hidden. Do not create duplicate listeners or run document watcher/dispatcher. Local links require this machine’s services; the Drive evidence is durable. Runtime PIDs and timestamps are snapshots, not an uptime guarantee.`);
const network=[...functional.network,...transition.network,...matrix.network];
const external=network.filter(n=>n.externalBlocked||n.blocked);
const mutations=network.filter(n=>n.path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(n.method));
const authPosts=network.filter(n=>n.path.startsWith('/fixture-auth/')&&n.method==='POST');
write('synthetic-fixture-safety',header('synthetic fixture safety')+`## Actual renderer and synthetic boundary

The Vite fixture imports the real frontend/src route and the actual CustomerPaymentPanel/RideSettlementPanel for presentation references. It does not recreate customer screens in the review HTML. The /booking/p07-… path hydrates from a finite local read-only response catalogue; synthetic identifiers, names, phone strings, amounts, times and coordinates are not customer/captain data. The dev-only auth helper supplies only a local actor. No .env, production credentials, real authentication bypass or deployed route was changed.

All /api non-GET requests return a deliberate409 after a short delay; successful payment/order/refund/cancel writes are impossible in this fixture. A denied POST is used to test failure feedback. “Zero external writes” does not mean zero local POST attempts: selected functional/transition/matrix logs contain **${mutations.length} local mutating attempts**, all fixture-denied. Additional fixture-safety test POSTs also receive409. No checkout/order/payment/ledger is created or altered, and GET sequences may change presentation only. Fixture tests prove an assigned row is unchanged after denied cash/order/cancel attempts.

The selected combined logs also contain${authPosts.length} POSTs to the isolated fixture-auth helper; these are local synthetic auth setup, not customer/financial writes or denied API operations. The browser harness blocks any non-loopback host. Selected combined logs record${external.length} attempted non-loopback requests reaching its route layer. CSP also blocks prohibited external/Maps requests before that layer; the renderer shows Map unavailable. No blocked-request count is invented from that message. Final supplemental contacts have external[]. CSP permits connect-src self (plus its own development WebSocket), frame-src none and blocks form actions; real provider frames cannot load. The preview uses a Vite-only transform to intercept window.location.href contact assignments; original product files remain unchanged. window.open/share/clipboard/geolocation and external link intents are intercepted. Existing review bridge and P07 prelude have separate safe intent arrays; the supplemental test checks both rather than assuming only one recorder.

The finite /__review/p07?case=… allowlist rejects constructor/__proto__/external/path cases; unknown non-synthetic booking reads return404. Reviewer4317 host-checks loopback, rejects every non-GET method with405 and has no dispatcher. No document watcher was started. Drive uploads/document append are the explicitly requested handoff publication, not an external customer action.

## Explicit limitations

Mocked status and paid/refund states demonstrate actual presentation and update handling only. They do not prove a provider charge/refund, independent payment verification, booking authority, receipt validity, fare math, financial policy, database, dispatch, maps or real back-end integration. Provider busy/failed/cancelled/paid presentation references use imported components with labelled synthetic props/callbacks. No force-success handler was added to product code. Initial loading and permission-denied branches are deterministic fixture observations; no real user session or deployed permissions are exercised.

Build, browser scripts, test logs, fixtures and hashes are retained. Source-preservation.json verifies304 recorded frontend/driver/shared inputs and existing owner registries unchanged; permitted metadata edits are separately identified. Evidence snapshots contain synthetic data. No screenshot or fixture should be passed off as production or native-device acceptance.

${guard}`);
write('coverage-tracker-delta',header('coverage tracker delta')+`Canonical file: tools/ui-quality/coverage/master-ui-coverage.csv. All **351 predecessor rows are identical**, including parent/sibling states, stable IDs, historical failures, reachability, P03 owner deferrals, native evidence and P06 accepted fixes. No broad route/component is marked complete from these selected checks.

| Counter | Before | After |
|---|---:|---:|
| Total rows / unique IDs |351|355|
| AUDITED |${tracker.before.audit.AUDITED}|${tracker.after.audit.AUDITED}|
| NOT_REVIEWED |${tracker.before.audit.NOT_REVIEWED}|${tracker.after.audit.NOT_REVIEWED}|
| OWNER_DEFERRED |${tracker.before.owner.OWNER_DEFERRED}|${tracker.after.owner.OWNER_DEFERRED}|
| OWNER_REVIEW_REQUIRED |${tracker.before.owner.OWNER_REVIEW_REQUIRED}|${tracker.after.owner.OWNER_REVIEW_REQUIRED}|

Four source-evidenced children were added under W.TRACKING; all are AUDITED / OWNER_REVIEW_REQUIRED / NOT_CHANGED / FAIL, with independent fixture_functional, accessibility/responsive and visual_consistency dimensions appropriate to that case. FAIL records the reproduced defect; it is not a failed attempt to implement it. No owner aesthetic acceptance field is fabricated.

${tracker.addedRows.map((id,i)=>'- '+id+' → '+issues[i].id+'; source '+issues[i].source).join('\n')}

The four original P07 scope roots keep NOT_REVIEWED/NOT_RUN because broader route/component coverage remains partial. This conservative parent status does not discard the detailed P07 state report. New children link to their exact finding and uploaded P07 evidence folder; the upload manifest gives individual file IDs and hashes. No speculative states or synthetic fixture endpoints are mislabelled as new product screens.

registered-surfaces.json and issues.json receive the same four additive source-bound findings; all prior issue entries remain unchanged. component-consistency-inventory.json receives phaseAssessments.P07, keeping original catalog revision/families/occurrences. owner-approved-patterns.json and consistency-decisions.json / consistency-audit-decisions.json remain byte-identical: zero invented approvals. Item12 hold remains separately documented and is not a fifth P07 defect or a blocker to this audit.

Validation:355 real source traces; zero duplicate IDs, logical duplicates, orphan parents, orphan issues or missing discovered routes; CSV round trip passes.19 tooling tests pass.304 source input hashes, HEAD and staged index unchanged. No whole website audit percentage is inferred from355 rows.

${guard}`);
// Verify syntax of new executable JavaScript, and whitespace of all new P07
// source/report files, including untracked files that git diff cannot check.
const files=fs.readdirSync('tools/ui-quality/p07').filter(f=>/\.(mjs|js)$/.test(f)).map(f=>'tools/ui-quality/p07/'+f);
const syntax=files.map(file=>{const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return{file,exit:r.status};});
const checked=[...files,'tools/ui-quality/p07/components.jsx','tools/ui-quality/p07/board.html',...names.map(n=>`${dir}/P07-${n}.md`)];
for(const file of checked)assert(!/[\t ]+\r?$/m.test(fs.readFileSync(file,'utf8')),'Trailing whitespace '+file);
fs.writeFileSync(out+'/quality.json',JSON.stringify({syntax,explicitWhitespace:{files:checked.length,status:'PASS'},note:'JSX/HTML exercised in actual Vite/browser; no product source edits.'},null,2));
const reports=names.map(n=>`${dir}/P07-${n}.md`);
fs.writeFileSync(out+'/deliverables.json',JSON.stringify({reports,folder,phase:'P07',status:'APPROVAL_REQUIRED'},null,2));
console.log(JSON.stringify({reports:reports.length,syntax:syntax.length,whitespace:checked.length,selectedNetwork:network.length,deniedMutationAttempts:mutations.length,blockedExternal:external.length}));
