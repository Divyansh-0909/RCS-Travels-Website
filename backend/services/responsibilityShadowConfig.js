import { AI_RESPONSIBILITY_CONTRACT_VERSION } from './responsibilityContracts.js'
import { RESPONSIBILITY_POLICY_VERSION } from './responsibilityPolicyGate.js'

export const RESPONSIBILITY_ADJUDICATION_MODES = Object.freeze({
  DISABLED: 'disabled',
  SHADOW: 'shadow',
})

export const RESPONSIBILITY_ANALYST_CONFIG_VERSION = 'responsibility-analyst-config-v1'
export const RESPONSIBILITY_SHADOW_LEASE_MS = 2 * 60 * 1000
export const RESPONSIBILITY_SHADOW_MAX_ATTEMPTS = 4
export const RESPONSIBILITY_SHADOW_MAX_MANUAL_RETRIES = 2
export const RESPONSIBILITY_SHADOW_BASE_RETRY_MS = 30 * 1000
export const RESPONSIBILITY_SHADOW_MAX_RETRY_MS = 15 * 60 * 1000

export class ResponsibilityAdjudicationConfigError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export function responsibilityAdjudicationMode(env = process.env) {
  const raw = env.RESPONSIBILITY_ADJUDICATION_MODE?.trim().toLowerCase()
  if (!raw) throw new ResponsibilityAdjudicationConfigError('RESPONSIBILITY_ADJUDICATION_MODE_REQUIRED')
  if (!Object.values(RESPONSIBILITY_ADJUDICATION_MODES).includes(raw)) {
    throw new ResponsibilityAdjudicationConfigError('RESPONSIBILITY_ADJUDICATION_MODE_INVALID')
  }
  return raw
}

export const responsibilityShadowLogicalKey = ({ caseId, evidenceHash }) => [
  'shadow',
  caseId,
  evidenceHash,
  AI_RESPONSIBILITY_CONTRACT_VERSION,
  RESPONSIBILITY_ANALYST_CONFIG_VERSION,
  RESPONSIBILITY_POLICY_VERSION,
].join(':')

export function responsibilityShadowRetryDelayMs(attemptCount) {
  const exponent = Math.max(0, Number(attemptCount) - 1)
  return Math.min(RESPONSIBILITY_SHADOW_MAX_RETRY_MS, RESPONSIBILITY_SHADOW_BASE_RETRY_MS * (2 ** exponent))
}
