import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { json, bytes, digest, canonical, ROOT } from '../s5Continuation/artifacts.js';
import { verifyRegistration } from '../s5Continuation/registration.js';
import { inventory } from '../s5Continuation/inventory.js';
import { exactReplay } from '../s5Continuation/compatibility.js';
import { prepareLuna, requireCurrentLunaParent } from '../s5Continuation/lunaPreparation.js';
import { PHASES, stop } from './accounting.js';
import { captureWireRequest } from './transports.js';

export const BASE = 'output/search-v1-s5-current-source-2026-11-03/v2/';
export const DIRECTORY = 'output/search-v1-s5-live-executor-2026-11-03/';
export const BASE_HASH = '6bc21e82c8bd6046cbe88359306eb343fde5168be13f02e21dc1cebcc6bce1c3';
export const SOURCE_IDENTITY = '77a6b34321b35b42919096aaaec36aa41cfb137a2745dbc140bf0256fce9eddb';
export const FILES = ['accounting', 'adoption', 'evidence', 'registration', 'transports', 'executor']
  .map(name => `backend/benchmarks/search/s5Executor/${name}.js`).concat([
    'backend/scripts/search-s5-live-executor.mjs', 'backend/tests/helpers/searchS5ExecutorFake.js',
    'backend/tests/rideSearchS5LiveExecutor.test.js', 'backend/tests/rideSearchS5LiveSafety.test.js',
  ]);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export function networkIdentity(provider, request) {
  return digest({ provider, endpoint: provider === 'jev' ? 'https://api.typesafe.ai/v1/systemone' : 'https://api.openai.com/v1/responses',
    reportedModel: provider === 'jev' ? 'jev-1.14.0' : 'gpt-6-luna', request: stable(canonical(request)),
    timeoutMs: provider === 'jev' ? 10000 : 15000, retries: 0 });
}
export async function baseBundle() {
  const registration = await json(BASE + 'registration.json');
  if (registration.registrationHash !== BASE_HASH || registration.sourceIdentity !== SOURCE_IDENTITY) stop('PARENT_REGISTRATION_IDENTITY_MISMATCH');
  await verifyRegistration(registration);
  const inputs = await json('output/search-s5-authorized-development/development-inputs.json');
  const v6 = await json('output/search-v1-v6-retry-2026-11-03/comparison-live-results-v6-complete.json');
  return { registration, inputs, catalog: v6.observations.filter(row => row.provider === 'jev' && row.stage !== 'common') };
}
export async function currentPhaseA(bundle) {
  const row = bundle.inputs.find(value => value.caseId === PHASES.A.cases[0]);
  const replay = await exactReplay(row, bundle.catalog);
  const prepared = await prepareLuna(row, replay, bundle.catalog);
  const registered = bundle.registration.requests.find(value => value.provider === 'luna');
  if (!prepared || prepared.inputHash !== digest(registered.input) || prepared.requestHash !== digest(registered.request)) stop('STALE_LUNA_PARENT');
  const parent = { ...replay, sourceIdentity: SOURCE_IDENTITY, lunaInputHash: prepared.inputHash };
  requireCurrentLunaParent(parent, prepared.input, SOURCE_IDENTITY);
  if (!isDeepStrictEqual(replay.served, registered.parent.served)) stop('JEV_PARENT_RESPONSE_DRIFT');
  return { row, parent, prepared };
}
export async function buildAmendment() {
  const bundle = await baseBundle();
  const phaseA = await currentPhaseA(bundle);
  const scope = await inventory([...bundle.registration.sourceManifest.map(row => row.file), ...FILES]);
  const selected = bundle.registration.requests.filter(row => row.provider === 'luna'
    || row.provider === 'jev' && PHASES.B.cases.includes(row.caseId));
  const wireA = await captureWireRequest('A', phaseA.prepared.request);
  const requests = selected.map(row => ({ ...row, wireRequest: row.provider === 'luna' ? wireA : row.request,
    globalIdentity: networkIdentity(row.provider, row.provider === 'luna' ? wireA : row.request) }));
  const content = { version: 'search-s5-live-executor-amendment-v1', parentRegistrationHash: BASE_HASH,
    parentSourceIdentity: SOURCE_IDENTITY, datasetHash: bundle.registration.datasetHash, splitHash: bundle.registration.splitHash,
    sourceManifest: scope.sources, sourceIdentity: scope.sourceManifestHash, dependencies: scope.dependencies,
    phases: PHASES, requests, liveAuthorized: false, independentPhaseActivation: true,
    globalLedger: 'output/search-v1-s5-global-stage-ledger',
    identityDefinition: 'Canonical wire request, endpoint, expected returned model, timeout and zero retries; independent of activation/amendment.',
    adoption: 'Existing production guards in exact composition order, deferred grounding, no Places or synthetic provider response.',
    activationAuthorizationSchema: z.toJSONSchema(authorizationSchema),
  };
  return { ...content, amendmentHash: digest(content) };
}
export async function verifyAmendment(amendment) {
  const { amendmentHash, ...content } = amendment;
  if (digest(content) !== amendmentHash || amendment.parentRegistrationHash !== BASE_HASH || amendment.liveAuthorized !== false
    || !isDeepStrictEqual(amendment.phases, PHASES)) stop('EXECUTION_AMENDMENT_DRIFT');
  const bundle = await baseBundle();
  const current = await inventory([...bundle.registration.sourceManifest.map(row => row.file), ...FILES]);
  if (amendment.sourceIdentity !== current.sourceManifestHash || !isDeepStrictEqual(amendment.sourceManifest, current.sources)
    || !isDeepStrictEqual(amendment.dependencies, current.dependencies)) stop('SOURCE_OR_DEPENDENCY_DRIFT');
  for (const row of amendment.sourceManifest) if (digest(await bytes(row.file)) !== row.sha256) stop('SOURCE_DRIFT');
  for (const dependency of amendment.dependencies) if (digest(await bytes(`backend/node_modules/${dependency.name}/package.json`)) !== dependency.metadataHash) stop('DEPENDENCY_DRIFT');
  const currentA = await currentPhaseA(bundle), wireA = await captureWireRequest('A', currentA.prepared.request);
  const expected = bundle.registration.requests.filter(row => row.provider === 'luna' || row.provider === 'jev' && PHASES.B.cases.includes(row.caseId))
    .map(row => ({ ...row, wireRequest: row.provider === 'luna' ? wireA : row.request,
      globalIdentity: networkIdentity(row.provider, row.provider === 'luna' ? wireA : row.request) }));
  if (!isDeepStrictEqual(amendment.requests, expected)) stop('REQUEST_MANIFEST_DRIFT');
  return bundle;
}
const nullable = z.string().nullable();
export const authorizationSchema = z.strictObject({
  liveAuthorized: z.boolean(), syntheticAuthorization: z.boolean().optional(), phase: z.enum(['A', 'B']), activationId: nullable,
  registrationHash: z.string(), amendmentHash: z.string(), envelope: z.record(z.string(), z.json()),
  ownerReply: nullable, receiptReference: nullable, issuedAt: nullable, expiresAt: nullable,
  accountChecks: z.strictObject({ providerAccessVerified: z.boolean(), quotaVerified: z.boolean(), pricingVerified: z.boolean(),
    processingTerms: z.string(), checkedAt: nullable, verificationReference: nullable }),
});
export function authorizationTemplate(amendment, phase) {
  return { liveAuthorized: false, phase, activationId: null, registrationHash: BASE_HASH, amendmentHash: amendment.amendmentHash,
    envelope: PHASES[phase], ownerReply: null, receiptReference: null, issuedAt: null, expiresAt: null,
    accountChecks: { providerAccessVerified: false, quotaVerified: false, pricingVerified: false,
      processingTerms: phase === 'A' ? 'STANDARD_NON_REGIONAL_DEFAULT_30M' : 'JEV_INPUT_ONLY_NO_LONG_CONTEXT', checkedAt: null, verificationReference: null } };
}
function verifyDates(receipt, now) {
  const issued = Date.parse(receipt.issuedAt), expires = Date.parse(receipt.expiresAt), checked = Date.parse(receipt.accountChecks.checkedAt);
  const zoned = value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value ?? '');
  if (!zoned(receipt.issuedAt) || !zoned(receipt.expiresAt) || !Number.isFinite(issued) || !Number.isFinite(expires)
    || issued > now || expires <= now || expires - issued > 86400000) stop('AUTHORIZATION_EXPIRED_OR_INVALID');
  return { checked, zoned };
}
function verifyAccount(receipt, now, checked, zoned) {
  const account = receipt.accountChecks;
  const terms = receipt.phase === 'A' ? 'STANDARD_NON_REGIONAL_DEFAULT_30M' : 'JEV_INPUT_ONLY_NO_LONG_CONTEXT';
  if (!account.providerAccessVerified || !account.quotaVerified || !account.pricingVerified || account.processingTerms !== terms
    || !account.verificationReference?.trim() || !zoned(account.checkedAt) || !Number.isFinite(checked) || checked > now || now - checked > 86400000) stop('ACCOUNT_VERIFICATION_REQUIRED');
}
export function authorize(amendment, receipt, phase, now, synthetic = false) {
  if (!authorizationSchema.safeParse(receipt).success || receipt.phase !== phase || receipt.registrationHash !== BASE_HASH
    || receipt.amendmentHash !== amendment.amendmentHash || !isDeepStrictEqual(receipt.envelope, PHASES[phase])) stop('SEPARATE_PHASE_AUTHORIZATION_REQUIRED');
  if (synthetic ? receipt.liveAuthorized || receipt.syntheticAuthorization !== true : receipt.liveAuthorized !== true || receipt.syntheticAuthorization === true) stop('SEPARATE_LIVE_AUTHORIZATION_REQUIRED');
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(receipt.activationId ?? '') || !receipt.ownerReply?.trim() || !receipt.receiptReference?.trim()) stop('AUTHORIZATION_INCOMPLETE');
  const { checked, zoned } = verifyDates(receipt, now);
  verifyAccount(receipt, now, checked, zoned);
  return digest(receipt);
}
export const workspaceRoot = ROOT;
