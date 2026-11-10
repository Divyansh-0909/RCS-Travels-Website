# P06 — Updated accessibility and responsive observations

24 October 2026 IST. **STATUS: OUTPUT_READY — four explicitly approved P06 fixes VERIFIED in the local synthetic renderer.** Broader booking QA remains incomplete. Owner aesthetic acceptance is separate from technical verification.

| Width × height | Actual policy | Stages / saved preferences | Horizontal overflow |
| --- | --- | --- | --- |
| 360 × 844 | LEGACY_FIXED | Route / timing / vehicles; saved Light and Dark | None |
| 390 × 844 | LEGACY_FIXED | Route / timing / vehicles; saved Light and Dark | None |
| 768 × 1000 | LEGACY_FIXED | Route / timing / vehicles; saved Light and Dark | None |
| 1280 × 1000 | LEGACY_FIXED | Route / timing / vehicles; saved Light and Dark | None |
| 1440 × 1000 | LEGACY_FIXED | Route / timing / vehicles; saved Light and Dark | None |

Both saved account preferences preserve the intentionally fixed /book appearance. These are 30 samples, not 30 pages or two distinct supported visual themes. The product patch adds no styling classes, tokens, colors or layout. Actual mobile midnight and desktop suggestion-focus images were visually inspected against the prior renderer. Recorded before/after images are available beside the functioning live frame.

| Width | Saved preference | Stage | Raw axe violations | Incomplete nodes |
| --- | --- | --- | --- | --- |
| 390 | light | route | 0 | color-contrast: 1 |
| 390 | light | timing | 0 | color-contrast: 12 |
| 390 | light | vehicle | 0 | color-contrast: 1 |
| 390 | dark | route | 0 | color-contrast: 1 |
| 390 | dark | timing | 0 | color-contrast: 12 |
| 390 | dark | vehicle | 0 | color-contrast: 1 |
| 1440 | light | route | 0 | None |
| 1440 | light | timing | 0 | color-contrast: 11 |
| 1440 | light | vehicle | 0 | None |
| 1440 | dark | route | 0 | None |
| 1440 | dark | timing | color-contrast (1) | color-contrast: 11 |
| 1440 | dark | vehicle | 0 | None |

One 1440px saved-Dark timing scan reported 3.59:1 contrast on the primary action. The original record is retained. A follow-up after fonts and finite animations settled reported zero violations, with the enabled CTA white on blue and parent opacity 0.9. The evidence does not establish that every transient/contrast state passes; incomplete contrast nodes remain explicit. No extra theme treatment was introduced to hide this observation.

Keyboard and selection semantics pass independently of axe: both address fields retain focus within suggestions and support activation/dismissal; all four vehicle cards expose the actual selected state. Spoken screen-reader output, physical mobile keyboards/gestures, full tab order, zoom and exhaustive target/contrast coverage remain NOT_RUN.

[P06-responsive-accessibility-evidence.json](https://drive.google.com/file/d/12IHlbmwLvzsMmbRW6rfoFUeEEjLYUFDp/view?usp=drivesdk); P06-fixes-settled-axe.json; [23 October baseline P06-accessibility-responsive-matrix.md](https://drive.google.com/file/d/1iamEDevRHQv7HWBbb0U9GcAB0dv0rNx9/view?usp=drivesdk).

