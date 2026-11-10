# P06 — Approved website fixes, execution report

24 October 2026 IST. **STATUS: OUTPUT_READY — four explicitly approved P06 fixes VERIFIED in the local synthetic renderer.** Broader booking QA remains incomplete. Owner aesthetic acceptance is separate from technical verification.

The owner explicitly requested fixes for P06-B01-01 through P06-B01-04 in this conversation. This supersedes the approval hold for those four issues only. The original audit, failure reproductions and review receipt remain frozen at their earlier identities.

| Issue | Original observed failure | Implemented treatment | Actual source |
| --- | --- | --- | --- |
| P06-B01-01 | Older Alpha response replaced Beta suggestions | Obsolete successes/failures are ignored after query changes, clear and cached-query selection. Lookup completion does not reopen a dismissed group. | frontend/src/pages/OnBoarding.jsx |
| P06-B01-02 | At 23:50, Today / 00:30 defaulted to the past | Date and time initialize from the same earliest-valid rounded instant, including month/year rollover and fractional-second boundaries. Existing 30-minute rule and day window are preserved. | frontend/src/components/ui/DateTimeSelector.jsx |
| P06-B01-03 | Tab closed desktop suggestions before selection | Focus stays within each address group. Tab/Shift+Tab, arrow keys, Enter and Escape work; leaving the group closes it. A delayed response cannot steal the other field's focus or reopen the dismissed list. | frontend/src/pages/OnBoarding.jsx |
| P06-B01-04 | Visual vehicle selection had no accessible state | The existing card buttons expose aria-pressed; exactly one is true and matches the outline. Other buttons omit the attribute. Styling is preserved. | frontend/src/pages/VehicleSelect.jsx + frontend/src/components/ui/Button.jsx |

| Verification | Actual result |
| --- | --- |
| Frontend tests | 68 PASS / 0 FAIL |
| Developer / fixture / coverage / screenshot-route tests | 46 PASS / 0 FAIL / 1 existing Windows symlink skip |
| Website build | PASS; existing chunk-size warnings |
| Targeted actual-renderer checks | 14 initial fix checks plus 6 final focus/request checks; PASS |
| Final current-source check | Address empty/error controls and all four actual live replays PASS |
| Responsive matrix | 30 samples: 5 widths × 2 saved preferences × 3 stages; no horizontal overflow |
| Axe | 12 raw samples; one timing contrast observation retained; settled affected sample has 0 violations |
| Error, loading, navigation and persistence | 6 control groups PASS; 2 additional boundary observations retained |
| Live reviewer | 8 desktop/mobile outer-frame checks PASS, including real before/after PNGs |
| Source preservation | 4 approved product files changed; other 260 protected files unchanged |
| Coverage | 351 stable IDs; 7 bounded rows updated; 14 historical FAIL and 5 owner-deferred rows preserved |

The 14-check regression preceded the final focus-ownership refinement; the additional six focus checks and final live/error checks exercise the current address code. Other fixes and visual styling did not change during that refinement. A current website build and source inventory were regenerated afterward.

Developer work adds real corrected-state replays, a loopback-only before/after screenshot endpoint, a hostile-path/host/method test for that endpoint, current source-line reconciliation, additive coverage evidence and safe publication tooling. No production auth bypass or backend contract changed. Four dirty working-tree files were saved before editing; the product diff is relative to those files, preserving prior owner changes to VehicleSelect.

Source identities and exact diff: P06-fixes-source-preservation.json and P06-fixes-product-diff.md. Current-source final proof: P06-fixes-final-check.json. Run: 7c6bc9cb-8b6c-4704-be86-d4bf31fb0b91; approved-fix continuation under fixes-2026-10-24; prompt SHA-256 358584f65d9ab66f4bb174c43b49ea299026dbe1f6bb6d244f707cfd5293aa7a.

Testing used only loopback synthetic places, constant sample prices and an unusable quote. No Maps/provider/GPS, real quote, customer/account mutation, booking creation, checkout, payment, dispatch or notification was exercised. No backend/native source was changed or deployed. No spoken screen-reader/mobile-OS-keyboard acceptance, complete contrast pass, full role journey or untested child-state acceptance is claimed. W.BOOKING remains NOT_REVIEWED / NOT_RUN. Home/Outstation KEEP CURRENT and the earlier bounded P04 native acceptance are preserved. No commit, push, merge or P07.

Historical audit: [23 October baseline P06-execution-report.md](https://drive.google.com/file/d/15NruIy6bMexhdH6yK4BY4zc_TD24af1x/view?usp=drivesdk). New evidence folder: [P06-evidence](https://drive.google.com/drive/folders/11kVRXqDq9BySpLkQ2DNJvlJfFuECSe7h).


Visual QA caught an off-screen iframe painting blank in a mobile full-page screenshot after the evidence accordion scrolled the page. The actual frame DOM/replay was valid. Capture tooling now restores the top viewport and waits for repaint before recording; the eight viewer captures were regenerated and visually inspected. The supplementary offscreen-iframe PNG is a corrected reference capture, not the original white observation. That observation is recorded here and in the conversation; it was a developer screenshot issue, not a product UI change.

