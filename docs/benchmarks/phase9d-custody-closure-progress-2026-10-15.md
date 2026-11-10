# Phase 9D-1 custody closure - implementation progress, runtime blocked

15 October 2026 IST. Continues the [accepted custody checkpoint](phase9d-1-audit-custody-checkpoint-2026-10-14.md). This is an **unverified implementation progress record**, not an acceptance or production-readiness certificate. The full custody-closure request remains active and incomplete.

## Preserved baseline

Native PowerShell SHA-256 inspection matched all **28 accepted custody source identities** against `output/phase9d-audit-custody-2026-10-14/manifest.json`. The prior manifest and original runtime/fixture/test files were not edited. Existing 1,834/1,834 and custody 20/20 results remain historical evidence for that accepted source epoch; they are not executions of the new changes.

## New source awaiting execution

- `tools/phase9d/closure-matrix.mjs`: original-to-current acceptance reconciliation and baseline verification. Its Node invocation has not returned; do not assume its output exists.
- `closure-keys.mjs`: trusted public registry, historical versus currently trusted signing status, and signing/caching of actual committed receipt bodies. A duplicate should reuse its stored signature without a retired private key.
- `closure-status.mjs`: independent source/custody comparison, false-acknowledgement detection, and a bounded single-MVCC-snapshot check against the committed broker journal. Source-owner suppression of both original journal and capture remains outside that observation model.
- `closure-store.sql`: optional disposable custody extension with public key epochs, active-key fencing, narrow signer login and durable signatures. Signing credentials remain a declared trust root.
- `closure-source.sql`: optional disposable receiver extension with public key bindings, acknowledgement shape/identity fences, a read-only inspector and pressure gates on new shadow reservation/dispatch/send. It intentionally preserves outstanding-response recording and operator STOP. Receipt shape checks do not claim SQL Ed25519 verification.
- `closure-run.mjs`: source-bound continuation runner derived from the accepted runner, selecting the new unit and DB suites in a separate output directory.
- `backend/tests/phase9dCustodyClosure.test.js` and the new closure fixture/integration suite: proposed executable witnesses for key status, durable historical signatures, compromised-verifier detection, source consistency, permissions and saturation. **None has executed.**

No SQL extension was installed or tested in this continuation. No current coverage, mutation, typecheck, integration, container or replay pass is claimed.

## Runtime blocker

The absolute command `C:\Program Files\nodejs\node.exe --version` hangs without output before startup. Earlier Node source-inspection and matrix invocations also remain pending. A Docker CLI version probe likewise did not return. PowerShell file reads/writes and SHA-256 inspection still work. This is an observed local execution failure; its cause is not established and it is not relabelled as the historical profiler or transport failure.

The owner was asked to reload Codex/VS Code. If Node hangs in an independent terminal too, a Windows restart may be required. Hook configuration was not changed, no tool-policy bypass was attempted and no unrelated process was killed.

State and preflight evidence are in `output/phase9d-custody-closure-2026-10-15/continuation-state.json` and `preflight-blocked.json`.

## Resume order

1. Confirm Node startup has recovered; reconcile any pending matrix invocation before rerunning its exclusive-create command.
2. Execute `node tools/phase9d/closure-run.mjs unit` and `db`, inspect every failure, and correct the new code before expanding it.
3. Finish critical committed source/outbox/receiver and independent denial capture; preserve explicit unsupported/suppression boundaries.
4. Complete restricted custody capsules, signing-epoch interruption/concurrency tests, actual database restart/recovery and backlog/storage scenarios.
5. Implement and independently reconstruct explicit saved-input custody replay.
6. Complete affected SQL native/logical/privilege/mutation verification and critical JS quality; run independent adversarial review and the relevant regressions.
7. Publish the source-bound closure manifest and reconcile every original readiness criterion. Do not replace missing execution evidence with this document.

PHASE 9D-1: PARTIAL

CURRENT CONTINUATION CODE: UNVERIFIED

PRODUCTION_READY: NO

PHASE 9D-2: NOT_STARTED

PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH ROLLOUT: OFF

## Resumed execution — 15 October 2026, evening IST

