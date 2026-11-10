# Responsibility timeline layout correction

31 October 2026. Follows the [evidence and decision presentation](responsibility-records-2026-10-30.md). Owner reported that the timeline looked off and requested screenshot-based inspection and correction.

## Observed defects and correction

- The shared Card's desktop breakpoint added 24px of vertical padding above the event content, leaving the dot above its heading. The local event card now overrides that breakpoint padding explicitly.
- The previous event connector ended at the start of the final item, 25px before its marker in the 390px baseline. Each timeline item now owns a connector segment; the first and last endpoints align with their marker centers.
- Decision connectors used a fixed inset on the entire accordion, so opening the final record could extend the line below the last dot. Decision stages now use the same per-item rail as events and versions.
- Marker offsets follow the first heading line height, including wrapped headings and enlarged text. One-entry histories show a single dot with no protruding line.
- Label/value rows now stack when their available width cannot accommodate both columns. Short labels and individual words no longer break into cramped columns on narrow screens with enlarged text.

The implementation retains existing shadcn cards/accordions, RCS colors, original data, dates and lifecycle stage order. The correction uses CSS layout without animation, DOM measurements or observers in product code.

## Verification

Screenshots were captured before editing, inspected, recaptured after correction and reviewed again after the narrow-field adjustment. Selected evidence is in `output/handoff/responsibility-timeline-fix-2026-10-31/`.

- **20 browser configurations PASS** across Chromium, Firefox and WebKit; light/dark themes; 320, 390, 768 and 1440px widths, with 200% text at 320/1440px in Chromium.
- **140 timeline groups, 400 marker positions and 260 connector joins** checked. Heading, rail and first/last endpoint deviations are **0px**; maximum inter-item join deviation is **1px** at an accordion border.
- Default, expanded-event, evidence-version, single-assessment, all-decision-expanded and finalized states pass. Keyboard disclosure behavior, exact original JSON, read-only finalized behavior and original finalization timestamp remain intact. No runtime errors or fixture API writes were observed.
- Four scoped automated accessibility audits of expanded decision records report **zero violations**; incomplete/manual checks remain in their receipts.
- Website build, scoped whitespace and **14 coverage-inventory checks PASS**. All **355 stable IDs** and audit/owner statuses are preserved; only three Responsibility page source lines are rebound.

These are synthetic browser checks, including phone viewports, rather than physical-device or live backend/provider verification. Prior evidence remains unchanged.

[Review the corrected timeline](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light).
