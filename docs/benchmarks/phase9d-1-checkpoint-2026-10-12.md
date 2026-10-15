# Responsibility Phase 9D-1 isolated shadow readiness checkpoint

12 October 2026 IST. Scheduled start condition verified at 21:22 IST (15:52 UTC), after the required 21:21 boundary. **PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.** This is preparation and disposable execution, never production activation. Final source identities, selected executions, original failures and actual counts are in [the execution manifest](../../output/phase9d-1-2026-10-12/manifest.json). Current readiness is classified per criterion in [readiness-gates.json](../../output/phase9d-1-2026-10-12/readiness-gates.json).

The accepted [session revocation checkpoint](session-revocation-checkpoint-2026-10-12.md) supersedes the older 9C JWT observation. All three accepted auth sources and all 22 frozen V5 identities matched before implementation. The older 9C manifest has six later differences, retained in the new baseline record. No authentication middleware, policy, frozen identity, financial/commission/deposit rule, production setting, application UI, applicability-audit file or historical expectation was edited by this task. No subagents, real incident collection, live evaluation/auth/provider load, notifications, deployment or commit occurred. The rejected Vite cleanup was not retried.

## Actual shadow execution and authority map

The inventory artifact binds the actual imports, entry points, writes and migration grant statements to source hashes. It is a navigation inventory; the map below is based on inspected exact implementation.

| Transition / actual source | Process, data and transaction | Authority, retry and failure boundary |
| --- | --- | --- |
| Protected driver cancellation ? driverRideCancellation.js ? driverCancellations.js:97 | Existing app identity and Prisma DATABASE_URL; cancellation, responsibility_cases and immutable evidence/work are committed together | Shared fresh Clerk admission + existing ownership/status checks; collector creates NEEDS_ADMIN_REVIEW without AI. Evidence failure retains existing transaction rollback contract. |
| Protected customer cancellation/late recovery ? customerLifecycleIncidents.js ? lifecycleIncidentEvidence.js | Existing business transaction records supported rider-cancellation/late-driver recovery facts; stable source key and evidence version | No fabricated failed-pickup/offline/platform-assignment/replacement detector; observed recovery is not automatic blame. |
| Shadow evidence enqueue ? responsibilityShadowRepository.js | Validated evidence hash; responsibility_evidence_versions and responsibility_adjudication_work upserts; mutable case snapshot updated by existing app credential | Logical key binds case, hash, contract, analyst configuration and policy. Original app credential can write operative tables; this is not a privilege boundary. |
| Existing responsibility-finalization job ? lib/jobs.js:11,76 ? routes/internal.js | Same application process/credential; shadow sweep is followed by finalization, reliability and finance | Internal caller uses Google OIDC audience/service-account checks (development secret path is production-disabled). Combined job is inappropriate for dedicated shadow execution. No new job registered. |
| Original lease ? responsibilityShadowRepository.claimNext | Actual FOR UPDATE SKIP LOCKED; attempts, claimedAt and leaseUntil; default 2-minute lease/4 attempts/backoff/manual retry limits | Original claim uses app credential and claimedAt stale-claim protection; configuration flag does not remove writer authority. Rehearsal adds explicit UUID capability/owner/epoch/expiry checks. |
| Evidence ? analyst ? responsibilityShadowAdjudication.js:157 | Schema/hash/case binding; original production factory dynamically loads lib/openai.js through createOpenAIResponsibilityAnalyst | Production default is OpenAI (configured model/default gpt-5.6-mini), not the explicitly injected frozen Jev V5 used by Phase 9 tests. No default factory changed or invoked against a live provider. |
| Explicit offline Jev V5 ? factual validation ? policy/evidence guard | Frozen responsibilityJevV5.js and evidenceCriteriaV5.js; deterministic systemOne transport, frozen questions/settings, existing validateAnalysisAgainstEvidence/evaluateResponsibilityPolicy | Categorical recommendation acquires no tools or human authority. Missing/redacted evidence requires review even at confidence 1.0. No frozen prompt/schema/configuration changed. |
| Original advisory persistence ? responsibilityShadowRepository.complete | responsibility_shadow_results upsert and work completion in transaction; case set NEEDS_ADMIN_REVIEW, not final | This app credential can reach operative modules, but advisory storage itself is not final authorization. Rehearsal persists only a bounded categorical review-pending/execution-off projection. |
| Inspection/retry ? responsibilityAdmin.ts:82,96,105 | Existing shared human admission/admin-role guards; review context includes evidence/history/work/results | Sensitive role/object access and evidence supersession remain existing behavior. No inspection UI changed. Rehearsal inspector is a separate read-only DB principal, not a new human-facing route. |
| Human review ? responsibilityAdmin.ts:109/129 ? responsibilityReviewService.js:119 ? lifecycle repository lock | Separate human action, expected version/hash precondition, locked case, review/appeal/finalization contracts | A waiver can advance directly to finalization; upheld outcomes use the durable consequence handoff after their notice/appeal contract; an adverse outcome preserves the notice/appeal contract. Shadow principals cannot create a human review/final decision. Admission revocation is not execution-time cancellation. |
| Operative finality ? consequences/financial/reliability/compensation/liability/wallet/payout modules | Durable final authority, incident/evidence/policy binding, transactions, wallet idempotency and provider dispatch | Existing broad app credential and scheduler identity remain outside rehearsal worker authority. Catalog denial covers every migrated public table; selected actual services are separately attempted. No operative module rewritten. |

