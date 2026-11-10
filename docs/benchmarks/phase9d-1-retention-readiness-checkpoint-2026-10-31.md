# Phase 9D-1 — retention, holds and readiness review

31 October 2026 IST. Continues the [retention integration](phase9d-1-retention-integration-checkpoint-2026-10-22.md), [approved hold-procedure packet](phase9d-1-retention-hold-policy-review-2026-10-22.md), [candidate schedule](phase9d-1-retention-schedule-candidates-2026-10-22.md) and [latest native SQL/storage checkpoint](phase9d-1-native-sql-storage-checkpoint-2026-10-31.md). Actual execution receipts retain UTC timestamps.

**Selected local hold ordering/copy snapshots: VERIFIED_IN_ISOLATION. Readiness and approval packets: PREPARED. Complete real copy coverage, category schedule/legal review and human calibration: PARTIAL/PENDING. Whole-SQL and Phase 9D-1 remain PARTIAL. Production OFF; production deletion DISABLED.**

Evidence: [manifest](../../output/phase9d-retention-readiness-2026-10-31/manifest.json), [selected execution](../../output/phase9d-retention-readiness-2026-10-31/selected-executions.json), [native witness](../../output/phase9d-retention-readiness-2026-10-31/native-final/witness.json), [quality](../../output/phase9d-retention-readiness-2026-10-31/quality.json), [readiness](../../output/phase9d-retention-readiness-2026-10-31/readiness-current.json).

## Decisions and simple explanations

The owner confirmed Google, R2 and genuine off-host recovery should **remain pending**. Rajuddin is present for discussion, but the request to explain the twenty rows is not approval. The [approval record](../../output/phase9d-retention-readiness-2026-10-31/approval-current.json) retains the exact earlier section-2 hold approval and leaves every business-duration decision pending. Counsel/CA applicability, authenticated production proprietor binding and production activation are separate decisions.

The [plain-language walkthrough](../operations/phase9d-retention-and-review-decisions.md) explains **all twenty categories**, each with its proposed period/trigger, concrete example and preservation exceptions. It identifies what Rajuddin can accept/amend now and what requires legal/CA classification. Existing candidates are not converted to production TTLs, and historical documents/approvals are not rewritten.

Two people can conduct the proposed initial blind review: Divyansh and Rajuddin are **candidates, not confirmed assignments**. Each must save an independent assessment of fresh, unseen evidence before model output is revealed. Agreement can be recorded. Disagreement stays unresolved/review-required unless a third uninvolved person independently adjudicates it. Their own joint discussion is not relabelled independent adjudication. Developer exposure, proprietor interests and incident involvement remain declared conflicts/exclusions. No real collection or reviewer honesty/independence is attested by software.

## Current copy mapping

The [source copy map](../../output/phase9d-retention-readiness-2026-10-31/copy-map-current.json) reconciles **50 current Prisma models plus _prisma_migrations** against the earlier **51-table / 71-FK** catalog and twenty-category worksheet. The eight reviewed logical links and three explicit object-reference fields are retained. This is a source/schema-candidate reconciliation, not fresh full-schema deployment, constraint recreation or a hosted row inventory.

**Twenty JSON fields and six phone fields** are individually identified for review, with free-text/object-reference candidates. Their contents are not fetched. The map distinguishes:

- Original work/case/evidence/booking to source outbox, with configured HMAC pseudonym dependencies.
- Source logical-key/payload binding to receiver receipt/work identity.
- Journal/lineage to independent custody source/sequence/hash/receipt/public-key identity.
- Driver object references to all provider generations, including soft-deleted copies.
- Registered SQL scopes to encrypted backup generations and current-authority quarantine.

No raw booking ID is assumed present in a minimized custody event. No privacy key, credential or customer row is read. Hashing an entire JSON row detects content change but does not find every embedded reference. Phone equality, FK reachability and separately observed snapshots do not establish complete distributed scope. Actual pseudonym mappings, provider versions/logs/backups and current authenticated copy acknowledgements remain incomplete.

## Focused real PostgreSQL results

[native_retention_readiness_checks.py](../../tools/backups/native_retention_readiness_checks.py) uses the existing owned loopback-SCRAM native PostgreSQL **18.4** infrastructure. One newly initialized server runs at a time; maximum connections eight, shared buffers 32 MiB and work memory 1 MiB. These are not hard process RAM quotas. Profiler preload is empty and plpgsql_check absent. No routine replacement or profiling runs.

The selected current execution passes **44/44 assertions**:

- Actual restricted proprietor/operator logins and immutable declared copy bindings are observed.
- A provisional hold is invisible to a separate session; rollback leaves no durable hold, bridge state or hold audit row.
- A waiting synthetic payload writer is observed via **pg_blocking_pids** behind the proprietor transaction. Committing the hold makes that waiting write fail with **55000**, preserving the original payload.
- Two proprietor sessions submit the same expected epoch. Actual locking is observed; one transition commits and the competing stale request returns STALE. These sessions share one synthetic proprietor identity; they do not prove two real administrators.
- Overlapping holds survive release of one hold. Historical-looking audit times do not cause automatic expiry. Final release reports RELEASED_REVIEW_REQUIRED and no production-deletion authority.
- An unknown newly discovered generation advances the epoch and invalidates the declared inventory. Current-authority reconciliation detects the old backup epoch and retains quarantine.
- A REPEATABLE READ copy manifest remains stable while another connection commits a JSON change; a fresh snapshot changes its row/manifest commitment. An embedded foreign booking ID or shared phone string does not cause an unreviewed row sweep.
- All **17 optional registry/management routine definitions, owners, security modes, search paths and ACLs** remain identical before/after.

