# Auth and booking spacing applied

28 October 2026 IST. Implements the owner's approval of the [27 October spacing proposal](VC-B02-spacing-audit-2026-10-27.md). That earlier report and its screenshots remain a historical audit. These are RCS spacing choices informed by Apple's grouping and alignment principles, not Apple-mandated CSS measurements.

| Relationship | Applied spacing at normal text size |
| --- | --- |
| Heading to supporting copy | 8px |
| Intro group to first field / next independent group | 24px mobile, 32px from the existing `sm` breakpoint |
| Last visible mode-pill row to pickup | 16px |
| Pickup to drop | 16px |
| Field to validation / OTP expiry | 8px |
| Completed field, feedback or expiry group to primary action | 16px mobile, 24px larger layouts |
| Primary action to secondary/help copy | 16px mobile, 24px larger layouts |
| Booking action-bar caption to primary action | 16px mobile, 24px larger layouts |
| Ride options target to Book ride | 16px |
| Adjacent vehicle cards | Existing 16px retained |
| Timing-wheel summary to Confirm | 16px mobile, 24px larger layouts |

The layouts now own these gaps explicitly. Local overrides remove the existing primitive wrapper margins only at these call sites. Auth field/error groups use an 8px internal gap; the outer group owns the 16/24px space before the primary action. OTP expiry text remains part of its field group. The booking pill stack accounts for the native target's 4px inset below its visible face, including when Later wraps to another row.

The login input dimensions remain the reference: 86vw below `sm`, 377px above it, with normal-size height 48px, font 16px and radius 12px. Existing action and pill dimensions and single-border field focus are retained. OTP boxes keep their normal 48px size where space permits and shrink horizontally within the phone rail at 320px so all six remain reachable.

Booking action bars remain pinned with their existing safe-area padding. Enlarged-text testing exposed clipped route fields, so the route form and its suggestions now share the sheet's scroll area. Desktop route content can also scroll when it exceeds the viewport. The timing-choice dialog retains its normal 360px width but scales with text, stays within the viewport and can scroll. The auth form can scroll on short screens, and the wordmark can wrap within space reserved beside the back target at enlarged text sizes.

Changed product files: [LoginPage](../../frontend/src/pages/LoginPage.jsx), [SignUpPage](../../frontend/src/pages/SignUpPage.jsx), [OnBoarding](../../frontend/src/pages/OnBoarding.jsx), [VehicleSelect](../../frontend/src/pages/VehicleSelect.jsx), [DateTimeSelector](../../frontend/src/components/ui/DateTimeSelector.jsx) and [AuthHeader](../../frontend/src/components/ui/AuthHeader.jsx). Shared Input/Button implementations, RideOptionsTrigger, focus CSS, shared theme tokens and generated theme CSS retain their captured identities. Auth/API handlers, submission guards and booking/financial policy were not changed.

Validation:

- 130 measured actual-page cases: 13 states × five widths (320, 390, 600, 768, 1440) × Light/Dark preferences. These cover login, feedback, OTP, signup, an existing-account transition, route/home booking, timing, vehicle selection and the calendar popover. Expected visible gaps are asserted and screenshots captured. Booking retains its existing fixed theme policy.
- 54 additional responsive/interaction cases: 320×640, Hindi and Hinglish, long address text, and 200% root text size at mobile and desktop widths. Controls remain within the viewport and reachable after scrolling; OTP keyboard movement, timing dropdown dismissal and timing-wheel keyboard selection pass.
- 30 before/after cases compare ordinary auth-field, OTP and primary-action dimensions. The approved normal-size dimensions are preserved.
- Website production build passes; its existing large-bundle warning remains. Frontend tests: 77/77 pass. Review/coverage tooling tests: 19/19 pass. Scoped whitespace checks pass with Windows CRLF handling.

Screenshots were inspected across phone, tablet and desktop layouts, including translated and enlarged-text states, and the clipping/dialog issues above were corrected before final capture. Representative captures: [mobile login](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/verified-light-final/login-390.png), [mobile feedback](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/verified-dark-final/login-error-390.png), [desktop route](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/verified-dark-final/route-1440.png), [timing popup](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/verified-dark-final/calendar-popover-390.png), [Hindi signup](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/responsive/320-hi-16-signup-phone.png), and [enlarged timing dialog](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/responsive/1440-en-32-timing-dropdown.png).

Evidence and exact source identities: [manifest](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/manifest.json), [Light measurements](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/verified-light-final/observations.json), [Dark measurements](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/verified-dark-final/observations.json), [responsive checks](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/responsive/results.json), and [dimension preservation](../../output/handoff/VC-B02-spacing-implementation-2026-10-28/dimension-preservation.json). Earlier attempts remain separate, including harness corrections for a wrapped pill row, a form selector and a loading-screen race. The initial enlarged-text failures are retained rather than counted as passes.

Six source references in the canonical coverage data were refreshed, including the signup root token changed by the scroll layout; owner decisions, statuses and historical evidence are preserved. No new aesthetic approval is fabricated. This check uses synthetic local actors/API responses and blocks external provider requests. It does not establish real Maps, OTP delivery, payment or physical-keyboard behavior. Backend and native suites were not run for this website presentation change.
