# P04 test matrix: final verification

AUTHOR: CODEX | PHASE: P04 | VERSION: 1
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 2026-10-22T20:32:10.808Z
Run: 79361924-917d-4dd9-9740-26c727966c1b

Eight fresh physical-device accessibility checks passed: all four destinations in Light, Account and Rides in Dark, return to Account in Dark, and restoration of Account/Light. Every check verifies exactly one selected tab plus named, clickable, focusable android.widget.Button controls. Focused actual Maestro passed all four destinations, selected/unselected assertions and Legal detail-and-Back. Captain-app lint passed (0 errors, 7 existing warnings), captain-app TypeScript passed, and 20 native infrastructure/transport/hierarchy/preview-health tests passed. The staged source matches the repository.

| Native accessibility check | Selected tab | Result |
|---|---|---|
| a2-light-home | Home only | PASS |
| a2-light-market | Market only | PASS |
| a2-light-rides | Rides only | PASS |
| a2-light-account | Account only | PASS |
| a2-dark-account | Account only | PASS |
| a2-dark-rides | Rides only | PASS |
| a2-dark-account-return | Account only | PASS |
| a2-final-account | Account only | PASS |

| Other validation | Result |
|---|---|
| Prior A1 covered/hidden/restored fade, boundary, modal and native drag checks | PASS, 13 Light/Dark checks, original proof retained |
| Prior A1 focused Maestro | PASS |
| Fresh A2 selected-state/navigation/Legal-and-Back Maestro | PASS, exit0 |
| Captain-app lint | PASS, 0 errors / 7 existing warnings |
| Captain-app TypeScript | PASS |
| Native infrastructure / hierarchy / transport / preview health | PASS, 20 tests |
| Source identity and untouched-source preservation | PASS |
| Backend typecheck, earlier P04 attempt | FAIL, untouched StudyAI return type |
| Full backend suite, earlier P04 attempt | UNFINISHED, no final result |
| Spoken TalkBack / iOS / other devices / release build / fresh full business journeys | NOT RUN |

Capture exit0 proves only a capture; selected-state assertions and Maestro independently verify behavior. All prior failures remain in checks.json and baselineTests; no snapshot was auto-approved.

Tested on one Samsung SM-A528B Android14 physical USB device (1080x2400, density450, font0.9), isolated com.rcstravels.driver.phase9 debug package and disposable synthetic backend. Android accessibility-node metadata was verified; spoken TalkBack was NOT tested. No iOS/other-device/release-build claim. The existing APK was reused with a rebuilt native JS bundle. Full offer/notification/booking/wallet/dispatch journeys were NOT rerun for this metadata-only change; those implementations and role gates were preserved. Earlier P04 backend typecheck failure in untouched StudyAI code and the unfinished full backend suite remain unresolved baseline limitations, not passes. Home and Outstation remain owner-deferred and unchanged. No production data, bookings, payments or external messages were used.
