import { mkdir, open, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest } from './artifacts.js';
import { ENVELOPE, RESERVATIONS, reserveUsd, usageCost } from './bounds.js';
import { requireCurrentLunaParent } from './lunaPreparation.js';

async function exclusive(file, value) {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
}
export function createBudget(envelope = ENVELOPE) {
  const counts = { jev: 0, luna: 0, total: 0 }, spent = { jev: 0, luna: 0, total: 0 };
  let pending = null, stopped = null;
  return {
    snapshot: () => ({ counts: { ...counts }, spent: { ...spent }, pending, stopped }),
    stop(reason) { stopped = reason; },
    reserve(provider) {
      if (stopped || pending) throw new Error(stopped ?? 'CONCURRENCY_STOP');
      if (!Object.hasOwn(counts, provider) || provider === 'total') throw new Error('PROVIDER_SCOPE_STOP');
      const value = reserveUsd(provider);
      if (counts[provider] >= envelope.maxRequests[provider] || counts.total >= envelope.maxRequests.total
        || spent[provider] + value > envelope.maxUsd[provider] || spent.total + value > envelope.maxUsd.total) throw new Error('BUDGET_OR_REQUEST_LIMIT_STOP');
      pending = provider; counts[provider]++; counts.total++;
    },
    observe(provider, usage) {
      if (pending !== provider) throw new Error('CONCURRENCY_STOP');
      const cost = usageCost(provider, usage); spent[provider] += cost; spent.total += cost; pending = null;
      if (spent[provider] > envelope.maxUsd[provider] || spent.total > envelope.maxUsd.total) throw new Error('BUDGET_STOP');
    },
  };
}
async function waitDeadline(clock, deadline) {
  for (let wakes = 0; clock.now() < deadline && wakes < 8; wakes++) await clock.sleep(Math.max(1, Math.ceil(deadline - clock.now())));
  if (clock.now() < deadline) throw new Error('THROTTLE_CLOCK_STOP');
}
function checkStage(registration, stage, completed) {
  if (completed.some(row => row.identity === stage.identity)) throw new Error('DUPLICATE_STAGE_STOP');
  const known = registration.requests.find(row => row.identity === stage.identity);
  if (!known || digest(known) !== digest(stage)) throw new Error('REQUEST_DRIFT_STOP');
  const group = stage.provider === 'luna' ? registration.firstLunaBatch : registration.firstJevBatch;
  if (!group.includes(stage.caseId)) throw new Error('CASE_SCOPE_STOP');
  if (stage.provider === 'luna') {
    requireCurrentLunaParent(stage.parent, stage.input, registration.sourceIdentity);
    return;
  }
  if (stage.stage === 'routing') return;
  const routed = completed.find(row => row.caseId === stage.caseId && row.stage === 'routing');
  if (!routed || routed.nextStage !== stage.stage) throw new Error('UNPROVEN_PARSER_BRANCH_STOP');
}
async function sendBounded(transport, stage, timeoutMs, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  let timer;
  try {
    if (signal?.aborted) throw new Error('CANCELLED_STOP');
    const interrupted = new Promise((resolve, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      controller.signal.addEventListener('abort', () => reject(new Error(timedOut ? 'TIMEOUT_STOP' : 'CANCELLED_STOP')), { once: true });
    });
    signal?.addEventListener('abort', cancel, { once: true });
    return await Promise.race([Promise.resolve().then(() => transport.send(stage, controller.signal)), interrupted]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

// A usable offline executor exercises claims, budgets and crash behavior. It
// deliberately has no credentials, HTTP transport, SDK client or live option.
export async function runSyntheticBatch(registration, stages, transport, options) {
  if (transport.kind !== 'SYNTHETIC') throw new Error('LIVE_EXECUTION_NOT_IMPLEMENTED_OR_AUTHORIZED');
  await options.verify(registration);
  await mkdir(options.directory, { recursive: true });
  await exclusive(join(options.directory, 'activation-claim.json'), { registrationHash: registration.registrationHash, synthetic: true });
  const budget = createBudget(), completed = [];
  let lastStart = -Infinity, reason = null;
  try {
    for (const stage of stages) {
      if (options.signal?.aborted) throw new Error('CANCELLED_STOP');
      checkStage(registration, stage, completed);
      if (Buffer.byteLength(JSON.stringify(stage.request)) + 4096 > RESERVATIONS[stage.provider].inputTokens) throw new Error('PAYLOAD_RESERVATION_STOP');
      await waitDeadline(options.clock, lastStart + ENVELOPE.minimumGapMs);
      await options.verify(registration);
      budget.reserve(stage.provider);
      await exclusive(join(options.directory, `${stage.identity}-intent.json`), { identity: stage.identity, provider: stage.provider, caseId: stage.caseId });
      lastStart = options.clock.now();
      const response = await sendBounded(transport, stage, options.syntheticTimeoutMs ?? ENVELOPE.timeoutMs[stage.provider], options.signal);
      if (options.signal?.aborted) throw new Error('CANCELLED_STOP');
      if (response.status !== 200) {
        await exclusive(join(options.directory, `${stage.identity}-error.json`), { status: response.status,
          retryAfter: response.retryAfter ?? null, arbitraryBodyRetained: false });
        throw new Error(`HTTP_${response.status}_STOP`);
      }
      if (response.malformed || response.refusal || response.model !== (stage.provider === 'jev' ? 'jev-1.14.0' : 'gpt-6-luna')) throw new Error('MALFORMED_REFUSAL_OR_MODEL_DRIFT_STOP');
      budget.observe(stage.provider, response.usage);
      const row = { identity: stage.identity, caseId: stage.caseId, stage: stage.stage, usage: response.usage,
        nextStage: response.nextStage ?? null, responseHash: digest(response) };
      await exclusive(join(options.directory, `${stage.identity}-complete.json`), row);
      completed.push(row);
    }
  } catch (error) { reason = error.message; budget.stop(reason); }
  const terminal = { status: reason ? 'STOPPED' : 'COMPLETE', reason, completed, budget: budget.snapshot(), retries: 0, synthetic: true };
  await exclusive(join(options.directory, 'terminal.json'), terminal);
  return terminal;
}
export async function auditSyntheticReceipts(directory) {
  const files = await readdir(directory);
  const intents = files.filter(file => file.endsWith('-intent.json'));
  const unresolved = intents.filter(file => !files.includes(file.replace('-intent.json', '-complete.json')));
  const completed = await Promise.all(files.filter(file => file.endsWith('-complete.json')).map(file => readFile(join(directory, file), 'utf8').then(JSON.parse)));
  return { completed, unresolved, canReplayClaimedActivation: false, requiresSeparateAmendmentAfterInterruption: unresolved.length > 0 };
}
