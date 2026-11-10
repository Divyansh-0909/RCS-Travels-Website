# P02 test evidence

AUTHOR: CODEX
PHASE: P02
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T12:55:35.155Z

RUN/PASS: original unchanged physical Android full journey; corrected light native acceptance; corrected dark native acceptance; 27 targeted native tests; 3 native hierarchy safety/readback checks; 4 bundle-preflight checks; 22 handoff passes with one Windows symlink skip; real fresh and resumed Codex workspace-write/loopback probes. FAILED then corrected: three theme-setup attempts, initial new handoff-test fixtures, the native viewer cache-query route, and the first post-flow hierarchy capture. Historical P01 native failure remains FAILED and preserved. NOT RUN: full backend suite/typecheck in P02, iOS, other Android sizes, TalkBack, real GPS/map correctness, production operations.

- priorFailure: 20261021072740335-1c3b6252-6334-42e8-8aeb-5dacf5e2226f — FAILED
- unchangedBaseline: 20261021103022154-3a4bf18d-6d5a-4f92-8f9a-75f4cb6ed9a7 — PASS
- light: 20261021124649501-33466fde-6adf-41b7-b716-3f85ebb1143e — PASS
- lightCaptureFailure: 20261021123305519-edce5c4d-4dde-4051-9b4b-7f5bc95e3947 — FAILED
- dark: 20261021124015166-8db8cd4e-e3df-4b1a-8204-a9682c2d06c6 — PASS

The P02-*-native-evidence.json files contain actual assertion timestamps/results, APK and bundle hashes, selected safe UI hierarchies, controlled-fault evidence and synchronized response/offer timelines. P02-native-execution-logs.md contains full selected Maestro/Metro and application-only logcat records with credentials/device identifiers redacted; unrelated system logcat is not published. P02-resolved-attempts.json preserves the initial setup/test-draft failures. P02-source-checkpoint.json records the source hashes and current dirty checkpoint. The screenshot links below were uploaded and authenticated byte/hash readback succeeded before this report was generated. The watcher publishes the final complete artifact manifest before OUTPUT_READY.

Device: {"model":"SM-A528B","android":"14","size":"Physical size: 1080x2400","density":"Physical density: 450"}. Only com.rcstravels.driver.phase9 was used. Existing APK identity/signature verification and isolated PostGIS/synthetic Clerk/provider transport remain in force. The phone was kept awake on USB at the owner's request.

- [P02-prior-failure-after-panel-expiry.png](https://drive.google.com/file/d/16ljggDZyipU6jbCD3TPimpYBL_jQOn_R/view?usp=drivesdk)
- [P02-unchanged-app-visible-error.png](https://drive.google.com/file/d/1h_J0fUpEJOeBA8HWgvdh6HcplBt3ZbPs/view?usp=drivesdk)
- [P02-dark-acceptance-failure.png](https://drive.google.com/file/d/1ebOAfsDpsSc7k74VvSZ0pdTpeiVUP95j/view?usp=drivesdk)
- [P02-dark-accepted.png](https://drive.google.com/file/d/1lznrpe_tUrCiWjjkTatdWvLXg1wzGGKO/view?usp=drivesdk)
- [P02-dark-incoming-offer.png](https://drive.google.com/file/d/13faEwTlbE425oi-Wf7wJXZTCAe2bgNit/view?usp=drivesdk)
- [P02-dark-panel-expired.png](https://drive.google.com/file/d/1lOJTgCpbSDjgixZsAAS3in2AQRiI0mP8/view?usp=drivesdk)
- [P02-dark-retained-notification.png](https://drive.google.com/file/d/1pXF6Jf0qe8wcpPjCmllsiIZN3QCqtpFh/view?usp=drivesdk)
- [P02-native-viewer-1920.png](https://drive.google.com/file/d/1tOX6OnWQSKPXQaa6Etejzho6G0zjyhk6/view?usp=drivesdk)
- [P02-native-viewer-390.png](https://drive.google.com/file/d/1KjOc1qIb-RwTahaS8u6dkFHGseyYBxym/view?usp=drivesdk)
- [P02-theme-setup-hidden-navigation.png](https://drive.google.com/file/d/1zJrNzbbdCAtGiAuxerLiM5Np0SLFcKkP/view?usp=drivesdk)
- [P02-theme-setup-obscured-row.png](https://drive.google.com/file/d/1cVTKLRFsUH78kKjj9k6YQszrTc9dQs5l/view?usp=drivesdk)
- [P02-light-acceptance-failure.png](https://drive.google.com/file/d/1PLTD5SKmlaW_ZX36MqIwK00czx6_73Pl/view?usp=drivesdk)
- [P02-light-accepted.png](https://drive.google.com/file/d/1foJNUbrmZqmT9AW_RZqc3dLVNpqmANzY/view?usp=drivesdk)
- [P02-light-incoming-offer.png](https://drive.google.com/file/d/1YGTNIsqdmAaYxT0k2JzszUODSTj9WpR-/view?usp=drivesdk)
- [P02-light-panel-expired.png](https://drive.google.com/file/d/12EtFxxzVepXNn0Ql5u8hBzfMQ_dKNaBh/view?usp=drivesdk)
- [P02-light-retained-notification.png](https://drive.google.com/file/d/1PuQgdySP3n6RM0MXKr3Lff7VqYMW9u4M/view?usp=drivesdk)

| Command | Result | Scope |
|---|---|---|
| node --test backend/tests/phase9MaestroTrigger.test.mjs | PASS | Loopback readiness rendezvous, idempotency and setup failure |
| node --import tsx --test tests/phase9NativeInfrastructure.test.js tests/phase9NativeTransport.test.js tests/phase9NativeAcknowledgement.test.js tests/phase9MaestroTrigger.test.mjs | PASS | Native transport, real fault gateway, acknowledgement reconciliation and rendezvous |
| node backend/tests/run-phase9-native.js --keep-awake (P02 pre-fix reproduction) | PASS | Controlled 503 on the connected Android test package |
| node --test tools/ui-quality/tests/bundle-preflight.test.mjs | PASS | Cold Metro deadline, HTTP failures, interrupted and oversized bundles |
| npm --prefix tools/handoff test | PASS | Phase-scoped deliverables, Google status reporting, sandbox invocation and existing recovery tests |
| node tools/handoff/verify-write.mjs | PASS | Real fresh CLI workspace write plus loopback access with the final launcher settings |
| node backend/tests/run-phase9-native.js --keep-awake --acceptance-only --theme=light | PASS | Physical Android light: controlled 503, actual panel expiry, durable offer, retry assignment and final native hierarchy |
| node tools/handoff/verify-write.mjs --resume-readonly | PASS | Resume the original read-only fixture thread with verified workspace writes and loopback access |
| node tools/ui-quality/verify-native-viewer.mjs | PASS | Live Android iframe, heartbeat, overflow at 390/1920 and separate Home/Outstation navigation |
| node --test backend/tests/phase9NativeHierarchy.test.mjs | PASS | Native hierarchy readback, foreground privacy checks and exact temporary-file cleanup |
| node backend/tests/run-phase9-native.js --keep-awake --acceptance-only --theme=dark | PASS | Physical Android dark: controlled 503, actual panel expiry, durable offer, retry assignment and final native hierarchy |

Accessible control/error text was found by the native driver, and the screenshots were inspected for clipping, overlays, safe-area interaction and both themes. This does not certify screen-reader announcement behavior. Keyboard and map gestures were not part of acceptance and remain NOT RUN.
