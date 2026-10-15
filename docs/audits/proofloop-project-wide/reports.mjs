// Render audit-only reports from current machine inventories and curated judgments.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out='output/proofloop-project-wide-audit-2026-10-11',docs='docs/audits/proofloop-project-wide';
const load=async n=>JSON.parse(await fs.readFile(path.join(root,out,n),'utf8'));
const c=await load('counts.json'),f=await load('features.json'),entry=await load('entrypoint-coverage.json'),ev=await load('evidence-verification.json');
const byId=new Map(f.map(x=>[x.id,x]));
const artifact=n=>`[${n}](../../../${out}/${n})`;
const source=ref=>{const p=ref.replace(/:\d+$/,'');const line=ref.match(/:(\d+)$/)?.[1];return `[${ref}](../../../${p}${line?'#L'+line:''})`;};
const write=async(n,s)=>fs.writeFile(path.join(root,docs,n),s.trim()+'\n');
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(x=>String(x).replaceAll('|','\\|').replaceAll('\n',' ')).join(' | ')+' |').join('\n');
const coveredRows=Object.entries(c.reconciliation).filter(([k])=>k!=='excludedProbeRoutes').map(([k,v])=>[k,v.discovered,v.classified,v.traceable,v.unknown,v.excluded]);
const curatedPrimary=Object.fromEntries(Object.keys(c.primary).map(k=>[k,f.filter(x=>x.primary===k).length]));
const statuses=`PROJECT-WIDE DISCOVERY AUDIT: PARTIAL\nREPOSITORY INVENTORY: COMPLETE FOR THE DECLARED FILESYSTEM BOUNDARY\nPOLICY INVENTORY: PARTIAL\nENTRYPOINT RECONCILIATION: COMPLETE FOR STATIC API/JOB/ROUTER REGISTRATION; PARTIAL FOR DYNAMIC/ALIASED OPERATIONS\nCROSS-SYSTEM INTERACTION AUDIT: PARTIAL\nPROOFLOOP APPLICABILITY CLASSIFICATION: COMPLETE FOR DISCOVERED ROWS, INCLUDING EXPLICIT UNKNOWN\nRISK PRIORITIZATION: PARTIAL FOR UNRESOLVED SOURCE/RULE CANDIDATES\nPROJECT-WIDE PROOFLOOP IMPLEMENTATION: NOT STARTED\nPHASE 9C: CONTINUES INDEPENDENTLY; SELECTED HISTORICAL CHECKPOINT PARTIAL\nPHASE 9D: NOT STARTED AT THE RECORDED CHECKPOINT\nPRODUCTION SHADOW: OFF AT THE RECORDED CHECKPOINT; LIVE SETTINGS NOT QUERIED\nPRODUCTION CONSEQUENCES: OFF AT THE RECORDED CHECKPOINT; LIVE SETTINGS NOT QUERIED\nSEARCH ROLLOUT: OFF AT THE RECORDED CHECKPOINT; LIVE SETTINGS NOT QUERIED\nPUBLIC PROOFLOOP GENERALIZATION: NOT STARTED`;
const top=[
 ['DS-07','Confirmed static enforcement mismatch','securityHttp/criticalRideTransactions test families; no demonstrated negative witness for this alternate scheduled claim','Owned-offer, class, online, deposit and assignment effects through actual generic HTTP handler','Clear offer/hold authority; isolate DB; protect legitimate immediate callers'],
 ['DR-06','Confirmed approved requirement/enforcement gap','driverNewWorkEligibility assertions cover suspension/reliability; final-payment tests cover a narrower payout check','All online/candidate/offer/accept paths with missing/unverified/invalidated destination','Recovered H0/V1 mandatory-payout rule; human destination verification'],
 ['DR-04','Confirmed cached-expiry enforcement gap','documentPolicy/documentConcurrency and new-work tests; hourly expiry is not synchronous claim proof','Expired personal/active-vehicle docs between sweep and accept, including transaction revalidation','Safe continuation policy for already-assigned work'],
 ['FN-10','Confirmed replacement architecture mismatch','Critical transaction tests demonstrate unverified UPI cash fallback; liability-change lock now exists','A-active/B-pending, accepted-ride payment continuity, open-batch change and compromised destination recovery','Versioned destination authority and provider-safe recovery'],
 ['DS-03','Confirmed absent feasibility assessment; consequence is a hypothesis','Pool/nearby/dispatch tests and Phase 9 observation fallback; no whole-calendar feasibility assertion','Far captain, overlapping commitments, delayed workers, traffic and stale source observations','ETA/buffer/unknown-reachability decisions remain unapproved'],
 ['OP-06','Confirmed maintenance isolation limitation; no execution/production damage observed','No cleanup/normalization safety witness independently verified in this audit','Remote/local identity guard, real-versus-synthetic collision and cascade/ledger preservation','Explicit maintenance scope; disposable DB; read-only dry run itself reads records'],
 ['FN-11','Potential provider/commit race','payoutBatchExecution uses a Prisma-shaped fake; paymentReliability DB suite is separate scoped evidence','Balance/destination invalidated after preflight but before create; lost response, retry/reversal, two workers','RazorpayX fake + actual transaction boundaries; separate live certification'],
 ['WA-03','Potential committed-booking/session/send divergence','whatsappWebhook/notification test families; whole real-service recovery ordering not established','Create succeeds, session update/send fails, friendly fallback/processed mark, repeated confirmation','Owned inbound/session/event identity and delivery/replay inputs'],
 ['GP-01','Confirmed different freshness bases; unsafe stale dispatch is a hypothesis','Geofence/cancellation provenance tests; physical GPS was denied/unverified in selected native slice','Old observed fix newly received passes updated_at proximity filter, without reaching verified arrival','Record observation/receipt clock separately; no inferred driver intent'],
 ['RS-08','Explicit unsupported scope, not a new defect','Financial-family negative tests and Phase 9 incident/replay evidence','Failed pickup/offline/platform assignment/replacement failure detectors and non-driver-cancel financial semantics','Owner event/financial authority; retain consequence firewall and V5 freeze'],
];
await fs.writeFile(path.join(root,out,'ranked-findings.json'),JSON.stringify(top.map(([id,status,tests,missing,dependencies],i)=>({rank:i+1,featureId:id,policyIds:byId.get(id).policyIds,title:byId.get(id).title,source:byId.get(id).refs,status,existingTests:tests,missingVerification:missing,risk:byId.get(id).risk,pipeline:byId.get(id).primary,dependencies})),null,2)+'\n');

