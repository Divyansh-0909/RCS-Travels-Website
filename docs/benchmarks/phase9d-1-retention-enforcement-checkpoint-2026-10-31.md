# Phase 9D-1 — disabled retention planning and application cleanup safeguards

31 October 2026 IST. Continues the [owner decisions](phase9d-1-retention-owner-decisions-2026-10-31.md), [native retention/readiness checks](phase9d-1-retention-readiness-checkpoint-2026-10-31.md) and [SQL/storage correction](phase9d-1-native-sql-storage-checkpoint-2026-10-31.md). Evidence: [manifest](../../output/phase9d-retention-enforcement-2026-10-31/manifest.json), [selected executions](../../output/phase9d-retention-enforcement-2026-10-31/selected-executions.json), [native witness](../../output/phase9d-retention-enforcement-2026-10-31/native-selected/witness.json), [quality](../../output/phase9d-retention-enforcement-2026-10-31/quality.json), [current status](../../output/phase9d-retention-enforcement-2026-10-31/readiness-current.json).

**Selected local cleanup safeguards: VERIFIED_IN_ISOLATION. Business schedule subtargets: AWAITING OWNER ANSWERS. Human synthetic pilot: PREPARED/AWAITING BOTH FORMS. Financial retention: CA REVIEW EXCLUDED/PENDING as instructed. Complete retention/whole-SQL/Phase 9D-1: PARTIAL. Production OFF; production deletion DISABLED.**

## 1. Schedule configuration and unanswered decisions

[retention-policy.disabled.json](../../output/phase9d-retention-enforcement-2026-10-31/retention-policy.disabled.json) compiles the recorded business targets into 27 review rules, including subclassified logs/backups and three explicit pending subrules. Production deletion, automatic cleanup, native-gate installation, provider deletion and real-label collection remain disabled.

The user was asked to decide the nonfinancial ride-history endpoint (recommended one year with exceptions), rejected/abandoned-upload window (recommended seven days after confirmed rejection and closed appeal), and raw broker-payload window (recommended ninety days after terminal state and review/appeal closure). No answer has been received in this execution. Those rules remain null and businessApproved=false; proposals are not installed as periods. Existing contact/convenience ninety-day and other already recorded decisions remain intact. Row 10 is separately CA_REVIEW_PENDING.

[retention_policy.py](../../tools/backups/retention_policy.py) is a no-write planner. It uses calendar months/years, handles leap/month ends and distinguishes review dates from deletion authority. Active/overlapping holds, incomplete inventory, open matters, missing business decisions and legal classification block progression. Even REVIEW_DUE never authorizes deletion. **13/13 tests PASS**, including financial deferral and disabled-policy enforcement. No supported immediate self-erasure request is delayed until ninety days by this planner.

## 2. Real application request paths

[accountRetention.js](../../backend/services/accountRetention.js) now supplies the two existing protected account and saved-place DELETE handlers in [users.js](../../backend/routes/users.js). Auth middleware and user ownership predicates remain. Missing/disabled/unreviewed infrastructure refuses cleanup before removal. Application errors are bounded categories; raw SQL/driver errors are not returned to callers.

The local account operation runs gate validation, the existing active-ride check, saved-place removal, existing profile minimization and provider-action persistence in one Prisma transaction. Injected failure rolls back both local mutation stages. Necessary synthetic ride/fare records remain. No Clerk delete is called: the durable action remains WAITING_PROVIDER_REVIEW. The successful synthetic HTTP contract is 202 with that pending status, not a claim of all-provider erasure. Existing Clerk read/auth configuration and other route behavior are preserved.

The optional [application_retention_gate.sql](../../tools/backups/application_retention_gate.sql) defaults disabled, constrains production_deletion=false and permits positive tests only in explicitly configured retention_cleanup_lab_* databases. It is not an application migration and installs no deployed grant/trigger. A same-host owner bootstraps its targets and roles only in disposable fixtures.

The gate shares the existing registry configuration lock order with hold/copy decisions. Explicit post-hold proprietor review binds epoch, inventory/policy hashes and locked current-row snapshot. Transaction/backend/action-scoped permits cannot be replayed in another transaction. Missing or changed rows, unknown/stale copies, active holds, incomplete inventory and stale reviews are refused. The source outbox's existing restricted cleanup routine is exercised with an added fixture trigger; its original definition remains unchanged.

## 3. Selected actual native PostgreSQL acceptance

PostgreSQL **18.4**, loopback SCRAM, eight connections, 32 MiB shared buffers and 1 MiB work memory; these settings are not hard process memory quotas. Each disposable server runs sequentially. The fixture explicitly selects its marked synthetic database. No profiler, routine replacement, Docker or remote connection runs.

**49/49 assertions PASS** in the selected execution:

- Actual restricted Prisma login and application service refuse missing/default-disabled/unreviewed gates.
- Incomplete inventory, stale copy observations, unknown copies, stale policy version and changed row commitments refuse local removal.
- Two overlapping proprietor holds block deletion. Releasing one preserves the other; final release still requires a fresh current review.
- Active rides continue to block account removal.
- The injected profile constraint's unique PostgreSQL marker confirms rejection after saved-place deletion; the entire local transaction and provider queue roll back.
- Individual saved-place removal requires its own review and retains a real foreign account's saved place/profile. The positive own-place case executes.
- A new unregistered child row causes a native scope-guard error and rolls back account cleanup. Fixture-only restoration is explicitly scoped; no new restore API is introduced.
- An autocommitted old permit cannot authorize a subsequent direct DELETE.
- Permitted synthetic local cleanup clears the intended profile/places, preserves another account and ride/fare history, and records pending provider work without executing it.
- Actual pg_blocking_pids observes original outbox cleanup blocked by the proprietor transaction. After hold commit it is refused. After release, stale review still refuses it; a fresh review permits the unchanged terminal cleanup, preserving row identity.

