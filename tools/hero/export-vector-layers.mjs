import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const destination = path.resolve(process.argv[2] ?? path.join(repo, 'output/hero-vector-layers/editable'));
const artwork = path.join(repo, 'frontend/src/assets/hero-section-illustration/character-vector.svg');
const rig = path.join(repo, 'frontend/src/components/hero/characterRig.js');
const svg = await readFile(artwork, 'utf8');
const layers = [...svg.matchAll(/<g id="([^"]+)" data-joint="([^"]+)" data-layer="([^"]+)">([\s\S]*?)<\/g>/g)];
if (layers.length !== 19) throw new Error(`Expected 19 drawing layers, found ${layers.length}; inspect the SVG structure before exporting.`);
await mkdir(path.join(destination, 'layers'), { recursive: true });
await copyFile(artwork, path.join(destination, 'character.svg'));
await copyFile(rig, path.join(destination, 'characterRig.js'));
for (const [index, match] of layers.entries()) {
  const name = `${String(index + 1).padStart(2, '0')}-${match[1]}.svg`;
  const layer = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 755 731" fill="none">\n<title>${match[1]}</title>\n<g stroke="#172331" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">\n${match[0]}\n</g>\n</svg>\n`;
  await writeFile(path.join(destination, 'layers', name), layer, 'utf8');
}
await writeFile(path.join(destination, 'README.md'), `# RCS hero editable vectors

Open character.svg in a vector editor. It contains all 19 named groups in paint
order. The layers/ folder contains those same vector groups individually; every
file keeps the full 755 x 731 artboard so the layers line up when stacked.

The legs, arms and clothing include newly drawn hidden surfaces underneath
overlapping parts. These are vector paths, without embedded cutout images.
The drawing follows the full character reference; fine contours still differ.

characterRig.js contains movement settings. amplitude controls degrees of
rotation; phase controls timing, cycles controls repetitions, and pivot is the
rotation centre. The hand resting on the thigh and its arm follow that leg;
the extended hand stays still. The code's left/right names use screen position.

This folder is an export snapshot. To update the running website, edit:
frontend/src/assets/hero-section-illustration/character-vector.svg
frontend/src/components/hero/characterRig.js

Preserve the SVG artboard and data-joint attributes. See
docs/design/landing-character-animation.md in the repository for the guide.
`, 'utf8');
console.log(`Exported character, ${layers.length} vector layers and movement settings to ${destination}`);
