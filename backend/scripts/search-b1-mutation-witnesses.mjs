import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
async function moduleFrom(file, source) {
  const origin = new URL(file, root);
  const compiled = stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: origin.href }).replace(
    /from\s+(['"])(\.[^'"]+)\1/gu, (_match, quote, specifier) => `from ${quote}${new URL(specifier, origin).href}${quote}`);
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const routeFile = 'backend/services/search/locations/hindiRoutes.ts';
const quoteFile = 'backend/services/search/negation.ts';
const candidateFile = 'backend/services/search/locations/candidates.ts';
const route = module => {
  const phrases = text => module.hindiRouteSpans(text).map(span => ({ text: text.slice(span.start, span.end), role: span.role }));
  assert.deepEqual(phrases('Mujhe kal shaam campus se airport jaana hai'), [{ text: 'campus', role: 'pickup' }, { text: 'airport', role: 'drop' }]);
  assert.deepEqual(phrases('"Lake se Park" se "Kal Nagar" jaana hai'), [{ text: 'Lake se Park', role: 'pickup' }, { text: 'Kal Nagar', role: 'drop' }]);
  assert.deepEqual(phrases('A se B se C jaana hai'), []);
  assert.deepEqual(phrases('campus se Airport kal 9 baje'), [{ text: 'campus', role: 'pickup' }, { text: 'Airport', role: 'drop' }]);
  assert.deepEqual(phrases('Airport jaana hai Campus se'), [{ text: 'Airport', role: 'drop' }, { text: 'Campus', role: 'pickup' }]);
};
const negative = module => {
  assert.equal(module.negativeRequirementAfter('SUV nahi chahiye', 3), true);
  assert.equal(module.negativeRequirementAfter('SUV नहीं चाहिए', 3), true);
  assert.equal(module.negativeRequirementAfter('SUV nahi toh sedan', 3), false);
  assert.equal(module.insideQuote('"SUV nahi" Cafe', 1, 4), true);
  assert.equal(module.balancedRouteQuotes('"unclosed se name'), false);
};
const candidates = module => {
  const result = module.generateLocationCandidates({ id: 'resource-witness', revision: 1,
    text: `${'x'.repeat(501)} से Delhi` }, 'BOOKING_REQUEST');
  assert.equal(result.issues[0]?.code, 'LIMIT_EXCEEDED'); assert.deepEqual(result.candidates, []);
};
const probes = [
  [routeFile, "sourceEnd, 'pickup'", "sourceEnd, 'drop'", route, 'origin role reversal'],
  [routeFile, '.filter(match => !insideQuote(text, match.index + 1))', '.filter(() => true)', route, 'quoted separator treated as route'],
  [routeFile, 'return boundary;', 'return end;', route, 'temporal/journey suffix absorbed into place'],
  [routeFile, 'if (markers.length > 1) return [];', 'if (false) return [];', route, 'competing markers silently selected'],
  [routeFile, 'return Math.min(cursor, end);', 'return 0;', route, 'booking prefix absorbed into pickup'],
  [quoteFile, "return /^\\s+", "return false && /^\\s+", negative, 'Hindi negative assertion removed'],
  [quoteFile, "return false;\n  return", "return true;\n  return", negative, 'conditional negation becomes unconditional'],
  [quoteFile, 'return quotedRanges(text).some(', 'return false && quotedRanges(text).some(', negative, 'quote protection removed'],
  [quoteFile, '(text.match(/"/gu)?.length ?? 0) % 2 === 0', 'true', negative, 'unclosed quote accepted'],
  [candidateFile, 'const MAX_SINGLE_CANDIDATE_TEXT = 500;', 'const MAX_SINGLE_CANDIDATE_TEXT = 5_000;', candidates, 'single candidate resource cap removed'],
];
const originals = new Map();
for (const [file, , , witness] of probes) {
  if (!originals.has(file)) originals.set(file, await readFile(new URL(file, root), 'utf8'));
  witness(await moduleFrom(file, originals.get(file)));
}
const results = [];
for (const [file, from, to, witness, purpose] of probes) {
  const source = originals.get(file);
  if (!source.includes(from)) throw new Error(`MUTATION_SITE_CHANGED:${purpose}`);
  const mutant = source.replace(from, to);
  let killed = false;
  try { witness(await moduleFrom(file, mutant)); } catch (error) {
    if (error.code !== 'ERR_ASSERTION') throw error;
    killed = true;
  }
  results.push({ file, purpose, sourceHash: hash(source), mutantHash: hash(mutant), killed });
}
const report = { scope: 'TEN_TARGETED_MUTATION_WITNESSES_NOT_EXHAUSTIVE_STRYKER_CLOSURE', sourceFilesModified: 0,
  total: results.length, killed: results.filter(row => row.killed).length, survived: results.filter(row => !row.killed).length, results };
const revision = process.argv.includes('--revision=v2') ? '-v2' : '';
await writeFile(new URL(`output/search-v1-b1-comparison-2026-11-01/b1-mutation-witnesses${revision}.json`, root), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ total: report.total, killed: report.killed, survived: report.survived, sourceFilesModified: 0 }));
if (report.survived) process.exitCode = 1;
