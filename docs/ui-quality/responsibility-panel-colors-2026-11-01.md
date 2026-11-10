# Responsibility review — panel color accents

1 November 2026. Owner requested color for the Evidence, AI assessment and Decisions text/icons, informed by Vercel and Linear. Uses the RCS UI skill and the existing cards, badges, trace components, type and spacing.

## References inspected

- [Vercel Geist colors](https://vercel.com/geist/colors): neutral default surfaces, with accessible text/icon color roles.
- [Vercel Geist badges](https://vercel.com/geist/badge): short semantic labels and subtle fills for dense interfaces.
- [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui): reduce visual noise, preserve hierarchy and keep theme contrast consistent. Its published UI image could not be fetched by the web reader; the article itself was available.

The implementation adapts these principles to RCS; it does not copy either product's palette or rebuild the page.

## Changes

| Accent | Meaning on this page |
| --- | --- |
| Blue | Saved information, timeline titles, people, history counts and recorded decision outcomes |
| Amber | Explicit requests for review, missing/unavailable information and conflicting accounts |
| Green | An explicit successful validation or a source-marked complete record without listed gaps |
| Red | An explicit failed information validation |
| Gray | Unknown results, absent records and empty histories |

Color is paired with existing text and distinct icon shapes. AI suggestions cannot become green/red verdicts merely from their classification or explanation. UPHOLD and WAIVE outcomes both use informational blue. Absent legacy validation never borrows a newer production result. A contradictory completeness flag stays amber.

Added two informational ink colors to `shared/theme/tokens.cjs` and regenerated the theme. Reused the existing adaptive success, warning and danger roles. All pre-existing tokens remain unchanged; the generated captain-app stylesheet is byte-for-byte unchanged. The dark red badge uses the plain panel background after its initial tinted version failed the text contrast check.

Bounded badge corner radii also prevent enlarged, multiline labels from being clipped by tall capsule edges. Normal 20px badges retain their compact shape. Layout, summary wording, raw records, API behavior and decision submission rules are preserved.

## Verification

- Frontend build PASS; its existing bundle-size warning remains in the log.
- Frontend tests **104/104 PASS**, including four new source-bound color classification tests.
- **12 browser configurations PASS**: Chromium at 320/390/768/1440px in both themes; Firefox and WebKit at selected phone/desktop sizes.
- **6 scoped axe audits**, zero reported violations; **24 browser contrast sets**, minimum sampled text contrast **4.74:1**, with separate 3:1 icon and 4.5:1 text thresholds.
- **40 exact full-record JSON comparisons** and **8 before/after summary-content comparisons** PASS. Popup opening, Escape/focus return, timeline controls, disabled save state, long names and unavailable/contradictory records covered.
- After the final radius adjustment, **4 additional 200% text checks PASS**, with screenshots and contrast measurements at phone/desktop widths in both themes.
- Representative desktop, tablet, phone, failed-check and enlarged-text screenshots were visually inspected. Synthetic local data only; browser fixture requests remained GET-only.
- Scoped whitespace checks PASS with CRLF recognized as line endings. No backend/native implementation, production, customer, provider or SQL operations were involved.

Evidence: [`output/handoff/responsibility-status-colors-2026-11-01/`](../../output/handoff/responsibility-status-colors-2026-11-01/), including `checks.json`, `wrap-checks.json`, `preservation.json`, test/build logs and before/after screenshots. The first rejected dark-red contrast sample is retained separately.

Preview: [dark](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=dark) · [light](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light).
