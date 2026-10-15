import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
export const output = 'output/phase9d-1-2026-10-12';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyBaseline() {
  const authPath = 'output/session-revocation-2026-10-12/manifest.json';
  const auth = JSON.parse(await readFile(authPath));
  for (const [file, sha256] of Object.entries(auth.sources)) assert.equal(hash(await readFile(file)), sha256, file);
  const freezePath = 'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json';
  const frozen = JSON.parse(await readFile(freezePath));
  const { freezeHash, ...body } = frozen;
  assert.equal(hash(JSON.stringify(body)), freezeHash);
  assert.equal(frozen.sourceManifest.length, 22);
  for (const source of frozen.sourceManifest) assert.equal(hash(await readFile(source.file)), source.sha256, source.file);
  const priorPath = 'output/phase9c-adversarial-2026-10-11/execution-manifest.json';
  const prior = JSON.parse(await readFile(priorPath));
  const differences = [];
  for (const [file, sha256] of Object.entries(prior.sources)) if (hash(await readFile(file)) !== sha256) differences.push(file);
  return { checkedAt: new Date().toISOString(), auth: { path: authPath, sha256: hash(await readFile(authPath)), sources: auth.sources },
    frozen: { path: freezePath, sha256: hash(await readFile(freezePath)), freezeHash, sources: frozen.sourceManifest },
    phase9c: { path: priorPath, sha256: hash(await readFile(priorPath)), status: prior.phase9c, differences },
    productionShadow: 'OFF', productionConsequences: 'OFF', productionDeploymentAuthorized: false };
}
await mkdir(output, { recursive: true });
if (process.argv[1]?.endsWith('baseline.mjs')) {
  const record = await verifyBaseline();
  await writeFile(output+'/baseline-'+Date.now()+'.json', JSON.stringify(record, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ authSourcesMatched: 3, frozenSourcesMatched: 22, phase9cDifferences: record.phase9c.differences }));
}
