# Candidate review batches

AUTHOR: CODEX | PHASE: P05 | VERSION: 1
CONTINUATION: Owner-requested connected Android follow-up
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 23/10/2026, 3:33:49 pm (Asia/Kolkata)
Run: 968cf0bf-7d54-4e7d-b622-9ba86224340c:android-connected-2026-10-23

These are ordered planning candidates, not a newly authored phase prompt or permission to change product UI. Website batches come first per the owner. Every visible change in a chosen future batch requires the actual affected live preview and explicit owner instructions. Keep brand colors, Home/Outstation identities, P03 deferrals and P04 behaviors locked.

## B01 — Website booking entry and vehicle selection

Targets (3): [W.BOOKING.ROUTE](http://127.0.0.1:4317/?mode=website&coverage=W.BOOKING.ROUTE&width=390&theme=light), [W.BOOKING.TIMING](http://127.0.0.1:4317/?mode=website&coverage=W.BOOKING.TIMING&width=390&theme=light), [W.BOOKING.VEHICLES](http://127.0.0.1:4317/?mode=website&coverage=W.BOOKING.VEHICLES&width=390&theme=light).

Why: Highest-traffic conversion path, with location/timing/vehicle transitions under one real /book route.

Test feasibility: Actual safe previews exist; add scoped read-only geocode/fare/quote fixtures before claiming happy paths. The existing /api/fare/estimate preview returns 409. No live booking.

Risks: Location SDK availability, scheduled-time validation, prices and route-state transitions; keep legacy composition.

## B02 — Website tracking, payment and terminal ride feedback

Targets (4): [W.TRACKING](http://127.0.0.1:4317/?mode=website&coverage=W.TRACKING&width=390&theme=light), [W.SHARED.CUSTOMER-PAYMENT-PANEL](http://127.0.0.1:4317/?mode=website&coverage=W.SHARED.CUSTOMER-PAYMENT-PANEL&width=390&theme=light), [W.SHARED.RIDE-SETTLEMENT-PANEL](http://127.0.0.1:4317/?mode=website&coverage=W.SHARED.RIDE-SETTLEMENT-PANEL&width=390&theme=light), [W.SHARED.CANCELLED-BOOKING-PANEL](http://127.0.0.1:4317/?mode=website&coverage=W.SHARED.CANCELLED-BOOKING-PANEL&width=390&theme=light).

Why: Critical post-booking status, payments, cancellation and receipt comprehension.

Test feasibility: Use existing /dev/tracking variants for initial rendering, then isolated real-backend/provider fixtures for behavior; never real payments.

Risks: Polling races, advance vs remaining payment, amount changes, refresh and cancellation states.

## B03 — Unreviewed website account children

Targets (5): [W.SETTINGS.LANGUAGE](http://127.0.0.1:4317/?mode=website&coverage=W.SETTINGS.LANGUAGE&width=390&theme=light), [W.SETTINGS.SAVED-PLACES](http://127.0.0.1:4317/?mode=website&coverage=W.SETTINGS.SAVED-PLACES&width=390&theme=light), [W.SAFETY.CONTACT](http://127.0.0.1:4317/?mode=website&coverage=W.SAFETY.CONTACT&width=390&theme=light), [W.SAFETY.LOCATION](http://127.0.0.1:4317/?mode=website&coverage=W.SAFETY.LOCATION&width=390&theme=light), [W.HELP.FAQ](http://127.0.0.1:4317/?mode=website&coverage=W.HELP.FAQ&width=390&theme=light).

Why: Frequent account tasks were not completed by the P01 notification pilot.

Test feasibility: Actual section navigation now works in synthetic customer preview; add failure/rollback fixtures per child.

Risks: Editable contact/place data, localization, mobile menu/content transitions and accessible focus.

## B04 — Admin review, finance, responsibility and fare editor

Targets (4): [W.ADMIN.DRIVER-DETAIL](http://127.0.0.1:4317/?mode=website&coverage=W.ADMIN.DRIVER-DETAIL&width=390&theme=light), [W.SHARED.DRIVER-FINANCE-PANEL](http://127.0.0.1:4317/?mode=website&coverage=W.SHARED.DRIVER-FINANCE-PANEL&width=390&theme=light), [W.RESPONSIBILITY](http://127.0.0.1:4317/?mode=website&coverage=W.RESPONSIBILITY&width=390&theme=light), [W.ADMIN.FARES](http://127.0.0.1:4317/?mode=website&coverage=W.ADMIN.FARES&width=390&theme=light).

Why: Role-critical work with large consequences from confusing errors or review state.

Test feasibility: Admin actor fixture exists; richer synthetic driver/documents/cases are needed. Begin read-only; use separate isolated backend for any eventual approved action.

Risks: Protected roles, document evidence, finance corrections and business-rule boundaries.

## B05 — Unreviewed Android Account children

Targets (5): [A.DOCUMENTS](http://127.0.0.1:4317/?mode=android&coverage=A.DOCUMENTS&width=390&theme=light), [A.VEHICLES](http://127.0.0.1:4317/?mode=android&coverage=A.VEHICLES&width=390&theme=light), [A.PAYOUT](http://127.0.0.1:4317/?mode=android&coverage=A.PAYOUT&width=390&theme=light), [A.WALLET](http://127.0.0.1:4317/?mode=android&coverage=A.WALLET&width=390&theme=light), [A.MANAGE](http://127.0.0.1:4317/?mode=android&coverage=A.MANAGE&width=390&theme=light).

Why: P04 A1/A2 did not verify these child screens.

Test feasibility: Reuse the verified isolated debug package with a connected phone and synthetic captain. Record read-only cases before any mutations.

Risks: Document/vehicle editing, financial data, destructive account controls, safe-area and keyboard behavior.

## B06 — Android Home board, Standby, Market, Rides and Notifications

Targets (5): [A.HOME.BOARD](http://127.0.0.1:4317/?mode=android&coverage=A.HOME.BOARD&width=390&theme=light), [A.HOME.STANDBY](http://127.0.0.1:4317/?mode=android&coverage=A.HOME.STANDBY&width=390&theme=light), [A.MARKET](http://127.0.0.1:4317/?mode=android&coverage=A.MARKET&width=390&theme=light), [A.RIDES](http://127.0.0.1:4317/?mode=android&coverage=A.RIDES&width=390&theme=light), [A.NOTIFICATIONS](http://127.0.0.1:4317/?mode=android&coverage=A.NOTIFICATIONS&width=390&theme=light).

Why: Primary daily captain tasks and error/retry discoverability.

Test feasibility: Physical isolated app + controlled local data/notifications only; no stock browser replacement.

Risks: Permissions, offer timing, approved vs assigned-work gates, scroll chrome and notification races.

## B07 — Android sign-in, onboarding status and Legal entry

Targets (5): [A.LOGIN](http://127.0.0.1:4317/?mode=android&coverage=A.LOGIN&width=390&theme=light), [A.SIGNUP](http://127.0.0.1:4317/?mode=android&coverage=A.SIGNUP&width=390&theme=light), [A.WELCOME](http://127.0.0.1:4317/?mode=android&coverage=A.WELCOME&width=390&theme=light), [A.HOME.STATUS](http://127.0.0.1:4317/?mode=android&coverage=A.HOME.STATUS&width=390&theme=light), [A.LEGAL](http://127.0.0.1:4317/?mode=android&coverage=A.LEGAL&width=390&theme=light).

Why: Unreviewed entry/registration paths, rejected/pending states and external legal navigation.

Test feasibility: Synthetic auth/provider fixtures plus a reconnected device; never send real OTP or documents.

Risks: Signed-in/incomplete profiles, eligibility, error recovery and external browser handoffs.

## B08 — Android active ride, ride detail and OTP/drop overrides

Targets (3): [A.HOME.ACTIVE](http://127.0.0.1:4317/?mode=android&coverage=A.HOME.ACTIVE&width=390&theme=light), [A.RIDE-DETAIL](http://127.0.0.1:4317/?mode=android&coverage=A.RIDE-DETAIL&width=390&theme=light), [A.DIALOGS.ACTIVE-RIDE](http://127.0.0.1:4317/?mode=android&coverage=A.DIALOGS.ACTIVE-RIDE&width=390&theme=light).

Why: High-consequence operational screens deserve a separate bounded review.

Test feasibility: Reconnected physical device and existing real isolated lifecycle harness; synthetic location/provider data only.

Risks: OTP, fresh GPS/geofences, cancellation reason/charges, settlement and side effects. Inventory is not authorization to change these rules.
