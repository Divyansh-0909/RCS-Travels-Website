# P06 — Approved fixes and journey regression

24 October 2026 IST. **STATUS: OUTPUT_READY — four explicitly approved P06 fixes VERIFIED in the local synthetic renderer.** Broader booking QA remains incomplete. Owner aesthetic acceptance is separate from technical verification.

| Issue | Original observed failure | Implemented treatment | Actual source |
| --- | --- | --- | --- |
| P06-B01-01 | Older Alpha response replaced Beta suggestions | Obsolete successes/failures are ignored after query changes, clear and cached-query selection. Lookup completion does not reopen a dismissed group. | frontend/src/pages/OnBoarding.jsx |
| P06-B01-02 | At 23:50, Today / 00:30 defaulted to the past | Date and time initialize from the same earliest-valid rounded instant, including month/year rollover and fractional-second boundaries. Existing 30-minute rule and day window are preserved. | frontend/src/components/ui/DateTimeSelector.jsx |
| P06-B01-03 | Tab closed desktop suggestions before selection | Focus stays within each address group. Tab/Shift+Tab, arrow keys, Enter and Escape work; leaving the group closes it. A delayed response cannot steal the other field's focus or reopen the dismissed list. | frontend/src/pages/OnBoarding.jsx |
| P06-B01-04 | Visual vehicle selection had no accessible state | The existing card buttons expose aria-pressed; exactly one is true and matches the outline. Other buttons omit the attribute. Styling is preserved. | frontend/src/pages/VehicleSelect.jsx + frontend/src/components/ui/Button.jsx |

The actual graph remains /book route details → timing when scheduled → read-only estimate → vehicles. Book ride was never activated. The existing booking policy and server contracts remain unchanged.

| Journey / boundary | Observed after fixes |
| --- | --- |
| Slow Alpha followed by Beta | Beta remains current; stale success, stale failure, clear and cached-query controls pass |
| Late response after changing fields | Dismissed group stays closed; the other field retains focus; refocus shows the resolved results |
| Keyboard pickup and drop | Tab and Shift+Tab retain the list; arrow navigation and Enter select actual coordinates; Escape returns focus and closes |
| 23:50 IST | Tomorrow / 00:30 selected; See prices enabled |
| Month/year rollover and sub-minute time | Future date retained and minimum lead time remains satisfied |
| 12:00 lead-time rule | 12:15 blocked, 12:30 accepted; no policy change |
| Missing/cleared fields and reload | Coordinates persist per tab; clearing invalidates continuation |
| Empty / failed suggestions | Actual no-match and service-unavailable states still render |
| Slow quote / double action | One read-only estimate; loading action disabled; back preserves route |
| Quote HTTP503 | Recovery state hides booking form and exposes Try again / Change your route |
| Vehicle cards | All four keep styling and expose one aria-pressed=true choice; Space, Enter and pointer work |

[P06-fixes-regression.json](https://drive.google.com/file/d/19fQbMdsRlNZuwZju0g73CWPnLYWUms0A/view?usp=drivesdk); [P06-control-evidence.json](https://drive.google.com/file/d/1iDW758Qcp-_BbeY8-WWI8Tfrffbr_eRo/view?usp=drivesdk); P06-fixes-focus-guard.json and P06-fixes-final-check.json bind the final address refinement.

Same-point entry remains an unclassified observation, not an invented new defect. The visible day wheel remains today..+6 while the validator permits through +7 end-of-day; that inclusive-window product question was not changed. Maps, populated saved-place accounts, complete overlays, successful quote retry, sharing/coupon/business eligibility and ride creation remain outside the verified scope.

Historical failures and exact original reproduction steps: [23 October baseline P06-booking-flow-audit.md](https://drive.google.com/file/d/13yDbpRaIo3ZVFn0kQ5h5H5ECq78MLAqW/view?usp=drivesdk).

