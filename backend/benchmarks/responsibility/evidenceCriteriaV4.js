import { createHash } from 'node:crypto'
import { choice, VERSION } from '@typesafe-ai/sdk'
import { evidenceCriteriaV3Questions } from './evidenceCriteriaV3.js'
import { createCriteriaAdapter } from './evidenceCriteriaV2.js'

const predicate = { YES: 'Affirmative incident facts establish this predicate.',
  NO: 'The stated affirmative facts do not establish this predicate.', UNCLEAR: 'Necessary evidence is incomplete or contradictory.' }
const questions = { ...evidenceCriteriaV3Questions(),
  externalCauseMaterial: choice('Do stated affirmative facts establish a material external emergency, obstruction or competing outside cause of this incident? Choose YES for a verified external cause as well as an unverified cause; resolved attribution does not erase external causation. An authenticated rider-requested release with explicit incident-bound recorded administrative waiver, no misconduct and no unresolved complaint is an authorized release, not a separate external failure. A demonstrably impossible platform assignment is platform causation, not external causation. Do not infer approval from a rider request alone. Missing, disputed or conflicting approval requires UNCLEAR. Any separately evidenced material external cause still requires YES even if an approval also exists. Do not imagine hypothetical emergencies.', predicate),
  needsHumanReview: choice('Does the supplied incident evidence require human review? Corroborated serious reliability facts (deliberately avoiding an accepted pickup, knowingly conflicting commitments, abandonment or harmful repetition) require YES even if ordinary failure also occurred. Missing mandatory facts, critical contradiction, material external cause or unresolved attribution requires YES. A recorded incident-bound approved waiver of authenticated rider-requested release may require NO only with complete consistent evidence, no misconduct and no unresolved complaint/cause. A proven impossible platform assignment alone does not require review if mandatory evidence is complete and consistent. Platform delay without proven impossibility or recorded approved waiver still requires causal-sequence review. Complete ordinary failure without aggravation may require NO. Decide independently from original evidence; other question answers are unavailable.', predicate),
}
export const EVIDENCE_CRITERIA_V4_CONFIG = Object.freeze({ version: 'responsibility-evidence-criteria-development-v4',
  model: 'jev-latest', sdkVersion: VERSION, questionsHash: createHash('sha256').update(JSON.stringify(questions)).digest('hex'),
  status: 'DEVELOPMENT_ONLY_NOT_FROZEN', guardChanged: false, productionChanged: false })
export const evidenceCriteriaV4Questions = () => ({ ...questions })
export const createEvidenceCriteriaV4Adapter = options => createCriteriaAdapter(EVIDENCE_CRITERIA_V4_CONFIG, questions, options)
