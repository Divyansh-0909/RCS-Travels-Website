import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../services/search/locations');
test('S3 location modules cannot import booking submission, payments, dispatch, responsibility or complex models', () => {
  for (const name of readdirSync(directory).filter(value => value.endsWith('.ts'))) {
    const source = readFileSync(resolve(directory, name), 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+[^;]*?from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('./') || match[1].startsWith('../') && !match[1].includes('services/')
        || ['node:crypto', 'node:util', 'zod'].includes(match[1]), `${name}: ${match[1]}`);
      assert.doesNotMatch(match[1], /responsibility|AI\/|openai|bookings|bookingCreation|dispatch|payments|fare/i);
    }
    assert.doesNotMatch(source, /\b(?:createBooking|assignDriver|applyFinalizedResponsibilityConsequences|prisma|eval|require)\s*[.(]/);
    assert.doesNotMatch(source, /\bimport\s*\(/);
    if (name !== 'places.ts') assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
});

test('S3 reuses RCS Google proxy and never writes geography into model draft contract', () => {
  const places = readFileSync(resolve(directory, 'places.ts'), 'utf8');
  assert.match(places, /\/api\/googleAPI\/autocomplete/);
  assert.match(places, /\/api\/googleAPI\/details/);
  assert.doesNotMatch(places, /places\.googleapis\.com|maps\.googleapis\.com/);
  const contract = readFileSync(resolve(directory, '../contracts.ts'), 'utf8');
  assert.doesNotMatch(contract, /\b(?:placeId|latitude|longitude|lat|lng|fare|scheduledAt)\s*:/);
});