await write('executive-summary.md',`# Project-wide Proofloop discovery audit — 11 October 2026 (IST)

The audit identifies **${f.length} curated workflows/features** and **${c.featureMatrixRows} traceability rows**, including smaller source units. The most urgent future verification targets are the alternate generic acceptance path, mandatory verified-payout eligibility, document-expiry claim gates and payout-destination continuity. Existing Responsibility and Phase 9 evidence should be maintained and extended at its residual boundaries.

**Overall audit status: PARTIAL.** Static production registration is reconciled, and every discovered entity is classified or explicitly unresolved. Complete policy authority, all UI-handler semantics, aliased/dynamic SQL writers and deployed permissions are not proved. This report does not certify the repository or assert an exhaustive semantic review of every line. Missing evidence is recorded as UNKNOWN, not as low risk.

The workspace comprises a Node/Express/Prisma backend; React customer/admin website; Expo/React Native captain app; shared theme/i18n; isolated DB, lifecycle/provider/fault/replay/browser/native verification; policy RAG CLI/corpus; operational/deployment/maintenance tooling; developer Code Atlas/plugins; and nonproduction Python/design experiments. Marketplace financial behavior is approved but its captain screen is a local prototype with an explicit not-connected claim action. New Search services are development/test implementations without the original customer NL UI/production handoff. See ${source('driver-app/src/pages/MarketplaceDetail.tsx:108')}, ${source('backend/rcs-rag/README.md:5')}, and ${source('docs/search/search-owner-decisions-2026-10-06.md:9')}.

## Actual inventory denominators

${table(['Inventory','Discovered','Classified/accounted','Source-traceable','Explicit unknown','Excluded'],coveredRows)}

The file walk accounts for ${c.files} individual project files and ${c.excludedFileCount.toLocaleString('en-US')} files in ${c.excludedTrees} excluded dependency/generated/profile/artifact directories. Six restricted configuration files are metadata-only. Symlinks/junctions are not followed; their exclusion records retain an unknown target denominator. Excluded .git/profile/device-output trees are accounting boundaries, not sources of application policy. Nested temporary Expo/design bundles have explicit classification refinements. ${artifact('repository-inventory.json')} and ${artifact('inventory-refinements.json')} retain the denominator and exclusions.

The 105 production route declarations agree between independent AST/mount/root-import tracing and the bounded Code Atlas scan. Seven local security-probe routes are excluded from the production count. There are 54 actual router constructs: 34 captain and 20 website, including eight index/pathless layouts. Broad Atlas path-object candidates outside router constructs are not counted as navigation. There are 46 page files and 499 JSX event registrations; event registrations include bounded local UI actions and do not equal 499 business workflows.

The 64 financial writer candidates include financial data keys on Booking/Driver, not just money-named models. Seed/maintenance writes are identified separately from production-root reachability. Aliased NotificationDelivery and parameterized PolicyChunk writes are traced explicitly. OverchargeFlag has no recovered production writer. The 26 raw SQL and 99 migration/trigger write candidates remain a separate unresolved denominator; they are not all financial writes or demonstrated active mutations.

The ${c.policyRows} policy-registry records include 26 curated policy families, 52 original VM requirements, document rule candidates, environment-key uses, schema/SQL contracts and 146 numeric implementation-rule candidates. **They are not ${c.policyRows} approved business policies.** All 12 original scenarios A–L are recovered from owner source H0. Draft, historical, implemented, operational, approved and externally confirmable rules retain distinct statuses.

## Primary treatment counts

${table(['Treatment','Curated workflows/features','All matrix rows','Additional supporting uses'],Object.keys(c.primary).map(k=>[k,curatedPrimary[k],c.primary[k],c.supporting[k]]))}

One primary label per row makes the primary totals disjoint. Supporting labels overlap. Workflow rows and constituent source-unit rows represent different levels of the same system; do not add them as independent lifecycle adoption projects. FULL_PROOFLOOP on a helper means participation in its owning pipeline, not another bespoke simulator.

## Highest-risk findings

${table(['Rank / exact feature and policy','Evidence type / source','Existing verification','Missing verification / dependencies','Risk / treatment'],top.slice(0,6).map(([id,status,tests,missing,dep],i)=>[String(i+1)+' '+id+' '+byId.get(id).title+'; '+byId.get(id).policyIds.join(', '),status+'; '+byId.get(id).refs.map(source).join(', '),tests,missing+'; '+dep,byId.get(id).risk+' / '+byId.get(id).primary]))}

These findings are static mismatches or explicit hypotheses. No live attack, provider call, production database query, cleanup script or financial transaction was run. No application/schema/policy/test/flag was changed. All writes are inside the two authorized audit directories.

## Recommended first three workstreams

1. **New-work authority and eligibility:** close verification gaps across generic and owned-offer acceptance, current document validity and mandatory payout readiness. These are P0 policy gaps with clear sources and reusable protected HTTP/DB/fault infrastructure.
2. **Financial continuity across provider and booking boundaries:** extend current owner-hold/advance/settlement/refund evidence to payout destination/versioning, payout lost responses and concurrent wallet/debt/admin operations. Preserve completed ledger/replay work instead of rebuilding it.
3. **Scheduled operational recovery and feasibility:** extend delayed-worker/replacement/multiple-captain recovery first; defer ETA/commitment/short-notice decisions until approved. Reuse clocks, route/GPS/provider observations and Phase 9 replay.

Complete scope, fault points, replay inputs and acceptance criteria are in [adoption-roadmap.md](adoption-roadmap.md).

## Source/evidence continuity

HEAD remains unchanged. ${ev.sourceDriftDuringAudit.length} hashed files changed concurrently; affected Phase 9C/UI findings are subject to change, and no current execution pass is inferred from expanded recipe source. ${artifact('evidence-verification.json')} identifies each change, current hash and historical mismatch.

The selected browser/native receipt bytes match their recorded hashes. Browser artifacts: 37/37 hash matches. Native artifacts: 37/39 matches; latest-build.json and phone-awake-state.json are mutable pointers changed during independent work, not selected-receipt corruption. Current-source matches are ${ev.historical[0].currentSourceMatched}/463 browser and ${ev.historical[1].currentSourceMatched}/20 native manifest identities; preserved historical scope cannot certify changed code. Both recovered frozen V5 source manifests match 22/22. The native nine-module coverage summary/manifest records 157 branches; checkpoint prose says 156. This metadata discrepancy is retained, without changing existing records.

Responsibility Phases 1–7 and Phase 8 retain their accepted scope; V5 freeze and comparator amendment remain. Phase 8.2 is retired by owner decision. Phase 9A/B evidence remains scoped; active Phase 9C continues independently. No Phase 9D or production permission proof is supplied here. Search S3 UI and unfinished S5/S6/S7/Hindi-Hinglish requirements remain separate; October 6 owner decisions supersede older unresolved year/week/timezone/SUV statements. No held-out, unseen challenge, pending paid provider/model evaluation or Responsibility Luna comparison was resumed.

## Audit status

\`\`\`text
${statuses}
\`\`\`

## Full artifacts

[Applicability and risk rubrics](proofloop-applicability-report.md), [interaction/state map](interaction-dependency-map.md), [unverified requirements and historical dispositions](unverified-requirements.md), [adoption roadmap](adoption-roadmap.md), [methodology/reproduction](methodology.md), ${artifact('complete-feature-matrix.csv')}, ${artifact('policy-registry.csv')}, ${artifact('entrypoint-coverage.json')}, ${artifact('audit-evidence-manifest.json')}.
`);