Current deployment files describe the combined Cloud Run backend, scheduler and shared application secrets. They do not prove deployed shadow-only grants or IAM. Existing grant/RLS migrations protect Data API access, but a shared privileged application login is not a dedicated shadow principal. Deployed identities/grants/extensions were neither read nor modified.

## Implemented isolated boundary and executable proofs

New code lives in tools/phase9d plus two backend test files. permissions.sql is an **unapplied disposable rehearsal**, not a migration. Its launcher validates loopback and a harness-owned rcs_verify_* database and uses the existing pinned PostgreSQL/PostGIS/pgvector migration harness.

Separate nonlogin owners control the shadow and audit schemas. Separate actual logins perform capture, execution, operations, inspection and independent denial recording. Worker has no application-table grants, owner/superuser/bypass-RLS privileges or role memberships. Default PUBLIC application access and routine EXECUTE are revoked only in the disposable database. Definer routines use fixed trusted search_path, pg_temp last, and no dynamic SQL.

The real worker is given only its dedicated login through IPC, an allowlisted environment, denied runtime URLs, the existing loopback fence and an explicit offline V5 transport. It never receives Clerk, Google, payment or provider secrets. This proves the executed child environment, **not hostile native/process/filesystem containment**; the developer OS/repository is shared. A separate image/IAM/egress/broker deployment is an outstanding gate.

Direct SQL exercises UPDATE/DELETE/TRUNCATE/INSERT against **all 51 migrated public tables**, with two attempts each, plus escalation, schema/temp shadowing, control, audit and retention attacks: **436 denials** in the completed isolation witness. Independent inspector state hashes cover actual seeded synthetic users, drivers, bookings, payments and every application table before/after, with no partial consequence. No Phase 9 consequence-denial trigger is used as the principal's authorization boundary.

Actual finalization, financial and reliability sweeps, human review, payout batch execution/creation and wallet posting are attempted using the real shadow Prisma login. The service probe also deliberately grants schema USAGE temporarily, so table permissions must still deny after that independent namespace defense is removed. The grant is restored afterward. PostgreSQL hides inaccessible schemas from unqualified lookup (42P01); the qualified/table-level denial probe obtains 42501. An earlier probe expecting only 42501 and a wrong wallet enum were fixture defects, retained and corrected without changing operative code or historical expectations.

