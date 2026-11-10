# RCS Travels Captain App ? extraction notes

Use this export for the captain application in driver-app/, not the customer website.

## Palette mapping

Source: driver-app/src/theme/colors.ts, which supplies native semantic light and dark palettes. color-1=primary #243afb, color-2=primaryLight #7a94ff, color-3=shared primary-dark #1212b4, color-4=shared pastel-primary #e5e9ff. The latter two are inherited brand utilities from shared/theme/tokens.cjs through driver-app/tailwind.config.js. success=positive #166534, warning=#92400e and error=negative #b91c1c are invariant across schemes in actual native code; website dark status colors are deliberately not substituted.

Light neutrals: 1=surface, 2=canvas, 3=surfaceMuted, 4=borderUi, 7=inkMuted, 9=ink. Slots 5=#c5c5c5, 6=#969696, 8=#454545, 10=#000000 retain template defaults.
Dark neutrals: 1=template black, 2=canvas, 3=surface, 4=surfaceMuted, 5=surfaceRaised, 6=borderUi, 7=template #ababab, 8=inkMuted, 9=template #f4f4f4, 10=ink. Primary foreground references white (light neutral-1 / dark neutral-10). Map land/route colors have no dedicated slots.

## Typography, icons and motion

All roles use the editor family PP Mori. Native actually registers separate families per cut, so add the Regular, SemiBold, Extralight, Black and italic files listed in driver-app/src/theme/fonts.ts from driver-app/assets/fonts. The numeric editor weights cannot encode native per-cut family selection. The app's font-bold uses Black rather than website SemiBold. Add Noto Sans Devanagari Regular, SemiBold and Bold separately for Hindi. No font binaries were copied.

text.xxl=44/46 maps the app-specific fare token. The plate token (22/26, 0.08em intended tracking), other shared type steps and individual screen display sizes have no dedicated slots. The entire letterSpacing object stays at template defaults: native uses points (0, 0.3 and 0.6) rather than em, and the default AppText applies 0.3 points. A single em scale cannot preserve these absolute values at every text size. Hindi explicitly resets tracking to zero.

iconFamily=Phosphor comes from phosphor-react-native, including ui/BackButton.tsx. Bold/regular/fill icon weights are per component, not one constant stroke.

animation.duration=180 and easing=[0.23,1,0.32,1] map the scrim entrance; animation.large.duration=240 uses sheet entrance from driver-app/src/hooks/useBottomSheetMotion.ts. The same hook uses 160/220ms exit timing. Input.tsx uses 160ms cubic ease-out; toggles, skeletons and press feedback vary. These cannot all fit two global timings. Buttons change opacity on press rather than translating down by one pixel; pressDistance=1 is a retained default.

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
