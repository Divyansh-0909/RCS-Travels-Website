# Landing character animation

The hero now renders a drawn SVG character with JavaScript joint transforms.
The character contains 68 paths in 19 named drawing groups, controlled by 14
joints. There is no raster image, clipping mesh, Rive file or subscription in the
character renderer. The surrounding scenery and clouds retain their existing
image assets.

## Artwork

Edit `frontend/src/assets/hero-section-illustration/character-vector.svg` in a
vector editor or directly in code. Its 755 x 731 artboard matches
`character-full-reference.webp`, the visual reference. Colours, pose, clothing,
cap, face, hair, backpack and shoes follow that reference. This is a manual
vector reconstruction; fine contours and small details differ from the raster
reference. It should not be described as a pixel-identical conversion.

Each group has an `id`, `data-layer` and `data-joint`. Preserve `data-joint` when
editing so the website can find the group to animate. Separate drawing groups
can share a joint: the front trouser and its cuff move together, for example.

Silhouette strokes follow the same Bezier segments as their filled surfaces.
The trouser legs and cuff rims share their outer curves and join coordinates;
the hip seam follows the knee contour instead of starting outside it. Preserve
that alignment when editing either a fill or its corresponding outline.

Both trouser legs have complete closed silhouettes. In particular, the rear leg
continues beneath the overlapping hand. Moving that hand reveals blue cloth,
not a hand-shaped hole. Forearms extend beneath sleeves and hands; ankles extend
under the separately painted cuff rims. These overlaps supply hidden artwork
for movement. The cuff foregrounds leave the ankle exits open. The rear cuff
sits behind the front shoe so it cannot paint across the toe. Draw order lets
the shirt sit behind the knee while the hand stays in front of the trousers.

The body is stationary. Head/cap/face, hair, backpack, arms, forearms, hands,
legs and shoes have separate transforms. The hand resting on the thigh (the
character's anatomical left, on the right of the picture) and its arm follow
that leg as one unit, with their own movement disabled to keep the joints
connected. The extended hand and arm stay still. The code's left/right names
describe screen position. Each shoe follows its own leg and adds ankle movement.
The face uses one rigid transform so its features do not stretch.

## Change movement in code

Edit the `bones` array in
`frontend/src/components/hero/characterRig.js`. Changes are reflected by Vite on
the localhost landing page.

| Setting | Meaning |
| --- | --- |
| `amplitude` | Rotational strength in degrees; `0` disables that joint's own motion |
| `phase` | Timing offset in radians |
| `cycles` | Whole-number repetitions per eight-second loop; defaults to `1` |
| `pivot` | Rotation centre in the SVG's artboard coordinates |
| `parent` | Index of the joint whose movement this part inherits |
| `LOOP_SECONDS` | Duration of the complete animation |

For example, changing the `right-hand` amplitude from `0` to `3` would enable
wrist movement again. Changing it does not change the leg. Change `right-leg`
independently to adjust the leg behind that hand. `amplitude` is the sine-wave strength; phase
and the reference-pose offset also affect the total angular excursion.

The overlapping geometry is designed for the configured subtle movement.
Large rotations require checking joint overlaps and draw order again. Keep the
artboard and group coordinates when editing paths so the existing pivots stay
aligned.

`AnimatedRCSCharacter.jsx` loads the SVG paths and applies affine transforms with
`requestAnimationFrame`. It pauses while the document is hidden, removes its
listeners on unmount, and shows the reference pose for reduced motion. It also
responds when the reduced-motion setting changes while the page is open.

## Export the editable layers

```powershell
node tools/hero/export-vector-layers.mjs D:/Downloads/RCS-Travels-Hero-Vector
```

The folder contains `character.svg`, all 19 individual layer SVGs on the same
artboard, the movement configuration, and editing instructions. The export is a
snapshot: edit the repository source to update localhost, or copy artwork edits
back into that source. The original cutout assets are retained in the repository
but are not loaded by the character component.

## Verification

The existing development harness renders the actual hero at `/dev/hero`.
`?time=0` shows the reference pose; `?time=2`, `4`, `6` and `8` freeze other
positions. Production continues to use the normal landing route.

- `node --test frontend/tests/characterRig.test.js` checks wrist tuning, the
  resting hand's leg link, parent transforms, rigid geometry, and loop position and
  velocity. It also prevents raster artwork from returning to the vector asset.
- Chromium checks the actual hero at 1440 x 900 and 390 x 844, with no page
  exceptions. It checks live animation, a stationary body, reduced motion and
  resuming motion after a preference change.
- The hand-hidden and hand-lifted captures verify continuous leg artwork under
  the hand. Sampled poses, reference comparisons, and screenshots are retained
  under ignored `output/hero-vector-layers/`.
- Phone checks use browser emulation, not physical-device performance testing.

Run the frontend unit suite and production build after changes:

```powershell
npm --prefix frontend test
npm --prefix frontend run build
```

## Earlier research

The requested [REA repository](https://github.com/morluto/rea) and its browser
observation workflow informed inspection. Earlier Rive investigation informed
the usual parent/joint transform model. No REA or Rive implementation, binary
format, editor export or branding-removal code is included in the website.
