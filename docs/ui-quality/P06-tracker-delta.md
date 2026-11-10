# P06 — Approved-fix coverage delta

24 October 2026 IST. **STATUS: OUTPUT_READY — four explicitly approved P06 fixes VERIFIED in the local synthetic renderer.** Broader booking QA remains incomplete. Owner aesthetic acceptance is separate from technical verification.

The canonical tracker retains **all 351 current IDs**, including all 347 pre-P06 IDs and the four source-backed P06 children. No entry was removed or silently merged.

| Updated bounded row | Owner / implementation / verification |
| --- | --- |
| W.BOOKING.ROUTE.ASYNC-SUGGESTIONS | APPROVED_FOR_FIX / VERIFIED / VERIFIED |
| W.BOOKING.TIMING.MIDNIGHT-DEFAULT | APPROVED_FOR_FIX / VERIFIED / VERIFIED |
| W.BOOKING.ROUTE.KEYBOARD-SUGGESTIONS | APPROVED_FOR_FIX / VERIFIED / VERIFIED |
| W.BOOKING.VEHICLES.SELECTED-STATE | APPROVED_FOR_FIX / VERIFIED / VERIFIED |
| W.BOOKING.ROUTE | APPROVED_FOR_FIX / VERIFIED / VERIFIED |
| W.BOOKING.TIMING | APPROVED_FOR_FIX / VERIFIED / VERIFIED |
| W.BOOKING.VEHICLES | APPROVED_FOR_FIX / VERIFIED / VERIFIED |

Seven bounded rows describe four resolved issues. This does not verify the complete booking journey or any untested sibling. The other 344 entries retain their audit/decision/implementation/verification/evidence history; source locations are refreshed against current code where lines moved. Original audit links remain alongside new verified Drive evidence.

| Measure | Current |
| --- | --- |
| Total website / Android | 351 / 210 / 141 |
| AUDITED / NOT_REVIEWED | 29 / 322 |
| Verification VERIFIED / FAIL / NOT_RUN | 13 / 14 / 321 |
| P03 owner-deferred rows | 5 |
| W.BOOKING | NOT_REVIEWED / NOT_RUN |
| Source traces / duplicate IDs / orphan parents | 351 / 0 / 0 |
| Repeated CSV regeneration | Byte-stable SHA-256 6e9c7e5cf1ec0ca7a23a62af9edcced09167453e4b9ca66f4d4b57ba63676e71 |

All 14 historical FAIL rows and five owner-deferred Home/Outstation issues remain. Fixed P06 failures are superseded only for the approved treatments; original raw reproductions and reports remain unchanged at their old artifact IDs. Source discovery parses 254 current files with zero syntax errors. No broader state obtains verification through its parent or a fixture response.

Historical delta: [23 October baseline P06-tracker-delta.md](https://drive.google.com/file/d/18acuRpomwrt1-xfg_ZPdVbGCVt7C7INY/view?usp=drivesdk). Exact current validation: P06-fixes-tracker-validation.json.

