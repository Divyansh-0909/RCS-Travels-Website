# Visual consistency — first owner-directed comparison batch

24 October 2026 IST. VC-B01-2026-10-24 is an unnumbered bounded audit, explicitly requested by the owner after approving the cross-phase directive. P06 remains completed for its four approved fixes. This work does not dispatch P07 or approve any product redesign.

**Ready for owner pattern choices.** Three component families, eight occurrences, four existing tracker entries, two actual routes (/book and /settings). Two comparisons need owner direction; the third documents a purposeful selection-control exception. No visual mismatch is promoted to a confirmed defect without evidence of intended equivalence.

## Primary booking actions — NEEDS_OWNER_CHOICE

The route/timing action applies a 1.3 desktop scale to Button; the vehicle action uses an unscaled full-width Button with its own text size. Compare rendered height, text, radius and padding below.

These are successive primary actions in the same legacy booking flow. The commit step may deliberately differ from the earlier steps; no approved reference establishes one standard.

Button is reused outside these screens. Any future choice must be scoped to the listed booking actions; global Button or brand-token edits are excluded.

[Compare the actual controls](http://127.0.0.1:4317/?view=consistency&family=VC-B01-ACTIONS&width=1440&theme=light).

| Occurrence / canonical screen | 390px control height / estimated font | 1440px control height / estimated font |
| --- | --- | --- |
| A · Route entry — Set date & time / `W.BOOKING.ROUTE` | 44.0 / ≈16.0px | 57.2 / ≈20.8px |
| A · Timing — See prices / `W.BOOKING.TIMING` | 44.0 / ≈16.0px | 57.2 / ≈20.8px |
| B · Vehicle selection — Book ride / `W.BOOKING.VEHICLES` | 44.0 / ≈16.0px | 48.0 / ≈18.0px |

Owner options: Use the route/timing proportions for these actions; Use the vehicle-action proportions for these actions; Keep purpose-specific action proportions. A custom instruction and screen exclusions are supported.

## Address text fields — DESIGN_REFERENCE_UNCLEAR

Booking uses the shared Input with desktop vertical scaling, medium text and marker/clear adornments. Saved places uses a local unscaled input inside an account row. Measure the shared address-entry task while preserving the distinct page themes.

Both accept a place address, but booking offers autocomplete and Settings edits a saved address. Theme and available width are deliberate context differences; the intended common control proportions need an owner choice.

Only pickup, drop and the saved Home editor are sampled. Settings reuses its editor for Work and custom places: those variants remain unverified and need an expanded affected-controls review before any edit that would reach them. Other Input callers are excluded. Colors and autocomplete behavior are locked.

[Compare the actual controls](http://127.0.0.1:4317/?view=consistency&family=VC-B01-ADDRESS&width=1440&theme=light).

| Occurrence / canonical screen | 390px control height / estimated font | 1440px control height / estimated font |
| --- | --- | --- |
| A · Booking pickup address / `W.BOOKING.ROUTE` | 42.0 / ≈16.0px | 54.6 / ≈20.8px |
| A · Booking drop address / `W.BOOKING.ROUTE` | 42.0 / ≈16.0px | 54.6 / ≈20.8px |
| B · Settings — saved Home address editor / `W.SETTINGS.SAVED-PLACES` | 42.0 / ≈16.0px | 42.0 / ≈16.0px |

Owner options: Use booking field proportions, keeping each page theme; Use saved-place field proportions, keeping each page theme; Keep purpose-specific booking and account fields. A custom instruction and screen exclusions are supported.

## Selection controls: compact modes and rich cards — INTENTIONAL_VARIANT

Trip mode uses compact pill buttons. Vehicle choice uses larger cards with a vehicle image, passenger count and sample fare. Both expose aria-pressed; their content and space requirements differ.

Different information density justifies distinct shapes. This is an explicit exception candidate, not a confirmed visual defect. Do not turn vehicle cards into pills or trip-mode choices into fare cards.

Preserve the P06 selected-state fix and the existing trip-mode behavior. A pattern decision here never approves a booking-rule change.

[Compare the actual controls](http://127.0.0.1:4317/?view=consistency&family=VC-B01-SELECTION&width=1440&theme=light).

| Occurrence / canonical screen | 390px control height / estimated font | 1440px control height / estimated font |
| --- | --- | --- |
| A · Route — One way / Round trip / `W.BOOKING.ROUTE` | 28.8 / ≈14.4px | 39.6 / ≈18.0px |
| B · Vehicle — Hatchback / Sedan / SUV / `W.BOOKING.VEHICLES` | 68.0 / ≈18.0px | 73.5 / ≈19.9px |

Owner options: Keep compact modes and rich vehicle cards; Leave undecided for a later comparison. A custom instruction and screen exclusions are supported.

## Evidence and scope

- [Source-traced component inventory](https://drive.google.com/file/d/1I6mXSbpRthpl-O2xHP6tErWwkW5is8AY/view?usp=drivesdk).
- [Thirty-two actual renderer samples and computed measurements](https://drive.google.com/file/d/1BRd00GA4zEt6qiDCV-QiUrETHQBTH1wL/view?usp=drivesdk): eight occurrences × 390/1440px × both saved preferences; zero observed page errors or horizontal overflow. CSS font/radius and transformed rendered bounds are distinguished. Font estimates use integer layout dimensions and are approximate; large full-radius CSS values denote pills.
- [Live reviewer checks](https://drive.google.com/file/d/1gYe88biPJ3TyE0vXJ4zaE7Brh-E3ULAf/view?usp=drivesdk): 14 check groups at outer widths 390, 768 and 1440, both actual panes, alternative occurrences, 1440px Dark-preference frames, actual vehicle selection, custom-choice submission with screen exclusions, and existing P06/Android modes. Test form submissions were intercepted; no test choice was written as an owner decision.
- [Tool tests](https://drive.google.com/file/d/1q54HvzrmSpADQ31947g6pcOV6iPfb8hb/view?usp=drivesdk): 49 passed, zero failed, one existing Windows symlink skip. [Quality checks](https://drive.google.com/file/d/1gkQdKfr3T-UCeD6gvPBQ40V_PnE4ai3Y/view?usp=drivesdk) include syntax and explicit new-file whitespace.
- [Protected source identities](https://drive.google.com/file/d/11hPuThb_7AshPFG_mFC2UykIaIjb97fT/view?usp=drivesdk): all 264 product/theme inputs unchanged; HEAD and staging index unchanged. Only developer preview/reviewer, coverage and audit files changed. No frontend/backend/native product suite is implied by the tool checks.
- [Published owner-pattern snapshot](https://drive.google.com/file/d/1I-1rrF2BEOhWlf-X48p9MaSOeCzdWfQV/view?usp=drivesdk). The live local registry is `output/handoff/consistency-decisions.json`; it stores the exact selected family, shown occurrence IDs, screen subset, custom instruction and revision history. Recording a choice never executes a product edit. A shared-source cascade outside those occurrences requires a new explicit review. Technical verification and eventual aesthetic acceptance remain separate.

## Tracker preservation

All 351 canonical IDs remain; only four existing rows gain bounded visual_consistency observations. 347 unrelated rows are unchanged, and every previous owner/implementation/verification field is preserved. Only the Home address editor was sampled in Saved Places; Work/custom editors remain excluded. W.BOOKING remains NOT_REVIEWED/NOT_RUN; five P03 keep-current failures, historical failures and P04/P06 accepted changes remain intact. Existing functional approval fields do not approve these new visual patterns. CSV regeneration is byte-stable.

## Fixture limits and retained corrections

Booking stays LEGACY_FIXED under both preferences; Saved Places follows its actual account theme. The local fixture seeds the real router stage and uses the real store setter for a valid synthetic future scheduled time before React mounts. It renders the existing product components; it does not replay or certify a complete booking journey. Read-only constant-price quotes and synthetic addresses are used; Maps is unavailable. No booking, payment, dispatch, communication, customer/provider or production operation occurred.

3 pre-fix reviewer attempts are retained. The first mobile occurrence switch did not complete automatic stage navigation. Direct stage seeding then exposed the omitted non-persisted scheduled-time input; the final fixture seeds that input through the existing setter. Browser offscreen transition behavior was a diagnostic hypothesis, not a certified browser-engine defect. A further preview import failed Vite resolution; the fixture initialization was inlined into the existing preview entry transform and the actual entry module was checked again. None of these attempts was a product regression finding. The final actual-renderer checks pass.

Android product UI was not changed or audited for consistency; the existing actual-device VIEW-ONLY preview remains available and its current freshness is reported honestly. Home/Outstation, brand tokens, all unlisted screens and global primitive refactors remain excluded. No commit, push, merge or deployment occurred.
