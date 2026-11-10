# P04 A1: owner-approved fade tap guard

AUTHOR: CODEX | PHASE: P04 | VERSION: 1, owner-directed A1 implementation
STATUS: OUTPUT_READY
Date: 2026-10-22T08:44:42.642Z
Run: 79361924-917d-4dd9-9740-26c727966c1b

P04-A1 is implemented following the owner's explicit direction: taps on page content within the existing fade are suppressed while that fade is visible. When scrolling hides the app bar and the fade reaches zero opacity, the same area becomes tappable. Scrolling back up restores the guard. The floating tab buttons remain interactive. Overlap is retained visually as requested; no extra spacer, repositioning, colors or tab-history changes were introduced.

The guard lives inside Account's native ScrollView, above its pressable children. This lets the native ScrollView take over drags, including ones that start within the fade. The fade itself stays pointerEvents=none. One shared animated visibility drives its opacity and tap blocking; there is no React state update per scroll frame. The guard uses the fade's measured pageY bounds in the same root coordinate frame as touch events. The settings modal bypasses the guard because it appears above the fade.

13 real-device checks passed across Light and Dark, plus the focused Maestro flow. Captain-app lint passed with 7 existing warnings and no errors; captain-app TypeScript check passed. Existing native infrastructure/transport/hierarchy/preview-health tests passed (20 tests). Actual source hashes in the staged native bundle match the four changed repository files.

| Check | Result |
|---|---|
| light: covered gutter tap blocked | PASS |
| light: fade boundary exact; native modal bypasses guard | PASS |
| light: drag from covered area scrolls and hides chrome | PASS |
| light: tap in former fade strip opens Appearance | PASS |
| light: restoring fade restores tap blocking | PASS |
| light: uncovered part of settings row remains tappable | PASS |
| dark: covered gutter tap blocked | PASS |
| dark: fade boundary exact; native modal bypasses guard | PASS |
| dark: drag from covered area scrolls and hides chrome | PASS |
| dark: tap in former fade strip opens Appearance | PASS |
| dark: restoring fade restores tap blocking | PASS |
| dark: uncovered part of settings row remains tappable | PASS |
| tab buttons still navigate; original Light restored | PASS |

Before: a real tap at (1020,2290), outside the pill but inside the faded Appearance row, opened the Appearance modal. After: it leaves Account unchanged. A drag starting there scrolls Appearance from y2265 to approximately y2131 and hides the bar; a tap in the former fade strip then opens Appearance. Taps at y2202 (just inside the fade) are blocked; y2190 (just above it) still opens Language. A modal backdrop tap in that strip closes the modal.

Initial prototypes were rejected: an ancestor outside the ScrollView blocked fade-start drags; window-coordinate measurement also blocked just-above-fade taps because Android subtracts insets. Native checks caught both. The final inside-scroll guard uses root-relative measurement, and the entire suite was rerun on the corrected, hash-matched source. Failed evidence/checkpoints are retained.

One Samsung SM-A528B Android14 physical USB device, 1080x2400 / density450 / font0.9, isolated com.rcstravels.driver.phase9 debug package and local synthetic captain/database. No new iOS, other-device, TalkBack or full business-journey acceptance claim. No production accounts, bookings, payments or external messages. The existing APK was reused; Metro built and served the changed JS bundle. No Gradle release build was run. P04's earlier unrelated StudyAI typecheck failure and unfinished full backend suite remain historical limitations; neither was rerun or represented as passing for this UI-only change.

P04-A2 was subsequently approved and implemented; see P04-A2-approved-selected-state.md. This report retains the A1-specific evidence. A2 adds only selected accessibility metadata to AppBar; Home, Outstation, shared colors and other user changes remain preserved.

Live reviewer: http://127.0.0.1:4317/?mode=android&issue=P04-A1
