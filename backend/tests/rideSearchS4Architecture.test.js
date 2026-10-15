import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';

const backend = resolve(import.meta.dirname, '..');
function graph(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const match of readFileSync(file, 'utf8').matchAll(/(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const target = resolve(dirname(file), match[1]);
    graph(existsSync(target) ? target : target.replace(/\.js$/, '.ts'), seen);
  }
  return seen;
}
test('S4 dependency firewall permits only drafts, pure scheduling, Jev, and grounding; no operative systems', () => {
  for (const entry of readdirSync(resolve(backend, 'services/search/complex')).filter(value => value.endsWith('.ts'))) {
    for (const file of graph(resolve(backend, 'services/search/complex', entry))) {
      const name = relative(backend, file).replaceAll('\\', '/');
      assert.ok(name.startsWith('services/search/') || ['lib/clock.js', 'lib/scheduling.js'].includes(name), name);
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /\b(?:createBooking|assignDriver|applyFinalizedResponsibilityConsequences|prisma|eval|require)\s*[.(]/);
      assert.doesNotMatch(source, /\bimport\s*\(/);
      for (const imported of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        assert.doesNotMatch(imported[1], /responsibility|AI\/bookingParser|payments|dispatch|bookingCreation|Terra/i);
        if (imported[1].startsWith('openai')) assert.equal(name, 'services/search/complex/luna.ts');
      }
    }
  }
});
test('S4 remains a service only; structured customer booking, legacy prototype and responsibility are not rewired', () => {
  const roots = ['index.js', 'lib/jobs.js', ...readdirSync(resolve(backend, 'routes')).filter(value => /\.[jt]s$/.test(value)).map(value => `routes/${value}`)];
  for (const file of roots) assert.doesNotMatch(readFileSync(resolve(backend, file), 'utf8'), /search\/complex|AI\/bookingParser/);
  const contract = readFileSync(resolve(backend, 'services/search/contracts.ts'), 'utf8');
  assert.doesNotMatch(contract, /openai|Luna|typesafe|placeId|coordinates/);
});
