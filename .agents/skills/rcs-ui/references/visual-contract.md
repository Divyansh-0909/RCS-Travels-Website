# RCS visual contract

Use this reference for design or implementation decisions. The source files remain authoritative if they change.

## Canonical sources

- Shared tokens: `shared/theme/tokens.cjs`
- Website generated theme: `frontend/src/theme.generated.css` (generated; do not hand-edit)
- Website primitives: `frontend/src/components/ui/`
- Website component map: `.design-sync/config.json`
- Website component previews: `.design-sync/previews/`
- Captain-app primitives: `driver-app/src/components/ui/` and `driver-app/src/components/AppText.tsx`
- Captain-app Tailwind mapping: `driver-app/tailwind.config.js`
- Captain-app visual prototype: `driver-app/design/driver-ui.html`
- Captain-app fonts: `driver-app/src/theme/fonts.ts`

When a shared token changes, edit `shared/theme/tokens.cjs`, run the relevant package's `theme` script, and commit the generated website CSS with the source change.

## Identity already chosen

- PP Mori is the product family. Preserve the existing cuts and role assignments rather than introducing a fashionable substitute.
- Primary blue is `#243AFB`, with the dark and light variants already declared in shared tokens.
- The established dark surfaces are `#0B0B14`, `#121220`, and `#1d1d27`; light surfaces and ink roles already exist. Use their variables instead of duplicating hex values at call sites.
- The shared type scale is intentional and cross-platform. The captain app has special `fare` and `plate` roles; do not use them as generic display sizes.
- Existing radii cluster around 12px controls, 16px cards/sheets, and full pills for status or compact chrome. A pill is not the default container shape.
- Existing spacing follows a 4-point rhythm. Prefer 4, 8, 12, 16, 24, 32, 48, 64, or 96 over arbitrary near-duplicates.

## Product-specific priorities

### Customer website

The booking path should make location, ride choice, price, timing, and the next action immediately legible. Visual novelty must not compete with booking confidence. Maps and route information are functional content, not decorative backdrops.

### Captain app

Captains use the app one-handed, outdoors, under time pressure, and sometimes while stationary in a vehicle. Ride state, payout/fare, pickup/drop, safety constraints, and the next permitted action outrank ornament. Keep touch targets generous, contrast resilient, copy short, and status changes unmistakable.

## Hierarchy and composition

- Decide what should be noticed first, second, and third. Use a combination of size, weight, contrast, and space; do not rely on oversized text alone.
- Keep one clear primary action per screen or decision region. Secondary and destructive actions must not compete with it.
- Space within a group must be smaller than space between groups. Labels belong close to their fields; sections need visibly larger separation.
- Prefer whitespace, typography, and surface contrast before adding borders, separators, cards, gradients, or shadows.
- Shadows communicate elevation. Static content should be flat or very subtle; popovers, sheets, and dialogs may use progressively stronger elevation.
- Use real interface copy. Controls name the resulting action, terminology stays consistent across the flow, and errors explain what happened and what the user can do.

## Avoid generic generated UI

Do not default to glassmorphism, decorative gradients, glowing blobs, every-section cards, excessive pills, oversized marketing headlines, arbitrary icon badges, or identical centered layouts. Use one justified signature idea at most and keep the rest disciplined.

Do not introduce a new visual language when the task is to extend an existing screen. Match the surrounding system first; distinctive work comes from composition, content, and interaction, not random novelty.

## Accessibility floor

- Normal text must meet WCAG AA contrast; large text and control boundaries need at least 3:1.
- Preserve visible keyboard focus on web.
- Do not communicate state through color alone.
- Support text wrapping, long names/locations, and dynamic values without clipping.
- Respect reduced motion and avoid hover-only affordances on touch devices.
