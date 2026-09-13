# Vehicle illustrations v2

Eight original simplified raster illustrations created using the built-in image generation tool, not the CLI. These are static PNG illustrations, not SVG or Rive animation files. Existing app images have NOT been replaced or wired to this set.

## Deliverables

| Category key | Vehicle panel | Map marker master |
| --- | --- | --- |
| hatchback | hatchback-panel.png | hatchback-map.png |
| sedan | sedan-panel.png | sedan-map.png |
| suv | suv-panel.png | suv-map.png |
| suv_premium | suv-premium-panel.png | suv-premium-map.png |

- PNG masters retain genuine RGBA transparency and soft semitransparent ground shadows. No background removal was applied to final selected assets after generation.
- Panel views face diagonally lower-right. Map views are elevated, with the nose facing west/left to match the existing bearing + 90 degree rotation convention.
- Premium SUV is graphite with gold sparkle stars behind the vehicle in both views.
- All masters are 1536 x 1024 except sedan-map and suv-premium-map (1774 x 887).
- preview.png is a review contact sheet on cream/blue backgrounds, NOT a transparent production asset.
- References 1–4 mentioned by the user were not attached in the active request; the set follows the written direction, not an exact reference match.

## Integration notes

- frontend/src/constants/vehicleImages.js currently maps legacy images; these new assets are intentionally not integrated yet.
- VehicleSelect.jsx currently horizontally flips legacy panel art. Remove that flip when adopting these already-right-facing panel images.
- Website and captain-app map rendering currently selects sedan vs a common fallback. Supporting four distinct classes requires an explicit category mapping change in both consumers.
- Normalize visible bounds and export small marker variants at integration time. Do not place full-resolution masters in native marker snapshots without downscaling and fitting; map canvases are small.
- Preserve alpha during export. The stars are decorative and should not shift the car's rotation anchor when integrating premium map art.

## Final prompt set

### hatchback-panel

Use case: stylized-concept.
Draw an ORIGINAL MINIMAL CAR APP ILLUSTRATION, one small five-door hatchback facing diagonally LOWER RIGHT, front three-quarter view slightly from above.
This must be a simplified editorial vector-style illustration, NOT a realistic car render. Think a friendly small transport pictogram with only about 12 major shapes: warm-white body, slate-gray windows as SOLID opaque shapes, black circular tires, plain circular light gray wheel hubs, simple pale headlights and single dark grille rectangle. Flat colors with just two or three broad soft shading planes to imply volume. Rounded compact hatchback silhouette, short hood, upright roof, almost no rear overhang. Remove intricate panel seams, tire treads, spokes, glass reflections, interior seats, wipers, headlight internals, metallic sparkle. No dark outlines around body. No brand resemblance, logo or words.
Isolated centered car on a GENUINELY TRANSPARENT PNG ALPHA canvas. Absolutely no black background, no white background, no gray backdrop, no studio halo, no floor plane, no checkerboard. Include only the car and one subtle semi-transparent soft gray contact shadow immediately under the wheels fading to fully transparent. Full car and shadow entirely in frame with 12 percent breathing room. Landscape composition. Illustration should remain legible at 72 pixels wide. Output ONE car, no scene, no text, no stars.

### sedan-panel

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of a four-door SEDAN, long low body, clearly separated rear trunk, smoothly sloping roof, longer hood. Pearl off-white body.
Camera: front three-quarter view, front nose pointing diagonally toward LOWER RIGHT, rear toward upper left. Moderately elevated camera shows roof, front and side.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. No stars or decoration. No scene or other objects. Output only this single vehicle asset.

### suv-panel

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of an SUV, tall upright cabin, taller ground clearance, broad hood, squared wheel arches, simple roof rails, off-white body and dark lower bumper.
Camera: front three-quarter view, front nose pointing diagonally toward LOWER RIGHT, rear toward upper left. Moderately elevated camera shows roof, front and side.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. No stars or decoration. No scene or other objects. Output only this single vehicle asset.