The application projection has real User/SavedPlace/Booking field/type names used by the service and strict synthetic keys, not the full application/PostGIS/RLS/provider deployment. This is service-level integration, not a real Clerk-authenticated HTTP/browser or distributed provider-erasure certificate. Trusted owner/controller compromise and missing remote observations remain outside the local proof.

## 4. Fresh human pilot status

Three fictional case cards were generated, and an owned PowerShell form was opened for Divyansh followed by Rajuddin. The script hides reference answers and writes each reviewer's initial form using CreateNew outside the repository. Reviewers must independently attest no reference exposure and not discuss answers until both forms are saved. A shared laptop/user account is self-attestation, not independent account administration or enforceable blinding.

At checkpoint finalization **zero forms exist**. No answers were invented, no comparison was recorded and the precommitted synthetic reference remains unrevealed. The collector refuses to proceed until both forms exist and validates bindings/chronology before comparison. The exercise uses a synthetic reference, **not a live AI result**, with zero model/provider calls and zero real cases. Disagreements remain unresolved without a separate adjudicator. It therefore cannot yet be called a completed human pilot or calibration.

The existing reviewer process is final and the assignments remain Divyansh Singh/Rajuddin. **14/14 protocol unit tests PASS**; those synthetic software checks are not human labels. Real collection, useful projection, sample size and harm/acceptance thresholds remain separate unapproved gates.

## 5. Quality, failures and preservation

| Check | Actual selected result |
| --- | --- |
| Native application/outbox integration | **49/49 PASS** |
| Calendar/disabled-policy tests | **13/13 PASS** |
| Reviewer-protocol tests | **14/14 PASS**, software fixtures only |
| Backend typecheck | **PASS** |
| New JavaScript lint | **Two files; zero errors/warnings** |
| Edited route lint | **Three pre-existing unused catch bindings**, identical rule/message/severity to preserved original; zero new findings |
| Scoped Python lint/AST; PowerShell AST | **PASS** |
| Scoped Git and explicit new-file whitespace | **PASS** |
| Existing product source modified | **Only backend/routes/users.js**, its new import and two handlers |
| Original fifteen SQL files / migrations / V5 / auth inputs | Preserved at current source epochs |

The initial 39/39 pass remains at its earlier test epoch. The expanded run records 19/20 passing assertions when an assumed Prisma error-metadata location returns NULL; the PostgreSQL constraint itself had rejected. A unique native log marker replaces that unsupported attribution. The next rehearsal records 28/29 before detecting that the trusted fixture's name-reset UPDATE also touched its new foreign-account seed; that fixture UPDATE is narrowed to u1. No application SQL is changed for either correction. Original witnesses, receipts, source snapshots and failures remain.

The first quality wrapper passes typecheck/units but fails sending Unicode route source through Windows' default CP1252 stdin. The selected wrapper explicitly uses UTF-8 and retains earlier logs. The preserved before-route has the same three unused catch-variable ESLint findings; unrelated handlers are not modified to hide them.

Six owned native servers across these runs are stopped. The reviewer input window is separate and intentionally awaits human input; it is not a database workload. Across the recorded native/quality windows, **104 host samples** record minimum available RAM **2,308.59 MiB**, minimum commit headroom **11,652.35 MiB**, and zero unresponsive taskbar samples. Owner-disabled RAM admission limits stay disabled; deadlines/responsiveness/disk checks remain. Same-host monitoring cannot exclude an OS freeze. No unrelated process/service/global setting is changed.

The new manifest binds exact source hashes, preserved before-route bytes, selected receipts, retained failures, disabled policy, pilot commitments/status and quality. Protected existing inputs, HEAD and staging remain unchanged except the explicitly authorized route edit. Earlier evidence is not rewritten to claim a new epoch. New gate/planner code has no native profiler/mutation or whole-SQL certificate.

## 6. Remaining scope

The [runbook](../operations/phase9d-retention-enforcement.md) inventories important remaining paths: real provider generations/backups/device caches, administrative cleanup scripts, location maintenance, receiver/custodian enrollment and the account UI's current erasure/anonymity/sign-out claims. No remote worker, full mutation-path enrollment or production integration is claimed. Production-positive operation is disabled by the new gate; activation needs additional reviewed implementation, actual operating roles/copies and truthful end-user completion behavior.

To finish this requested continuation, the owner must answer the three pending business subtargets and both reviewers must submit their pilot forms. The CA review remains excluded as requested. Google/R2, off-host restore, final custody/key administration and real-data calibration remain pending; profiler investigation remains PAUSED, signal-11 OPEN and signal-9 SEPARATE/UNATTRIBUTED. Broader Phase 9D-1/whole-SQL readiness stays PARTIAL.

No live/customer/provider/model operation, real email, production deletion, paid provisioning, commit, push, merge or deployment occurs. **Production stays OFF.**
