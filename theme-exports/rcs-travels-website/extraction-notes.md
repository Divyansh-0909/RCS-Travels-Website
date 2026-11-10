# RCS Travels Website ? extraction notes

Use this export for the website's preference-aware light/dark account and application surfaces. The separate rcs-travels-website-legacy export covers /book, /booking/* and /t/* only. Homepage (/) and outstation (/outstation) styling is excluded from these website exports by request. Runtime route assignments in frontend/src/components/ThemeRouteSync.jsx are unchanged.

## Palette mapping

Source: frontend/src/index.css:56-106 (actual light/dark semantic variables), with shared/theme/tokens.cjs for the common identity. color-1 is primary #243afb. color-2/3/4 are the teal/violet/sand tones from the active scheme. The primary pastel, primary-dark and primary-light remain unrepresented. success/warning/error map to status-success/status-warning/status-danger, including the brighter dark-mode statuses.

Light neutrals: 1=surface white, 2=canvas, 3=surface-muted, 4=border, 7=ink-muted, 9=ink. Slots 5=#c5c5c5, 6=#969696, 8=#454545 and 10=#000000 retain template defaults; they are not invented intermediate source tokens.
Dark neutrals: 1=template black, 2=canvas, 3=input-background, 4=surface, 5=surface-muted, 6=raised, 7=border, 8=ink-muted, 9=template #f4f4f4, 10=ink white. The two close panel tones are ordered by computed relative luminance. Primary foreground references white (light neutral-1 / dark neutral-10).

## Typography, icons and motion

UI/brand/editorial/data stack: PP Mori, Poppins, sans-serif. Add PP Mori Regular (400), SemiBold (600; also mapped to 700 on the web), Extralight (200) and corresponding italic cuts from frontend/src/assets/fonts if needed by the editor. Poppins is the browser fallback; add it separately if required. Add Noto Sans Devanagari Regular, SemiBold and Bold for Hindi; locale-based substitution cannot be encoded here. Check existing font usage rights before distributing font files.

text.xxl=48/52 stays at template defaults: there is no shared 48/52 token. LetterSpacing xs=-0.02 and s=-0.01 come from shared 3xl/4xl and 2xl tokens; m=0, l=0.01 and xl=0.02 are retained defaults rather than a complete extracted tracking scale. Material Design Icons names the library used by CircleIconButton; other components use Phosphor/custom SVGs, so the format cannot reproduce every icon.

animation.duration=280 and easing=[0.16,1,0.3,1] use the dropdown reveal in frontend/src/index.css:379-394. animation.large.duration=400 uses the root view transition at :229-233 with the same easing. Button/input color and opacity transitions instead use 300ms; these remain documented rather than collapsed into the dropdown timing. The dropdown's scaleY(0.9) is not a uniform popup scale, so popupScale retains the template default.

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