await write('proofloop-applicability-report.md',`# Applicability and risk classification

11 October 2026 (IST). Planning only. Machine entries: ${artifact('features.json')}, ${artifact('complete-feature-matrix.csv')}, ${artifact('policy-registry.json')}.

## Classification rule

FULL_PROOFLOOP applies to consequential stateful workflows whose components can individually pass while composition violates owner/financial/authority invariants. Required relevant stages are failure hypotheses, scenarios, reproducible owned initial state, actual service execution, controlled faults, invariant assertions, immutable evidence, executable deterministic replay, permanent regressions and scoped mutation/quality validation. UI/device is added where human action/device state is essential. A provider fake does not replace the actual application service.

TARGETED_INTEGRATION fits bounded DB/provider/transport contracts such as owned saved-place CRUD, internal scheduler authentication, storage/ingestion and configuration/migration rehearsals. UNIT_CONTRACT_STATIC fits math/schema/normalization/catalog/primitive modules and supports a full pipeline at their consumers. UI_DEVICE_E2E is primary when browser/native interaction is the missing layer. OPERATIONAL_MONITORING records real timing/delivery/provider/queue effects the simulator cannot certify. MANUAL_OR_EXTERNAL preserves owner/legal/provider/human/device authority. NOT_APPLICABLE avoids a bespoke lifecycle for static marketing/asset presentation. UNKNOWN retains genuinely unresolved implementation/authority, not an automatic low-risk score.

${table(['Treatment','Primary rows','Supporting uses'],Object.keys(c.primary).map(k=>[k,c.primary[k],c.supporting[k]]))}

The primary count denominator is ${c.featureMatrixRows} distinct IDs. The ${f.length} curated behaviors have ${curatedPrimary.FULL_PROOFLOOP} full-pipeline candidates; maintain/extend/defer recommendations distinguish proven scope from missing paths. ${artifact('features.json')} includes concrete gaps and source-backed intended behavior for every curated row. Smaller source units carry function declarations, branch/throw/catch observations, real-route traces, direct test imports and an explicit static-layer rationale. These summaries do not certify all branches.

## Invariant groups

${table(['Domain / IDs','Existing invariant / forbidden state','Residual treatment'],[
 ['Booking BK-01–08','Server-owned quote; current actor/object; legal CAS transition; one terminal financial outcome','Form/reload, expiry and all illegal edges, with actual service/UI execution'],
 ['Dispatch DS-01–09','One assigned captain; requested class/capacity; owned offer; claim-time eligibility; no receipt-time freshness promotion','Alternate acceptance and feasibility-policy gaps; race/delayed-worker replay'],
 ['Finance FN-01–15 / MP-01–02','0%/10% approved basis; original reservation owner; exact money-purpose/event identity; no duplicate capture/refund/earnings/payout','Maintain accepted owner-hold witnesses; extend payout/marketplace/ambiguous external effect boundaries'],
 ['Cancellation CN-01–07','Confirmed charge/provenance; waivers/caps; release correct capacity; each owner hold retained until terminal; recovery independent of blame','Cross-role/native races, multiple cancellations, replacement and later-pickup authority'],
 ['Responsibility RS-01–08','Immutable incident/evidence; missing facts mandate review; advisory model cannot create consequences; final lineage controls liability/strike','Maintain current scopes; unsupported detectors/financial semantics, real notice/review UI and Phase 9D permissions separate'],
 ['GPS GP-01–05','Observed versus receipt time; accurate/fresh evidence; terminal share privacy; fallback is not blame','Real device/GPS/maps/connectivity and provider-history instruments'],
 ['Search AI-01–07','Source-grounded draft; user detail selection and final review; deterministic booking validation; model not label/booking authority','Preserve Search gates and pending datasets/provider queues; no resumed evaluation'],
 ['Messaging WA-01–04','Raw signature; owned message/session/event identities; provider acceptance not delivered notice','Cross-delivery order, committed-state/outbound failure and retry evidence'],
 ['Security SC-01–06 / ops OP-01–06','Signed identity/role/owner; fail-closed scheduler caller; deployment/test separation; guarded maintenance writes','All registered-route authorization matrix; distributed jobs and isolated maintenance contracts'],
 ['UI/compliance/tooling UI/LG/EX/UX','Current actor-bound state; accurate accessible disclosures; original approval versus draft/operational behavior','Conventional primitive contracts + selected device/human/provider layers; no public framework build'],
 ])}

Each feature JSON records required inputs, actors, concrete writer locations, related models, forbidden states, prerequisites, observations, current tests and reuse. Original VM fields retain original preconditions/action/expected outcome. These fields are partial where product authority or current enforcement is unknown; the audit does not invent an invariant to complete a blank.

## Ordinal rubric

Scores are independent potential-impact estimates, not production probability or invented frequency. 1 = minimal, 5 = maximal within the declared dimension. Financial exposure is not a rupee estimate.

${table(['Dimension','1 / 3 / 5 anchors'],[
 ['Consequence severity','Cosmetic / recoverable important failure / unauthorized irreversible financial, safety or authority effect'],
 ['Financial exposure','No money / bounded obligation display or adjustment / ledger/provider transfer/liability corruption'],
 ['Customer impact','Incidental / degraded recoverable workflow / stranded ride or private/financial harm'],
 ['Driver impact','Incidental / interrupted bounded work / earnings, liability, strike/block or safe-work harm'],
 ['Security/privacy','Public copy / owned personal metadata / administrative authority, private document/location or account data compromise'],
 ['State complexity','Pure computation / local multistep state / multiactor clocks, ledgers and finality'],
 ['Concurrency','Independent operation / duplicate/read-modify-write / competing consequential commits and external acknowledgements'],
 ['External uncertainty','None / controlled provider contract / physical/vendor outcome with incomplete observations'],
 ['Detection difficulty','Immediate explicit error / logs or reconciliation / silent state/financial harm requiring external evidence'],
 ['Frequency/exposure','UNKNOWN until real operational evidence; no score fabricated'],
 ['Actual failure history','UNKNOWN unless a source-bound failure/incident is recovered; audit hypotheses are not incidents'],
 ['Verification strength','No recovered direct evidence / inspected relevant assertions / comprehensive same-scope execution + replay + mutation + required UI/device (not claimed globally)'],
 ['Reuse','No applicable assets / unit/provider/clock pieces / existing actual-service DB/fault/evidence/replay pipeline'],
 ])}

P0 denotes consequential money/authority/privacy/safety state. P1 denotes bookings/dispatch/time-sensitive recovery. P2 denotes bounded important correctness/usability. P3 denotes lower-impact conventional contracts. UNKNOWN priority/dimensions remain unresolved. Shared helpers do not inherit an expensive bespoke pipeline simply because a P0 caller uses them.

## Current verification limits

The static test inventory contains 1,880 test/describe/it declarations across 221 source files; dynamic subtests, independent runners and historical versions make this incompatible with a current executed-test total. Direct import, filename, declaration and fake assertion are separate from execution. Selected assertion reads demonstrate commission ₹799/₹800, narrower suspension/reliability readiness, refund identity, scheduled fixture persistence, owner-hold/replacement financial witnesses and fake payout batch execution. No test was run in this audit.

Historical backend totals, scoped coverage/mutation and replay totals are retained per original manifest. Do not add overlapping native/browser/Phase 9B mutation populations or claim 100% project coverage. Exact saved-input UI replay remains distinct from native recipe repetition/backend replay. Safe-area/keyboard/gesture/native Maps/GPS fidelity is not inferred from Expo web.
`);

