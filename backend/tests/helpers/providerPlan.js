export const providerOutcome = Object.freeze({
  ERROR: 'error',
  TIMEOUT: 'timeout',
  LOST_RESPONSE: 'lost_response',
  OMIT_ID: 'omit_id',
})

export function providerFailure(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status, description: message })
}

export function createProviderPlan() {
  const pending = new Map()

  const enqueue = (operation, outcome, error = null) => {
    const queue = pending.get(operation) ?? []
    queue.push({ outcome, error })
    pending.set(operation, queue)
  }

  const take = (operation) => {
    const queue = pending.get(operation)
    if (!queue?.length) return null
    return queue.shift()
  }

  return { enqueue, take, reset: () => pending.clear() }
}

export function failBeforeCommit(plan, fallbackCode) {
  if (!plan || plan.outcome === providerOutcome.LOST_RESPONSE || plan.outcome === providerOutcome.OMIT_ID) return
  if (plan.error) throw plan.error
  if (plan.outcome === providerOutcome.TIMEOUT) {
    throw providerFailure('PROVIDER_TIMEOUT', 'Provider request timed out', 504)
  }
  throw providerFailure(fallbackCode, 'Provider rejected the request')
}

export function failAfterCommit(plan) {
  if (plan?.outcome !== providerOutcome.LOST_RESPONSE) return
  throw providerFailure('PROVIDER_RESPONSE_LOST', 'Provider completed the operation but the response was lost', 504)
}
