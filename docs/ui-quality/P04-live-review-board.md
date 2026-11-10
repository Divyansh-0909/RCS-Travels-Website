# P04 live review board: both issues implemented

AUTHOR: CODEX | PHASE: P04 | VERSION: 1
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 2026-10-22T20:32:10.808Z
Run: 79361924-917d-4dd9-9740-26c727966c1b

Live reviewer: http://127.0.0.1:4317/?mode=android&issue=P04-A2

| Issue | Owner choice | Result |
|---|---|---|
| P04-A1 | Keep layout; block content taps under visible fade | IMPLEMENTED / VERIFIED |
| P04-A2 | Expose current tab as selected to accessibility tools | IMPLEMENTED / VERIFIED |

P04-A1 is implemented following the owner's explicit choice: keep the floating layout and fade, suppress page-content taps inside the fade while it is visible, and allow them when it disappears. The guard inside Account's ScrollView lets native drags start in that strip, uses root-relative fade bounds and bypasses open settings modals. Floating tab controls remain interactive. The previous 13 native Light/Dark checks and Maestro proof remain available in the verified A1 manifest.

P04-A2 is implemented following the owner's explicit "do that" reply to the selected-state explanation. AppBar now sets accessibilityState={{ selected: isSelected }} on each existing tab button. The same route predicate already drives its visual highlight. On the phone, exactly the current tab reports selected=true and the other three report selected=false. Existing labels, button roles, styling, tab gates, routes and replace-history are preserved; the source verification proves the only AppBar change is that one metadata line.

The physical stream follows the connected phone. Selecting an issue in the browser describes it and does not navigate/control Android. Interact directly on the phone; confirm LIVE, DEVICE and a fresh capture age. Screenshots are supporting proof, not the primary live review. A2 has no visible design change. Both approvals are explicit and recorded; nothing remains awaiting an owner decision in P04.
