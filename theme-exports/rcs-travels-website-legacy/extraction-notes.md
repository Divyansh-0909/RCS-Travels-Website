# RCS Travels Website Legacy Booking ? extraction notes

This export covers only the legacy booking and ride-tracking routes: /book, /booking/* and /t/*. The homepage (/) and outstation page (/outstation) are excluded from this export by request. frontend/src/components/ThemeRouteSync.jsx still assigns the runtime legacy theme to all five route groups; application code was not changed. This is not the preference-aware website dark palette.

## Palette mapping and missing light mode

The entire light palette is the supplied template default, because legacy routes do not have a separate light mode. Do not interpret the light preview as an extracted RCS design.

Dark colors come from shared/theme/tokens.cjs, frontend/src/theme.generated.css and the :root[data-theme="legacy"] block in frontend/src/index.css. Neutrals: 1=template black, 2=background #0b0b14, 3=background-primary #121220, 4=input-background #1d1d27, 5=background-panel #272634, 6=background-muted #262636, 7=text-muted #aeaeae, 8=foreground-muted #f3f3f3, 9=template #f4f4f4, 10=foreground/text white. color-1=primary #243afb, color-2=primary-dark #1212b4, color-3=primary-light #3067fd, color-4=pastel-primary #e5e9ff. Other pastel tones are omitted. Status values #166534/#92400e/#b91c1c come from the legacy semantic block.

The booking and tracking surfaces mix a dark canvas, white semantic panels and legacy white text. A single ordered neutral scale cannot express all of these simultaneous semantic assignments. This export retains shared source colors but does not reconstruct component layouts. Homepage hero styles and outstation page styling are outside the export scope. The palette values remain unchanged because they come from the shared legacy tokens used by the retained booking and tracking routes.

## Typography, icons and motion

The website font, typography, icons, motion and their defaults match the companion rcs-travels-website export: PP Mori, Poppins, sans-serif; xxl=48/52 remains a template default; tracking xs=-0.02 and s=-0.01 are shared source values while m/l/xl are defaults; Material Design Icons is representative rather than exclusive. Motion is the 280ms dropdown and 400ms view transition with [0.16,1,0.3,1]. Add PP Mori Extralight/Regular/SemiBold and italic cuts, Poppins fallback, and Noto Sans Devanagari Regular/SemiBold/Bold for Hindi separately; see frontend/src/assets/fonts. The entire light palette and the shared defaults below are not extracted legacy values.

## Extraction method and scope

Extracted from the working tree on 20 October 2026. Application code, generated CSS, dependencies and fonts were left unchanged. This is an editor token export, not a replacement runtime theme or a pixel-perfect screen recreation. No font binaries are embedded.

The JSON has exactly the supplied schemaVersion 2 template structure. Scale names are editor slots, not necessarily the original utility names. Colors are six-digit hex, references use existing keys, and dimensions are numbers. Website rem sizes use the default 16px root; native rem utilities use 16 because driver-app/metro.config.js explicitly pins inlineRem to 16.

## Shared source mappings

- shared/theme/tokens.cjs and frontend/src/theme.generated.css: primary blue #243afb; PP Mori; text xs=12/16, s=14/20, m=16/24, l=24/32, xl=36/40. The 18/28, 20/28 and 30/36 steps have no dedicated slot in this smaller template.
- Spacing zero/xxs/xs/s/m/l/xl/xxl = 0/4/8/12/16/24/32/48: selected existing Tailwind utility steps, not a new spacing system. Other steps remain unrepresented.
- frontend/src/components/ui/Button.jsx and driver-app/src/components/ui/Button.tsx: 12px controls, 16px dropdowns; rounded-lg/rounded-xl/rounded-2xl/rounded-3xl map to radius s/m/l/xl = 8/12/16/24. buttonRadius references m. Borders s=1 and l=2 represent border/border-2; none=0.
- The dropdown shadow in both Button components maps to shadows.m: 0px 4px 20px 2px rgba(0,0,0,0.5). Black is neutral-10 in light and neutral-1 in dark. Shadow names indicate editor slots; this is not evidence of a three-level runtime elevation system.
- PP Mori Regular is used for both regular and medium (400); SemiBold is heavy (600). Website font-medium requests 500 but resolves to Regular. The app explicitly maps font-medium to its Regular cut. All four editor font roles share the product family; separate editorial/data families are not defined.

## Template defaults retained (not extracted)

- editor.styleId=base and editor.motion=Custom; componentTokens and componentVariants are empty as requested.
- editor.character.bold=50, editor.character.airy=50, theme.colorEmphasis=52 and theme.neutralTone=neutral have no direct source token.
- radius.zero=0, radius.xs=4 and radius.full=9999 remain template defaults; actual product pills use full rounding or values such as 999px. border.m=1 remains the duplicate template slot.
- shadows.s and shadows.l remain entirely at template defaults: s=(0,2,4,0), opacity 0; l=(0,16,48,0), opacity 20; their palette references also remain unchanged.
- animation.popupScale=0.96 and pressDistance=1 remain defaults. The project does not define one uniform popup scale or button displacement. iconStyle=outlined and iconStroke=1.7 remain defaults: mixed solid/outline icons and icon-specific weights cannot be reduced to one measured stroke.
- Typography xxs=10/14 remains the template default. Unmapped neutral slots and surface-specific typography/tracking defaults are listed below. Unchanged values elsewhere may coincide with defaults but are sourced as described above.

## Styles this format cannot represent

Route-specific mixed light/dark regions; separate canvas, surface, ink, input and on-action semantics; component states and their opacity; alpha borders (for example rgba(255,255,255,0.3) = #ffffff4d and placeholder rgba(255,255,255,0.42) = #ffffff6b); additional brand/status colors; responsive/clamp typography, dimensions, spacing and radii; font metric overrides and italic cuts; locale-specific font selection; multiple icon libraries and icon weights; map styling; keyframes, axis-only scaling, spring/gesture motion, reduced-motion branches and independent entrance/exit timing. Palette ordering preserves brightness, not all original semantic roles. Invariant strong surfaces can remain dark even in a light theme.

## Validation

JSON was parsed and recursively checked against every key and value type in the supplied template. Numeric bounds, palette syntax and neutral luminance order, palette references, radius references, empty component maps and fixed editor settings were checked. No application build, lint, browser/device verification or actual theme-editor import was run: only export files were added, and the editor is not connected. Import compatibility with any undocumented editor enum restrictions remains unverified.