The trusted fixture writer is used to test the existing row guard, not an application/user cleanup API. The optional bridge is not automatically installed on all application tables. RELEASED_REVIEW_REQUIRED is a procedure/result state, not universal enforcement of a new review gate on every possible privileged cleanup path. Current production deletion is disabled; actual enrollment and complete mutation-path review remain required. Local locks do not form a global provider hold barrier.

Source-identical historical **23/23 scope**, **33/33 authenticated hold** and **15/15 encrypted backup** results are explicitly reused at their own epochs. Their bound sources match current bytes; they were not rerun. Real provider object holds, physical backup erasure, off-host restore and all-category production integration are not inferred from these counts.

## Human and privacy readiness evidence

The new [offline review checker](../../tools/backups/review_readiness.py) passes **14/14 unit tests**. All labels are synthetic test fixtures. It checks source/evidence/instruction bindings, distinct reviewers, pre-reveal lock chronology, categorical labels, duplicate cases, missing approvals and disagreements. A third adjudicator is optional for agreement; unresolved disagreement cannot be counted as independently resolved. Invalid cases remain in supplied/real denominators; synthetic cases never become real calibration cases.

The [real intake](../../output/phase9d-retention-readiness-2026-10-31/human-review-intake.json) contains **zero real labels**, unconfirmed assignments and no collection/projection/acceptance approval. [Its assessment](../../output/phase9d-retention-readiness-2026-10-31/human-review-current.json) correctly returns INCOMPLETE. PROCESS_EVIDENCE_COMPLETE_ONLY in a positive synthetic test never certifies accuracy, reviewer independence, sample adequacy or production authority. Forms are templates for approved restricted storage; customer data must not be added to repository artifacts.

The [provider register](../../output/phase9d-retention-readiness-2026-10-31/provider-decisions-current.json) covers Supabase/PostgreSQL, Google Cloud Run/GCS, Clerk, Razorpay/RazorpayX, WhatsApp, Firebase/Maps, OpenAI API, R2/GitHub and phone/local/email copies. Source integrations and previous synthetic receipts are distinguished from unverified production settings. Regions, recipients, DPA/subprocessors, legal purposes, retained copies, hold/deletion mechanisms and operator responsibility remain specific decisions. Public provider documentation is not account verification. Current primary references and their practical limits are linked in the walkthrough.

The current isolated privacy projection redacts evidence values; it remains a containment proof, not a useful approved causal projection. Real calibration still needs lawful collection/access, a useful reviewed projection, pre-registered eligibility/exclusions, sample/harms thresholds, case-independent labels and measured results. Financial/human-final authority remains unchanged.

## Exact verification, preservation and stop point

| Check | Result |
| --- | --- |
| Selected focused native PostgreSQL | **44/44 PASS**, server stopped |
| Human-review protocol units | **14/14 PASS**, synthetic only |
| Reused scope / hold / encrypted backup | **23/23 / 33/33 / 15/15**, current matching source identities, not new executions |
| Scoped Ruff / Python AST | **8 active Python files PASS** |
| Git and explicit new-file whitespace | **PASS** |
| Protected existing inputs | **1,384 unchanged**, HEAD and staging index unchanged |
| Existing product/application/SQL sources changed | **Zero** |
| Owned servers | **Two stopped**, no remaining PID files or PANIC/unexpected-signal lines |

An initial 44/44 pass predates the user-requested two-person review-format change in the wrapper's broader source inventory. It is retained unselected; the final 44/44 receipt binds the current complete source scope. The initial static packet builder counted 51 SQL tables as Prisma models; source inspection showed 50 models plus migration metadata. The original builder is retained and the inventory classification corrected. No application defect or database change followed from that assertion.

[Changed-file hashes](../../output/phase9d-retention-readiness-2026-10-31/changed-files.json) and the manifest bind the three new tools, five execution/packet/finalization scripts, walkthrough, checkpoint, snapshots, approval/intake/provider/copy artifacts, selected/reused receipts and quality observations. No historical evidence or previous approval document is edited. The earlier NULL-safe capture_status correction retains its existing 31 October hash; no old SQL epoch is relabelled current.

Twenty host samples across the two short native runs record minimum available RAM **2,507.37 MiB**, minimum commit headroom **12,834.39 MiB**, zero unresponsive taskbar samples; nine samples belong to the selected run. Owner-disabled RAM admission thresholds stay disabled, with deadlines, responsiveness and disk observations retained. Same-host sampling cannot exclude a complete OS freeze. No unrelated app/process/service or global setting changes.

The additive readiness assessment preserves the previous **78 criteria and 20 audit rows** without changing their original evidence/status fields. Schedule approval, legal/CA review, real copy completeness, provider/privacy decisions, blind human calibration, independent administration and production activation remain open. Google/R2/off-host remain pending by owner direction. Default-cache signal-11 remains OPEN/PAUSED; signal-9 remains SEPARATE/UNATTRIBUTED. Accepted P6 cache-OFF 16/16 and P7 14/14 behavioral/native results and the selected P8 register are preserved.

No Docker, crash diagnostic, mutation, real provider/model/customer operation, new live label collection, email, paid resource, production deletion, commit, push, merge or deployment occurs. This local continuation stops with reviewable decisions and isolated tests. **Production stays OFF.**
