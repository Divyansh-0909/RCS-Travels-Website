# Website consistency audit — VC-B02

26 October 2026 IST. Audit and design samples only; product styling and existing owner choices remain unchanged.

14 findings: inputs, pills, focus states, switches, icon actions, feedback and action sizing. The source census covers 89 JSX/TSX files, 45 input declarations across 13 files, 43 rounded interactive declarations, and 3 additional clickable SVG declarations. These are source declarations, not counts of defects or distinct product controls. The 71 rounded wrappers/indicators include intentional decoration and status information.

## Measurements

Auth and booking fields match each other in this sample. Their scaling, and their differences from other website fields, are the actual sizing inconsistency.

| Field | Phone height (px) | Desktop height (px) | Phone CSS text / desktop rendered estimate (px) |
| --- | ---: | ---: | ---: |
| Login phone | 42 | 54.6 | 16px / 20.8 |
| Signup name | 42 | 54.6 | 16px / 20.8 |
| Booking pickup | 42 | 54.6 | 16px / 20.8 |
| Saved address | 48 | 48 | 16px / 16.0 |
| Safety contact | 42 | 42 | 16px / 16.0 |
| Filter date | 38 | 38 | 14px / 14.0 |
| Case ID | 48 | 48 | 16px / 16.0 |
| Login OTP | 46 | 46 | 24px / 24.0 |

Saved places measures the 48px labelled field, not just its 24px text-entry element. OTP boxes are a deliberate purpose-specific variant. Booking stays in its intentional legacy dark colour context even when the surrounding theme preference is Light; that alone is not a broken theme.

Trip buttons are 48px high inside a 60px group, Later is 48px, admin action pills are 44px, and filter chips are 32px. Compact design samples compare a 36px face / 40px visible group with a 40px face / 44px visible group, both using 44px native button targets. These samples are proposals, not implemented product styles or owner selections.

## Findings

### VC-B02-01 — Keyboard focus disappears in account controls

High; Observed defect.

Theme and Language rows receive focus, but their outline style remains none. Safety's contact field also keeps the same border with no outline or ring when focused. Booking and auth fields visibly change their border instead.

Suggested direction: Use an explicit solid focus treatment for every interactive control. Keep focus distinct from selected, error and disabled states.

Source: `frontend/src/components/ThemeToggle.jsx:36`, `frontend/src/components/LanguageSelector.jsx:41`, `frontend/src/pages/SafetyPage.jsx:141`.

### VC-B02-02 — Account edit panels crash before their fields render

High; Observed blocker.

Opening the Emergency Contact editor throws 'mdiChevronDown is not defined'. The reference is missing from the icon import. The profile's contact, DOB and Gender field presentation cannot be accepted from this broken state.

Suggested direction: Repair this runtime blocker before comparing or standardizing the account edit panels. Their input styles are recorded as source inspection only.

Source: `frontend/src/pages/ManageAccount.jsx:7`, `frontend/src/pages/ManageAccount.jsx:839`.

### VC-B02-03 — Admin filters sit under their backdrop

High; Observed defect.

At phone, tablet and desktop sizes, the filter panel is visibly dimmed. Pointer hit tests on its chips and date fields land on the backdrop, so pointer hover and active states cannot be exercised normally. Keyboard activation can still change filter sections.

Suggested direction: Fix the overlay stacking, then verify pointer and keyboard access together. Do not treat a visually rendered panel as a working control.

Source: `frontend/src/pages/AdminDashboard.tsx:725`, `frontend/src/components/ui/AccountLayout.jsx:91`.

### VC-B02-04 — Input height and text size change across surfaces

Medium; Needs common rule.

Auth and booking share the same base Input: 42px / 16px on phones, approximately 54.6px / 20.8px rendered on desktop because of scaling. Saved places uses a 48px labelled field with 16px text at both sizes. Safety is 42px, dense filters use 38px, and the responsibility case input is 48px.

Suggested direction: Consider 48px / 16px for standard fields, 40px / 14px for deliberately dense tools, and a separate OTP variant. Set actual dimensions instead of scaling the whole field.

Source: `frontend/src/components/ui/Input.jsx:8`, `frontend/src/pages/LoginPage.jsx:493`, `frontend/src/pages/OnBoarding.jsx:1267`, `frontend/src/pages/SettingsPage.jsx:205`.

### VC-B02-05 — Input fill, border and focus styles come from different systems

Medium; Needs common rule.

Auth uses input-background/input-border; booking overrides the fill to background-muted in its deliberate legacy dark surface; saved places uses a labelled surface with an ink ring; Safety inherits the row fill through a transparent field; admin filters use foreground-based borders. A shared purpose does not currently imply a shared state contract.

Suggested direction: Agree on semantic fill, border, placeholder, focus, invalid and disabled roles. Preserve the booking flow's deliberate dark context and the owner's saved-place design while choosing the shared geometry.

