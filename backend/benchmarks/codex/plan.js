import { digest } from './config.js'

export function validateDevelopmentInput(record, plan) {
  const expected = plan.order.find(item => item.caseId === record.id)
  if (!expected || expected.inputHash !== digest(record.modelInput)) throw new Error('BENCHMARK_INPUT_OR_SPLIT_MISMATCH')
  if (Object.keys(record.modelInput).some(key => key !== 'evidence')) throw new Error('BENCHMARK_LABEL_LEAKAGE')
  return structuredClone(record.modelInput)
}
export function requireVerifiedPreflight(receipt, cliVersion) {
  if (receipt.status !== 'VERIFIED' || receipt.model !== 'gpt-6-luna' || receipt.cliVersion !== cliVersion
    || receipt.authentication !== 'Logged in using ChatGPT' || receipt.authRestriction !== 'forced_login_method=chatgpt'
    || receipt.providerRestriction !== 'model_provider=openai' || receipt.userConfigIgnored !== true
    || receipt.sandbox !== 'read-only' || receipt.toolFeaturesDisabled !== true
    || receipt.unexpectedToolCalls !== 0 || receipt.failure !== null) throw new Error('CODEX_PREFLIGHT_NOT_VERIFIED')
}
export function requirePilotGate(receipt, planHash) {
  if (receipt.planHash !== planHash || receipt.status !== 'COMPLETE' || receipt.completed !== 10
    || receipt.failures !== 0 || receipt.unexpectedToolCalls !== 0 || receipt.guardedUnsafeOutcomes !== 0) throw new Error('CODEX_PILOT_GATE_NOT_PASSED')
}
export async function executeDevelopmentQueue({ order, journal, evaluate, checkpoint }) {
  const results = []
  for (const identity of order) {
    let entry
    try { entry = await journal.evaluateOnce(identity, () => evaluate(identity)) }
    catch (error) {
      await checkpoint({ status: 'STOPPED', completed: results.length, failure: error.message, results })
      return { status: 'STOPPED', completed: results.length, failure: error.message, results }
    }
    if (!entry.result.success) {
      const stopped = { status: 'STOPPED', completed: results.length, failure: entry.result.error, failedIdentity: identity, results }
      await checkpoint(stopped)
      return stopped
    }
    results.push({ identity, ...entry })
    await checkpoint({ status: 'RUNNING', completed: results.length, results })
  }
  const complete = { status: 'COMPLETE', completed: results.length, failure: null, results }
  await checkpoint(complete)
  return complete
}
