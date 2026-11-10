# automation-verification

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.421Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

| Requirement | Evidence / result | Type |
|---|---|---|
| Drive/Docs authenticated access | Correct IDs, folder write capability, document and change feed verified | REAL |
| Correct active prompt | P01:v1 parsed, both addenda included; formatting/report writes leave hash stable | REAL + FIXTURE |
| Newly ready prompt | P99 synthetic document drove a real Codex turn in a separate Git fixture | REAL dispatcher; simulated Drive event |
| Exactly one launch | P99 actualCodexLaunches=1, saved thread ID and completed turn | REAL |
| Duplicate events | Repeated P99 events and reloaded Engine did not dispatch again | REAL persisted dispatcher + fixture source |
| Crash/restart state | Worker stop/start retained P01 owner, phase/run/thread and heartbeat; unit fixtures cover interrupted/publication states | REAL restart + SIMULATED failures |
| Author colors | Added range read back dark red; original green text unchanged | REAL Google Docs |
| Artifact upload | Test uploaded/read back/hash verified, then deleted; final screenshots uploaded and read back | REAL Google Drive |
| Incomplete phase never done | Missing artifact/failing evidence rejected; manifest required before OUTPUT_READY | AUTOMATED FIXTURE |
| Usage exhaustion | Limit pauses, persists thread/checkpoint, suppresses calls and resumes same phase | SIMULATED; no real quota exhaustion induced |
| Heartbeat/current work | Durable five-second heartbeat and live current issue/status | REAL |
| Live website/status | Desktop + phone viewer captures; interactive actual frontend iframe; Storybook switch interaction and axe in both themes | REAL browser |
| Bootstrap duplicate prevention | P01 remains owned by this current session through infrastructure/pilot; no watcher P01 dispatch | REAL state + automated guard tests |
| Existing review discovery | Exact P01 report names, screenshot folder, artifact manifest and latest red OUTPUT_READY block | REAL publication; future hourly review not forced |

Commands: npm --prefix tools/handoff test — 21 tests: 20 passed, 1 skipped (Windows file-symlink privilege unavailable), exit 0. node tools/handoff/verify-live.mjs — exit 0. node tools/handoff/verify-codex.mjs — one real connection smoke, exit 0. node tools/handoff/verify-dispatch.mjs — one real dispatcher fixture run, exit 0. node tools/ui-quality/verify-views.mjs — exit 0.

Evidence JSON files in this handoff: P01-connection-verification.json, P01-dispatch-verification.json, P01-codex-smoke-verification.json, P01-runtime-status.json and P01-viewer-verification.json. Fixture Drive publication is explicitly distinguished from the real Google API color/upload checks. Temporary connection-test artifacts were removed. No test prompt was inserted into the shared human prompt history. Original P01 prompts and green formatting remain intact. Native/device follow-up: FAILED: Isolated native startup/journey verification — accept-failure-and-retry Maestro exit 1 — failed assertion: "Controlled acceptance outage. Please retry." is visible. Evidence: P01-native-verification.json. USB keep-awake remains enabled at the owner’s request.
