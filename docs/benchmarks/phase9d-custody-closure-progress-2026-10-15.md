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
