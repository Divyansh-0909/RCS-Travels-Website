# VC-B01 compact control sizing follow-up

26 October 2026 IST. The owner answered the pending sizing question: **“Apply the new sizing to compact buttons too.”** This extends the [initial implementation](VC-B01-owner-implementation-2026-10-26.md); it supersedes only that pass's decision to keep compact controls unchanged.

`ActionControl`, exported from the existing Button module, now supplies the shared native button contract. Main actions continue to use Button's `size: "action"`. Trip-mode pills, Later/Now, the calendar opener, date-picker Confirm/Close, timing choices and close buttons, and ride-option triggers/switch rows/close buttons share its 48px minimum target, 16px text, 24px line height and 12px vertical padding. Text actions use 24px horizontal padding; icon targets use 12px and at least a 48px square. Two-line controls can grow to fit their descriptions. Switches retain their visual track with the entire row as the keyboard-accessible switch target.

The route controls wrap rather than scale below the shared dimensions. Calendar desktop scaling is removed and the picker is clamped to the viewport with vertical scrolling. Its shell is a dialog section rather than a button containing other buttons. Ride-option sheets have a bounded scrollable body. Desktop ride options render in a portal with measured viewport positioning and a sticky header; this fixes a close button that testing found clipped above a short landscape viewport. Date/time eligibility, option availability, quote computation and booking submission rules are unchanged.

Final screenshot inspection also caught a light-theme calendar mixing a dark shell with light-theme controls. The shell and controls now use the existing semantic surface/ink colours, including an inverted Confirm action and the shared focus outline. Four targeted Light/Dark phone/desktop samples verify at least 4.5:1 contrast for Confirm text and the close icon against their backgrounds.

Evidence is under `output/handoff/compact-controls-2026-10-26/`. Original source copies and six baseline screenshots remain separate from the accepted output. Earlier failed attempts remain recorded, including the oversized desktop timing icon and the clipped landscape popover caught during iteration.

| Check | Result |
| --- | --- |
| Compact-control browser matrix | 30 PASS: route/timing, calendar and ride options at 320×640, 390×844, 768×1024, 1440×900 and 680×360, Light/Dark |
| Keyboard/state checks | Trip-mode Space/Enter and focus outline, timing selection, date confirmation, switch click/Space and checked state, unavailable switch state, close controls |
| Primary-flow browser regression | 48 PASS: main booking actions, login/signup OTP states and saved-place editing |
| Frontend tests | 72 PASS |
| Website build | PASS, with the existing large-chunk warning |
| Source locator maintenance | All 351 IDs and audit/owner/verification fields preserved |

Browser checks use the actual application on the loopback fixture server and synthetic actors/prices. No real OTP, booking, customer, captain or provider operation is performed. Screenshots were inspected at phone, desktop and short landscape sizes. These results describe website rendering and interactions; they do not establish native-device visual acceptance or the owner's final aesthetic approval.

[Review the controls](http://127.0.0.1:4317/?view=consistency&width=390&theme=light).
