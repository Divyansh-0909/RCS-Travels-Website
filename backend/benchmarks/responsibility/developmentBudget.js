export function developmentProviderFailure(error) {
  const message = `${error.name ?? ''}:${error.message ?? ''}`
  if (error.status === 401 || error.status === 403) return 'AUTH'
  if (/per day|insufficient_quota|credits|quota/i.test(message)) return 'QUOTA'
  if (error.status === 429 || /rate limit/i.test(message)) return 'RATE_LIMIT'
  if (error.status === 404) return 'MODEL_API_NOT_FOUND'
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return 'TIMEOUT'
  if (/Zod|schema|parse|MODEL_MISMATCH/i.test(message)) return 'SCHEMA'
  return 'PROVIDER'
}
export function guardDevelopmentProvider(adapter, { minIntervalMs, requestLimit, now = Date.now,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0 || !Number.isInteger(requestLimit) || requestLimit < 1) throw new Error('INVALID_DEVELOPMENT_BUDGET')
  let requests = 0; let nextAt = 0; let halted = null
  return { ...adapter, budgetState: () => ({ requests, halted }), async analyzeResponsibilityCase(evidence) {
    if (halted || requests >= requestLimit) throw new Error(`RESPONSIBILITY_PROVIDER_PAUSED:${halted ?? 'REQUEST_BUDGET'}`)
    const delay = Math.max(0, nextAt - now())
    if (delay > 0) await wait(delay)
    requests++; nextAt = now() + minIntervalMs
    try { return await adapter.analyzeResponsibilityCase(evidence) }
    catch (error) {
      const category = developmentProviderFailure(error)
      if (['AUTH', 'QUOTA', 'RATE_LIMIT', 'MODEL_API_NOT_FOUND'].includes(category)) halted = category
      // Sanitized taxonomy only: no organization identifier, credentials or provider body enters receipts.
      throw new Error(`RESPONSIBILITY_PROVIDER_FAILURE:${category}`)
    }
  } }
}
