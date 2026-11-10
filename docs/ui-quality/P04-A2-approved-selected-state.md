# P04 A2: approved selected accessibility state

AUTHOR: CODEX | PHASE: P04 | VERSION: 1
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 2026-10-22T20:32:10.808Z
Run: 79361924-917d-4dd9-9740-26c727966c1b

P04-A2 is implemented following the owner's explicit "do that" reply to the selected-state explanation. AppBar now sets accessibilityState={{ selected: isSelected }} on each existing tab button. The same route predicate already drives its visual highlight. On the phone, exactly the current tab reports selected=true and the other three report selected=false. Existing labels, button roles, styling, tab gates, routes and replace-history are preserved; the source verification proves the only AppBar change is that one metadata line.

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

Before evidence: the original P04 Account/Rides hierarchies and A1 final Account hierarchy expose selected=false on every tab. After evidence: a2-light-*.xml, a2-dark-*.xml and a2-final-account.xml expose only the matching current tab as selected. Screenshots confirm the existing presentation. No exact spoken announcement is claimed.

Tested on one Samsung SM-A528B Android14 physical USB device (1080x2400, density450, font0.9), isolated com.rcstravels.driver.phase9 debug package and disposable synthetic backend. Android accessibility-node metadata was verified; spoken TalkBack was NOT tested. No iOS/other-device/release-build claim. The existing APK was reused with a rebuilt native JS bundle. Full offer/notification/booking/wallet/dispatch journeys were NOT rerun for this metadata-only change; those implementations and role gates were preserved. Earlier P04 backend typecheck failure in untouched StudyAI code and the unfinished full backend suite remain unresolved baseline limitations, not passes. Home and Outstation remain owner-deferred and unchanged. No production data, bookings, payments or external messages were used.

Owner approval: P04-A2-owner-direction.json. Current source: P04-A2-source-verification.json. Native proof: P04-A2-native-results.json. Live viewer: http://127.0.0.1:4317/?mode=android&issue=P04-A2