await write('methodology.md',`# Audit boundary, discovery methods and reproduction

The audit begins from the dirty working tree, not HEAD alone. ${artifact('repository-inventory.json')} binds HEAD, original porcelain status and 1,444 content hashes plus metadata/exclusion records. The live read ledger is not an atomic snapshot. ${artifact('evidence-verification.json')} recomputes content identities, marks concurrent changes and checks historical evidence without executing it. Restricted environment/key/profile/production-data content is never read. Binary/generated/vendor paths are counted or metadata-accounted instead of semantically parsed.

Independent passes: filesystem/package-root discovery; TypeScript AST imports/dynamic-import literals; entrypoint-root import closure; literal Express registration/middleware mounts; a bounded audit copy of Code Atlas symbol/call/reference/Prisma/UI discovery; a second actual-router AST parser; Prisma delegates and financial data keys; raw SQL/schema/migration/trigger candidates; timer/queue registrations; provider imports/calls; environment-key and alias/client-config references; documentation/policy/owner-source recovery; and source test/assertion discovery. Actual relevant code ranges are inspected for money, auth, transactions, eligibility, cancellation, onboarding, search, messages and evidence decisions.

The unmodified Atlas attempt hit the 4GiB V8 heap limit after including retained mutation directories. An audit-only copy excludes .stryker-tmp/.expo and implicit dependency/library loading. The original scanner stays unchanged. Adaptation/original byte hashes and remaining diagnostics are in ${artifact('static-dependency-graph.json')}. The independent route count still matches 105/105. The broad UI path-object heuristic is independently corrected: 28 objects outside router registration and eight missing pathless layouts; actual-router denominator 54. ${artifact('navigation-reconciliation.json')} preserves each disposition; legal/tab navigation-link data remains in source/UI discovery. ${artifact('subproject-inventory.json')} records package roots and script names without executing them. Repeated policy statements retain separate source-occurrence IDs in ${artifact('policy-occurrence-reconciliation.json')}.

The Supabase and Postgres skills were used for static connection/privilege/transaction review. The [official connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) was consulted; the skill's Markdown changelog lookup returned an unsupported content type. No Supabase project, database, deployed grant or provider account was accessed.

## Reproduction

The following commands only write within the audit folders and do not load application modules, run tests, create a DB, execute receipts or call providers:

\`\`\`powershell
node docs/audits/proofloop-project-wide/discover.mjs
node docs/audits/proofloop-project-wide/atlas-adapter.mjs
node docs/audits/proofloop-project-wide/enrich.mjs
node docs/audits/proofloop-project-wide/compile.mjs
node docs/audits/proofloop-project-wide/evidence.mjs
node docs/audits/proofloop-project-wide/reconcile.mjs
node docs/audits/proofloop-project-wide/reports.mjs
node docs/audits/proofloop-project-wide/validate.mjs
\`\`\`

Preserve this run before reproducing: discover rewrites its audit baseline. On a large dirty workspace, use the bounded adapter instead of discover's final unmodified graph stage. No reproduction command is a production authorization. Existing code/test checks were not rerun because application surfaces were not changed. The audit validator checks references/counts/IDs/hash identities and report consistency only.

## Explicit limits

Runtime-reference evidence is static registration/call/import resolution, not a live deployment attestation. Dynamic/computed routes, callbacks, dependency injection, aliased ORM stores, SQL function bodies/dynamic statements, notification event ordering and deployed config/grants retain uncertainty. Statements inside policy/implementation documents are rule candidates until approved provenance and current enforcement agree. Legal conclusions/provider certification/physical issuing-authority truth/real device conditions require the proper external authority.

The UNKNOWN/UNMAPPED denominator is not one bucket of low-risk features: ${artifact('unmapped.json')} records distinct UI handlers, internal units, configuration/rule candidates and SQL candidates with source-specific reasons. Explicit unknown discovery accounting does not establish exhaustive semantic closure. The full audit therefore remains PARTIAL even though every statically registered API/job/router construct is reconciled.

The existing evidence manifests bind historical source versions. Current source drift and mutable pointers are separately reported. Active Phase 9C form/review/device recipe source was re-read after detecting change; no completion claim was advanced from unexecuted code. Only the audit folders were written; no code, policy, schema, frozen model, flag, tests, deployed workflow or production data were changed by this task.
`);

