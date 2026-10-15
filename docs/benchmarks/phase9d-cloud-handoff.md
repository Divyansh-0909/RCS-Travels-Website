# Phase 9D-1 cloud handoff

15 October 2026, Asia/Kolkata. This is a source-preservation checkpoint, not a release or acceptance certificate.

## Repository and source preservation

- Repository: `https://github.com/Divyansh-0909/RCS-Travels-Website.git`.
- Original checkout: `dev`, based on `ab03176c205649798db40673aceb8fc5cde119c2`.
- Handoff branch: `wip/proofloop-9d1-custody-handoff`. The existing baseline branch is actually named `dev`; this checkpoint does not rename it to `development`.
- The initial checkout contained 132 modified tracked files and 37,587 untracked files; 36,450 untracked files were under `output/`. Preserve those local artifacts separately.
- Existing source changes are grouped into WIP commits by area. They include application/auth/payment/ride work, Search/RAG, Responsibility evaluations, website/captain/shared UI, Phase 9 verification, and supporting tools/docs. These commits preserve unfinished work and do not imply each intermediate commit independently builds.
- No extraction into the separate Proofloop repository, reset, clean, rebase, force-push, deployment, or production configuration change is part of this handoff.
- Source staging uses `git -c core.autocrlf=false add` to retain exact working-file bytes for source-bound evidence. Do not silently normalize accepted files and then claim their old hashes still match.
- Reviewed `tools/phase9d/*.sql` files are explicitly unignored. `output/`, environment secrets and two diagnostic `.err` files stay local. The small `profiler-vendor` archives are Docker build inputs with checksums in `sql-profiler.Dockerfile`, not execution evidence.

## Last accepted checkpoint

Read [the accepted custody checkpoint](phase9d-1-audit-custody-checkpoint-2026-10-14.md) and [the continuation progress record](phase9d-custody-closure-progress-2026-10-15.md). The latter predates later local executions and must not be treated as the latest runtime account.

During handoff, SHA-256 checks matched all 28 source entries in the local accepted manifest, `output/phase9d-audit-custody-2026-10-14/manifest.json`. Its file SHA-256 was `5b14a6b9dda1781abfdc906a6b0d3fbbd7c0f0c326db02f33e2f677ed1eeec28`.

The accepted scope is bounded committed broker-event custody, verified in isolation. The documented 1,834/1,834 regression and 20/20 custody results belong to their historical source epoch. Overall Phase 9D-1 and independent audit custody remain PARTIAL; production readiness is NO.

## Continuation source and observed executions

The new continuation includes signing epochs and durable signatures (`closure-keys`, `closure-rotation`, `closure-store.sql`), acknowledgement/status checks (`closure-status`, `closure-source.sql`), admission and committed lineage (`closure-admission.sql`, `closure-lineage.sql`, `closure-source-lineage.sql`), ingress/HTTP/observer contracts, restricted capsule orchestration, reconciliation, and closure/observer/lineage tests. Inspect current code before asserting any complete boundary.

The following are summaries inspected from existing local receipts, not tests rerun for this handoff. All files below are under `output/phase9d-custody-closure-2026-10-15/` and are **not included in Git**.

| Local receipt | Observed result | Qualification |
| --- | --- | --- |
| `unit-1792050057696-985896bf-600b-44a0-9971-cfdb839be3b3.json` | 11 tests, 11 pass; code 0; source-stable during execution | Current integration test and `closure-capsule.mjs` differ from its recorded source set. Not current-tree certification. |
| `db-1792049687102-bc6ddb9a-2beb-4bcf-b54a-56fe0b97152d.json` | 8 tests, 8 pass; inner code 0 | `sourcesUnchanged: false`; the runner sets a nonzero process exit for this condition. Current code also differs. Do not accept this as a clean run. |
| `lineage-1792009618471-2b6ac240-5af0-4a9c-8638-58d282c4c7da.json` | 6 tests, 6 pass; code 0; source-stable during execution | Multiple continuation files have changed since this run. |
| `capsule-1792050106726-f0e90029-bf83-4ae5-aeea-2195f7866ce0.json` | FAIL; `CONTRACT` / `TRANSPORT_CHILD_EXITED` | Current files match its recorded 176 dependency hashes. Reproduce and diagnose this failure. The preceding capsule attempt has the same diagnostic. |

A newer `db-1792050175647-9fe5e3a0-bc7f-4328-9d22-66b8ca408a47-build.log` has no matching top-level JSON completion receipt in the inspected directory. Treat that attempt as incomplete; do not infer a pass or a running process.

The independent review follow-up `independent-review-20261015-131250.md` supersedes the earlier observer/admission schema finding at source level: current SQL has a `custody-denial-v1` admission branch. It does not establish a current source-stable database or capsule delivery receipt. The trusted JS rotation operator checks Ed25519; direct custody-owner SQL remains a declared trust-root boundary.

