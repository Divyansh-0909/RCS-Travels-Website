import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import express from '../../backend/node_modules/express/index.js';

const output = resolve('output/phase9c-adversarial-2026-10-11');
const file = 'backend/tests/helpers/phase9NativeGateway.js', source = await readFile(file, 'utf8');
const report = JSON.parse(await readFile(join(output, 'mutation-gateway-recovered.json'), 'utf8'));
assert.equal(report.files[file].source, source);
const survivors = report.files[file].mutants.filter(m => m.status === 'Survived');
assert.equal(survivors.length, 3);
const root = await mkdtemp(join(tmpdir(), 'rcs-phase9-gateway-equivalence-'));
const OriginalDate = globalThis.Date, fixed = OriginalDate.parse('2026-10-11T00:00:00.000Z'), results = [];
globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
try {
  await symlink(resolve('backend/node_modules'), join(root, 'node_modules'), 'junction');
  await copyFile('backend/tests/helpers/phase9NativeClerkEnvironment.js', join(root, 'phase9NativeClerkEnvironment.js'));
  const exercise = async module => {
    const output = [];
    for (const mode of [undefined, false, 'before', 'after']) for (const initialOwner of [null, 'prior-owner']) {
      const booking = { status: initialOwner ? 'assigned' : 'confirmed', driverId: initialOwner };
      let effects = 0, wallet = initialOwner ? 900 : 1000;
      const app = express(); app.use(express.json());
      app.patch('/api/driver/offers/synthetic/accept', (_req, res) => {
        if (!booking.driverId) { booking.driverId = 'captain'; booking.status = 'assigned'; wallet -= 100; effects++; }
        res.json({ status: booking.status });
      });
      app.get('/raw', (_req, res) => res.status(202).end('unchanged bytes'));
      const server = await new Promise(done => { const listener = app.listen(0, '127.0.0.1', () => done(listener)); });
      const harness = { apiUrl: 'http://127.0.0.1:' + server.address().port,
        actors: { captain: { id: 'captain' }, replacement: { id: 'replacement' } }, lifecycle: { booking: async () => booking },
        db: { driver: { findUniqueOrThrow: async () => ({ walletBalance: wallet }) } } };
      const gateway = await module.createNativeGateway(harness, { acceptanceFault: mode });
      try {
        const responses = [];
        for (let index = 0; index < 3; index++) {
          const response = await fetch(gateway.url + '/api/driver/offers/synthetic/accept', { method: 'PATCH', signal: AbortSignal.timeout(2000) });
          responses.push({ status: response.status, body: await response.json() });
        }
        const raw = await fetch(gateway.url + '/raw', { signal: AbortSignal.timeout(2000) });
        responses.push({ status: raw.status, contentType: raw.headers.get('content-type'), body: await raw.text() });
        output.push({ mode: mode ?? 'default-before', initialOwner, responses, effects, wallet, booking,
          requests: gateway.requests, faults: gateway.faults });
      } finally {
        await gateway.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
      }
    }
    return output;
  };
  await writeFile(join(root, 'baseline.mjs'), source);
  const baseline = await exercise(await import(pathToFileURL(join(root, 'baseline.mjs')).href));
  for (const mutant of survivors) {
    const { start, end } = mutant.location, lines = source.split('\n');
    const offset = point => lines.slice(0, point.line - 1).reduce((total, line) => total + line.length + 1, 0) + point.column - 1;
    assert.equal(mutant.replacement, 'true'); assert.ok([20, 44, 53].includes(start.line));
    const variant = source.slice(0, offset(start)) + 'true' + source.slice(offset(end));
    const path = join(root, 'variant-' + mutant.id + '.mjs'); await writeFile(path, variant);
    assert.deepEqual(await exercise(await import(pathToFileURL(path).href)), baseline);
    results.push({ file, location: mutant.location, mutatorName: mutant.mutatorName, replacement: mutant.replacement,
      sourceSha256: createHash('sha256').update(source).digest('hex'), status: 'REVIEWED_EQUIVALENT',
      reason: start.line === 53 ? 'Express falsey content-type handling followed by Buffer send preserves the same default and present headers.'
        : 'After the one injected outage, both Boolean latch values match neither allowed fault string. Further requests take the same forwarding path.',
      witness: 'Exact real loopback responses, raw/authoritative receipt fields, fault count, owner and wallet effects agree for every allowed mode, existing/no owner and three retries.' });
  }
  await writeFile(join(output, 'reviewed-gateway-equivalences.json'), JSON.stringify({ results }, null, 2));
  console.log('Gateway equivalences: ' + results.length + '/3 PASS');
} finally {
  globalThis.Date = OriginalDate;
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'rcs-phase9-gateway-equivalence-'));
  await rm(root, { recursive: true, force: true });
}
