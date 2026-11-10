import assert from 'node:assert/strict';
import { inventory } from './inventory.js';
import { reconcile, PATHS } from './reconciliation.js';
import { ROOT, OUTPUT, REVISION, PACKAGE, json, save, bytes, digest, canonical } from './artifacts.js';
import { stageIdentity, JEV } from './compatibility.js';
import { LUNA, requireCurrentLunaParent } from './lunaPreparation.js';
import { ENVELOPE, RESERVATIONS, estimate, reserveUsd } from './bounds.js';

const extraSources = ['backend/tests/rideSearchS5CurrentSource.test.js'];
export async function verifyRegistration(registration) {
  const { registrationHash, ...content } = registration;
  if (digest(content) !== registrationHash || registration.liveAuthorized !== false) throw new Error('REGISTRATION_DRIFT');
  for (const row of registration.sourceManifest) {
    if (digest(await bytes(row.file)) !== row.sha256) throw new Error('SOURCE_DRIFT');
  }
  for (const row of registration.artifacts) {
    if (digest(await bytes(row.file)) !== row.sha256) throw new Error('ARTIFACT_DRIFT');
  }
  for (const row of registration.dependencies) {
    if (digest(await bytes(`backend/node_modules/${row.name}/package.json`)) !== row.metadataHash) throw new Error('DEPENDENCY_DRIFT');
  }
  const allowed = new Set((await json(PATHS.inputs)).map(row => row.caseId));
  if (registration.developmentOrder.length !== 222 || registration.developmentOrder.some(id => !allowed.has(id))) throw new Error('DEVELOPMENT_SCOPE_DRIFT');
  for (const row of registration.requests) {
    if (!allowed.has(row.caseId)) throw new Error('SEALED_OR_UNKNOWN_CASE_REFUSED');
    const expected = stageIdentity(row.provider, row.request, row.contextHash);
    if (row.identity !== expected) throw new Error('REQUEST_DRIFT');
    if (row.provider === 'luna') requireCurrentLunaParent(row.parent, row.input, registration.sourceIdentity);
  }
  return { status: 'OFFLINE_REGISTERED_VERIFIED', sourceFiles: registration.sourceManifest.length,
    knownRequestIdentities: registration.requests.length, liveAuthorized: false, inferenceCalls: 0 };
}