The earlier progress note records Node and Docker startup hangs. Later receipts show they executed subsequently; neither the original cause nor present runtime health was established by this preservation task. Historical `TRANSPORT_CHILD_DEADLINE`, profiling-enabled PostgreSQL crash, Docker startup failure and interrupted broader DB run remain reliability debt. A later passing test does not resolve their causes.

## Cloud evidence availability and resume commands

Git does not contain the raw manifests, receipts, logs, Docker state or coverage/mutation evidence under `output/`. Cloud agents must mark unavailable evidence UNAVAILABLE. This handoff is a local observation summary, not a substitute for those artifacts.

`tools/phase9d/baseline.mjs` currently requires these local evidence inputs before the closure runner can start:

- `output/session-revocation-2026-10-12/manifest.json`
- `output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json`
- `output/phase9c-adversarial-2026-10-11/execution-manifest.json`

`closure-matrix.mjs` additionally reads the accepted custody manifest, `audit-coverage-matrix-current.json` and `readiness-gates.json`. Its outputs use exclusive creation (`wx`); inspect existing outputs before running it. Do not overwrite old evidence or invent missing baseline manifests to make the runner start.

Start with repository inspection and bounded Node/Docker startup checks. Install dependencies using the checked-in lockfiles in a suitable environment. With the required historical evidence securely available and verified, run from the repository root:

```powershell
node tools/phase9d/closure-run.mjs unit
node tools/phase9d/closure-run.mjs db
node tools/phase9d/closure-run.mjs lineage
node tools/phase9d/closure-capsule.mjs
node tools/phase9d/closure-run.mjs typecheck
node tools/phase9d/closure-run.mjs full
```

If those historical inputs are unavailable, first reconstruct an honest evidence-availability and remaining-work matrix from source. Generate fresh disposable verification evidence with explicit new provenance; do not claim reproduction of an unavailable accepted epoch. The closure DB runner builds `sql-profiler.Dockerfile`, whose base image is a locally tagged PostGIS/pgvector image. See `backend/tests/helpers/postgisEnvironment.js` and `backend/tests/fixtures/postgis-pgvector.Dockerfile` for its recipe; a fresh cloud host will not already have the local image.

Remaining work includes the current capsule failure; source-stable current unit/DB/lineage runs; complete committed source/outbox/receiver/guard and independently delivered denial/recovery coverage; real database restart and signing-epoch interruption/concurrency; bounded backlog/storage; explicit saved-input replay; affected SQL native/logical/privilege/mutation certification; critical JS quality; independent review; and a source-bound closure manifest reconciling every original criterion. Read the accepted checkpoint's full gate list before narrowing scope.

No application source was redesigned for this handoff. Website build, backend typecheck/tests and captain lint were not rerun as part of source preservation. Run the relevant checks before claiming the resumed work is verified:

```powershell
npm --prefix frontend run build
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix driver-app run lint
```

## Production restrictions

Phase 9D-1: PARTIAL. Phase 9D-2: NOT_STARTED. PRODUCTION_READY: NO. Deployment: NOT_AUTHORIZED. Production shadow, auto-adjudication, consequences and Search rollout remain OFF.

Use owned disposable databases, synthetic identities and isolated/fake providers for ordinary continuation. Preserve frozen V5 and accepted authentication identities. Do not use real customer/captain data, live incidents, paid provider calls, production credentials or deployed authentication bypasses. External privacy/retention approvals, blind human labels, production capacity/availability, monitoring ownership, financial/admin authorization, IAM/egress/grants, independent administrative custody, stopped-first rollout and separate activation authorization remain gates. Proofloop extraction waits for stable RCS interfaces and sufficient verification.

## Preservation checks

The grouped source commits were staged with exact-byte comparisons against their working files. `git diff --cached --check` (with CRLF recognized as a line ending) reported existing whitespace findings in 5 commit groups; source bytes were preserved instead of reformatted. This is not a clean whitespace-check claim. No runtime validation was rerun.

- `01-backend`: 4 findings in `backend/services/driverAssignment.js`, `backend/tests/quality/stryker.phase4.config.mjs`.
- `02-search`: 3 findings in `backend/tests/rideSearchOwnerDecisionSafety.test.js`, `docs/search/benchmark-v1/CORE_REVIEW_REQUIRED.md`, `docs/search/benchmark-v1/owner-policy-v2/FAMILY_REVIEW.md`.
- `03-responsibility`: 1 findings in `backend/tests/responsibilityBenchmarkEvaluation.test.js`.
- `04-website`: 3 findings in `frontend/src/lib/responsibilityReviewAction.js`, `frontend/src/pages/ManageAccount.jsx`.
- `06-phase9`: 2 findings in `backend/tests/helpers/phase9ReviewHttpFixture.js`, `backend/tests/integration/phase9ReviewHttp.test.js`.
