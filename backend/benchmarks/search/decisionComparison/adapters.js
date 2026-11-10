import { createHash } from 'node:crypto';
import { SearchProviderError, SearchQuestionContractError, validateDecisionRequest } from '../../../services/search/provider.ts';

export const PROVIDERS = Object.freeze({
  jev: { model: 'jev-latest', expectedModel: 'jev-1.14.0', endpoint: 'https://api.typesafe.ai/v1/systemone', inputPerMillion: 0.042 },
  decisions: { model: 'gpt-6-luna', expectedModel: 'gpt-6-luna', endpoint: 'https://api.openai.com/v1/decisions', inputPerMillion: 0.10 },
  clefFlash: { model: '@cf/cloudflare/clef-flash', selector: 'clef-flash', inputPerMillion: 0.038 },
  clef: { model: '@cf/cloudflare/clef', selector: 'clef', inputPerMillion: 0.24 },
});
export const identityHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const count = value => Number.isSafeInteger(value) && value >= 0;
const fail = category => { const error = new Error(category); error.category = category; throw error; };
const exactKeys = (value, names) => record(value) && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));

export function validateRequest(request) {
  if (!exactKeys(request, ['state', 'questions']) || typeof request.state !== 'string' || request.state.length > 12_000
    || !record(request.questions)) fail('INVALID_REQUEST');
  const questions = Object.entries(request.questions);
  if (!questions.length || questions.length > 48) fail('INVALID_REQUEST');
  for (const [name, question] of questions) {
    if (!/^[\w.-]{1,100}$/u.test(name) || !record(question) || typeof question.instructions !== 'string') fail('INVALID_REQUEST');
    if (question.kind === 'noul' && exactKeys(question, ['kind', 'instructions'])) continue;
    if (question.kind !== 'choice' || !exactKeys(question, ['kind', 'instructions', 'choices']) || !record(question.choices)) fail('INVALID_REQUEST');
    const choices = Object.entries(question.choices);
    if (choices.length < 2 || choices.length > 255 || choices.some(([key, description]) => !key || typeof description !== 'string')) fail('INVALID_REQUEST');
  }
}

export function buildWireRequest(provider, request) {
  validateRequest(request);
  const spec = PROVIDERS[provider]; if (!spec) fail('UNKNOWN_PROVIDER');
  if (provider === 'decisions') return { model: spec.model, input: request.state,
    // Explicit mode with no marked breakpoints disables cache writes for this pilot.
    prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    questions: Object.entries(request.questions).map(([name, question]) => question.kind === 'noul'
      ? { type: 'predicate', name, instructions: question.instructions }
      : { type: 'choice', name, instructions: question.instructions,
        choices: Object.entries(question.choices).map(([value, description]) => ({ value, description })) }) };
  return { model: spec.selector ?? spec.model, state: request.state,
    questions: Object.fromEntries(Object.entries(request.questions).map(([name, question]) => [name,
      question.kind === 'noul' ? { type: 'noul', instructions: question.instructions }
        : { type: 'choice', instructions: question.instructions, criteria: question.choices }])) };
}

function choiceAnswer(answer, question, openai) {
  if (!record(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(question.choices, answer.choice)
    || !probability(answer.confidence)) fail('INVALID_OUTPUT');
  let distribution = answer.probabilities;
  if (openai) {
    if (!Array.isArray(distribution) || distribution.some(item => !record(item) || typeof item.value !== 'string')
      || new Set(distribution.map(item => item.value)).size !== distribution.length) fail('INVALID_OUTPUT');
    distribution = Object.fromEntries(distribution.map(item => [item.value, item.probability]));
  }
  if (!exactKeys(distribution, Object.keys(question.choices)) || Object.values(distribution).some(value => !probability(value))
    || Math.abs(Object.values(distribution).reduce((sum, value) => sum + value, 0) - 1) > 0.000001) fail('INVALID_OUTPUT');
  return { choice: answer.choice, confidence: answer.confidence, probabilities: distribution };
}

export function normalizeResponse(provider, raw, request, latencyMs = 0) {
  validateRequest(request);
  const spec = PROVIDERS[provider]; if (!spec) fail('UNKNOWN_PROVIDER');
  const body = provider.startsWith('clef') ? raw?.result : raw;
  if (provider.startsWith('clef') && raw?.success !== true) fail('PROVIDER_ERROR');
  if (!record(body) || typeof body.model !== 'string') fail('INVALID_OUTPUT');
  if (![spec.expectedModel, spec.selector, spec.model].filter(Boolean).includes(body.model)) fail('MODEL_VERSION_CHANGED');
  const names = Object.keys(request.questions);
  let answers = body.answers;
  if (provider === 'decisions') {
    if (!Array.isArray(answers) || answers.length !== names.length
      || answers.some((answer, index) => answer?.name !== names[index])) fail('INVALID_OUTPUT');
    answers = Object.fromEntries(answers.map(answer => [answer.name, answer]));
  }
  if (!exactKeys(answers, names)) fail('INVALID_OUTPUT');
  const choices = {}, diagnostics = {};
  for (const [name, question] of Object.entries(request.questions)) {
    const answer = answers[name];
    if (answer?.type === 'refusal') fail('REFUSAL');
    if (question.kind === 'choice') choices[name] = choiceAnswer(answer, question, provider === 'decisions');
    else {
      const expected = provider === 'decisions' ? 'predicate' : 'noul';
      const value = provider === 'decisions' ? answer?.probability : answer?.noul;
      if (answer?.type !== expected || !probability(value)) fail('INVALID_OUTPUT');
      diagnostics[name] = value;
    }
  }
  const usage = body.usage;
  const unrecognizedCloudflareUsage = provider.startsWith('clef') && record(usage)
    && !Object.hasOwn(usage, 'input_tokens') && !Object.hasOwn(usage, 'output_tokens');
  if (usage !== undefined && !unrecognizedCloudflareUsage
    && (!record(usage) || !count(usage.input_tokens) || !count(usage.output_tokens))) fail('INVALID_USAGE');
  const details = usage?.input_tokens_details;
  if (details !== undefined && (!record(details) || !count(details.cached_tokens) || !count(details.cache_write_tokens)
    || details.cached_tokens + details.cache_write_tokens > usage.input_tokens)) fail('INVALID_USAGE');
  return { choices, diagnostics, metadata: { provider: `experimental:${provider}`, model: body.model,
    latencyMs, requestCount: 1, questionCount: names.length,
    ...(usage && !unrecognizedCloudflareUsage ? { usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } } : {}) } };
}