Source: `frontend/src/components/ui/Input.jsx:30`, `frontend/src/components/ui/Chips.tsx:4`, `frontend/src/pages/SafetyPage.jsx:141`, `frontend/src/pages/SettingsPage.jsx:205`.

### VC-B02-06 — Trip and timing pills inherit primary-action sizing

Medium; Owner-identified sizing issue.

One way and Round trip use 48px-high ActionControls with 24px horizontal padding. Their group adds 6px on each side, making it 60px high. Later also uses a 48px control with 24px horizontal padding. This explains the bulk in the supplied screenshot.

Suggested direction: Give pills their own compact size variant. Compare 36px faces in a 40px group against 40px faces in a 44px group; retain generous pointer targets independently of the visible fill.

Source: `frontend/src/components/ui/Button.jsx:14`, `frontend/src/pages/OnBoarding.jsx:1213`, `frontend/src/pages/OnBoarding.jsx:1231`.

### VC-B02-07 — Other pills have no shared role-based size scale

Medium; Needs common rule.

Filter chips are 32px high with 14px text; admin Sort/Filter pills are 44px with 16px text; booking pills are 48px with 16px text. There are also the navigation Now action, vehicle Ride details action, complaint choices, support actions, notice pills and status badges. These are different jobs, not one interchangeable component.

Suggested direction: Define separate variants for a segmented choice, an action/filter chip, and a noninteractive badge. Share typography, spacing and focus rules within each role; do not make every rounded item a primary button.

Source: `frontend/src/components/ui/Chips.tsx:20`, `frontend/src/pages/AdminDashboard.tsx:495`, `frontend/src/components/ui/NavBar.jsx:914`, `frontend/src/pages/ManageAccount.jsx:749`, `frontend/src/components/ui/NoticePill.jsx:12`.

### VC-B02-08 — Settings and ride options use unrelated switch designs

Medium; Needs common rule.

Settings uses a flat 48×28px ink/border switch with a circular thumb. Ride options uses a 50×22px visual assembly with a 14px green/grey track, a different thumb and more elaborate motion. The ride option's full row is correctly the interactive target; it is not a 22px-high hit target.

Suggested direction: Use one switch visual and motion contract, keeping the full-row interaction where appropriate. Choose one active colour policy and one disabled appearance.

Source: `frontend/src/components/ui/Toggle.jsx:12`, `frontend/src/components/RideOptions.jsx:27`, `frontend/src/components/RideOptions.jsx:50`.

### VC-B02-09 — Finance buttons combine adaptive ink with fixed white text

High; Source-confirmed contrast risk.

DriverFinancePanel defines its primary button as bg-ink plus text-white. In the Dark theme ink is white, which makes this combination white on white when no ancestor override applies. Finance inputs also have their own border/focus classes. These driver-detail states were not browser-exercised in this batch.

Suggested direction: Pair adaptive backgrounds with their matching foreground token, and verify the actual finance panel in both themes before approving a shared button/input contract.

Source: `frontend/src/components/DriverFinancePanel.tsx:5`, `frontend/src/components/DriverFinancePanel.tsx:6`, `frontend/src/index.css:89`.

### VC-B02-10 — Close, back and delete actions use different shapes and semantics

Medium; Observed and source-confirmed differences.

Saved-place cancel is the owner's white/black 32px button; auth Back is 40px; timing and ride-option close controls are 48px. Safety cancel and saved-place delete are clickable divs; the profile close and some copy/home actions are clickable SVGs. Several CircleIconButton callers still expose the generic name Action.

Suggested direction: Choose a compact icon size with a larger hit area, use native named buttons, and apply one keyboard focus/disabled policy. Keep the explicitly chosen white/black cancel colours.

Source: `frontend/src/components/ui/CircleIconButton.jsx:5`, `frontend/src/components/ui/AuthHeader.jsx:9`, `frontend/src/pages/SafetyPage.jsx:144`, `frontend/src/pages/SettingsPage.jsx:247`, `frontend/src/pages/ManageAccount.jsx:786`, `frontend/src/components/ui/bookingDisplay.jsx:39`.

### VC-B02-11 — Invalid-field feedback is implemented differently in each form

Medium; Needs common rule.

Auth uses a tinted field and InlineError with an alert icon. Saved places associates inputs with an alert and exposes aria-invalid, but uses a different visual invalid state. Safety changes its border and adds a plain message without the same field associations. Admin field validators have further local styles.

Suggested direction: Standardize invalid border/focus colours, message placement and accessible field associations. Keep form-level transport errors distinct from invalid input. OTP's verification animation remains a separate state.

Source: `frontend/src/components/ui/InlineError.jsx:8`, `frontend/src/pages/LoginPage.jsx:258`, `frontend/src/pages/SettingsPage.jsx:210`, `frontend/src/pages/SafetyPage.jsx:141`.

