const allowedItems = new Set(['agent_message', 'reasoning', 'error'])
const allowedEvents = new Set(['thread.started', 'turn.started', 'turn.completed', 'turn.failed',
  'item.started', 'item.updated', 'item.completed', 'error'])

export function eventIsSafe(event) {
  if (event === null || typeof event !== 'object' || typeof event.type !== 'string') return false
  if (!allowedEvents.has(event.type)) return false
  return !event.type.startsWith('item.') || allowedItems.has(event.item?.type)
}
export function startupWarning(event) {
  if (event.type !== 'item.completed' || event.item?.type !== 'error') return false
  const text = event.item.message
  return typeof text === 'string' && (text.startsWith('Under-development features enabled: skip_host_skill_discovery.')
    || text === 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.')
}
export function failureCategory(text) {
  if (/usage limit|rate.limit|quota|exhaust|too many requests|429/i.test(text)) return 'PROVIDER_USAGE_EXHAUSTED'
  if (/unsupported model|model.*(?:not found|not supported|unavailable|does not exist)/i.test(text)) return 'PROVIDER_MODEL_UNAVAILABLE'
  if (/auth|login|sign in|401|403|unauthorized/i.test(text)) return 'PROVIDER_AUTH_FAILURE'
  if (/sandbox|permission|policy|requirement/i.test(text)) return 'PROVIDER_ISOLATION_FAILURE'
  return 'PROVIDER_PROCESS_FAILURE'
}
export function observedCodexUsage(stdout) {
  let events
  try { events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
  catch { return null }
  const completed = events.filter(event => event?.type === 'turn.completed')
  if (completed.length !== 1) return null
  const usage = completed[0].usage
  if (!usage || !['input_tokens', 'output_tokens', 'cached_input_tokens'].every(key => Number.isInteger(usage[key]) && usage[key] >= 0)) return null
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cachedInputTokens: usage.cached_input_tokens,
    requestCount: 1, requestCountScope: 'CODEX_CLI_INVOCATION_NOT_HTTP_REQUESTS' }
}
export function parseCodexEvents(stdout) {
  let events
  try { events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
  catch { throw new Error('PROVIDER_SCHEMA_FAILURE') }
  if (events.some(event => !eventIsSafe(event))) throw new Error('UNEXPECTED_TOOL_USE')
  const errors = events.filter(event => event.type === 'error' || event.type === 'turn.failed'
    || event.item?.type === 'error' && !startupWarning(event))
  if (errors.length) throw new Error(failureCategory(JSON.stringify(errors)))
  const complete = events.filter(event => event.type === 'turn.completed')
  if (complete.length !== 1) throw new Error('PROVIDER_PARTIAL_OUTPUT')
  const messages = events.filter(event => event.type === 'item.completed' && event.item.type === 'agent_message')
  if (messages.length !== 1) throw new Error('PROVIDER_PARTIAL_OUTPUT')
  const usage = observedCodexUsage(stdout)
  if (!usage) throw new Error('PROVIDER_USAGE_UNVERIFIED')
  return { text: messages[0].item.text, usage, unexpectedToolCalls: 0 }
}