const interactions=[
 ['I-01','Booking × pricing','BK-01,FN-01,FN-15','Signed route/class/add-on base must match stored economics','Stale quote plus zone update; different client/server price basis','Quote bytes/version, class/route/add-ons, customer confirmation, clock'],
 ['I-02','Booking × payment × capture','BK-03,FN-04','One authoritative capture and corresponding booking/advance obligation','Capture before order response or after cancel/timeout; duplicate different provider events','Payment purpose/amount/currency/key, raw signed bytes, provider snapshots, before/after DB state'],
 ['I-03','Booking × assignment × eligibility','DS-06,DS-07,DR-04,DR-06','Current owner/class/capacity/doc/payout/block contract at every actual claim','Generic acceptance bypasses owned-offer callback; approval changes after preflight','Owned offer/driver/vehicle/booking, document/destination versions, transaction barrier, auth'],
 ['I-04','Scheduling × GPS × ETA × commitments','DS-02,DS-03,GP-01,GP-03','Physically feasible timing must use approved policy; unknown remains unassessed','Spatially near but impossible future commitment; old observation/new receipt; delayed sweep','Observed/received time, route request/response/traffic/cache identity, whole commitment chain'],
 ['I-05','Assignment × cancellation × replacement','CN-03,CN-05,CN-06','One current captain; previous owner incident and independent replacement economics','Arrival/accept/late-cancel race; multiple consecutive cancellations','Frozen pickup promise, owner/cycle/offer/event identities, ordered DB commit barrier'],
 ['I-06','Replacement × deposits × wallet','CN-06,FN-09,FN-08','Original owner reservation retained until terminal; every owner gets own release','Legacy booking key reused or release to current driver','All ledger keys/owners/amounts, reservation handoff and terminal state'],
 ['I-07','Cancellation × refund × provider reconciliation','CN-01,CN-02,FN-05,FN-06','Confirmed capped fee, refund balance and monotone owned external outcome','Lost refund response; late failure/processed; capture concurrent with cancel','Evidence snapshot/confirmed amount, refund identity, raw events and provider history'],
 ['I-08','Completion × settlement × commission','BK-07,FN-01,FN-02,FN-07','Gross/base/coupon/advance/compensation/commission sources reconcile once','Duplicate terminal action, unmatched share repricing, loyalty exception','Stored historical bases, reward/ledger snapshots, terminal CAS and provider/cash state'],
 ['I-09','Compensation × controlled earnings × payout','RS-05,FN-07,FN-10,FN-11','Final-only liability; FIFO entitlement; gross intact; recover at most once','Cash delays recovery; destination/earnings change during payout; duplicate recovery','Final/evidence IDs, entitlement allocations, earning keys, destination version and provider key'],
 ['I-10','Responsibility evidence × guard × admin authority','RS-01,RS-02,RS-04,RS-07','Raw model result cannot independently become final/money/strike','Missing evidence, stale review, wrong role, worker crash/resume','Immutable evidence/hash, frozen config, raw/gated analysis, signed actor, lease and final lineage'],
 ['I-11','Reliability blocks × new work','RS-06,DR-07,DS-06','Upheld current block prevents new work while accepted-work recovery remains separate','Block added after offer; expiry/indefinite removal races accept','Block/strike/final IDs, clock, auth, locked driver and pending offers'],
 ['I-12','Search extraction × Places × form','AI-01,AI-02,AI-03,AI-05','Grounded selected detail and explicit form final confirmation; no model submission authority','Stale form revision, invalid detail ID, source-zone/date conflict','Original source/spans, trusted edits/revision, provider details/session, final review flags'],
 ['I-13','WhatsApp × identity × booking × payment','WA-01,WA-02,WA-03','Signed customer intent and durable committed booking must survive message/send failures','Concurrent messages reorder session; create succeeds but confirm handoff fails','Raw signed input/message/phone IDs, session revision/step, quote, create outcome and outbound identity'],
 ['I-14','Notifications × state changes × appeal','WA-04,RS-03,DS-09','Accepted versus delivered is explicit; failed notice starts no appeal clock','Lost alert after claimed send; FCM receipt assumed informed; reordered status','Provider acceptance/delivery/receipt clocks, retry key, notice identity and deadline'],
 ['I-15','GPS × arrival × cancellation charge','GP-01,CN-01,BK-08','Fresh observation/accuracy + verified proximity/reached controls fee and milestones','Buffered location uploaded now; same receipt used as fresh evidence','Original device fix/timestamps/accuracy, server clock, calculated distance and decision snapshot'],
 ['I-16','Session/auth × all customer/captain/admin actions','SC-01,SC-02,UI-01,UI-02,UI-03','Role and object ownership enforced by server despite client state','Expired session, switched actor, protected UI reached through deep link','Signed identity/claims, object owner, API response, browser/native navigation state'],
 ['I-17','Workers × DB commit × replay','OP-01,OP-02,RS-07','DB uniqueness/leases/CAS carry cross-instance correctness, not in-process inFlight','Crash after commit before ack; two workers; late scheduler backlog','Clock, ordered task/events, lease owner, transaction phase and complete initial state'],
 ['I-18','Customer × captain × admin applications','UI-01,UI-02,UI-03,CN-06,RS-04','Same booking/reference/owner/money/evidence after refresh and role changes','One screen stale after replacement; review finality shown before server commit','Actor-bound app/API/source identities, UI actions/time, ordered outcomes and final DB/provider histories'],
 ['I-19','Payout destination × identity deletion/re-registration','DR-08,FN-10,RS-05','Persistent financial identity and valid accepted-payment option survive edits/deactivation','Sentinel deletion preserves ledger but new registration detaches identity','Original/superseding identity/destination, liability and accepted-ride snapshots'],
 ['I-20','Documents × scanner × cloud queue × existing work','DR-02,DR-03,DR-04,DR-07,OP-02','Owned clean/current/valid documents, atomic replacement, safe accepted-work recovery','Late obsolete scan approval; expired cache; killed task; switched vehicle','Object byte hash/owner/slot/revision/expiry, task/claim/scan/review and active booking state'],
 ['I-21','Policy corpus × RAG × legal disclosures','EX-01,LG-01,UI-04','Retrieved original approved/draft/pending passage status preserved; model not policy authority','Wrong audience; contradictory version; partial vector replacement','Document/version/chunk/content hash, audience, model selection IDs and rendered source'],
 ['I-22','Admin fare zones × safe route × quote/caches','FN-15,GP-04,BK-01','Versioned route/zone choice and actual available surcharge bind quote','Concurrent admin edit creates stale cache or silently drops selected route','Zone/cache/source version, route verdict/provenance, signature and user selection'],
 ['I-23','Maintenance cleanup × cascade × liabilities/privacy','OP-06,SC-06,DR-08','Owned maintenance scope must not destroy foreign/financial evidence','Synthetic phone collides; remote runtime DB; cascading delete with immutable histories','Owned disposable DB identity, intended record IDs, dry-run/commit boundary and cascade audit'],
];
await fs.writeFile(path.join(root,out,'interactions.json'),JSON.stringify(interactions.map(([id,family,ids,invariant,failure,replay])=>({id,family,featureIds:ids.split(','),invariant,canComponentsPassSeparatelyButCompositionFail:true,failureHypothesis:failure,replayInputs:replay,source:ids.split(',').flatMap(x=>byId.get(x).refs),classification:'FULL_PROOFLOOP',confidence:'PARTIAL_SOURCE_REVIEW',status:'SCENARIOS_PLANNED_NOT_EXECUTED'})),null,2)+'\n');
await write('interaction-dependency-map.md',`# Interactions, state machines and transaction boundaries

All 19 requested interaction families are represented below; additional identity/document/RAG/zone/maintenance interactions were discovered. ${artifact('interactions.json')} binds each to feature/source IDs and replay inputs. The graph ${artifact('static-dependency-graph.json')} and per-route callTrace in ${artifact('entrypoint-coverage.json')} retain resolved actual handlers/services. Static callbacks/aliases and deployment edges remain partial.

\`\`\`mermaid
flowchart LR
 Customer[Customer web / WhatsApp] --> Auth[Clerk and ownership]
 Auth --> Quote[Server quote / pricing / routes]
 Quote --> Booking[Booking and advance]
 Provider[Razorpay raw webhook] --> Booking
 Booking --> Dispatch[Offers / eligibility / capacity]
 GPS[Observed GPS / routing / commitments] --> Dispatch
 Dispatch --> Captain[Captain accept / milestones]
 Captain --> Cancel[Cancel / late recovery / replacement]
 Captain --> Complete[Completion / settlement]
 Cancel --> Refund[Refund / reconciliation]
 Cancel --> Incident[Immutable incident / evidence]
 Incident --> Model[Frozen V5 advisory analysis]
 Model --> Guard[Independent deterministic gate]
 Guard --> Human[Notice / appeal / human authority]
 Human --> Final[Immutable final lineage]
 Final --> Ledger[Liability / compensation / strikes]
 Complete --> Ledger
 Ledger --> Payout[Controlled earnings / RazorpayX payout]
\`\`\`

An arrow is an interaction obligation, not proof every branch or unsupported family is implemented. Operational recovery and refund do not wait for adjudication. Unsupported detectors/consequences remain blocked, and deployed shadow permission is not inferred from offline guarded analysis.

${table(['ID / composition','Invariant','Failure scenario / replay inputs'],interactions.map(([id,family,ids,inv,fail,replay])=>[id+' '+family+' ('+ids+')',inv,fail+'; capture '+replay]))}

## Booking edges

Schema states: pending, payment_pending, confirmed, assigned, en_route, reached, started, completed, cancelled, no_driver (${source('backend/prisma/schema.prisma:9')}). Completion/milestone transitions are en_route←assigned, reached←assigned/en_route, started←reached, completed←started (${source('backend/services/rideSettlement.js:14')}). Customer cancellation uses owned current-state CAS in permitted pre-start states; captain cancellation assigned/en_route/reached returns scheduled→confirmed and immediate→pending, with owner/capacity/evidence writes in the transaction. Capture confirmation, no-driver timeout and refund effects have separate handlers/writers.

The complementary AST register contains 29 actual Booking write sites, including DYNAMIC/UNCHANGED entries; it does not falsely convert status predicates into state-machine edges. Legal/illegal edge assertions must consider every writer, actor and money effect. A status enum alone is not transition enforcement. See ${artifact('complementary-discovery.json')} bookingWrites and ${artifact('entrypoint-coverage.json')} writer/model registries.

## Important commit boundaries

- Assignment reads route/readiness before the claim transaction; claim then locks/rechecks driver, CASes booking, conditionally consumes capacity and invokes owned-offer/deposit callback. The alternate generic route omits that callback. Test the actual wrapper, not only the shared CAS helper.
- Customer/captain cancellation joins ownership, capacity, held-money and immutable incident writes. Evidence failure must roll back the transition. External refund/redispatch/send acknowledgement is a later boundary.
- Payment/provider reconciliation must lock/reload identity and preserve terminal semantics. An event-ID unique key alone cannot protect different provider events with the same meaning.
- Payout preflight validates current balance/destination before external create; application provider-state/ledger writes happen afterwards. Stable idempotency key reduces duplicates but does not alone prove race-safe reservation or destination validity.
- WhatsApp shared booking creation, session update and outbound send are separate steps. Inline ordered messages within one webhook do not establish ordering across simultaneous deliveries for the same phone.
- Scheduler inFlight is process-local; distributed leases/constraints are the safety boundary. Scheduled unfilled query excludes bookings already past pickup. Owner alert is stamped before send; reminder failure instead attempts guarded stamp reset. These are different retry contracts requiring explicit operational review.
`);