### VC-B02-12 — Selects, numeric fields and textareas also need shared variants

Medium; Source candidates.

Responsibility review uses native selects and a textarea with one local field class. Driver review textareas use a 2px border and a different focus border. Finance fields and fare-zone fields define two more local classes. Profile Gender builds its own dropdown with clickable options, but the current panel crash blocks its browser review.

Suggested direction: Include these callers in the field inventory before changing Input globally. Keep multiline height, numeric behavior, native selection and locked fields purposeful; share chrome and state roles.

Source: `frontend/src/components/ResponsibilityReviewForm.jsx:19`, `frontend/src/components/DriverReview.tsx:349`, `frontend/src/components/DriverFinancePanel.tsx:5`, `frontend/src/pages/EditFares.jsx:98`, `frontend/src/pages/ManageAccount.jsx:850`.

### VC-B02-13 — Primary-action sizing still differs outside booking and auth

Medium; Source candidates.

The new 48px action variant is used in booking/auth and was also extended to selectors. Payment, settlement, cancellation, account and responsibility actions still include legacy Button calls or local button classes. Some of the simpler selectors now look heavier than these commit actions.

Suggested direction: Reserve the primary-action size for real commit actions. Add independent compact pill and icon variants, then review payment/account actions under their existing behavior and policy constraints.

Source: `frontend/src/components/ui/Button.jsx:50`, `frontend/src/components/CustomerPaymentPanel.jsx:86`, `frontend/src/components/RideSettlementPanel.jsx:41`, `frontend/src/components/ResponsibilityReviewForm.jsx:49`, `frontend/src/pages/ManageAccount.jsx:894`.

### VC-B02-14 — Loading fields do not share one interaction contract

Medium; Observed difference.

While a synthetic OTP request is held, Login disables its submit action but leaves the phone field fully editable with no busy state. During a held saved-place request, its inputs are disabled and dimmed to 60%. The distinction is visible on both phone and desktop; it is not a claim of a backend or authentication defect.

Suggested direction: Agree when busy fields remain editable, become read-only, or become disabled, then provide consistent visual feedback and accessible status. Keep read-only and disabled meanings distinct.

Source: `frontend/src/components/ui/Input.jsx:24`, `frontend/src/pages/LoginPage.jsx:481`, `frontend/src/pages/SettingsPage.jsx:214`.


## Browser evidence and limits

45 route/state groups at 390px Light/Dark, 768px Light, and 1440px Light/Dark produced 180 unique control/configuration observations. 40 groups were observed; 5 account-editor groups remain partial because the actual application throws the undefined-icon error. An observed audit group is not a functional PASS: the admin filter's pointer interception is itself a finding. Default, hover, keyboard-focus and pointer-active styles were sampled when reachable; intercepted hover/active states were left unobserved. Invalid phone/OTP states use explicit synthetic browser responses. Earlier harness attempts are retained separately; their navigation/quote-fixture failures are not product findings.

The supplement records four held-request field states and five measurements of the bordered case-ID input, excluding its external label. The report uses those corrected chrome measurements while preserving the original enclosing-label measurements in the raw browser evidence.

Additional source-only scope includes finance inputs/actions, driver review textareas, responsibility-review selects/textarea, fare-zone controls, profile dropdowns, and payment/cancellation actions. Their installed data-dependent flows were not browser-verified. Native Android, provider-owned UI, production data, payment operations, and complete workflow certification are outside this audit. Marketing/legal/navigation source is included in the census; no new defect is inferred merely from an intentionally different content layout or noninteractive badge.

All browser work used existing synthetic loopback actors. Auth responses were mocked; fare estimates used the existing read-only synthetic fixture; all other attempted mutations were refused. No real messages, bookings, provider, customer or finance operations occurred. Product/behavior suites and a production build were not rerun for this tooling-only audit.

Preservation: 229/229 recorded frontend/theme inputs unchanged; existing owner-choice registry unchanged: true. Canonical audit statuses, phase closure and owner acceptance were not advanced.

Evidence: `output/handoff/website-consistency-2026-10-26/` contains the source census/hashes, browser observations, screenshots, earlier attempts, interactive report, validation and manifest.

Audit report checks: PASS at 320, 390, 768 and 1440px, including filters, five evidence configurations, responsive comparison layout, image loads, native sample-button targets, and keyboard use. The validated report has zero axe findings at those sizes; that result applies to the report UI, not the audited website. The separate existing reviewer/coverage suite passed 17 tests. Earlier report-review failures and their corrections remain in the evidence directory.

[Open the interactive audit](http://127.0.0.1:4318/). The existing [live product preview](http://127.0.0.1:4317/?view=consistency&family=VC-B01-ADDRESS&width=390&theme=light) remains available.
