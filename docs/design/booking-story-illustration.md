# Landing booking steps

The landing page's "Book a ride in four simple steps" section follows the left illustration / right timeline structure of [MindMarket's Decision Case](https://mindmarket.com/customer-led-strategy). Its artwork is a native SVG redraw of `frontend/src/assets/hero-section-illustration/phone-holding-reference.png`.

## Editable sources

- `frontend/src/assets/booking-story/booking-phone-hand.svg`: the complete over-the-shoulder character from the updated 1448 × 1086 reference: cap, flowing hair, profile, glasses, pink backpack, cream shirt, both hands and phone. Source colour boundaries were traced into smooth cubic paths, with editable gradients and separately drawn seams. Groups are named with `data-layer` attributes. There are no embedded raster cutouts.
- `frontend/src/components/booking-story/BookingStepIllustration.jsx`: fits the screen to the reference's four phone edges using a perspective transform and the traced screen clip. Each instance prefixes its SVG IDs and gradient references.
- `frontend/src/components/booking-story/BookingPhoneUI.jsx`: four light-mode illustrations of the actual pickup/timing, vehicle picker, booking review and assigned-driver screens. Address, quote, driver and OTP details are represented by quiet placeholders. Vehicle images, names and seat counts come from the existing vehicle catalog. Scheduled-ride copy preserves the 10% advance rule.
- `frontend/src/components/booking-story/BookingStory.jsx` and `BookingStory.css`: the section layout, timeline and responsive behavior. The heading sits on the left and the introduction on the right above the unboxed steps; they stack with left alignment on mobile. The illustration and steps use the same centered row width as the header. Desktop fits the complete enlarged drawing into its column and available left gutter, with uniform scaling. The step column keeps its original readable proportions. The former four selector buttons beneath the illustration have been removed; numbered timeline markers remain.

The hero character SVG and its motion settings are unchanged by this section replacement.

The booking character uses the hero's fine navy (`#172331`) contour style, with 1.8-unit strokes and round caps/joins at its larger SVG scale. Separate visible-edge paths outline the cap, face, sleeves, hands and backpack. The traced edges are smoothed locally, cuff overlaps are outlined once, and garment creases stop at the fabric boundary. The lower backpack/shirt continuation meets the upper outlines without a step. Fill colors, gradients and phone-screen registration are retained.

The neck and front cuff share the adjoining fill contours so their outlines meet without white slivers. The back wrist paints behind the sleeve, with its covered outline omitted. Small overlaps close the phone grip and glasses bridge. The cap front has a continuous outer contour, and the white cap symbol has the same 1.8-unit navy border as the character.

The heading, introduction and illustration-and-steps row share a centered 1200px maximum width. The illustration retains its mobile gutters; desktop scales within the available column and outer gutter.

Inline artwork retains its 16px left offset. Desktop aligns the artwork with its column?s right edge and uses the available left gutter. The layout no longer clips the zoomed silhouette. The section clips only its horizontal gutters and allows the illustration to continue below; the About Us wrapper establishes the foreground layer.

The left side follows `phone-holding-reference.png`: the existing hair waves and upper backpack are retained, the few hair pixels cut by the source canvas are joined smoothly, and the lower backpack has a curved left outline. The `-16 -24 1536 1448` viewBox includes the completed silhouette and top/side breathing room. The crown fill and outline share a smooth rounded arc across the former source-canvas boundary. The established proportions, colors and phone position are retained. The full contour remains visible rather than being hidden behind a straight left crop.

The `lower-completion` SVG group closes the missing backpack and shirt edges with short, curved contours. The backpack has a rounded base, and the sleeve and shirt form a continuous lower silhouette. Fill and outline paths agree, garment seams join the reference drawing at the same coordinates, and the completion stays visible during the steps. At the transition into About Us, the final illustration continues underneath the About Us panel. The panel paints above it, and its rounded corners reveal the uninterrupted illustration. There is no long body extension or per-axis stretching. The phone registration is unchanged.

## Scroll and motion

On desktop, the character stays on the left as the four explanations scroll on the right. IntersectionObserver selects the step occupying the upper-middle reading area. A bounded CSS translation keeps the illustration at its reading position inside the landing page's existing ScrollSmoother. The translation follows rendered container bounds on the GSAP ticker when the rendered scroll position changes. Its exit limit includes the section?s bottom padding and allows the lower fifth of the artwork to pass the section boundary, without pin spacers, page-scroll writes or section-driven global refreshes. Only screen content changes between steps; the phone and grip stay registered to the same drawing.

Below 900px, on short viewports, and with reduced motion enabled, the section uses normal reading order with one illustration below each explanation. The complete silhouette fits within the header row's horizontal bounds. The final inline illustration uses a shorter frame and no trailing section/step padding so its lower edge runs underneath About Us. Reduced motion disables the screen fade. Observers and the desktop ticker are cleaned up on route changes and breakpoint changes.

The final Book a ride link opens the existing `/book` route. Illustrative controls inside the phone are decorative and do not submit bookings.

## Reference investigation

[REA](https://github.com/morluto/rea) 6.8.0 was run locally with its supported temporary Node runtime against an owned, anonymous browser viewing the public MindMarket page. Its `analyze_web_bundle` observation parsed 43 of 43 captured scripts with zero parse failures; the result retains its partial/static-analysis limitations. Direct inspection of the Decision Case component established the observer reading band, active classes, numbered navigation and accessibility state. MindMarket's proprietary character/Rive files are not part of the RCS implementation.

The local investigation and browser comparison artifacts are under `output/booking-steps-mindmarket-2026-10-27/`. The complete REA result is `research/rea-analysis-final.json`; a compact scope summary is `research/research-summary.json`.

## Review

- Landing: `http://localhost:1574/` (How it works section).
- Development preview: `/dev/booking-story`; `?progress=0`, `?progress=.26`, `?progress=.51`, and `?progress=.76` select the four phone screens.
- Desktop/mobile screenshots, per-step artwork and runtime checks are retained in the local output directory.

Hindi and Hinglish copy uses the existing website-copy dictionaries. Existing dictionary values were preserved when adding the new section labels.