await write('unverified-requirements.md',`# Unverified requirements, policy contradictions and open findings

Machine registers: ${artifact('unmapped.json')} (${c.unmappedRecords} source-specific records), ${artifact('unimplemented-policy.json')}, ${artifact('undocumented-behavior.json')}, ${artifact('original-scenarios.json')}, ${artifact('ranked-findings.json')}. Counts represent distinct source assertions/operations at several granularities, not ${c.unmappedRecords} confirmed bugs. Do not sum unknown counts across overlapping registries.

## Confirmed current enforcement gaps

Generic acceptance DS-07 bypasses owned scheduled offer/deposit callback/requested class, at ${source('backend/routes/driver.ts:2461')} and ${source('backend/services/driverAssignment.js:52')}. Verified-payout new-work requirement DR-06 is absent from the shared gate, at ${source('backend/services/driverNewWorkEligibility.js:17')}; payout/final-payment checks elsewhere do not satisfy VM-014/042. Document expiry DR-04 is evaluated in document recomputation, while request readiness consumes cached approval (${source('backend/services/driverDocuments.js:135')}, ${source('backend/routes/driver.ts:284')}). Payout replacement FN-10 overwrites current account and clears verification immediately (${source('backend/services/driverFinance.js:69')}), contradicting recovered A-active/B-pending and accepted-ride continuity. These are static findings, not production exploits.

Maintenance OP-06 is separate: clean-bookings has report-only and remote flags, while clean-seed-data logs a nonlocal host without refusing --write. Both are operator CLIs, not registered public routes. Future guard verification must use owned disposable data; neither DB-reading dry run nor deletion was executed here.

## Authority and scope decisions still required

ETA/whole-calendar feasibility, traffic/unknown fallback, timing buffers, scheduled online/connectivity recovery and short-notice collapse remain unassessed or need current owner-approved replacement. Original VM numeric feasibility candidates must not become approved rules from their presence in a table. Current 15/45 owner hold code provenance remains distinct from V1 proportional candidate windows. Later-pickup/customer-choice enforcement is not fully recovered. Group-level sharing economics and the implementation's commission-free loyalty exception need explicit disposition.

Financial semantics for failed pickup, driver late/offline, rider cancellation and replacement failure are NOT_YET_SAFE; platform assignment failure is explicitly nonfinancial. These accepted limits are not permission to implement consequences. Only supported driver-cancellation financial scope is approved for the existing executor. Additional incident-family detector event authority and real GPS/connectivity/traffic history are not fabricated.

Marketplace economics are approved but current claim/post UI is local/not connected; no production marketplace post/claim/settlement endpoint was discovered. OverchargeFlag has no recovered production writer; DriverReview production submission/overcharge moderation integration remains unproven (seeded reviews are not customer submit evidence). Planned multi-stop product support is distinct from rejected/unsupported parser authority.

October 6 Search P2/P3/P4/P5/P6 already resolve omitted year, calendar weeks, explicit timezones, generic negative SUV/XL and bare H12 PM. Older S4 documents saying those are unresolved are superseded. Normalization choice and language unseen challenge/evaluation/rollout are still open. Customer NL UI/handoff and pending S5/S6/S7 evidence remain separate from Responsibility/Phase 9.

## Cross-cutting failure hypotheses

Different freshness bases: dispatch reads location updated_at/receipt horizon, while cancellation/geofence uses observedAt and accuracy. Compare all consumers without blaming a captain from an inferred location. Different idempotency grains: wallet unique event keys, provider IDs, booking/owner incident IDs, conversation messages and final lineage protect different duplicate domains. Test logical conflicting identity/amount, not only duplicate same bytes.

Provider work outside transactions creates lost-response/retry and stale-preflight gaps. Swallowed logging/provenance failures and claimed-before-send alerts can lose observability even when application state is correct. Process-local scheduler flags are not distributed leases. Hardcoded client copy and stale PDF/RAG translations can contradict server economics without changing the server; legal disclosure remains externally confirmable.

No comprehensive production telemetry, deployment grants, retention evidence, exact saved-input UI replay, native Maps/GPS verification, independent human evaluation or live provider certification was acquired. Source controls cannot prove issuing-authority document truth or device behavior. Requirements with incomplete provenance stay in the explicit unknown register.

## Historical findings: current disposition

RCS-01 ordinary 5% commission: superseded by owner-approved current 10% and ₹799/₹800 assertions; do not rebill history. RCS-28 foreign hold/release: corrected in scoped Phase 9 owner reservations, preserve original-owner hold-until-terminal amendment and actual financial/backend replay evidence. RCS-29 refund terminal regression: current row lock/reread/identity/terminal guards supersede old implementation, but broader provider correction/reconciliation scenarios remain candidates. RCS-02 generic acceptance and RCS-03 expiry remain source-confirmed. RCS-04 accepted-work recovery remains an unresolved contract boundary; do not infer safe device completion from status-only tests. RCS-05 feasibility and RCS-30 loyalty remain open scope/authority decisions. Other RCS findings are retained as historical candidates pending exact enforcement revalidation, not blindly called current bugs.

Original V1/VM rows describing tests as missing are historical. Current Responsibility/Phase 9 evidence supersedes those coverage descriptions only within its supported cases/source/config scope. Phase 8.2 retirement removes that earlier blocker. Search/Responsibility partial API/native comparator queues are preserved; no automatic resumption occurred.

## Concurrent changes and evidence discrepancies

${ev.sourceDriftDuringAudit.map(s=>'- '+source(s.path)).join('\n')}

These changes belong to independently continuing Phase 9C. Current reviewAction/payload code was re-read: it binds current evidence/version and validates human decision/classification/level; current form/navigation/cross-role recipe expansion is implemented source, not a newly audited execution PASS. The changed Maps helper was also re-read: it checks the owned test package/outside-repository paths and stages SDK-only TLS domains. No key file was read and no Maps/device execution was performed by this audit. Revalidation warnings accompany UI-01/02/03, BK-02, RS-03/04, EX-04 and GP-02. The source hashes, not a stale HEAD-only checkout, identify audited state.

The selected receipt hashes match. Mutable latest-build/phone-awake pointer mismatch is explicit. Native prose's 156 branch count conflicts with the manifest/raw nine-module total 157; no underlying report was edited or totals combined.
`);

