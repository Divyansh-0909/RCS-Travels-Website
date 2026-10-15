import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import express from '../../backend/node_modules/express/index.js';

const output = resolve('output/phase9-cross-application-2026-10-11');
const file = 'backend/tests/helpers/phase9DeviceProvider.js';
const original = await readFile(file, 'utf8');
const report = JSON.parse(await readFile(join(output, 'mutation-device-final.json'), 'utf8'));
assert.equal(report.files[file].source, original);
const survivors = report.files[file].mutants.filter(m => m.status === 'Survived');
assert.equal(survivors.length, 5);
const root = await mkdtemp(join(tmpdir(), 'rcs-phase9-device-equivalences-'));
const app = express();
app.use((_req, res) => res.status(202).end('unchanged bytes'));
const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)); });
const gateway = { url: 'http://127.0.0.1:' + server.address().port }, results = [];
try {
  await symlink(resolve('backend/node_modules'), join(root, 'node_modules'), 'junction');
  const exercise = async module => {
    const provider = await module.createPhase9DeviceProvider(gateway, async () => ({ source: 'synthetic-delhi' }));
    const observations = [];
    try {
      const base = 'https://www.google.com/maps/dir/?api=1&destination=28.6129%2C77.2295&travelmode=driving&dir_action=navigate';
      const points = ['28.5,77.1', '28.8,77.4', '28.6129,77.2295', '28,77', '29,78', '28.49,77.2', '28.81,77.2',
        '28.6,77.09', '28.6,77.41', '', 'not-coordinates', ' 28.6,77.2', '28.6,77.2 ', '2.86e1,77.2', '28.6,0x4d'];
      const bodies = [null, {}, { url: null }, { url: 'not a URL' }, ...points.map(point => ({ url: base.replace('28.6129%2C77.2295', encodeURIComponent(point)) })),
        { url: base.replace(/destination=[^&]+&/, '') }, { url: base + '&waypoints=28.6315%2C77.2167' }, { url: base + '&waypoints=29%2C78' }];
      for (const body of bodies) {
        const response = await fetch(provider.url + '/phase9-navigation-intent', { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
        observations.push({ status: response.status, response: await response.json() });
      }
      const raw = await fetch(provider.url + '/raw', { signal: AbortSignal.timeout(2000) });
      assert.equal(raw.headers.get('content-type'), 'application/octet-stream');
      observations.push({ status: raw.status, type: raw.headers.get('content-type'), body: await raw.text() });
      observations.push(provider.observations);
      return observations;
    } finally { await provider.close(); }
  };
  await writeFile(join(root, 'baseline.mjs'), original);
  const baseline = await exercise(await import(pathToFileURL(join(root, 'baseline.mjs')).href));
  for (const mutant of survivors) {
    const { start, end } = mutant.location, lines = original.split('\n');
    const offset = position => lines.slice(0, position.line - 1).reduce((total, line) => total + line.length + 1, 0) + position.column - 1;
    const variant = original.slice(0, offset(start)) + mutant.replacement + original.slice(offset(end));
    const path = join(root, 'variant-' + mutant.id + '.mjs'); await writeFile(path, variant);
    assert.deepEqual(await exercise(await import(pathToFileURL(path).href)), baseline);
    let reason;
    if (start.line === 13 && mutant.mutatorName === 'Regex') {
      reason = 'The existing Delhi latitude/longitude intervals exclude every integer. Making the decimal part mandatory changes no accepted coordinate.';
    } else if (start.line === 13) {
      assert.equal(mutant.replacement, '"Stryker was here!"');
      reason = 'Both nullish fallbacks fail the coordinate regular expression and preserve rejection.';
    } else if (start.line === 17) {
      assert.equal(mutant.replacement, '{}');
      reason = 'An empty catch returns undefined; the sole caller applies a Boolean veto, giving the same rejection as false.';
    } else {
      assert.equal(start.line, 47); assert.equal(mutant.replacement, 'true');
      reason = 'Express maps the absent upstream content type to false; its Buffer send supplies the same application/octet-stream default. Present content types are unchanged.';
    }
    results.push({ file, location: mutant.location, mutatorName: mutant.mutatorName, replacement: mutant.replacement,
      sourceSha256: createHash('sha256').update(original).digest('hex'), status: 'REVIEWED_EQUIVALENT', reason,
      witness: 'Real loopback HTTP execution compares exact status, JSON, body bytes, content type and recorded navigation observations across baseline/variant.' });
  }
  await writeFile(join(output, 'reviewed-device-equivalences.json'), JSON.stringify({ results }, null, 2));
  console.log('Device equivalences: ' + results.length + '/5 PASS');
} finally {
  server.closeAllConnections(); await new Promise(done => server.close(done));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'rcs-phase9-device-equivalences-'));
  await rm(root, { recursive: true, force: true });
}
