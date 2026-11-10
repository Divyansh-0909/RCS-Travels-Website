# VC-B01 saved owner choices implemented

26 October 2026 IST. Implements the three CUSTOM instructions saved in `output/handoff/consistency-decisions.json`, revision 4, followed by the owner's instruction to implement them. Original choices, notes, screen selections and review history are preserved. Implementation is separate from the owner's final visual acceptance.

The route's pickup and drop inputs now use the same `--background-muted` surface as the vehicle cards. This is scoped to those two fields; their autocomplete, clear controls, focus, errors and current-location state retain their behavior.

Saved places now edits both the name and address inside the existing SettingRow. Typography and row padding retain the normal two-line footprint. Save and cancel stay on the trailing edge; cancel is a red circle with a white X and supports keyboard use. Home, Work and custom names can be edited. Renaming a place preserves its ID and occupies the existing row rather than adding an empty default card above it. Validation respects the API's 40-character name and 200-character address limits. A failed save retains both fields; pending saves disable editing/cancellation. Escape cancels, Enter saves, and composition input is respected.

The existing Button has an opt-in `size: "action"` used by main route/timing, vehicle booking/location-confirmation, login and signup actions. It provides a 48px minimum height, 16px text with 24px line height, 12px vertical and 24px horizontal padding, and the existing 12px radius. Width fits each form. Desktop scaling is removed from these actions so the actual control and text sizes agree across viewports. Loading exposes `aria-busy` and disables repeat submission; existing page labels and errors remain. Browser testing found and corrected the shared button's missing keyboard outline style. Compact selectors, switches and picker controls retain their purpose-specific sizes in this pass.

The sizing is an RCS design choice informed by [Apple's guidance on 44-point touch targets](https://developer.apple.com/design/tips/) and [Uber Base Web's shared button sizing/padding implementation](https://github.com/uber/baseweb/blob/main/src/button/styled-components.ts), with its [spacing tokens](https://github.com/uber/baseweb/blob/main/src/themes/shared/sizing.ts). Apple's points are not CSS pixels; no claim is made that these exact RCS dimensions are prescribed by Apple or reproduce every Uber screen. The supplied [REA repository](https://github.com/morluto/rea) was inspected as a reference to inspection tooling; the design values above use the primary design-system sources.

Validation uses the actual local React application with synthetic actors and fixture prices. All OTP and saved-place mutations in the browser checks are intercepted in isolated contexts; no real messages, bookings, provider or customer operations occur.

| Check | Result |
| --- | --- |
| Website production build | PASS; existing large-chunk warning remains |
| Frontend tests | 72 PASS |
| Reviewer/fixture/coverage tests | 49 PASS, one existing skip |
| Browser matrix | 48 PASS: route, timing, vehicle, login, signup, saved places at 360/390/768/1440 in Light/Dark |
| Action states | Size/padding, keyboard outline, disabled, loading, OTP and error states observed |
| Saved-place states | Name/address validation, unchanged row bounds, red/white cancel, pending, failure/draft retention, same-ID rename, Work/custom cancellation, long fields, Enter/Escape, new custom save |
| Visual inspection | Before/after phone and desktop screenshots, plus matrix screenshots |

Evidence: `output/handoff/consistency-implementation-2026-10-26/`, including original source copies, task-specific diffs, `before.json`, `after.json`, `functional.json`, earlier failed attempts, build output, tests and screenshots. Source locator maintenance retains all 351 inventory IDs and all audit/owner/verification fields; it does not expand product audit acceptance. Historical published VC-B01/P06 evidence is unchanged. No Android source, backend contract, authentication authority, business or financial rule was changed by this task.

[Review the implemented website](http://127.0.0.1:4317/?view=consistency&width=390&theme=light).

The owner's subsequent answer approved extending the shared sizing to compact controls. That additional implementation and its separate validation are recorded in the [compact-control follow-up](VC-B01-compact-controls-2026-10-26.md).

The subsequent revised address choice replaces the red cancel and bare saved-place inputs described above. Its implemented design and separate validation are recorded in the [address-editor revision](VC-B01-address-editor-revision-2026-10-26.md).
