import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'frontend/src/assets/booking-story');
const destination = path.resolve(process.argv[2] ?? path.join(root, 'output/booking-story-editable'));
await mkdir(destination, { recursive: true });
if ((await readdir(destination)).length) throw new Error('Choose an empty export folder to preserve existing edits.');
const manifest = [];
for (const file of (await readdir(source)).filter(name => name.endsWith('.svg')).sort()) {
    const content = await readFile(path.join(source, file), 'utf8');
    if (/<image\b|<filter\b|<linearGradient\b|<radialGradient\b/.test(content)) throw new Error(`Unexpected raster/filter/gradient in ${file}`);
    await copyFile(path.join(source, file), path.join(destination, file));
    const box = content.match(/viewBox="([^"]+)"/)[1];
    const directory = path.join(destination, 'layers', path.basename(file, '.svg'));
    await mkdir(directory, { recursive: true });
    const stack = [];
    const layers = [];
    for (const match of content.matchAll(/<g\b[^>]*>|<\/g>/g)) {
        if (match[0].startsWith('</')) {
            const open = stack.pop();
            if (open.name && !open.hasNamedChild) {
                const body = content.slice(open.start, match.index + match[0].length);
                const markup = open.ancestors.join('') + body + '</g>'.repeat(open.ancestors.length);
                const name = `${String(layers.length + 1).padStart(2, '0')}-${open.name}.svg`;
                await writeFile(path.join(directory, name), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" fill="none">${markup}</svg>\n`);
                layers.push(name);
            }
        } else {
            const name = match[0].match(/data-layer="([^"]+)"/)?.[1];
            if (name) for (const ancestor of stack) ancestor.hasNamedChild = true;
            stack.push({ start: match.index, tag: match[0], name, ancestors: stack.map(item => item.tag) });
        }
    }
    if (stack.length) throw new Error(`Unbalanced SVG groups in ${file}`);
    manifest.push({ file, viewBox: box, layers });
}
await copyFile(path.join(root, 'frontend/src/components/booking-story/bookingStoryRig.js'), path.join(destination, 'movement-settings.js'));
await copyFile(path.join(root, 'docs/design/booking-story-illustration.md'), path.join(destination, 'README.md'));
await writeFile(path.join(destination, 'layers.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ destination, views: manifest.length, layerExports: manifest.reduce((total, item) => total + item.layers.length, 0) }));
