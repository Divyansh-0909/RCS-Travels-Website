import { PROVIDERS } from './adapters.js';

export function requestCost(provider, observation) {
  const raw = provider.startsWith('clef') ? observation.raw?.result : observation.raw;
  const usage = raw?.usage;
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0) return null;
  const details = usage.input_tokens_details;
  // Unknown cache allocation cannot silently be priced as entirely uncached.
  if (provider === 'decisions' && !details) return null;
  const cached = details?.cached_tokens ?? 0, written = details?.cache_write_tokens ?? 0;
  if (![cached, written].every(value => Number.isSafeInteger(value) && value >= 0)
    || cached + written > usage.input_tokens) return null;
  if (provider !== 'decisions' && (cached || written)) return null; // No verified cache tariff for these adapters.
  const uncached = usage.input_tokens - cached - written;
  return (uncached * PROVIDERS[provider].inputPerMillion + cached * 0.01 + written * 0.125) / 1_000_000;
}

export function summarizeEconomics(provider, observations, { searches, valid, correct, fallbackCount = 0,
  fallbackCostPerCall = null } = {}) {
  const costs = observations.map(observation => requestCost(provider, observation));
  // A failed request may still be billed. Without its usage, total cost is unknown.
  const total = costs.every(cost => cost !== null) ? costs.reduce((a, b) => a + b, 0) : null;
  const divide = denominator => total !== null && denominator > 0 ? total / denominator : null;
  const perSearch = divide(searches);
  return { billedRequests: observations.length, knownUsageRequests: costs.filter(cost => cost !== null).length,
    publishedMarginalUsd: total, averageRequestUsd: divide(observations.length), perSearchUsd: perSearch,
    perValidInterpretationUsd: divide(valid), perCorrectInterpretationUsd: divide(correct),
    per1000QueriesUsd: perSearch === null ? null : perSearch * 1000,
    per10000QueriesUsd: perSearch === null ? null : perSearch * 10000,
    downstreamFallbackUsd: fallbackCount === 0 ? 0 : fallbackCostPerCall === null ? null : fallbackCount * fallbackCostPerCall,
    actualAdditionalChargeUsd: null, freeAllocationAccounting: 'REQUIRES_VERIFIED_ACCOUNT_RECEIPT' };
}

export function permitPilot(plan, evidence, provider, now = Date.now()) {
  const reviewed = evidence?.labelReview;
  const labelsReady = plan.labelsReadyForPrimaryComparison === true || reviewed?.ownerApproved === true
    && reviewed.labelArtifactHash === plan.labelArtifactHash && typeof reviewed.receiptReference === 'string' && reviewed.receiptReference.trim();
  if (!labelsReady) return { allowed: false, reason: 'MULTILINGUAL_LABEL_REVIEW_REQUIRED' };
  const allocation = evidence?.providers?.[provider];
  const expected = plan.budgets?.[provider];
  if (!allocation || !expected || evidence.planHash !== plan.planHash) return { allowed: false, reason: 'NO_ACCOUNT_ALLOCATION_EVIDENCE' };
  if (Date.parse(evidence.checkedAt) > now || !Number.isFinite(Date.parse(evidence.checkedAt))
    || !Number.isFinite(Date.parse(evidence.expiresAt)) || Date.parse(evidence.expiresAt) <= now) return { allowed: false, reason: 'STALE_ACCOUNT_ALLOCATION_EVIDENCE' };
  if (allocation.accountAccessVerified !== true || allocation.noAdditionalChargeVerified !== true
    || allocation.rateLimitsVerified !== true || allocation.overageDisabled !== true) return { allowed: false, reason: 'ACCESS_OR_NO_CHARGE_NOT_VERIFIED' };
  if (!Number.isFinite(allocation.remainingNoChargeUsd) || allocation.remainingNoChargeUsd < expected.maximumPublishedUsd
    || allocation.maxRequests !== expected.maxRequests) return { allowed: false, reason: 'INSUFFICIENT_RESERVED_ALLOCATION' };
  if (typeof allocation.evidenceReference !== 'string' || !allocation.evidenceReference.trim()) return { allowed: false, reason: 'MISSING_ACCOUNT_RECEIPT' };
  return { allowed: true, maxRequests: expected.maxRequests };
}

// Explicit owner waiver is distinct from verified free allocation. It never
// asserts a free balance, billing control, or account entitlement.
export function permitOwnerAuthorizedPilot(plan, evidence, provider, now = Date.now()) {
  const review = evidence?.labelReview, authorization = evidence?.authorization;
  if (review?.ownerApproved !== true || review.labelArtifactHash !== plan.labelArtifactHash
    || !review.receiptReference?.trim()) return { allowed: false, reason: 'MULTILINGUAL_LABEL_REVIEW_REQUIRED' };
  if (evidence.planHash !== plan.planHash || authorization?.mode !== 'OWNER_WAIVED_FREE_QUOTA_CHECK'
    || !authorization.receiptReference?.trim() || !authorization.ownerReply?.trim()) return { allowed: false, reason: 'OWNER_AUTHORIZATION_REQUIRED' };
  if (!Number.isFinite(Date.parse(evidence.checkedAt)) || Date.parse(evidence.checkedAt) > now
    || !Number.isFinite(Date.parse(evidence.expiresAt)) || Date.parse(evidence.expiresAt) <= now) return { allowed: false, reason: 'STALE_OWNER_AUTHORIZATION' };
  const expected = plan.budgets?.[provider], limit = evidence.providers?.[provider];
  if (!expected || !limit || limit.maxRequests !== expected.maxRequests
    || limit.maxInputPlanningTokensPerRequest !== plan.maxInputPlanningTokensPerRequest
    || limit.maxPublishedTariffUsd !== expected.maximumPublishedUsd
    || limit.maxRequests > 72) return { allowed: false, reason: 'BOUNDED_PILOT_LIMIT_MISMATCH' };
  return { allowed: true, mode: authorization.mode, maxRequests: limit.maxRequests,
    maxPublishedTariffUsd: limit.maxPublishedTariffUsd,
    perRequestReserveUsd: limit.maxInputPlanningTokensPerRequest * PROVIDERS[provider].inputPerMillion / 1_000_000 };
}
