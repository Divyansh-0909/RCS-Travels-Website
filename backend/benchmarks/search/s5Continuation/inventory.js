import { posix } from 'node:path';
import { bytes, digest, json, listFiles, git } from './artifacts.js';

export const LAYERS = {
  routing: ['backend/services/search/questions.ts', 'backend/services/search/provider.ts'],
  extraction: ['backend/services/search/parser.ts', 'backend/services/search/extractor.ts', 'backend/services/search/observations.ts'],
  candidates: ['backend/services/search/locations/candidates.ts', 'backend/services/search/locations/hindiRoutes.ts'],
  temporal: ['backend/services/search/hindiTemporal.ts', 'backend/services/search/hindiCalendar.ts', 'backend/services/search/temporal.ts'],
  vehicleAndRental: ['backend/services/search/negation.ts', 'backend/services/search/vehiclePolicy.ts', 'backend/services/search/observations.ts'],
  provenance: ['backend/services/search/contracts.ts', 'backend/services/search/provenance.ts'],
  fallback: ['backend/services/search/complex/eligibility.ts'],
  lunaInput: ['backend/services/search/complex/contracts.ts', 'backend/services/search/complex/luna.ts', 'backend/services/search/complex/service.ts'],
  adoption: ['backend/services/search/complex/evidence.ts', 'backend/services/search/complex/locations.ts', 'backend/services/search/complex/trusted.ts'],
  grounding: ['backend/services/search/locations/service.ts', 'backend/services/search/locations/places.ts', 'backend/services/search/locations/grounding.ts'],
  bookingRequirements: ['backend/services/search/validation.ts', 'backend/services/search/locations/formResolution.ts', 'backend/services/search/locations/review.ts'],
  evaluation: ['backend/benchmarks/search/metrics.js', 'backend/benchmarks/search/prediction.js', 'backend/benchmarks/search/providerStages.js'],
};

async function routingChangeProof(manifest) {
  const file = 'backend/services/search/questions.ts', prior = git('show', 'HEAD:' + file);
  if (digest(prior) !== manifest.currentSourceManifest.find(row => row.file === file).sha256) throw new Error('HISTORICAL_ROUTING_SOURCE_UNPROVEN');
  const current = await bytes(file);
  const section = (data, start, end) => {
    const text = data.toString(), begin = text.indexOf(start), finish = text.indexOf(end, begin);
    if (begin < 0 || finish < 0) throw new Error('ROUTING_SOURCE_BOUNDARY_UNPROVEN');
    return text.slice(begin, finish);
  };
  return { originalSourceHash: digest(prior), currentSourceHash: digest(current),
    stateBuilderUnchanged: section(prior, 'function state(', 'export function routingRequest(') === section(current, 'function state(', 'export function routingRequest('),
    routingQuestionsChanged: section(prior, 'export function routingRequest(', 'function candidateQuestion') !== section(current, 'export function routingRequest(', 'function candidateQuestion'),
    basis: 'Exact Git blob matches historical source hash; current normalized input/query/clock identities are separately bound. Actual reported model also changes 1.13 to required 1.14.' };
}

export async function inventory(extra = []) {
  const pending = [...Object.values(LAYERS).flat(), ...await listFiles('backend/benchmarks/search/s5Continuation'),
    'backend/scripts/search-s5-current-source.mjs', ...extra];
  const sources = new Map(), edges = [], packages = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (sources.has(file)) continue;
    if (!file.startsWith('backend/') || /node_modules|\.json$/.test(file)) throw new Error('SOURCE_SCOPE_INVALID');
    const source = await bytes(file); sources.set(file, { file, sha256: digest(source) });
    const text = source.toString();
    const imports = [...text.matchAll(/^\s*(?:import\s+(?:type\s+)?(?:[^'";]*(?:from\s*)?)?|export\s+(?:\*|\{[^}]*\})\s+from\s*)['"]([^'"]+)['"]/gm),
      ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)];
    for (const item of imports) {
      const specifier = item[1];
      if (!specifier.startsWith('.')) {
        if (!specifier.startsWith('node:')) packages.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
        continue;
      }
      let target = posix.normalize(posix.join(posix.dirname(file), specifier));
      try { await bytes(target); }
      catch (error) {
        if (error.code !== 'ENOENT' || !target.endsWith('.js')) throw error;
        target = target.slice(0, -3) + '.ts'; await bytes(target);
      }
      edges.push({ from: file, to: target }); pending.push(target);
    }
  }
  const dependencies = [];
  for (const name of [...packages].sort()) {
    const file = `backend/node_modules/${name}/package.json`, metadata = await json(file);
    dependencies.push({ name, version: metadata.version, metadataHash: digest(await bytes(file)) });
  }
  const manifests = [];
  for (const path of ['output/search-provider-continuation-2026-10-08/runtime-pending-manifest.json',
    'output/hindi-temporal-casefold-2026-10-09/runtime-pending-manifest.json']) {
    const snapshot = await json(path);
    const changed = snapshot.currentSourceManifest.filter(row => sources.get(row.file)?.sha256 !== row.sha256);
    manifests.push({ path, sourceCount: snapshot.currentSourceManifest.length, changed });
  }
  const historical = await json('output/search-provider-continuation-2026-10-08/runtime-pending-manifest.json');
  return { layers: LAYERS, sources: [...sources.values()].sort((a, b) => a.file.localeCompare(b.file)), edges, dependencies,
    routingChangeProof: await routingChangeProof(historical),
    historicalSnapshots: manifests, sourceManifestHash: digest([...sources.values()].sort((a, b) => a.file.localeCompare(b.file))) };
}
