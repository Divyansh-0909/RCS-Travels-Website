import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PILOT_SELECTION, commonTasks, commonLabels, labelView, freezePlan } from '../benchmarks/search/decisionComparison/pilot.js';
import { PROVIDERS, buildWireRequest, identityHash } from '../benchmarks/search/decisionComparison/adapters.js';

const version = process.argv.find(arg => arg.startsWith('--revision='))?.slice('--revision='.length) ?? 'v1';
if (!['v1', 'v2', 'v3', 'v4'].includes(version)) throw new Error('UNKNOWN_REVISION');
const revision = version === 'v1' ? '' : `-${version}`;
const root = new URL('../../', import.meta.url), out = new URL(`output/search-v1-b1-comparison-2026-11-${['v3', 'v4'].includes(version) ? '02' : '01'}/`, root);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const save = (name, value) => writeFile(new URL(name.replace(/\.json$/u, `${revision}.json`), out), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const filesIn = async folder => (await Promise.all((await readdir(new URL(folder, root), { withFileTypes: true }))
  .map(entry => entry.isDirectory() ? filesIn(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]))).flat();
// Filter by split BEFORE inspecting any truth field. No held-out labels are used.
const core = (await load('docs/search/benchmark-v1/frozen-v1/dataset.json')).records.filter(row => row.split === 'DEVELOPMENT');
const historical = await load('output/hindi-temporal-v2-2026-10-08/evaluation/rows.json');
const hindi = await load('docs/search/hindi-hinglish-robustness-v1/dataset.json');
const originalInputs = await load('output/search-s5-authorized-development/development-inputs.json');
const inputs = [], labels = [], selected = [];
for (const [id, rationale] of PILOT_SELECTION) {
  const record = id.startsWith('core-') ? core.find(row => row.id === id) : hindi.records.find(row => row.id === id);
  if (!record) throw new Error(`DEVELOPMENT_MEMBERSHIP_REQUIRED:${id}`);
  const sourceInput = id.startsWith('core-') ? originalInputs.find(row => row.caseId === id) : null;
  const saved = historical.find(row => row.id === id);
  const language = sourceInput ? 'ENGLISH' : saved.language;
  const context = record.modelInput.context;
  const input = { query: sourceInput ? { id: sourceInput.providerQueryId, revision: sourceInput.queryRevision, text: record.modelInput.query }
    : saved.parsed.draft.query, context };
  const tasks = commonTasks(input), expected = labelView(sourceInput ? record : saved, language);
  const truth = commonLabels(expected, tasks.candidates);
  if (Object.values(truth).some(label => label !== null && (!label.allowed.length || label.allowed.some(value => typeof value !== 'string')))) throw new Error('INVALID_PILOT_LABEL');
  const humanApproved = Boolean(sourceInput && record.truth.status === 'APPROVED' && record.truth.provenance === 'HUMAN_REVIEWED_SYNTHETIC');
  inputs.push({ caseId: id, language, input, tasks });
  labels.push({ caseId: id, language, humanApproved, labels: truth,
    pipelineRecord: sourceInput ? record : null, pipelineExpected: sourceInput ? null : saved.expected });
  selected.push({ caseId: id, language, rationale, inputHash: identityHash(input), questionHash: identityHash(tasks.request),
    originalLabelsHash: identityHash(sourceInput ? record.truth : saved.expected), humanApproved });
}
const paths = [...await filesIn('backend/services/search'), ...await filesIn('backend/benchmarks/search/decisionComparison'),
  'backend/scripts/search-decision-pilot.mjs', 'backend/scripts/search-decision-pilot-prepare.mjs'].sort();
const sourceManifest = await Promise.all(paths.map(async file => ({ file, sha256: digest(await readFile(new URL(file, root))) })));
const bodies = Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, inputs.map(row => buildWireRequest(provider, row.tasks.request))]));
const previousPlan = version === 'v4' ? await load('output/search-v1-b1-comparison-2026-11-02/pilot-registration-v3.json')
  : revision ? await load(`output/search-v1-b1-comparison-2026-11-01/pilot-registration${version === 'v3' ? '-v2' : ''}.json`) : null;
