import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { Google } from '../handoff/google.mjs';
import { atomicJson, readJson } from '../handoff/core.mjs';
const state = readJson(path.join(config.runtime, 'state.json'));
if (!state.bootstrap?.active || state.run.phase !== 'P01') throw new Error('Evidence uploader requires this session to own bootstrap P01');
const artifacts = path.join(state.run.directory, 'artifacts');
const google = new Google(config); await google.token();
await google.screenshotFolder('P01');
const mappingFile = path.join(config.runtime, 'evidence-links.json');
const mapping = readJson(mappingFile, {});
const files = [];
for (const section of ['before', 'after', 'viewer', 'audit']) {
  const dir = path.join(config.runtime, 'ui', section);
  for (const filename of fs.readdirSync(dir)) {
    if (!/\.png$/.test(filename)) continue;
    const name = filename.startsWith('P01-') ? filename : `P01-${section}-${filename}`;
    if (process.argv[2] && !name.includes(process.argv[2])) continue;
    const dest = path.join(artifacts, name); fs.copyFileSync(path.join(dir, filename), dest);
    files.push({ file: dest, name });
  }
}
// Bounded parallelism; each image is content-addressed/idempotent at the target folder.
for (let start = 0; start < files.length; start += 3) {
  const results = await Promise.allSettled(files.slice(start, start + 3).map(async ({ file, name }) => {
    const previous = mapping[name];
    const uploaded = await google.upload(file, state.run.id, 'image/png', 'P01'); mapping[name] = uploaded; atomicJson(mappingFile, mapping);
    if (previous && previous.id !== uploaded.id) await google.remove(previous.id);
    return uploaded.name;
  }));
  for (const result of results) { if (result.status === 'rejected') throw result.reason; console.log('Verified ' + result.value); }
}
console.log(JSON.stringify({ screenshots: files.length, folderId: await google.screenshotFolder('P01') }));
