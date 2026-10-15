import { developmentProviderFailure } from './developmentBudget.js'

export function safeRateLimitDetail(error, now = Date.now()) {
  const text = `${error.name ?? ''}:${error.message ?? ''}`
  const axis = /requests per day|\bRPD\b/i.test(text) ? 'RPD' : /tokens per minute|\bTPM\b/i.test(text) ? 'TPM'
    : /requests per minute|\bRPM\b/i.test(text) ? 'RPM' : 'UNSPECIFIED'
  const header = error.headers?.get?.('retry-after') ?? error.headers?.['retry-after']
  const numeric = Number(header)
  const retryAfterMs = header === undefined || header === null ? null
    : Number.isFinite(numeric) && numeric >= 0 ? numeric * 1000 : Math.max(0, Date.parse(header) - now)
  const limit = /(?:Limit|limit)\s*:?\s*(\d+)/.exec(text)
  return { category: developmentProviderFailure(error), axis, limit: limit ? Number(limit[1]) : null,
    retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : null }
}

export function pacedDevelopmentProvider(adapter, { requestLimit, minIntervalMs = 6500, maxRetries = 2, maxDelayMs = 60000,
  now = Date.now, random = Math.random, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isInteger(requestLimit) || requestLimit < 1 || !Number.isFinite(minIntervalMs) || minIntervalMs < 0
    || !Number.isInteger(maxRetries) || maxRetries < 0 || !Number.isFinite(maxDelayMs) || maxDelayMs < 1) throw new Error('INVALID_DEVELOPMENT_BUDGET')
  let requests = 0; let nextAt = 0; let halted = null; let serial = Promise.resolve()
  const events = []
  const pause = () => { if (halted || requests >= requestLimit) throw new Error(`RESPONSIBILITY_PROVIDER_PAUSED:${halted ?? 'REQUEST_BUDGET'}`) }
  async function execute(evidence, attempt = 0) {
      pause()
      const delay = Math.max(0, nextAt - now())
      if (delay > 0) await wait(delay)
      requests++; nextAt = now() + minIntervalMs
      try { return await adapter.analyzeResponsibilityCase(evidence) }
      catch (error) {
        const detail = safeRateLimitDetail(error, now()); events.push({ attempt, requestNumber: requests, ...detail })
        if (detail.category === 'QUOTA' || ['AUTH', 'MODEL_API_NOT_FOUND'].includes(detail.category) || detail.axis === 'RPD') {
          halted = detail.category; throw new Error(`RESPONSIBILITY_PROVIDER_FAILURE:${detail.category}`)
        }
        const retryable = ['RATE_LIMIT', 'TIMEOUT', 'PROVIDER'].includes(detail.category)
        if (!retryable || attempt >= maxRetries) throw new Error(`RESPONSIBILITY_PROVIDER_FAILURE:${detail.category}`)
        const backoff = Math.max(minIntervalMs * 2 ** attempt, detail.retryAfterMs ?? 0) + Math.floor(random() * 250)
        if (backoff > maxDelayMs) { halted = 'SERVER_DELAY_EXCEEDS_BUDGET'; throw new Error('RESPONSIBILITY_PROVIDER_DEFERRED') }
        nextAt = Math.max(nextAt, now() + backoff)
        return execute(evidence, attempt + 1)
      }
  }
  return { ...adapter, budgetState: () => ({ requests, halted, events: structuredClone(events) }),
    analyzeResponsibilityCase(evidence) {
      const request = serial.then(() => execute(evidence))
      serial = request.then(() => undefined, () => undefined)
      return request
    } }
}
