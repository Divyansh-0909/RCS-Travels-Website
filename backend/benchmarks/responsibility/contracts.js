import { z } from 'zod'
import {
  responsibilityClassification,
  responsibilityEvidenceBundleSchema,
} from '../../services/responsibilityContracts.js'
import { evidenceCategory, responsibilityCaseType, stableSerializeResponsibilityEvidence } from '../../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'

export const responsibilityBenchmarkCohort = Object.freeze({
  FROZEN_SYNTHETIC: 'A_FROZEN_SYNTHETIC',
  ADVERSARIAL_SAFETY: 'B_ADVERSARIAL_SAFETY',
  REAL_LABELED: 'C_REAL_LABELED',
  REAL_UNLABELED: 'D_REAL_UNLABELED',
})

export const responsibilityGroundTruthSource = Object.freeze({
  FINAL_APPEAL: 'FINAL_APPEAL',
  ADMIN_HUMAN: 'ADMIN_HUMAN',
  FROZEN_SYNTHETIC: 'FROZEN_SYNTHETIC',
  UNLABELED: 'UNLABELED',
})

export const consequenceLevel = Object.freeze({
  LEVEL_0: 'LEVEL_0',
  LEVEL_1: 'LEVEL_1',
  LEVEL_2: 'LEVEL_2',
})

const classificationSchema = z.enum(Object.values(responsibilityClassification))
const categorySchema = z.enum(Object.values(evidenceCategory))
const benchmarkPredictionFields = {
  responsibility: classificationSchema,
  needsReview: z.boolean().nullable(),
  consequenceLevel: z.enum(Object.values(consequenceLevel)).nullable(),
  autoUpholdAllowed: z.boolean().nullable(),
  autoWaiveAllowed: z.boolean().nullable(),
  evidenceSufficient: z.boolean().nullable(),
}

export const responsibilityBenchmarkLabelSchema = z.object({
  ...benchmarkPredictionFields,
  requiredMissingEvidence: z.array(categorySchema),
  contradictionCritical: z.boolean(),
  source: z.enum(Object.values(responsibilityGroundTruthSource)),
}).strict()

export const responsibilityBenchmarkRecordSchema = z.object({
  id: z.string().min(1),
  cohort: z.enum(Object.values(responsibilityBenchmarkCohort)),
  evidence: responsibilityEvidenceBundleSchema,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  modelInput: z.object({ evidence: responsibilityEvidenceBundleSchema }).strict(),
  label: responsibilityBenchmarkLabelSchema.nullable(),
  scenario: z.string().min(1),
  scenarioFamily: z.string().min(1).optional(),
}).strict().superRefine((record, context) => {
  if (stableSerializeResponsibilityEvidence(record.modelInput.evidence) !== stableSerializeResponsibilityEvidence(record.evidence)) {
    context.addIssue({ code: 'custom', message: 'Model input must use the record evidence' })
  }
  const evidence = responsibilityEvidenceBundleSchema.safeParse(record.evidence)
  if (evidence.success && record.evidenceHash !== responsibilityEvidenceHash(evidence.data)) {
    context.addIssue({ code: 'custom', message: 'Evidence hash must match the record evidence' })
  }
  if (record.cohort === responsibilityBenchmarkCohort.REAL_UNLABELED && record.label !== null) {
    context.addIssue({ code: 'custom', message: 'Unlabeled cohort cannot include ground truth' })
  }
})

export const realResponsibilityBenchmarkMetadataSchema = z.object({
  cohort: z.enum([
    responsibilityBenchmarkCohort.REAL_LABELED,
    responsibilityBenchmarkCohort.REAL_UNLABELED,
  ]),
  externalCaseReference: z.string().min(1),
  evidenceVersion: z.string().min(1),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  labelSource: z.enum(Object.values(responsibilityGroundTruthSource)),
}).strict()

const groundTruthPriority = Object.freeze({
  FINAL_APPEAL: 4,
  ADMIN_HUMAN: 3,
  FROZEN_SYNTHETIC: 2,
  UNLABELED: 1,
})

export function resolveResponsibilityGroundTruth(candidates) {
  const parsed = candidates.filter(Boolean).map(candidate => responsibilityBenchmarkLabelSchema.parse(candidate))
  if (parsed.length === 0) return null
  const highestPriority = Math.max(...parsed.map(candidate => groundTruthPriority[candidate.source]))
  const strongest = parsed.filter(candidate => groundTruthPriority[candidate.source] === highestPriority)
  if (strongest[0].source === responsibilityGroundTruthSource.UNLABELED) return null
  const canonical = strongest.map(candidate => JSON.stringify({
    responsibility: candidate.responsibility,
    needsReview: candidate.needsReview,
    consequenceLevel: candidate.consequenceLevel,
    autoUpholdAllowed: candidate.autoUpholdAllowed,
    autoWaiveAllowed: candidate.autoWaiveAllowed,
    evidenceSufficient: candidate.evidenceSufficient,
    requiredMissingEvidence: candidate.requiredMissingEvidence,
    contradictionCritical: candidate.contradictionCritical,
  }))
  if (new Set(canonical).size !== 1) throw new Error('GROUND_TRUTH_CONFLICT')
  return strongest[0]
}

export const benchmarkCaseTypes = Object.freeze(Object.values(responsibilityCaseType))
