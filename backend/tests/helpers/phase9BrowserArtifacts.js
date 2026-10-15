import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { redactBrowserTrace } from './phase9TraceRedaction.js';

const require = createRequire(new URL('../../../frontend/package.json', import.meta.url));
const { unzipSync, zipSync } = require('fflate');

// Raw traces stay in the runner's private temporary directory. Public evidence
// never includes authentication tokens, cookies or provider signatures.
export async function saveSanitizedTrace(context, temporary, output, name) {
  const path = join(temporary, `${name}.zip`);
  await context.tracing.stop({ path });
  const entries = redactBrowserTrace(unzipSync(new Uint8Array(await readFile(path))));
  const encoded = zipSync(entries);
  await writeFile(join(output, `${name}.zip`), encoded);
  await rm(path);
  return { name: `${name}.zip`, sha256: createHash('sha256').update(encoded).digest('hex'), credentialsRedacted: true };
}

export async function sourceIdentities(files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file,
    createHash('sha256').update(await readFile(new URL(`../../../${file}`, import.meta.url))).digest('hex')])));
}

export async function browserApplicationSources() {
  const files = [];
  async function visit(relative) {
    const entries = await readdir(new URL(`../../../${relative}/`, import.meta.url), { withFileTypes: true });
    for (const entry of entries) {
      const path = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error('UI source aliases are unsupported');
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  for (const directory of ['frontend/src', 'frontend/public', 'shared/theme', 'shared/i18n']) await visit(directory);
  return sourceIdentities(files.sort());
}