The bounded capture routine rejects known raw-value/source/quality/reference/extra-field bypasses and oversized records. Result persistence rejects final mode, unsupported route/classification/severity/confidence and oversized output, and strips free text/extra fields. Factual-validation metadata is bounded to booleans and adapter/schema/frozen/model identities are constrained. This is not a fully audited production privacy schema.

Audit ownership is separate from the worker/model and ordinary shadow owner. Worker cannot rewrite/delete/truncate/append arbitrary audit history. Queue transitions and audit append share a transaction. Revoking append permission causes claim rollback with unchanged queue/attempt count; the independent recorder records the outage. Independent external audit custody and complete failed-SQL delivery remain proposed: supervisor-recorded test denials do not prove a hostile worker cannot suppress a deployed application log.

The kill switch, lease/race/restart/backlog/quota/deletion behavior and metrics/data sources are detailed in [operations](phase9d-1-operations-2026-10-12.md). SQL mutations deliberately remove capture stop, claim stop, privacy validation, epoch, lease expiry, capability and quota checks; original probes deny, each mutant exposes the forbidden isolated behavior, and original definitions are restored. This is **seven targeted SQL mutation witnesses, not a complete PL/pgSQL mutation/branch certificate**.

## Privacy, calibration and authentication carry-forward

[Privacy/calibration preparation](phase9d-1-privacy-calibration-2026-10-12.md) inventories fields, purpose, access, provider disclosure, logging, provenance and deletion. Synthetic personal text/credentials/coordinates are omitted, case/booking/reference IDs receive keyed pseudonyms, original evidence is untouched, and redacted integrity can be verified. Current projection redacts all values, marks unknown/incomplete and forces review. A useful approved causal projection, real retention/legal-hold policy, lawful purpose/notice and provider disclosure remain missing. No real sampling/labels/outreach/transmission occurred.

The blind two-reviewer/adjudication protocol, uncertainty/sample-size rationale and harm-based suggested gates require separate approval. No synthetic integration label is reported as independent human calibration, and no numeric threshold is derived solely from V5 development results.

The actual authentication guarantee is admission after a fresh active Clerk response, covering 89 fully protected routes and one conditional coupon. Same-request guard reuse is preserved; no cross-request cache, fallback, retry or revocation redesign was introduced. The four-replica synthetic guard run executes 8,000 fresh lookups, 4,000 synthetic quota denials and stalled-slot recovery without provider traffic. Frequent offers/tracking/moving locations and shared instance budgets remain deployment blockers. Production measurement and an agreed provider capacity/availability plan are outstanding, as are real metrics/alerts.

Payout iteration/external dispatch, human-final review/appeal actions, reliability moderation, exceptional financial correction and operational resume need execution-time authority/context/idempotency/locking assessment if that stronger guarantee is required. Already admitted requests are not cancelled by revocation. No financial policy/settlement or request-admission behavior changed.

## Historical failures and quality scope

The original broader 54/58 disposable result and all new failure logs remain unchanged. Two exact earlier permission-script source snapshots were recovered by matching recorded hashes against untouched retained mutation sandboxes, including the failed SQL scaffold; recovered-source-custody.json binds them. A targeted historical reproduction reports 7/11 pass and four counted failures: three leaf provisional-route assertions plus their failed Phase 7 parent. A deterministic source-bound trace rejects those generic recorded:true fixtures through INDEPENDENT_ROUTE_AUTHORITY, consistent with the accepted October 8 guard requiring independently established causal facts. Clerk is not in this path. Historical fixtures/expectations need separate authoritative maintenance; downstream assertions after their failed early assertions remain unexecuted. Nothing was weakened to make them pass.

