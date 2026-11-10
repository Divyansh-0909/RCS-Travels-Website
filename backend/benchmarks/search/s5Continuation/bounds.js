export const RESERVATIONS = Object.freeze({ jev: { inputTokens: 24576, outputTokens: 0, inputPerMillion: 0.042, outputPerMillion: 0 },
  luna: { inputTokens: 65536, outputTokens: 4096, inputPerMillion: 0.125, outputPerMillion: 0.50 } });
export const ENVELOPE = Object.freeze({ maxRequests: { jev: 10, luna: 1, total: 11 }, maxUsd: { jev: 0.02, luna: 0.02, total: 0.04 },
  minimumGapMs: 1000, concurrency: 1, retries: 0, maxCasesJev: 5, maxCasesLuna: 1,
  timeoutMs: { jev: 10000, luna: 15000 }, transport: 'SYNTHETIC_ONLY_IN_THIS_PACKAGE' });
export const reserveUsd = provider => {
  const row = RESERVATIONS[provider];
  return (row.inputTokens * row.inputPerMillion + row.outputTokens * row.outputPerMillion) / 1e6;
};
export function estimate(requests) {
  return Object.fromEntries(Object.entries(requests).map(([provider, count]) => [provider, count * reserveUsd(provider)]));
}
export function usageCost(provider, usage) {
  if (!usage || ![usage.inputTokens, usage.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('UNKNOWN_USAGE_STOP');
  const reserve = RESERVATIONS[provider];
  if (usage.inputTokens > reserve.inputTokens || usage.outputTokens > (provider === 'jev' ? Number.MAX_SAFE_INTEGER : reserve.outputTokens)) throw new Error('TOKEN_RESERVATION_EXCEEDED_STOP');
  return (usage.inputTokens * reserve.inputPerMillion + usage.outputTokens * reserve.outputPerMillion) / 1e6;
}