function errorCategory(status) {
  if (status === 429) return 'RATE_LIMIT';
  if (status === 402) return 'PAYMENT_REQUIRED';
  if (status === 401 || status === 403) return 'AUTH_OR_ACCESS';
  if (status === 413) return 'RESOURCE_LIMIT';
  return 'PROVIDER_ERROR';
}

export function createHttpTransport(provider, { apiKey, accountId, fetch: fetcher = globalThis.fetch } = {}) {
  const spec = PROVIDERS[provider]; if (!spec || !apiKey) fail('CREDENTIALS_UNAVAILABLE');
  let endpoint = spec.endpoint;
  if (provider.startsWith('clef')) {
    if (!/^[a-f\d]{32}$/iu.test(accountId ?? '')) fail('ACCOUNT_UNAVAILABLE');
    endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${spec.model}`;
  }
  return { async send(body, signal) {
    const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // On errors retain only status/category/retry information, never arbitrary provider text.
    return { status: response.status, body: response.ok ? await response.json() : null,
      retryAfter: response.headers.get('retry-after') };
  } };
}

export function createExperimentalAdapter(provider, { transport, timeoutMs = 10_000, onObservation = () => {} } = {}) {
  if (!PROVIDERS[provider]) fail('UNKNOWN_PROVIDER');
  if (!transport || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) fail('INVALID_ADAPTER_CONFIG');
  async function execute(request) {
    const body = buildWireRequest(provider, request), requestIdentity = identityHash({ provider, body, timeoutMs, retries: 0 });
    const observation = { provider, requestedModel: PROVIDERS[provider].model, requestIdentity, request: body,
      questionCount: Object.keys(request.questions).length, requestBytes: Buffer.byteLength(JSON.stringify(body)),
      retries: 0, truncation: 'NOT_REQUESTED_PROVIDER_REPORT_UNKNOWN', raw: null, normalized: null, error: null };
    // UTF-8 byte count is a conservative text-token planning bound, not a tokenizer.
    if (observation.requestBytes + 4096 > 24_576) fail('LOCAL_CONTEXT_BUDGET');
    const controller = new AbortController(), started = performance.now();
    let timer;
    try {
      const response = await Promise.race([transport.send(body, controller.signal), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); const error = new Error('TIMEOUT'); error.category = 'TIMEOUT'; reject(error); }, timeoutMs);
      })]);
      observation.httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        observation.error = { category: errorCategory(response.status), httpStatus: response.status, retryAfter: response.retryAfter ?? null };
      } else {
        observation.raw = response.body;
        observation.normalized = normalizeResponse(provider, response.body, request, performance.now() - started);
      }
    } catch (error) { observation.error = { category: error.category ?? 'TRANSPORT_ERROR' }; }
    finally { clearTimeout(timer); }
    observation.latencyMs = performance.now() - started;
    onObservation(observation);
    return observation;
  }
  return { execute, async decide(request) {
    validateDecisionRequest(request);
    let result;
    try { result = await execute(request); }
    catch (error) {
      if (['INVALID_REQUEST', 'LOCAL_CONTEXT_BUDGET'].includes(error.category)) throw new SearchQuestionContractError();
      throw error;
    }
    if (!result.normalized) throw new SearchProviderError(result.error?.category === 'TIMEOUT' ? 'JEV_TIMEOUT'
      : ['INVALID_OUTPUT', 'INVALID_USAGE', 'REFUSAL', 'MODEL_VERSION_CHANGED'].includes(result.error?.category) ? 'JEV_INVALID_RESPONSE' : 'JEV_PROVIDER_ERROR');
    return result.normalized;
  } };
}