await write('adoption-roadmap.md',`# Proposed adoption roadmap — implementation not authorized by this audit

Continue active Phase 9C independently; do not restart its proven scope or claim upcoming concurrent results. Phase 9D independent human/deployed shadow permissions remains separate. Reuse actual-service/owned-DB/source-bound replay assets first. No public Proofloop framework/generalization is proposed.

${table(['Workstream / priority / effort','Scope and highest-risk invariants','Faults and replay inputs','Dependencies / devices / decisions','Artifacts and completion criteria'],[
 ['W1 New-work authority and eligibility — P0 / large','DS-06/07, DR-02–07, SC-01: owned offer/class/capacity/current documents/verified destination and current block at every claim','Suspend/expire/change vehicle/payout after preflight; compete generic versus owned accept; DB failure/lost ack. Capture actor, booking/offer/vehicle/doc/destination versions and commit barriers','Reuse protected HTTP, isolated Postgres and newWork/dispatch helpers. Owner safe existing-work recovery; actual native accept/reject/settings journey','Route×role×object×new/assigned-work matrix; source-bound receipts/replay; permanent wrapper regressions and scoped mutation; no alternate bypass, one owner/hold/capacity effect'],
 ['W2 Financial continuity — P0 / large','FN-04–13, CN-01–06, RS-05: exact event money base/owner; no duplicate transfer/refund; completing driver gross intact','Gateway commit before timeout; reordered capture/refund/payout; balance/destination race; wallet repair/debt/terminal repeat. Capture full ledgers/provider histories, original owner holds and destination snapshots','Reuse phase9FinancialJourneys/database/raceTransactions/provider fakes and saved replay. Versioned A-active/B-pending destination decision; real contract certification separate','All money-source/obligation/hold/earnings/liability/payout conservation reports; ambiguous provider reconciliation receipts; deterministic independent replay; no meaningful scoped mutant survivors or hidden skipped outcome'],
 ['W3 Scheduled recovery and feasibility — P1 (money/authority boundaries P0) / large','DS-01–09, CN-05–07, GP-01/03, WA-04: one current captain, unchanged pickup promise, correct independent replacement economics','Delayed/missed worker past pickup; far/old GPS; overlapping future rides; offers unresolved; simultaneous recovery/accept/arrival. Capture clocks, route/traffic/observation facts and commitment chain','Extend clear operational recovery first. Defer feasibility/buffers/collapse/connectivity blame until owner approval. Physical GPS/maps and customer/captain browser/native needed','Approved rule/version registry; real dispatch/recovery scenario corpus; full DB/provider/UI evidence; missing facts remain UNASSESSED/review, no invented punishment'],
 ['W4 Provider/event/worker reliability — P0/P1 / medium–large','WA-01–04, OP-01/02, RS-07: duplicate/reorder/crash cannot lose or multiply consequential effects','Message create→session→send gap, outbound failure, duplicate task, leased worker termination/new process, lost ack. Capture raw webhook IDs/signatures, session revisions, leases and retry histories','Reuse actual signed HTTP, notification status fakes, controlled clock and termination/replay. Define retries/dead-letter/escalation ownership; deployment telemetry','Per-boundary before/after fault receipts; real-service retries/recovery, monotone delivery/finality and backlog alerts. Monitoring proof accompanies automation'],
 ['W5 Cross-application and device closure — P0/P1 / large','BK/UI/GP/RS: forms, acceptance, replacement/completion, human review/appeal agree with backend','Double actions, expired session, process death, denied/revoked GPS, deep-link/back/swipe/refresh. Capture actor/source/APK, ordered UI input/state and final DB/provider history','Continue existing Phase 9C; preserve browser/native partial receipts. Dedicated isolated Maps setup, actual phone/settings/keyboard/safe areas. Independent human evaluation Phase 9D','Explicit selected surface/size/device coverage; screenshots and state assertions; current-source repeat comparison; exact saved-input UI replay identified separately until actually provided'],
 ['W6 Responsibility residual families/permissions — P0 / decision-gated large','RS-01–08: frozen advisory boundary, immutable fact/final authority and supported financial family policy','Unsupported/missing/contradictory signal, stale evidence, appeal notice failures, unauthorized deployed writes. Capture facts/raw/gated/final provenance and grants','Maintain phases 1–8/9A/B accepted contracts. New detector/financial semantics need owner authority; deployed zero-consequence role proof and independent review separate','Exhaustive family×detector×evidence×financial classification; blocked negatives; freeze unchanged; explicit permission proof before any later production activation'],
 ['W7 Search/WhatsApp interpretation and confirmation — P1 / large, gated','AI-01–07, WA-02/03: grounded fields/Places details, form requirements, explicit final confirmation, one booking','Hostile/invalid model content, wrong detail ID, temporal/language conflict, provider quota/timeout, repeated confirmation. Capture original spans/timezone/trusted edits/session/revision/provider response','Finish independent S3 UI/S5/S6/S7 and language decisions in authorized order; preserve pending queues/held-out/unseen boundaries. No live evaluation in audit','Versioned owner policy/grounding matrix; actual form handoff/booking contract; independent evaluation receipts when separately authorized; no model authority or automatic submit'],
 ['W8 Operational isolation and maintenance — P0 / medium','OP-03–06, SC-04/06: source/deploy/migration/DB roles and cleanup scopes explicit','Wrong environment/mode; migration rollback compatibility; remote/misidentified cleanup; seed identity collision; shutdown during commit. Capture config key identities/role grants/DB ownership','Owned disposable DB only; CI integration DB; provider/manual operation review; do not run runtime-DB dry-run against real records','Migration/permission/isolation and maintenance negative receipts; deploy/test boundary check; readiness/backlog/rollback operational witness'],
 ['W9 Policy/legal/data authority and corpus — P0/P2 / manual + medium','LG/EX-01/UI-04: approved current rule distinct from historical/draft/legal convention; privacy/tax/vehicle/disclosures traceable','Conflicting PDF/locale/RAG, stale audience/corpus, private export, expired sharing. Capture source/version/approval/citation/redaction metadata','Owner dispositions + professional current legal/vehicle/tax/retention/provider review; no new legal conclusions or binding draft promotion','Authoritative policy registry with no unapproved monetary replacement; source→code→UI→test links; scoped contract/integration assertions and external signoffs'],
 ['W10 Lower-impact modules and tooling — P2/P3 / small','EX-02/05/06/08 and helper matrix: math/schema/theme/i18n/paths/assets/link correctness','Boundary values, malformed schemas, catalogs/font/link/accessibility/layout, parser/generated exclusion failures','Conventional unit/property/schema/static/mutation where relevant; selected visual/device checks. Python/design/unused modules remain explicit status decisions','Maintain applicable tests; no bespoke lifecycle per trivial helper or publication/generalization project'],
 ])}

## Execution strategy

Already adequately verified **at the accepted bounded source scope**: V5 frozen gate/schema/evidence safety; supported final-only financial/reliability lineage; accepted owned DB lifecycle/worker recovery/backend saved replay; owner reservation/commission corrections; nine native safety/transport/staging modules and selected native journey; selected authenticated browser payment/cancel/refund/inspection. Maintain their regressions. A changed source needs a new applicable evidence record; prior scoped percentages do not certify it.

Adopt immediately **after current Phase 9 work and separate implementation authorization**: W1 and clear W2/W4/W8 gaps. Requires product decisions: W3 whole-schedule/short-notice rules, destination safe recovery/loyalty/shared economics, new financial incident families and marketplace enforcement. Requires instrumentation: connectivity/GPS/traffic/history, delivery/event outbox/retries, provider ambiguous effects, backlog/readiness and complete replay inputs. Requires external/human validation: Phase 9D grants, review/appeal operations, Maps/device permission/background conditions, provider contract/certification and legal/tax/privacy/vehicle authority. Lower-risk conventional checks: W10 and source-unit classifications.

Every future full-pipeline completion must name scope and source/config identities; demonstrate actual service/DB/required UI/device paths and controlled faults; validate all relevant invariants; retain immutable evidence and complete replay inputs; perform independent executable replay and permanent meaningful regressions; reconcile scoped mutation/coverage/complexity without adding overlapping totals; list unknown/external limits. No passing happy-path simulator or broad backend suite alone closes a policy or deployed trust boundary.
`);

