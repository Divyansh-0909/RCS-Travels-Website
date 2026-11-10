# Login input sizing and single-border focus

27 October 2026 IST. The owner selected the existing login/signup input sizing as the reference and requested removal of the second offset outline.

Booking pickup/drop fields now use the same shared responsive width as auth: 86vw below the `sm` breakpoint and 377px from `sm` upward. Height remains 48px, type 16px, and radius 12px. The 78vw home-form override and the differently constrained booking rail no longer change field width. Timing and map-picker panel constraints retain their separate layout.

| Viewport | Login reference | Booking before | Home booking before | Both booking surfaces now |
| --- | --- | --- | --- | --- |
| 320px | 275.2px | 304px | 249.6px | 275.2px |
| 390px | 335.4px | 335.4px | 304.2px | 335.4px |
| 600px | 516px | 416px | 468px | 516px |
| 768px / 1440px | 377px | 377px | 377px | 377px |

Text fields, selects and textareas use their existing focus border, with no outer outline, shadow ring or outline offset. Normal focus remains primary blue. Existing invalid-field border colours remain. Buttons, links, radios, switches and other controls keep their visible primary keyboard outlines.

The auth page sources are unchanged. Before/after measurements of all 30 sampled auth fields confirm identical width, height, typography, padding and radius. The shared field primitive exposes its width class so booking uses the same source.

Validation:

- Frontend production build: PASS, with the existing bundle-size warning.
- 70 field samples across login, signup name/phone, `/book`, and home booking at 320, 390, 600, 768 and 1440px in both preferences. Rest, pointer focus, keyboard focus and pressed states checked.
- Seven additional groups cover narrow layouts, timing dropdown placement/dismissal, auth error borders, OTP sizing/focus, another shared field and retained button outlines.
- All 19 Compare/coverage tool tests pass. Coverage metadata changes refresh source-line references only.
- Screenshots inspected at phone, constrained mobile, tablet and desktop sizes. Synthetic actors/API responses only; no real OTP/provider or customer writes. Backend/native suites were not run.

Evidence: `output/handoff/VC-B02-input-refinement-2026-10-27/`, including the eight-file baseline, before/after measurements, auth-size preservation, state checks, screenshots and build/tool logs. Earlier failed harness attempts are retained; a suggestion overlay and keyboard navigation made the initial test sequence unsuitable, so the final harness dismisses prior focus and establishes keyboard modality before measuring.

The actual website preview is running at [localhost:1575](http://127.0.0.1:1575/__review/consistency?occurrence=VCB01_ROUTE_ACTION&theme=dark). This starts only the synthetic website preview; document automation is not running.
