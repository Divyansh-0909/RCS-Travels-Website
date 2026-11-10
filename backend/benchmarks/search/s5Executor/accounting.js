export const PHASES = Object.freeze({
  A: { provider: 'luna', cases: ['core-ambiguity-conflict-001'], maxRequests: 1, maxRouting: 0, maxExtraction: 0,
    inputReservation: 65536, maxOutputTokens: 4096, reservationUsd: 0.01024, maxUsd: 0.02, timeoutMs: 15000, minimumGapMs: 1000, concurrency: 1, retries: 0 },
  B: { provider: 'jev', cases: ['core-standalone-003', 'core-standalone-020', 'core-standalone-021', 'core-complete-simple-029', 'core-date-only-004'],
    maxRequests: 10, maxRouting: 5, maxExtraction: 5, inputReservation: 24576, maxOutputTokens: null,
    reservationUsd: 0.001032192, maxUsd: 0.02, timeoutMs: 10000, minimumGapMs: 1000, concurrency: 1, retries: 0 },
});
export const stop = category => { const error = new Error(category); error.category = category; throw error; };
const count = value => Number.isSafeInteger(value) && value >= 0;
export function measureUsage(provider, body) {
  const raw = body?.usage;
  if (!raw || !count(raw.input_tokens) || !count(raw.output_tokens)) return { known: false, category: 'UNKNOWN_USAGE' };
  const measured = { known: true, inputTokens: raw.input_tokens, outputTokens: raw.output_tokens, raw,
    tariffUsd: provider === 'jev' ? raw.input_tokens * 0.042 / 1e6 : null, category: null };
  if (raw.total_tokens !== undefined && raw.total_tokens !== raw.input_tokens + raw.output_tokens) measured.category = 'USAGE_DISCREPANCY';
  if (provider !== 'luna') return measured;
  const details = raw.input_tokens_details;
  if (!details || !count(details.cached_tokens) || !count(details.cache_write_tokens)
    || details.cached_tokens + details.cache_write_tokens > raw.input_tokens) return { ...measured, category: 'UNKNOWN_OR_INVALID_CACHE_USAGE' };
  const writes = details.cache_write_tokens_details ?? (details.cache_write_tokens === 0 ? { ttl_30m_tokens: 0, ttl_12h_tokens: 0 } : null);
  if (!writes || !count(writes.ttl_30m_tokens) || !count(writes.ttl_12h_tokens)
    || writes.ttl_30m_tokens + writes.ttl_12h_tokens !== details.cache_write_tokens) return { ...measured, category: 'CACHE_USAGE_DISCREPANCY' };
  measured.tariffUsd = ((raw.input_tokens - details.cached_tokens - details.cache_write_tokens) * 0.10
    + details.cached_tokens * 0.01 + writes.ttl_30m_tokens * 0.125 + writes.ttl_12h_tokens * 0.25 + raw.output_tokens * 0.50) / 1e6;
  if (writes.ttl_12h_tokens > 0) measured.category = 'CACHE_POLICY_DRIFT';
  if (body.service_tier !== 'default') { measured.tariffUsd = null; measured.category = 'PROCESSING_TIER_UNKNOWN_OR_CHANGED'; }
  return measured;
}
export function createBudget(phase) {
  const envelope = PHASES[phase];
  const state = { reserved: 0, dispatched: 0, routing: 0, extraction: 0, knownTariffUsd: 0, unknownTariffRequests: 0,
    inputTokens: 0, outputTokens: 0, pending: false, observations: [] };
  return { state,
    reserve(stage, requestBytes) {
      if (state.pending) stop('CONCURRENCY_VIOLATION');
      if (state.reserved >= envelope.maxRequests || state.knownTariffUsd + envelope.reservationUsd > envelope.maxUsd) stop('BUDGET_OR_REQUEST_LIMIT');
      if (requestBytes + 4096 > envelope.inputReservation) stop('REQUEST_PAYLOAD_LIMIT');
      if (stage === 'routing' && state.routing >= envelope.maxRouting || ['booking', 'location'].includes(stage) && state.extraction >= envelope.maxExtraction) stop('STAGE_REQUEST_LIMIT');
      state.pending = true; state.reserved++;
      if (stage === 'routing') state.routing++;
      if (['booking', 'location'].includes(stage)) state.extraction++;
    },
    observe(usage, providerModelMatches = true) {
      if (!state.pending) stop('USAGE_WITHOUT_RESERVATION');
      state.pending = false; state.observations.push(usage);
      if (usage.known) { state.inputTokens += usage.inputTokens; state.outputTokens += usage.outputTokens; }
      if (providerModelMatches && usage.tariffUsd !== null && usage.tariffUsd !== undefined) state.knownTariffUsd += usage.tariffUsd;
      else state.unknownTariffRequests++;
      if (!usage.known) stop(usage.category ?? 'UNKNOWN_USAGE');
      if (usage.category) stop(usage.category);
      if (usage.inputTokens > envelope.inputReservation || envelope.maxOutputTokens !== null && usage.outputTokens > envelope.maxOutputTokens) stop('TOKEN_RESERVATION_EXCEEDED');
      if (usage.tariffUsd === null || state.knownTariffUsd > envelope.maxUsd) stop('TARIFF_LIMIT_OR_UNKNOWN');
    },
  };
}