The two new critical JS helpers have **100% statements/branches/functions/lines** (57 statements/lines, 27 branches, 10 V8 functions), **71/71 killed mutants**, zero survivors/timeouts/errors, cyclomatic maximum 4, cognitive 2, Halstead Difficulty 16.105, CRAP 4, largest source 32 physical LOC and zero clones at five lines/50 tokens. Original 60-killed/11-survivor mutation output is retained. These numbers certify the two helpers only. The worker-process/launch orchestration is outside that helper certificate. Full critical entry-point and stored-routine coverage/structural instrumentation is **NOT IMPLEMENTED**; targeted SQL mutations do not satisfy the owner's complete critical-code quality requirement. This is an internal reason Phase 9D-1 remains PARTIAL.

Final accepted executions: **backend 1,784/1,784; new disposable readiness 18/18; current lifecycle 50/50; paired replay 37/37; independent saved-input replay 36/36; protected cross-application 3/3 suites**. Backend typecheck, scoped lint and Git whitespace pass. The lifecycle/replay/HTTP executions preceded final metadata-only changes in the new private SQL/test; their actual application/frozen import graphs are unchanged. The final 18/18 DB run executes the metadata-hardened source. Exact epochs and exclusions remain in the manifest. A first backend pass is 1,784/1,784. A later resource-constrained full run is 1,773/1,784, with CLI/source-loader subprocess deadlines and a shared offline diagnostic setup failure; it is retained as a failure. Local free memory was approximately 430 MB during concurrent verification. Owned Phase 9/replay test descendants were interrupted to relieve pressure, with launchers retained for cleanup; no unrelated process was stopped. Migration-deadline, SQL scaffold, fixture and source-change failures are not relabeled as passes. Final serialized checks are selected explicitly in the manifest.

No native/browser UI suites were needed because no UI/runtime client contracts changed. No live provider evaluation, Search/Luna/held-out rerun, deployment or production incident was performed. The offline backend regression includes existing fixture/cached diagnostic unit tests only.

## Readiness decision and every outstanding gate

The machine-readable [criterion matrix](../../output/phase9d-1-2026-10-12/readiness-gates.json) classifies every security, operations, privacy, model/guard, calibration, deployment and quality criterion. The [unapplied topology proposal](../../tools/phase9d/deployment-proposal.json) names the required separate identities, grants, secrets, ingress/egress and stop/reconciliation sequence.

Outstanding gates include: full critical worker/entry-point and SQL quality/coverage certification; a production-compatible bridge/outbox and server clock/retry contract; dedicated hostile-process/filesystem/IAM/secret/egress containment; effective deployed grants/security-definer/extension verification; independent external audit and denial completeness/retention; useful approved causal evidence projection and provenance custody; real purpose/notice/provider disclosure/retention/legal-hold approvals; independently labeled real cases and quantitative approval; provider token/currency budgets and independent timeout/admission enforcement; faithful isolated HTTP/auth journey capacity/tail/outage verification plus authorized production measurements and shared Clerk budget agreement; actual telemetry/alerts/on-call/reconciliation owners; execution-time human-financial authorization/concurrency policy verification; explicit production adapter selection; a stopped-first rollout/reconciliation exercise and separate explicit deployment/activation approval. Any unfinished/failing current verification is an additional internal blocker, enumerated in the final manifest.

VERIFIED_IN_ISOLATION does not mean PRODUCTION_READY. No passing checklist activates shadow processing or grants finality.

RESPONSIBILITY PHASES 1?8: VERIFIED

HISTORICAL PHASE 8.2: RETIRED

PHASE 9A: COMPLETE

PHASE 9B: COMPLETE

PHASE 9C: COMPLETE FOR APPROVED ISOLATED SCOPE

PHASE 9D-1: PARTIAL

PHASE 9D-2: NOT STARTED

PRODUCTION SHADOW: OFF

AUTO-ADJUDICATION: OFF

PRODUCTION CONSEQUENCES: OFF

SEARCH ROLLOUT: OFF

PROJECT-WIDE APPLICABILITY AUDIT: INDEPENDENT

PROJECT-WIDE PROOFLOOP IMPLEMENTATION: NOT STARTED

PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
