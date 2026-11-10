import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createJevSearchProvider } from '../../../services/search/provider.ts';
import { createLunaInterpreter } from '../../../services/search/complex/luna.ts';
import { createRideSearchParser } from '../../../services/search/parser.ts';
import { generateLocationCandidates } from '../../../services/search/locations/candidates.ts';
import { parseInput, caseClock } from '../s5Continuation/compatibility.js';
import { canonical, digest, bytes } from '../s5Continuation/artifacts.js';
import { waitUntilDeadline } from '../decisionComparison/executorRetry.js';
import { verifyAmendment, authorize, currentPhaseA, networkIdentity, workspaceRoot } from './registration.js';
import { PHASES, createBudget, measureUsage, stop } from './accounting.js';
import { openEvidence } from './evidence.js';
import { adoptDeferred, parserResultDeferred } from './adoption.js';

const defaultClock = { nowMs: () => performance.now(), wallMs: () => Date.now(), sleep: ms => delay(ms) };
const expectedModel = phase => phase === 'A' ? 'gpt-6-luna' : 'jev-1.14.0';
const bounded = value => typeof value === 'string' ? value.slice(0, 128) : null;
const category = error => error.category ?? 'EXECUTOR_OR_EVIDENCE_FAILURE';

async function fence(context) {
  authorize(context.amendment, context.authorization, context.phase, context.clock.wallMs(), context.synthetic);
  if (context.signal?.aborted) stop('INTERRUPTED');
  const entries = [...context.amendment.sourceManifest, ...context.bundle.registration.artifacts];
  await Promise.all(entries.map(async row => { if (digest(await bytes(row.file)) !== row.sha256) stop('SOURCE_OR_ARTIFACT_DRIFT'); }));
  for (const row of context.amendment.dependencies) if (digest(await bytes(`backend/node_modules/${row.name}/package.json`)) !== row.metadataHash) stop('DEPENDENCY_DRIFT');
  if (context.synthetic && context.hooks.fence) await context.hooks.fence(context);
  authorize(context.amendment, context.authorization, context.phase, context.clock.wallMs(), context.synthetic);
  if (context.signal?.aborted) stop('INTERRUPTED');
}
function registeredRequest(context, caseId, stage, request) {
  const expected = context.amendment.requests.find(row => row.provider === context.envelope.provider && row.caseId === caseId && row.stage === stage);
  if (!expected || !isDeepStrictEqual(canonical(request), expected.request)
    || networkIdentity(expected.provider, expected.wireRequest) !== expected.globalIdentity) stop('REQUEST_IDENTITY_DRIFT');
  if (context.sent.has(expected.globalIdentity)) stop('DUPLICATE_STAGE');
  return expected;
}
async function requestWait(context) {
  let deadline = context.lastDispatch + context.envelope.minimumGapMs;
  const prior = context.evidence.previous?.lastDispatchWallMs;
  if (!Number.isFinite(context.lastDispatch) && Number.isFinite(prior)) {
    const remaining = prior + context.envelope.minimumGapMs - context.clock.wallMs();
    if (remaining > context.envelope.minimumGapMs + 5000) stop('GLOBAL_CLOCK_FAILURE');
    deadline = context.clock.nowMs() + Math.max(0, remaining);
  }
  return waitUntilDeadline(context.clock, deadline, context.signal);
}
async function boundedSend(context, request, providerSignal, beforeFetch) {
  const controller = new AbortController();
  const signal = providerSignal ? AbortSignal.any([controller.signal, providerSignal, ...(context.signal ? [context.signal] : [])])
    : AbortSignal.any([controller.signal, ...(context.signal ? [context.signal] : [])]);
  let timer, timedOut = false;
  try {
    const interrupted = new Promise((resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, context.envelope.timeoutMs);
      signal.addEventListener('abort', () => { const error = new Error('INTERRUPTED_OR_TIMEOUT');
        error.category = timedOut || !context.signal?.aborted ? 'TIMEOUT' : 'INTERRUPTED'; reject(error); }, { once: true });
    });
    return await Promise.race([context.transport.send(request, signal, beforeFetch), interrupted]);
  } finally { clearTimeout(timer); }
}
function rawRecord(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.error) return { model: body.model, usage: body.usage, status: body.status };
  if (Buffer.byteLength(JSON.stringify(body)) > 1000000) stop('RESPONSE_RESOURCE_LIMIT');
  return canonical(body);
}
function validateReply(context, reply, observation) {
  observation.httpStatus = reply.status; observation.retryAfter = bounded(reply.retryAfter); observation.requestId = bounded(reply.requestId);
  if (!Number.isInteger(reply.status) || reply.status < 200 || reply.status >= 300) {
    observation.error = { category: Number.isInteger(reply.status) ? `HTTP_${reply.status}` : reply.errorCategory ?? 'TRANSPORT_FAILURE',
      status: reply.status, retryAfter: observation.retryAfter };
    const usage = { known: false, tariffUsd: null, category: observation.error.category };
    try { context.budget.observe(usage, false); } catch { /* The original HTTP category takes precedence. */ }
    stop(observation.error.category);
  }
  observation.raw = rawRecord(reply.rawBody ?? reply.body);
  const modelMatches = reply.body?.model === expectedModel(context.phase);
  const usage = measureUsage(context.envelope.provider, reply.body); observation.usage = usage;
  let usageError;
  try { context.budget.observe(usage, modelMatches); } catch (error) { usageError = error; }
  if (reply.normalizationError === 'SUCCESS_JSON_PARSE_FAILURE') stop('MALFORMED_RESPONSE_JSON');
  if (!modelMatches) stop('MODEL_VERSION_DRIFT');
  if (usageError) throw usageError;
  if (reply.body.error || reply.body.status === 'incomplete' || reply.body.incomplete_details) stop('MALFORMED_OR_INCOMPLETE_RESPONSE');
}
async function sendRequest(context, caseId, stage, request, providerSignal) {
  if (context.failure) stop(context.failure);
  await fence(context);
  const expected = registeredRequest(context, caseId, stage, request);
  const throttle = await requestWait(context);
  await fence(context);
  await context.evidence.claimStage(expected.globalIdentity, { parentRequestIdentity: expected.identity, caseId, stage });
  context.budget.reserve(stage, Buffer.byteLength(JSON.stringify(expected.wireRequest)));
  const number = await context.evidence.intent({ caseId, stage, provider: expected.provider, request: expected.wireRequest, adapterRequest: canonical(request),
    requestIdentity: expected.identity, globalIdentity: expected.globalIdentity, throttle, inputReservation: context.envelope.inputReservation });
  const observation = { number, caseId, stage, provider: expected.provider, requestIdentity: expected.identity,
    globalIdentity: expected.globalIdentity, request: canonical(request), raw: null, normalized: null, error: null, dispatched: false };
  context.pending = observation; context.sent.add(expected.globalIdentity);
  try {
    if (context.synthetic && context.hooks.afterIntent) await context.hooks.afterIntent(context);
    await fence(context);
    if (providerSignal?.aborted) stop('TIMEOUT');
    const reply = await boundedSend(context, request, providerSignal, async wire => {
      try {
        await fence(context);
        const endpoint = expected.provider === 'jev' ? 'https://api.typesafe.ai/v1/systemone' : 'https://api.openai.com/v1/responses';
        if (wire.endpoint !== endpoint || wire.method !== 'POST' || !isDeepStrictEqual(wire.body, expected.wireRequest)) stop('ACTUAL_WIRE_IDENTITY_DRIFT');
        if (observation.dispatched) stop('DUPLICATE_NETWORK_DISPATCH');
        context.lastDispatch = context.clock.nowMs(); context.lastDispatchWallMs = context.clock.wallMs();
        context.budget.state.dispatched++; observation.dispatched = true; observation.actualWire = wire.body;
      } catch (error) { context.failure ??= category(error); throw error; }
    });
    if (!observation.dispatched) stop(context.failure ?? 'TRANSPORT_BOUNDARY_NOT_OBSERVED');
    observation.providerLatencyMs = Math.max(0, context.clock.nowMs() - context.lastDispatch);
    validateReply(context, reply, observation);
    await fence(context);
    return reply.body;
  } catch (error) {
    context.failure ??= category(error); observation.error ??= { category: context.failure };
    if (observation.dispatched && context.budget.state.pending) {
      try { context.budget.observe({ known: false, tariffUsd: null, category: context.failure }, false); } catch { /* Account uncertainty is retained. */ }
    }
    throw error;
  }
}
async function send(context, caseId, stage, request, providerSignal) {
  try { return await sendRequest(context, caseId, stage, request, providerSignal); }
  catch (error) { context.failure ??= category(error); throw error; }
}
async function saveObservation(context, normalized, failure) {
  const observation = context.pending;
  if (!observation) return;
  observation.normalized = normalized ? canonical(normalized) : null;
  if (failure) { context.failure ??= failure; observation.error ??= { category: context.failure }; }
  observation.eligibleForRegisteredExecution = !context.failure;
  try { await context.evidence.response(observation.number, observation); }
  catch { context.failure = 'EVIDENCE_PERSISTENCE_FAILURE'; stop(context.failure); }
  context.observations.push(observation); context.pending = null;
}
function jevProvider(context, row) {
  const adapter = createJevSearchProvider({ model: 'jev-latest', clock: caseClock(row), timeoutMs: 10000,
    client: { systemOne(request, options) {
      if (options.timeout !== 10000 || options.retry?.maxRetries !== 0) stop('JEV_CONFIGURATION_DRIFT');
      return send(context, row.caseId, Object.hasOwn(request.questions, 'booking_complexity') ? 'routing'
        : Object.hasOwn(request.questions, 'location_search_candidate') ? 'location' : 'booking', request);
    } } });
  return { async decide(request) {
    try { const normalized = await adapter.decide(request); await saveObservation(context, normalized); return normalized; }
    catch (error) { await saveObservation(context, null, context.failure ?? 'JEV_RESPONSE_SCHEMA_FAILURE'); throw error; }
  } };
}
async function phaseB(context) {
  for (const [index, caseId] of context.envelope.cases.entries()) {
    if (context.failure) break;
    const row = context.bundle.inputs.find(value => value.caseId === caseId);
    const parser = createRideSearchParser(jevProvider(context, row), caseClock(row), generateLocationCandidates);
    const parsed = await parser.parse(parseInput(row));
    let result = { caseId, parserResult: parsed, providerFailure: context.failure, automaticLunaCalls: 0, PlacesCalls: 0 };
    if (!context.failure) {
      try { result = { caseId, ...parserResultDeferred(parsed, row) }; }
      catch (error) { context.failure ??= category(error); result.guardFailure = context.failure; }
    }
    await context.evidence.result('jev', index, result); context.results.push(result);
    await fence(context);
  }
}
async function phaseA(context) {
  const current = await currentPhaseA(context.bundle);
  const adapter = createLunaInterpreter({ clock: { now: () => context.clock.nowMs() }, transport: { parse(request, options) {
    return send(context, current.row.caseId, 'luna', request, options.signal);
  } } });
  let normalized;
  try { normalized = await adapter.interpret(current.prepared.input, context.signal); await saveObservation(context, normalized); }
  catch (error) { await saveObservation(context, null, context.failure ?? error.code ?? 'LUNA_RESPONSE_SCHEMA_FAILURE'); throw error; }
  await fence(context);
  let result;
  try { result = { caseId: current.row.caseId, reusedJev: current.parent.served,
    ...adoptDeferred(current.prepared.input, normalized, current.parent.parserResult, current.row.modelInput.context.activeField) }; }
  catch (error) {
    const rejected = { caseId: current.row.caseId, adoptionFailure: category(error), submittedBookings: 0, PlacesCalls: 0 };
    await context.evidence.result('luna', 0, rejected); context.results.push(rejected); throw error;
  }
  await context.evidence.result('luna', 0, result); context.results.push(result);
}
function validateMode(phase, transport, synthetic, evidenceRoot, hooks) {
  if (!PHASES[phase]) stop('UNKNOWN_PHASE');
  if (!synthetic && (evidenceRoot !== undefined || Object.keys(hooks).length)) stop('LIVE_PATH_OR_HOOK_OVERRIDE_REFUSED');
  if (transport.kind !== (synthetic ? 'SYNTHETIC' : 'LIVE')) stop('TRANSPORT_MODE_MISMATCH');
}
async function finish(context, identity) {
  if (context.pending) { try { await saveObservation(context, null, context.failure ?? 'UNRESOLVED_INTENT'); } catch { context.failure = 'EVIDENCE_PERSISTENCE_FAILURE'; } }
  const terminal = { status: context.failure ? 'STOPPED' : 'COMPLETE', stopReason: context.failure,
    budget: context.budget.state, observations: context.observations, cases: context.results, unresolvedIntent: context.pending !== null,
    publishedTariffTotalUsd: context.budget.state.unknownTariffRequests ? null : context.budget.state.knownTariffUsd,
    lastDispatchWallMs: context.lastDispatchWallMs, receiptCommitRequired: true,
    retries: 0, LunaCalls: context.phase === 'A' ? context.budget.state.dispatched : 0, JevCalls: context.phase === 'B' ? context.budget.state.dispatched : 0,
    PlacesCalls: 0, DetailsCalls: 0, submittedBookings: 0, actualAccountChargesUsd: null };
  try { await context.evidence.finish(terminal); return { ...identity, ...terminal, receiptCommitted: true }; }
  catch { return { ...identity, ...terminal, status: 'STOPPED', stopReason: 'EVIDENCE_PERSISTENCE_FAILURE', receiptCommitted: false }; }
}
export async function runS5Phase({ amendment, authorization, phase, transport, synthetic = false,
  evidenceRoot, clock = defaultClock, signal, hooks = {} }) {
  validateMode(phase, transport, synthetic, evidenceRoot, hooks);
  const bundle = await verifyAmendment(amendment);
  const authorizationHash = authorize(amendment, authorization, phase, clock.wallMs(), synthetic);
  const identity = { phase, activationId: authorization.activationId, amendmentHash: amendment.amendmentHash,
    registrationHash: amendment.parentRegistrationHash, authorizationHash, synthetic };
  const required = amendment.requests.filter(row => row.provider === PHASES[phase].provider && (phase === 'A' || row.stage === 'routing')).map(row => row.globalIdentity);
  const evidence = await openEvidence(evidenceRoot ?? fileURLToPath(workspaceRoot), identity, synthetic ? hooks.beforeWrite : undefined, required);
  const context = { amendment, authorization, bundle, phase, transport, synthetic, signal, clock, hooks, evidence,
    envelope: PHASES[phase], budget: createBudget(phase), sent: new Set(), observations: [], results: [], pending: null,
    failure: null, lastDispatch: -Infinity, lastDispatchWallMs: null };
  try { await evidence.provider(context.envelope.provider); await fence(context); await (phase === 'A' ? phaseA(context) : phaseB(context)); }
  catch (error) { context.failure ??= category(error); }
  return finish(context, identity);
}
