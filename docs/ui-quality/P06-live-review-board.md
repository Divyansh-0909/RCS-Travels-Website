# P06 — Corrected live review board

24 October 2026 IST. **STATUS: OUTPUT_READY — four explicitly approved P06 fixes VERIFIED in the local synthetic renderer.** Broader booking QA remains incomplete. Owner aesthetic acceptance is separate from technical verification.

The four fixes were explicitly approved and technically verified. The existing viewer shows the corrected actual /book implementation and a collapsible **Before / after recorded evidence** pair for each issue. Click either image to inspect the full recorded screenshot. These images supplement the live frame and do not simulate an interactive old implementation.

| Issue | Live corrected state | Verification |
| --- | --- | --- |
| P06-B01-01 | [Open P06-B01-01](http://127.0.0.1:4317/?mode=website&issue=P06-B01-01&width=390&theme=light) | IMPLEMENTED / bounded regression PASS |
| P06-B01-02 | [Open P06-B01-02](http://127.0.0.1:4317/?mode=website&issue=P06-B01-02&width=390&theme=light) | IMPLEMENTED / bounded regression PASS |
| P06-B01-03 | [Open P06-B01-03](http://127.0.0.1:4317/?mode=website&issue=P06-B01-03&width=1440&theme=light) | IMPLEMENTED / bounded regression PASS |
| P06-B01-04 | [Open P06-B01-04](http://127.0.0.1:4317/?mode=website&issue=P06-B01-04&width=390&theme=light) | IMPLEMENTED / bounded regression PASS |

## P06-B01-01

Ignore obsolete successful and failed autocomplete responses after a newer value, cached query or clear action.

1. Observe Beta input and Beta suggestions after the delayed Alpha response finishes
2. For manual replay, type Alpha, wait 0.4 seconds, then replace it with Beta

## P06-B01-02

Initialize the date and time from one rounded earliest-valid instant, including day/month/year rollover and sub-minute boundaries.

1. This replay uses a simulated 23:50 IST clock
2. Observe tomorrow / 00:30 AM with See prices enabled; no booking is submitted

## P06-B01-03

Keep suggestions open while focus remains in the address group; support Tab, Shift+Tab, arrow keys, Enter and Escape.

1. Use width 1440 and focus the Aster pickup input
2. Press Tab through Clear pickup into the visible suggestions, or use ArrowDown then Enter
3. Escape returns to the field and closes suggestions; leaving the group also closes them

## P06-B01-04

Keep the existing vehicle buttons and styling; expose exactly one selected card with aria-pressed=true and the others false.

1. Observe Sedan selected in the actual sample-price vehicle stage
2. Use Space or Enter to select another vehicle
3. Inspect aria-pressed: exactly one card is true, matching the visual outline

Eight desktop/mobile viewer checks verified the actual issue frame, corrected behavior, both PNGs, fixed legacy theme and preservation of older Website/Android modes. Four additional live replays checked the final address refinement. Native rendering was not re-certified.

Technical PASS does not record owner aesthetic acceptance. The current design remains the visual reference; this board is available for your review. Original owner-choice board: [23 October baseline P06-live-review-board.md](https://drive.google.com/file/d/1_NyZAyphuapdcWS8fzzKsTpeLjaMd4A_/view?usp=drivesdk).