export function makeRegistration(reconciliation, sources, artifactHashes) {
  const sourceIdentity = sources.sourceManifestHash;
  const requests = reconciliation.knownRequests.map(row => {
    const contextHash = digest({ sourceIdentity, inputHash: row.inputHash, caseId: row.caseId, stage: row.stage, configuration: JEV });
    return { ...row, contextHash, identity: stageIdentity('jev', row.request, contextHash) };
  });
  for (const prepared of reconciliation.preparedLuna) {
    const current = reconciliation.cases.find(row => row.caseId === prepared.caseId);
    const contextHash = digest({ sourceIdentity, inputHash: prepared.inputHash, configuration: LUNA });
    const parent = { ...current.replay, sourceIdentity, lunaInputHash: prepared.inputHash };
    requireCurrentLunaParent(parent, prepared.input, sourceIdentity);
    requests.push({ caseId: prepared.caseId, provider: 'luna', stage: 'luna', request: prepared.request,
      input: prepared.input, parent, contextHash, identity: stageIdentity('luna', prepared.request, contextHash),
      condition: 'EXACT_CURRENT_JEV_PARENT_WITH_ELIGIBLE_FALLBACK_AND_SEPARATE_ACTIVATION' });
  }
  const summary = reconciliation.summary;
  const content = { version: 'search-s5-current-source-continuation-v2', datasetHash: reconciliation.datasetHash,
    splitHash: reconciliation.splitHash, original50OrderHash: reconciliation.originalQueueHash,
    historicalIdentities: { S5: 'original 222 / 172 complete / 50 Luna pending', HindiDiagnostics: '80-case historical diagnostics, no inference reuse',
      v6: '821e405be4efbe0e29fe32ff7e31c33b36eb22b95a2fc9aa33a9b7edd2ade561',
      heldOut: '98 sealed, NOT_RUN', challenge: '18 sealed, NOT_RUN', S6: 'independent verification incomplete, excluded' },
    sourceIdentity, sourceManifest: sources.sources, dependencies: sources.dependencies, artifacts: artifactHashes,
    developmentOrder: reconciliation.cases.map(row => row.caseId), historical50Order: reconciliation.original50.map(row => row.caseId),
    firstLunaBatch: summary.firstLunaBatch, firstJevBatch: summary.firstJevBatch, requests,
    adaptiveLunaInputs: 'Unbound until accepted current Jev receipt; append separately hashed binding, never reuse historical partials.',
    providerConfiguration: { jev: JEV, luna: LUNA }, envelope: ENVELOPE, reservations: RESERVATIONS,
    estimates: { firstLuna: reserveUsd('luna'), firstFiveJevMaximum: reserveUsd('jev') * 10,
      reconciliationMaximum: estimate({ jev: summary.requiresCurrentJevCases * 2, luna: summary.conditionalLunaMaximum }),
      fullReconciliationProposedCeilingUsd: { jev: 0.50, luna: 2.50, total: 3.00 },
      noSpendingAuthorized: true, invoiceCapGuaranteed: false, PlacesDetailsAndS6Excluded: true },
    stopRules: ['ANY_429', 'AUTH_401_403', 'PAYMENT_OR_RESOURCE_ERROR', 'OTHER_HTTP_OR_TRANSPORT_ERROR', 'TIMEOUT',
      'REFUSAL', 'MALFORMED_OUTPUT_OR_USAGE', 'MODEL_DRIFT', 'UNKNOWN_OR_EXCESS_USAGE', 'BUDGET_OR_REQUEST_LIMIT',
      'SOURCE_OR_REQUEST_DRIFT', 'STALE_QUERY_OR_LUNA_PARENT', 'DUPLICATE_STAGE_OR_UNRESOLVED_INTENT', 'INTERRUPTION'],
    retryPolicy: 'ZERO_RETRIES_ENTIRE_ACTIVATION_STOPS_NO_AUTOMATIC_RESUMPTION',
    durability: 'Exclusive fsynced activation claim and per-request intent/completion records; never remove claims; amendment required after interruption.',
    scoring: { contract: 'Existing Search prediction/metric functions, source-bound above; score only original approved DEVELOPMENT labels.',
      currentScores: 'NOT_MEASURED', preservedHistoricalScoresAreNotCurrent: true,
      noLabelReadDuringPreparation: true, categoricalAndParserFieldsSeparate: true,
      checks: ['exact positive pickup/drop', 'role/source provenance', 'vehicle/negation', 'missing fields', 'unsupported capability',
        'fallback eligibility/adoption', 'guard-accepted partial versus correct complete draft', 'grounding/details/explicit selection separate'],
      compatibilityIsNotAccuracy: true },
    availability: 'UNKNOWN_NO_PROBE', activationConditions: ['separate owner authorization and accepted maximum spend',
      'account access/model availability and quotas verified', 'current tariffs and standard processing/30m default cache terms rechecked',
      'validated v6-independent S5 live transport/executor amendment using this registration and existing adapters',
      'source/artifact identities current, fresh exclusive claim, no unresolved intent'],
    productionSearch: 'OFF', liveAuthorized: false, liveExecutable: false,
  };
  return { ...content, registrationHash: digest(content) };
}

export async function register() {
  const result = await reconcile();
  const sources = await inventory(extraSources);
  const preservedHindi = await json('output/search-v1-post-v6-hindi-binding-2026-11-03/offline-source-registration.json');
  for (const file of ['backend/services/search/negation.ts', 'backend/services/search/observations.ts']) {
    assert.equal(digest(await bytes(file)), preservedHindi.sourceManifest.find(row => row.file === file).sha256);
  }
  await save(REVISION + 'dependency-inventory.json', sources);
  await save(REVISION + 'reconciliation.json', result);
  await save(REVISION + 'original-50-stage-dispositions.json', result.original50);
  const cachePaths = result.cases.flatMap(row => row.cachedEvidence.map(cache => cache.file));
  const paths = [...new Set([...Object.values(PATHS), ...cachePaths, 'backend/package-lock.json', OUTPUT + 'public-pricing-check.json',
    'docs/search/search-owner-decisions-2026-10-06.md', 'docs/search/search-owner-routing-decisions-2026-11-02.md',
    PACKAGE + 'dependency-inventory.json', PACKAGE + 'reconciliation.json', PACKAGE + 'original-50-stage-dispositions.json'])];
  const artifactHashes = await Promise.all(paths.map(async file => ({ file, sha256: digest(await bytes(file)) })));
  const registration = makeRegistration(result, sources, artifactHashes);
  for (const row of registration.requests) {
    if (Buffer.byteLength(JSON.stringify(row.request)) + 4096 > RESERVATIONS[row.provider].inputTokens) throw new Error('REQUEST_RESERVATION_TOO_SMALL');
  }
  await save(REVISION + 'registration.json', registration);
  const verification = await verifyRegistration(registration);
  await save(REVISION + 'identity-verification.json', verification);
  return { ...verification, registrationHash: registration.registrationHash, sourceIdentity: sources.sourceManifestHash,
    summary: result.summary, estimates: canonical(registration.estimates), root: ROOT.pathname };
}
