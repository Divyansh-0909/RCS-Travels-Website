import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { createExperimentalAdapter, buildWireRequest, identityHash } from './adapters.js';
import { createStopLedger } from './readiness.js';
import { loadExecution, authorizeExecution, verifySources, requestKey, EXECUTOR_DIR, ENVELOPE } from './executorRegistration.js';
import { claimActivation, evidenceStore, safeObservation } from './executorEvidence.js';
import { providerResults } from './executorMetrics.js';
import { createRideSearchParser } from '../../../services/search/parser.ts';
import { generateLocationCandidates } from '../../../services/search/locations/candidates.ts';
import { SearchProviderError, SearchQuestionContractError } from '../../../services/search/provider.ts';

const fail = category => { const error = new Error(category); error.category = category; throw error; };
const defaultClock = { nowMs: () => performance.now(), wallMs: () => Date.now(), sleep: ms => delay(ms) };
const wallTime = clock => clock.wallMs ? clock.wallMs() : clock.nowMs();
const categoryOf = error => error.category ?? 'EXECUTOR_FAILURE';
function parserStage(request) {
  if (Object.hasOwn(request.questions, 'booking_complexity')) return 'routing';
  return Object.hasOwn(request.questions, 'location_search_candidate') ? 'location' : 'booking';
}
function verifyOutgoing(context, provider, caseId, stage, request) {
  const body = buildWireRequest(provider, request), key = requestKey(provider, caseId, stage);
  const expected = context.bundle.requestIndex.get(key);
  const identity = identityHash({ provider, body, timeoutMs: ENVELOPE.timeoutMs, retries: 0 });
  if (!expected || expected.requestIdentity !== identity || expected.wireHash !== identityHash(body)) fail('REQUEST_IDENTITY_DRIFT');
  if (context.sentKeys.has(key)) fail('DUPLICATE_REQUEST');
  const group = ['booking', 'location'].includes(stage) ? 'extraction' : stage;
  const countKey = `${provider}:${group}`, count = context.stageCounts.get(countKey) ?? 0;
  if (count >= 24) fail('STAGE_REQUEST_LIMIT');
  return { body, key, identity, countKey, bytes: Buffer.byteLength(JSON.stringify(body)) };
}
async function throttle(context) {
  if (context.ledger.state.stopped || context.signal?.aborted) fail('ACTIVATION_STOPPED');
  const wait = Math.max(0, ENVELOPE.minimumGapMs - (context.clock.nowMs() - context.lastDispatch));
  if (wait) await context.clock.sleep(wait);
  if (context.signal?.aborted) fail('INTERRUPTED');
  // A scheduler that wakes early must not send early.
  if (context.clock.nowMs() - context.lastDispatch < ENVELOPE.minimumGapMs) fail('THROTTLE_CLOCK_FAILURE');
  return wait;
}
async function dispatch(context, transport, body, signal) {
  if (context.signal?.aborted || context.ledger.state.stopped) fail('INTERRUPTED');
  const started = context.clock.nowMs();
  context.lastDispatch = started; context.dispatchedCalls += 1; context.pending.dispatched = true;
  const combined = context.signal ? AbortSignal.any([signal, context.signal]) : signal;
  try { return await transport.send(body, combined); }
  finally { context.providerLatencyMs = context.clock.nowMs() - started; }
}
async function executeRequest(context, provider, caseId, stage, request) {
  try {
    await verifySources(context.root, context.bundle.amendment.sourceManifest);
    const checked = verifyOutgoing(context, provider, caseId, stage, request);
    const wait = await throttle(context);
    if (context.synthetic && context.hooks.beforeReserve) await context.hooks.beforeReserve({ ledger: context.ledger, provider, requestBytes: checked.bytes });
    context.ledger.reserve(provider, checked.bytes, context.clock.nowMs());
    context.stageCounts.set(checked.countKey, (context.stageCounts.get(checked.countKey) ?? 0) + 1);
    context.sentKeys.add(checked.key);
    const id = await context.store.intent({ provider, caseId, stage, requestIdentity: checked.identity,
      request: checked.body, reservedAtMs: context.clock.nowMs(), reservationInputTokens: ENVELOPE.maxInputTokensPerRequest });
    context.pending = { id, provider, caseId, stage, dispatched: false };
    if (context.synthetic && context.hooks.afterIntent) await context.hooks.afterIntent(context.pending);
    context.providerLatencyMs = null;
    const adapter = createExperimentalAdapter(provider, { timeoutMs: ENVELOPE.timeoutMs,
      transport: { send: (body, signal) => dispatch(context, context.transports[provider], body, signal) } });
    const observation = await adapter.execute(request);
    observation.caseId = caseId; observation.stage = stage; observation.clientThrottleMs = wait;
    observation.providerLatencyMs = context.providerLatencyMs ?? observation.latencyMs;
    context.ledger.settle(observation);
    if (context.signal?.aborted) context.ledger.stop('INTERRUPTED');
    observation.eligibleForRegisteredScores = context.ledger.state.reason !== 'MODEL_VERSION_CHANGED';
    const safe = safeObservation(observation);
    context.observations.push(safe);
    await context.store.response(id, { observation: safe, stopReason: context.ledger.state.reason });
    context.pending = null;
    return observation;
  } catch (error) {
    if (!context.ledger.state.stopped) context.ledger.stop(categoryOf(error));
    throw error;
  }
}
function parserProvider(context, provider, caseId) {
  return { async decide(request) {
    let observation;
    try { observation = await executeRequest(context, provider, caseId, parserStage(request), request); }
    catch { throw new SearchQuestionContractError(); }
    if (context.ledger.state.stopped || !observation.normalized) throw new SearchProviderError(
      observation.error?.category === 'TIMEOUT' ? 'JEV_TIMEOUT'
        : ['INVALID_OUTPUT', 'INVALID_USAGE', 'REFUSAL', 'MODEL_VERSION_CHANGED'].includes(observation.error?.category ?? context.ledger.state.reason)
          ? 'JEV_INVALID_RESPONSE' : 'JEV_PROVIDER_ERROR');
    return observation.normalized;
  } };
}
async function runCase(context, provider, row, index) {
  const common = await executeRequest(context, provider, row.caseId, 'common', row.tasks.request);
  let parserResult = null, parserLatencyMs = null;
  if (!context.ledger.state.stopped && common.normalized) {
    const started = context.clock.nowMs();
    const parser = createRideSearchParser(parserProvider(context, provider, row.caseId),
      { now: () => new Date(row.input.context.clock) }, generateLocationCandidates);
    parserResult = await parser.parse({ query: row.input.query, candidates: [], timeZone: row.input.context.timeZone });
    parserLatencyMs = context.clock.nowMs() - started;
    if (!context.ledger.state.stopped && parserResult.issues.some(issue => issue.code === 'JEV_SCHEMA_ERROR' && issue.field === 'questions')) context.ledger.stop('LOCAL_CONTRACT_FAILURE');
    if (!context.ledger.state.stopped && parserResult.issues.some(issue => ['LIMIT_EXCEEDED', 'INVALID_INPUT_PROVENANCE'].includes(issue.code))) context.ledger.stop('LOCAL_RESOURCE_OR_INPUT_FAILURE');
  }
  const result = { provider, caseId: row.caseId, index, parserResult, parserLatencyMs };
  context.cases.push(result);
  await context.store.caseResult(provider, index, result);
}
function terminalResult(context, identity) {
  const providers = Object.fromEntries(ENVELOPE.providers.map(provider => [provider,
    providerResults(provider, context.bundle, context.observations, context.cases)]));
  const pendingProvider = context.pending?.provider ?? context.ledger.state.inFlight;
  if (pendingProvider) {
    providers[pendingProvider].economics.all.completeTariffUsd = null;
    providers[pendingProvider].economics[context.pending?.stage === 'common' ? 'level1' : 'parser'].completeTariffUsd = null;
    context.ledger.state.providers[pendingProvider].usageUnknown = true;
  }
  return { ...identity, status: context.ledger.state.stopped ? 'STOPPED' : 'COMPLETE',
    stopReason: context.ledger.state.reason, synthetic: context.synthetic,
    measurementKind: context.synthetic ? 'SYNTHETIC_EXECUTOR_TEST_NOT_PROVIDER_ACCURACY' : 'REGISTERED_PROVIDER_MEASUREMENT',
    dispatchedCalls: context.dispatchedCalls, reservedCalls: Object.values(context.ledger.state.providers).reduce((sum, row) => sum + row.calls, 0),
    unresolvedIntent: context.pending, usageLedger: context.ledger.state.providers, providers,
    observations: context.observations, cases: context.cases, actualAccountChargesUsd: null,
    LunaCalls: 0, PlacesCalls: 0, bookingOrDispatchCalls: 0, retries: 0 };
}
async function initialize({ root, amendment, authorization, synthetic = false, transports,
  directory, clock = defaultClock, signal, hooks = {} }) {
  const bundle = await loadExecution(root, amendment);
  const authorizationHash = synthetic ? null : authorizeExecution(bundle.amendment, authorization, wallTime(clock));
  for (const provider of ENVELOPE.providers) {
    if (typeof transports?.[provider]?.send !== 'function') fail('TRANSPORT_UNAVAILABLE');
    if (synthetic && transports[provider].kind !== 'SYNTHETIC') fail('SYNTHETIC_TRANSPORT_REQUIRED');
  }
  if (!synthetic && directory) fail('ACTIVATION_DIRECTORY_OVERRIDE_FORBIDDEN');
  const evidenceDirectory = synthetic ? directory : join(root, EXECUTOR_DIR, 'activation');
  if (!evidenceDirectory) fail('SYNTHETIC_DIRECTORY_REQUIRED');
  const identity = { planHash: bundle.plan.planHash, amendmentHash: bundle.amendment.amendmentHash,
    authorizationHash, synthetic, startedAt: new Date(wallTime(clock)).toISOString() };
  await claimActivation(evidenceDirectory, identity);
  const context = { root, bundle, clock, signal, synthetic, transports, hooks, store: evidenceStore(evidenceDirectory, identity),
    ledger: createStopLedger(ENVELOPE.providers), sentKeys: new Set(), stageCounts: new Map(),
    observations: [], cases: [], pending: null, lastDispatch: -Infinity, dispatchedCalls: 0 };
  return { context, identity };
}
async function runProviders(context) {
  for (const provider of ENVELOPE.providers) {
    if (context.ledger.state.stopped || context.signal?.aborted) { context.ledger.stop('INTERRUPTED'); break; }
    await context.store.provider(provider);
    for (const [index, row] of context.bundle.inputs.entries()) {
      await runCase(context, provider, row, index);
      if (context.ledger.state.stopped) break;
    }
    if (context.ledger.state.stopped) break;
  }
}
export async function runV6Execution(options) {
  const { context, identity } = await initialize(options);
  const { signal } = context;
  const interrupted = () => context.ledger.stop('INTERRUPTED');
  signal?.addEventListener('abort', interrupted, { once: true });
  try {
    await runProviders(context);
  } catch (error) {
    if (!context.ledger.state.stopped) context.ledger.stop(error instanceof SearchQuestionContractError ? 'LOCAL_CONTRACT_FAILURE' : categoryOf(error));
  } finally { signal?.removeEventListener('abort', interrupted); }
  const terminal = terminalResult(context, identity);
  await context.store.finish(terminal);
  return terminal;
}
