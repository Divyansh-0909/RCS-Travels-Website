import { createHash } from 'node:crypto'
import { choice, VERSION } from '@typesafe-ai/sdk'
import { evidenceCriteriaV2Questions, createCriteriaAdapter } from './evidenceCriteriaV2.js'

const predicate = { YES: 'Affirmative incident facts establish this predicate.',
  NO: 'The stated affirmative facts do not establish this predicate.', UNCLEAR: 'Necessary evidence is incomplete or contradictory.' }
const questions = { ...evidenceCriteriaV2Questions(),
  needsHumanReview: choice('Does this incident require review? Missing mandatory facts, critical contradiction, unresolved attribution or corroborated serious reliability facts require YES. Material platform contribution alone does not prove a valid automated waiver. Nonzero platform delay without an incident-bound documented reviewed waiver or demonstrably impossible assignment requires review of the cancellation/pickup causal sequence. Complete ordinary driver cancellation with no aggravating facts may require NO; a documented approved waiver may require NO if otherwise complete.', predicate),
  aggravatingEvidencePresent: choice('Are specific serious facts affirmatively corroborated: abandonment, deliberately disabling availability to avoid an accepted pickup for a personal errand, knowingly accepting incompatible simultaneous bookings, or documented harmful repetition? Ordinary dispatch refusal or requested unassignment, including an authenticated acknowledgement of that refusal, is NOT aggravating without these additional serious facts. Confirmation that an ordinary act occurred does not convert it into a serious act. Missing GPS or uncorroborated allegations do not establish aggravation.', predicate),
}
export const EVIDENCE_CRITERIA_V3_CONFIG = Object.freeze({ version: 'responsibility-evidence-criteria-development-v3',
  model: 'jev-latest', sdkVersion: VERSION, questionsHash: createHash('sha256').update(JSON.stringify(questions)).digest('hex'),
  status: 'DEVELOPMENT_ONLY_NOT_FROZEN', guardChanged: false, productionChanged: false })
export const createEvidenceCriteriaV3Adapter = options => createCriteriaAdapter(EVIDENCE_CRITERIA_V3_CONFIG, questions, options)
export const evidenceCriteriaV3Questions = () => ({ ...questions })