await write('README.md',`# Project-wide Proofloop audit

Start with [executive-summary.md](executive-summary.md). Detailed [classification](proofloop-applicability-report.md), [interaction map](interaction-dependency-map.md), [unverified requirements](unverified-requirements.md), [roadmap](adoption-roadmap.md) and [methodology](methodology.md) describe the actual scope and limits.

Machine artifacts are under ${artifact('repository-inventory.json')}, ${artifact('complete-feature-matrix.csv')}, ${artifact('policy-registry.csv')}, ${artifact('entrypoint-coverage.json')}, ${artifact('unmapped.json')}, ${artifact('evidence-verification.json')} and ${artifact('audit-evidence-manifest.json')}.

Audit: PARTIAL; static API/job/router reconciliation complete. Implementation: NOT STARTED. Independent Phase 9C continues. No production/model/provider/DB execution or application/policy/schema/test/flag changes are authorized or performed by this audit.
`);
await fs.writeFile(path.join(root,out,'audit-status.json'),JSON.stringify({projectWideDiscovery:'PARTIAL',repositoryInventory:'COMPLETE_DECLARED_BOUNDARY',policyInventory:'PARTIAL',entrypointReconciliation:'COMPLETE_STATIC_PARTIAL_DYNAMIC_SQL',crossSystemAudit:'PARTIAL',applicabilityClassification:'COMPLETE_DISCOVERED_WITH_UNKNOWN',riskPrioritization:'PARTIAL_UNRESOLVED',implementation:'NOT_STARTED',phase9C:'CONTINUES_INDEPENDENTLY',phase9D:'NOT_STARTED_RECORDED_CHECKPOINT',productionShadow:'OFF_RECORDED_NOT_LIVE_QUERIED',productionConsequences:'OFF_RECORDED_NOT_LIVE_QUERIED',searchRollout:'OFF_RECORDED_NOT_LIVE_QUERIED',publicGeneralization:'NOT_STARTED',curatedPrimary,sourceDriftDuringAudit:ev.sourceDriftDuringAudit.map(x=>x.path)},null,2)+'\n');
console.log(JSON.stringify({reports:7,curatedPrimary,status:'PARTIAL_WITH_COMPLETE_STATIC_ENTRYPOINT_RECONCILIATION'}));
