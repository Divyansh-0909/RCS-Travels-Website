# P04 native UX audit: final owner choices

AUTHOR: CODEX | PHASE: P04 | VERSION: 1
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 2026-10-22T20:32:10.808Z
Run: 79361924-917d-4dd9-9740-26c727966c1b

P04-A1 is implemented following the owner's explicit choice: keep the floating layout and fade, suppress page-content taps inside the fade while it is visible, and allow them when it disappears. The guard inside Account's ScrollView lets native drags start in that strip, uses root-relative fade bounds and bypasses open settings modals. Floating tab controls remain interactive. The previous 13 native Light/Dark checks and Maestro proof remain available in the verified A1 manifest.

Original A1 overlap: Appearance [43,2265]-[1037,2400] intersects the tab hit regions y2167-2313 by 48px. The owner selected touch suppression in the fade, retaining that visual overlap. Uncovered portions of rows remain tappable. Root pageY measurement corrected an initial inset mismatch; a guard outside the ScrollView was rejected because it trapped drags. Failed prototype evidence is retained.

P04-A2 is implemented following the owner's explicit "do that" reply to the selected-state explanation. AppBar now sets accessibilityState={{ selected: isSelected }} on each existing tab button. The same route predicate already drives its visual highlight. On the phone, exactly the current tab reports selected=true and the other three report selected=false. Existing labels, button roles, styling, tab gates, routes and replace-history are preserved; the source verification proves the only AppBar change is that one metadata line.

Intentional behavior: down-scroll hides the chrome, up-scroll restores it; tabs replace history; Back returns from pushed Legal details. Android portrait policy and enlarged-font cold-start results are retained in the original audit. A hot font-scale debug render error remains a documented test limitation.

Eight fresh physical-device accessibility checks passed: all four destinations in Light, Account and Rides in Dark, return to Account in Dark, and restoration of Account/Light. Every check verifies exactly one selected tab plus named, clickable, focusable android.widget.Button controls. Focused actual Maestro passed all four destinations, selected/unselected assertions and Legal detail-and-Back. Captain-app lint passed (0 errors, 7 existing warnings), captain-app TypeScript passed, and 20 native infrastructure/transport/hierarchy/preview-health tests passed. The staged source matches the repository.

Tested on one Samsung SM-A528B Android14 physical USB device (1080x2400, density450, font0.9), isolated com.rcstravels.driver.phase9 debug package and disposable synthetic backend. Android accessibility-node metadata was verified; spoken TalkBack was NOT tested. No iOS/other-device/release-build claim. The existing APK was reused with a rebuilt native JS bundle. Full offer/notification/booking/wallet/dispatch journeys were NOT rerun for this metadata-only change; those implementations and role gates were preserved. Earlier P04 backend typecheck failure in untouched StudyAI code and the unfinished full backend suite remain unresolved baseline limitations, not passes. Home and Outstation remain owner-deferred and unchanged. No production data, bookings, payments or external messages were used.
