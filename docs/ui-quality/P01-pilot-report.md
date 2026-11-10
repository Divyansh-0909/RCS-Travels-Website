# pilot-report

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.432Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

Pilot family: existing Toggle. Representative screen: Settings → Notifications. Supporting caller: Safety → Live location. Scope: translated accessible names only; no layout, styling, data, API, booking, payment, dispatch or cancellation changes.

Functional contract: role=switch, aria-checked reflects the existing state, type=button, keyboard Space/Enter activates the native button, disabled prevents interaction, existing onClick callback/API payload and failed-save rollback remain intact. The new optional aria-label/aria-labelledby props supply names without replacing those contracts. Settings names use the same translation function as visible labels; Safety uses its visible translated live-location label.

Before: axe button-name affected all three notification switches in light/dark at 390/1440. After: zero violations in the four corresponding captures, zero page errors, all 30 pilot browser tests pass across 360/390/768/1280/1440 and both themes. Frontend build exit 0; existing frontend regressions 68/68 exit 0. Storybook existing switch stories render/interact/axe clean in light/dark. Browser persistence uses local synthetic preferences and proves the frontend request/reload contract, not production DB behavior. Native work is a separate verification scope: FAILED: Isolated native startup/journey verification — accept-failure-and-retry Maestro exit 1 — failed assertion: "Controlled acceptance outage. Please retry." is visible. Evidence: P01-native-verification.json. USB keep-awake remains enabled at the owner’s request.

Actual status transitions were persisted: Investigating (unnamed-switch repro), Editing (translated label forwarding), Testing (keyboard/theme/error/axe/build/regressions), Fixed (only after checks passed). Viewer proof includes current screen/action and live heartbeat. Aesthetic layout was intentionally preserved; the measurable improvement is accessible control identification.

Before: [light phone](https://drive.google.com/file/d/1mmALCoeRFPSlBrkm2zXVvMzCx_UI8Acs/view?usp=drivesdk), [dark desktop](https://drive.google.com/file/d/17wVC3_GO3melvHKUz2Nu-n5_DOkxSBvu/view?usp=drivesdk). After: [light phone](https://drive.google.com/file/d/18Jo4CShOPH9eQjZifjNEjCajlu-OeXum/view?usp=drivesdk), [dark desktop](https://drive.google.com/file/d/18wY2J_5HyCLQNNB6OPg1XvH5jbEOi5mh/view?usp=drivesdk). All other pairs and metadata are in the visual-baseline index.

Rollback: restore only the three pilot files from output/handoff/pilot-rollback/frontend/src/... after reviewing any newer edits. The baseline Git reference is codex/p01-ui-handoff-20261021; do not reset/stash the dirty repository or overwrite unrelated work. The pilot stops here. Wider axe/visual findings and native/cloud readiness remain follow-up work with the original approval boundaries.
