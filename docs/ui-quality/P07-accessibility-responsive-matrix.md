# P07 — accessibility and responsive matrix

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

## Measured coverage

| Configurations | Samples | What was checked |
|---|---|---|
| 390/1440px ×22 source-backed states | 44 | Rendered headings/status/actions, geometry, scroll, document overflow and centre hit probes |
| 320/360/768/1280px ×5 core states | 20 | assigned, advance, completed, partial-refund-pending, failure |
| 390/1440px ×5 core states, root font32px | 10 | 200% text stress, wrapping and reachability |
| 320px Hindi /390px Hinglish ×5 core states | 10 | Actual store+i18n language change; translated and fallback text; long labels |
| Total | **84 OBSERVED** | Not84 fully passing journeys; no document horizontal overflow does not rule out overlap |
| Scoped axe normal text at390/1440 | **12 runs; 0 violations** | assigned, advance, completed, refunded, partial pending, failure; wcag2a/2aa/21aa scoped to #root |

Tracking is the actual fixed legacy composition under both saved light/dark preferences. Themes were not forced into unsupported counterpart pages. Whole-page theme reconciliation stays deferred; shared component themes outside this route are not accepted by these checks.

## Keyboard, pointer and announcements

Actual Tab reaches normal controls with a2px primary outline (rgb48,103,253 in this legacy composition); source Button uses the shared primary token. Successful visual stale recovery still leaves an opacity0 Dismiss Tab stop2×: P07-B02-03. At1440/root32px Contact support is covered by receipt2× despite no document overflow: P07-B02-04. Both remain FAIL. Normal sized primary actions use minimum48px height and expand for wrapped text; circular Back is44px, context pills are deliberate smaller variants. This audit does not silently enlarge these owner-approved variants.

CustomerPaymentPanel failed state exposes role=alert; paid/cancelled/busy and settlement-paid presentations use status/live semantics where implemented. A denied settlement has no alert:02. Heading hierarchy and computed sizes are captured in measured-families.json/matrix.json. No spoken screen reader announcement timing or full modal focus trap certification is claimed. The full-screen Go back dismiss control and off-viewport/opacity0 nodes can appear in raw geometry probes; they are not all separate bugs. Confirmed issues use actual pointer or Tab reproduction, not geometry alone.

Measured enabled white-on-primary action contrast is4.68:1; white on legacy page19.59:1; white on muted card14.86:1; muted heading example8.83:1. Computation uses text colors and composited solid ancestor backgrounds, not screenshot color guessing. Transparent/invisible full-screen dismiss controls and disabled opacity are excluded from normal-text acceptance. Axe incomplete nodes remain in raw output; zero scoped violations does not certify every state or transient overlay.

Touch contexts at narrow sizes and browser scroll were exercised; safe-area CSS rendered with desktop browser insets. Physical mobile safe areas, Android/iOS native maps, OS keyboards, native gestures, actual TalkBack/VoiceOver, browser zoom at every DPI and provider checkout accessibility are NOT_RUN. Root32px is explicit text stress, not a claim about real OS text scaling. Translation remains partial for existing financial copy. No data-specific financial correctness is tested.

Evidence: matrix.json, matrix-before-language-recheck.json, matrix-localized.json, measured-families.json, transitions.json, large-text-support.json, supplement.json and their PNGs. [Live04](http://127.0.0.1:4317/p07?issue=P07-B02-04&width=1440).
