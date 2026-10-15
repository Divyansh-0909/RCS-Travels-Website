import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { VEHICLE_CLASS_NAMES } from '../constants/vehicles.js';
import { vehicleClassSchema } from '../services/search/contracts.ts';

const backend = resolve(import.meta.dirname, '..');
const search = resolve(backend, 'services/search');

function localGraph(file, visited = new Set()) {
  if (visited.has(file)) return visited;
  visited.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) {
      const target = resolve(dirname(file), match[1]);
      localGraph(existsSync(target) ? target : target.replace(/\.js$/, '.ts'), visited);
    }
  }
  return visited;
}

test('search dependency graph reaches only draft parsing, clock and pure scheduling, never operative systems', () => {
  const allowed = new Set(['lib/clock.js', 'lib/scheduling.js']);
  for (const entry of readdirSync(search).filter(name => name.endsWith('.ts'))) {
    for (const file of localGraph(resolve(search, entry))) {
      const path = relative(backend, file).replaceAll('\\', '/');
      assert.ok(path.startsWith('services/search/') || allowed.has(path), `Forbidden parser dependency: ${path}`);
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /\b(?:fetch|eval|require)\s*\(|\bimport\s*\(/, 'No hidden dynamic downstream dependency');
      assert.doesNotMatch(source, /applyFinalizedResponsibilityConsequences|createBooking|prisma\.|google\.maps|OpenAI|Luna|Terra/);
    }
  }
});

test('public booking draft and provenance contracts have no provider dependency or grounded location writes', () => {
  for (const file of ['contracts.ts', 'provenance.ts', 'fields.ts']) {
    const source = readFileSync(resolve(search, file), 'utf8');
    assert.doesNotMatch(source, /from\s+['"].*(?:typesafe|provider|openai|responsibility)/i);
  }
  const contract = readFileSync(resolve(search, 'contracts.ts'), 'utf8');
  assert.doesNotMatch(contract, /\b(?:placeId|latitude|longitude|lat|lng|fare|scheduledAt|bookingStatus)\s*:/);
  assert.deepEqual(vehicleClassSchema.options, VEHICLE_CLASS_NAMES);
});

test('legacy AI booking prototype and new search parser are not production-wired competing parsers', () => {
  // These are the only current server/route/job composition roots. S2 exposes a service, not an endpoint.
  const roots = ['index.js', 'lib/jobs.js', ...readdirSync(resolve(backend, 'routes')).filter(name => /\.[jt]s$/.test(name)).map(name => `routes/${name}`)];
  for (const file of roots) {
    const source = readFileSync(resolve(backend, file), 'utf8');
    assert.doesNotMatch(source, /(?:from|import\s*\()\s*['"][^'"]*(?:AI\/bookingParser|search\/parser)/, file);
  }
});
