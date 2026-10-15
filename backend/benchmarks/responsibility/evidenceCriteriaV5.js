import { createHash } from 'node:crypto'
import { choice, VERSION } from '@typesafe-ai/sdk'
import { evidenceCriteriaV4Questions } from './evidenceCriteriaV4.js'
import { createCriteriaAdapter } from './evidenceCriteriaV2.js'

const questions = { ...evidenceCriteriaV4Questions(),
  needsHumanReview: choice('Is a blocking human-review condition established by this incident evidence? Decide independently from the original evidence; other answers are unavailable. Serious corroborated conduct requires YES even if ordinary failure also occurred. Do not use review as a default approval step for complete ordinary evidence. Do not infer completeness, guilt or waiver from an incident name or a selected cancellation reason. A rider request alone does not establish administrative approval.', {
    YES: 'Mandatory evidence is missing, a critical contradiction or attribution conflict remains, a material external cause remains, nonzero platform delay needs causal-sequence review, or serious corroborated abandonment, deliberate pickup avoidance, incompatible commitments or harmful repetition is established.',
    NO: 'Mandatory evidence is complete and consistent, with no review blocker: either affirmative ordinary driver causation without serious/aggravating facts or material platform/external contribution; or incident-bound recorded administrative approval of an authenticated rider release with no misconduct/unresolved complaint; or a demonstrably impossible platform assignment with no unresolved competing cause.',
    UNCLEAR: 'Available facts cannot establish whether a review blocker exists or whether the required evidence is complete. Do not assume missing facts.',
  }),
}
export const EVIDENCE_CRITERIA_V5_CONFIG = Object.freeze({ version: 'responsibility-evidence-criteria-development-v5',
  model: 'jev-latest', sdkVersion: VERSION, questionsHash: createHash('sha256').update(JSON.stringify(questions)).digest('hex'),
  status: 'DEVELOPMENT_ONLY_NOT_FROZEN', guardChanged: false, productionChanged: false })
export const evidenceCriteriaV5Questions = () => ({ ...questions })
export const createEvidenceCriteriaV5Adapter = options => createCriteriaAdapter(EVIDENCE_CRITERIA_V5_CONFIG, questions, options)