The earlier unverified/runtime-blocked statements above describe the first interrupted attempt. Node execution recovered. This appended record preserves those observations; **the complete custody-closure request is still incomplete**.

Current progress evidence: `output/phase9d-custody-closure-2026-10-15/progress-1792077637686-2f3bce42-834c-43f3-bd8b-8b67c38941c9.json`. It verifies all **28 accepted custody**, **three accepted authentication** and **22 frozen V5** source identities. It is a progress manifest, not an acceptance certificate.

Executed results:

- Current continuation units: **14/14 PASS**, unchanged source epoch, `unit-1792077537210-6c25a448-e086-48f0-9f7d-6b32913c1d24.json`.
- Full backend: **1,845/1,845 PASS**, `full-1792076606512-67be6797-c3fc-4f2b-9dfc-dd3b5940fab8.json`. Later continuation edits and tests have distinct identities; this result is not a fresh full-suite execution of those edits.
- Backend typecheck and scoped lint: **PASS**. The typecheck execution is `typecheck-1792076394642-12e6bee8-f216-4652-83a3-1d39dec9e4cb.json`; later source epochs remain distinguishable.
- Nine core helpers: **100% statements/branches/functions/lines**; **217 statement/line counters, 145 branches, 19 functions**. Structural maxima: cyclomatic **15**, cognitive **12**, Halstead Difficulty **33.967**, CRAP **15**, source **50 physical lines**. Scoped clones: **0**. Measurement: `quality-1792077398709-e6a23fc1-b421-4f41-909b-460d1705d42f/`. Capsule entry/proxy execution, the prepared replay-input validator and new SQL are not certified by these nine-module figures.
- Framework mutation audit: **593 instrumented**, running at this progress snapshot. No passing mutation closure is claimed.

Earlier source-stable executions passed **8/8 custody DB** and **6/6 lineage** tests (`1792009618471`). They execute actual source cancellation, outbox/transport, offline analysis, independent guard, accounting and minimized custody delivery at their recorded epochs. Subsequent fixture, admission, rotation and denial changes require new DB execution. Failed and source-drift trials remain retained.

Independent review found a direct database-ingress bypass. The new `custody.ingest(frame)` independently validates the closed frame, source/service, HMAC, event commitment and selected active key; the ingestion principal cannot call the old bare acceptance entry point or read source secrets. A second finding identified key-ID/public-material mismatch during rotation. SQL now binds the ID to decoded SPKI bytes; the trusted operator additionally validates Ed25519 material before mutation. The direct migration owner remains a trusted root. Reviews and their exact source hashes are retained separately.

The continuation also adds committed source/receiver lineage capture, read-only false-acknowledgement detection, signing epochs with durable historical signatures, analysis admission pressure gates and bounded structured-log denial projection. Saved observer state is validated before extension. Signal probes terminate real Node children around an explicitly synthetic DB adapter; they do not replace real database crash-window verification. The replay-input loader has permanent integrity/path/order/state tests; **executable saved-input custody replay is still NOT_IMPLEMENTED**.

Restricted capsule trials remain **FAILED**, with owned resources removed in their recorded cleanup. Missing runtime data, an incorrect working directory and omitted dynamically forked entry files were identified in the fixture and corrected. The corrected capsule and real denial-delivery recipe have not passed. No earlier container evidence is relabelled as custody capsule acceptance.

Docker Desktop currently cannot start its engine: its startup log reports failure renaming `sailor-ingest.sock` to `sailor-ingest.sock.stale`. Normal CLI stop also failed. The owner was asked to quit/reopen Docker Desktop while preserving data; no factory reset, socket deletion, hook modification or rejected cache-cleanup bypass was attempted. This observed startup condition is not a full root-cause diagnosis. Real DB/capsule verification requires engine recovery.

Remaining approved work includes current real-server denial delivery, restricted capsules, complete rotation/restart/storage/race witnesses, executable saved-input reconstruction, changed-SQL verification, mutation reconciliation, final independent review and the complete acceptance/readiness manifest. Production readiness remains **NO**; production switches remain **OFF**.