const plan = freezePlan({ version: `search-decision-pilot-${version}`, registeredAt: new Date().toISOString(),
  supersedesPlanHash: previousPlan?.planHash ?? null,
  revisionReason: version === 'v4' ? 'Owner approved v3 labels and waived free-quota verification. Add explicit bounded owner authorization and actual-usage spending stops; semantic tasks and approved label vectors unchanged.'
    : version === 'v3' ? 'Pre-inference review: conditional destination choice projection and explicit correction routing instructions corrected; original frozen truth and candidate lists unchanged.'
    : revision ? 'Pre-inference English contraction quote regression fix; inputs and labels remain independently hash-bound.' : null,
  labelProjectionVersion: 'v3-conditional-destination-preservation',
  scope: '24_DEVELOPMENT_CASES_NO_HELDOUT_NO_CHALLENGE_NO_PLACES_NO_LUNA', selection: selected, sourceManifest,
  languageCounts: Object.fromEntries([...new Set(inputs.map(row => row.language))].map(language => [language, inputs.filter(row => row.language === language).length])),
  labelsReadyForPrimaryComparison: labels.every(row => row.humanApproved),
  labelLimitation: '8 English cases use approved Search V1 truth; 16 multilingual cases use unchanged agent-authored development labels and require owner review for the requested primary comparison.',
  inputArtifactHash: identityHash(inputs), labelArtifactHash: identityHash(labels),
  questionContract: '26 categorical questions; no provider-specific semantic tuning; no score-to-category threshold.',
  level1: 'One fixed decision batch per case with identical original text/candidate list across providers.',
  level2: 'Existing parser plus B1 generator and provider adapter; one routing and at most one extraction batch; no Luna or Places.',
  metrics: 'Per-task correct/eligible/observed; invalid output and unavailable capability separate; per-language/cohort metrics; required fallback unexecuted; no customer safety pass.',
  runOrder: Object.keys(PROVIDERS), concurrency: 1, minimumGapMs: 1000, timeoutMs: 10_000, retries: 0,
  maxInputPlanningTokensPerRequest: 24576, planningTokenCaveat: 'Conservative allocation estimate only, not tokenizer-equivalent measurements or a guaranteed provider charge cap.',
  budgets: Object.fromEntries(Object.entries(PROVIDERS).map(([provider, spec]) => [provider, { maxRequests: inputs.length * 3,
    maximumPublishedUsd: inputs.length * 3 * 24576 * spec.inputPerMillion / 1_000_000,
    actualAdditionalChargeAuthorizedUsd: version === 'v4' ? null : 0, outputPrice: 0 }])),
  spendPolicy: version === 'v4' ? 'Explicit owner waiver of free-quota verification; no owner-specified dollar allowance. Agent imposes registered published-tariff estimates as operational stops, not guaranteed invoice caps.' : 'NO_ADDITIONAL_CHARGE_ONLY',
  requestByteAccounting: Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, {
    level1Requests: bodies[provider].length, level1PayloadBytes: bodies[provider].reduce((sum, body) => sum + Buffer.byteLength(JSON.stringify(body)), 0),
    largestLevel1PayloadBytes: Math.max(...bodies[provider].map(body => Buffer.byteLength(JSON.stringify(body)))) }])),
  stopOn: ['RATE_LIMIT', 'PAYMENT_REQUIRED', 'AUTH_OR_ACCESS', 'RESOURCE_LIMIT', 'TIMEOUT', 'MODEL_VERSION_CHANGED', 'TRANSPORT_ERROR'],
  historicalJevResultsComparable: false, modelNote: 'Current jev-latest alias documented as jev-1.14.0; historical jev-1.13.0 results remain separate.',
  frozenInputsModified: false, inferenceExecutedBeforeRegistration: false });
await mkdir(out, { recursive: true });
await save('pilot-inputs.json', inputs); await save('pilot-labels.json', labels); await save('pilot-registration.json', plan);
console.log(JSON.stringify({ registered: selected.length, planHash: plan.planHash, languageCounts: plan.languageCounts,
  humanApproved: labels.filter(row => row.humanApproved).length, budgets: plan.budgets, requestBytes: plan.requestByteAccounting }));