### suv-premium-panel

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of a PREMIUM SUV, longer wheelbase, substantial broad squared body, tall upscale proportions, dark graphite charcoal body, slate windows, simple light silver hubs, restrained chrome single stripe.
Camera: front three-quarter view, front nose pointing diagonally toward LOWER RIGHT, rear toward upper left. Moderately elevated camera shows roof, front and side.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. Include exactly three simple small four-point champagne-gold sparkle stars BEHIND and above the roof toward upper-left. Elegant restrained stars, separate shapes, no glow. No scene or other objects. Output only this single vehicle asset.

### hatchback-map

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of a compact five-door HATCHBACK, off-white body, short hood, upright compact cabin, very short rear overhang.
Camera: high elevated TOP VIEW 70 degrees above ground, almost looking straight down with a little of lower-facing side visible. Car longitudinal axis EXACTLY HORIZONTAL, front nose points LEFT (west), rear points RIGHT. Roof is the dominant visible shape. Orthographic camera, no diagonal yaw. Wide landscape silhouette.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. No stars or decoration. No scene or other objects. Output only this single vehicle asset.

### sedan-map

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of a four-door SEDAN, off-white body, long low body, clearly separated rear trunk, smoothly sloping roof, longer hood.
Camera: high elevated TOP VIEW 70 degrees above ground, almost looking straight down with a little of lower-facing side visible. Car longitudinal axis EXACTLY HORIZONTAL, front nose points LEFT (west), rear points RIGHT. Roof is the dominant visible shape. Orthographic camera, no diagonal yaw. Wide landscape silhouette.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. No stars or decoration. No scene or other objects. Output only this single vehicle asset.

### suv-map

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of an SUV, off-white body, tall upright cabin, broad hood, squared wheel arches, simple roof rails, dark lower bumper.
Camera: high elevated TOP VIEW 70 degrees above ground, almost looking straight down with a little of lower-facing side visible. Car longitudinal axis EXACTLY HORIZONTAL, front nose points LEFT (west), rear points RIGHT. Roof is the dominant visible shape. Orthographic camera, no diagonal yaw. Wide landscape silhouette.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. No stars or decoration. No scene or other objects. Output only this single vehicle asset.

### suv-premium-map

Use case: stylized-concept. Asset type: transparent PNG car illustration for a ride-booking app.
Draw ONE original minimal car app illustration of a PREMIUM SUV, longer wheelbase, substantial broad squared body, tall upscale proportions, dark graphite charcoal body, slate windows, simple light silver hubs, restrained chrome single stripe.
Camera: high elevated TOP VIEW 70 degrees above ground, almost looking straight down with a little of lower-facing side visible. Car longitudinal axis EXACTLY HORIZONTAL, front nose points LEFT (west), rear points RIGHT. Roof is the dominant visible shape. Orthographic camera, no diagonal yaw. Wide landscape silhouette.
Style: simplified editorial vector-style softly dimensional illustration, NOT a realistic car render. Friendly transport illustration with large clean shapes: warm-white or specified body color, solid slate-gray opaque windows, black circular tires, PLAIN circular light gray wheel hubs. Flat colors with just two or three broad soft shading planes to imply volume. Simple headlight shapes, single dark grille slot. Minimal panel seams. NO tire treads, spokes, glass reflections, interior seats, wipers, headlight internals or metallic sparkle. No dark outlines around body. No brand resemblance, logos, text or badges.
Background: TRUE TRANSPARENT PNG ALPHA, no backdrop, no floor plane, no checkerboard drawn into the image. Soft realistic semi-transparent dark gray contact shadow directly below tires and body, feathering cleanly to fully transparent, no white or gray rectangle, no luminous halo.
Composition: landscape canvas, entire car and shadows centered filling about 80 percent of width with breathing room. Vehicle must remain legible at small app sizes. Include three very small simple four-point champagne-gold sparkle stars just behind the rear of the car toward RIGHT, restrained separate shapes, no glow. No scene or other objects. Output only this single vehicle asset.
