# Approved RCS palette

The approved input is **rcs-palette-draft (1).json**, supplied on 4 November 2026. Its full export is preserved in `shared/theme/final-palette.json` with all 88 color roles. This replaces the earlier `rcs-palette-draft.json` approval.

The newer export changes the light surface, muted surface and raised surface to `#F3F3F5`. The remaining 85 values match the preceding export. Light canvas remains `#FFFFFF`; dark canvas remains `#0A0A19`.

## Runtime consumers

- `shared/theme/tokens.cjs` maps approved foundations into the shared light/dark schemes and retains the separate legacy booking and ride-chrome roles.
- `shared/theme/build-css.cjs` generates the website's semantic variables in `frontend/src/theme.generated.css`, native legacy variables in `driver-app/global.css`, and approved editor defaults in `theme-exports/palette.final.js`.
- `driver-app/src/theme/colors.ts` consumes the shared schemes for native component props. `ThemeContext.tsx` exposes the same values to NativeWind.
- Responsibility review uses generated, dedicated border and input variables, including distinct case-ID, focus and disabled states. Its dark input background is exactly `#1D1D23`; its normal dark field/card border is `#454549`.
- Primary/negative action foregrounds remain white. The approved strong-action foreground is black in light mode and white in dark mode; fixed dark ride chrome also keeps its white foreground.

Regenerate outputs using `npm --prefix frontend run theme`. Do not edit generated stylesheets or `palette.final.js` by hand.

## Reference and drafts

`theme-exports/color-reference-2026-11-03.html` keeps its existing URL and saved-draft storage key. The approved export now supplies its defaults and reset values. Loading the page preserves browser draft data; later editor changes remain preview drafts until applied to the project.

## Validation

- Website production build passed; Vite reports its existing large-chunk advisory.
- Captain-app lint passed with zero errors and seven existing warnings.
- Browser checks matched all 88 editor roles to the approved export, checked saved-draft preservation and approved resets, and verified website theme switching.
- Responsibility review's normal, focused, invalid and disabled field colors were checked in both modes. Screenshots were captured at 390px and 1440px widths.
- Both native scheme objects were checked against the shared approved roles. No native device or emulator was connected, so native rendering, maps, gestures, safe areas and keyboard presentation remain unverified on hardware.

No production deployment was performed.
