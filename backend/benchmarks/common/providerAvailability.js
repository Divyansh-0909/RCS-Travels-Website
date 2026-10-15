// Account capacity is shared across domains; domain prompts/metrics are not.
export function providerAvailability(preflight, now) {
  if (!Number.isFinite(now.getTime())) throw new Error('PROVIDER_CLOCK_INVALID')
  if (preflight.status === 'PASS') return { allowed: true, reason: null, retryAt: null }
  const failure = preflight.providerFailure
  if (failure?.category !== 'RATE_LIMIT' || !Number.isFinite(failure.retryAfterMs)
    || failure.retryAfterMs < 0 || !Number.isFinite(Date.parse(preflight.recordedAt))) {
    return { allowed: false, reason: 'PREFLIGHT_REQUIRED', retryAt: null }
  }
  const retryAt = new Date(Date.parse(preflight.recordedAt) + failure.retryAfterMs).toISOString()
  return { allowed: now.getTime() >= Date.parse(retryAt), reason: now.getTime() < Date.parse(retryAt) ? 'SERVER_RETRY_WINDOW' : null, retryAt }
}
