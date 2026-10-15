import { z } from 'zod'
import { evidenceCategory, responsibilityCaseType } from './responsibilityEvidence.js'

export const AI_RESPONSIBILITY_CONTRACT_VERSION = 'responsibility-analysis-v1'

export const responsibilityClassification = Object.freeze({
  DRIVER_CAUSED: 'DRIVER_CAUSED',
  PLATFORM_CAUSED: 'PLATFORM_CAUSED',
  VALID_WAIVED: 'VALID_WAIVED',
  EXTERNAL_OR_UNCERTAIN: 'EXTERNAL_OR_UNCERTAIN',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
})

export const suggestedActionCategory = Object.freeze({
  AUTO_WAIVE_CANDIDATE: 'AUTO_WAIVE_CANDIDATE',
  AUTO_UPHOLD_CANDIDATE: 'AUTO_UPHOLD_CANDIDATE',
  ADMIN_REVIEW: 'ADMIN_REVIEW',
})

export const responsibilitySeverity = Object.freeze({
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
})

const jsonValueSchema = z.json()
const evidenceCategorySchema = z.enum(Object.values(evidenceCategory))

export const responsibilityEvidenceEntrySchema = z.object({
  id: z.string().min(1),
  category: evidenceCategorySchema,
  kind: z.string().min(1),
  value: jsonValueSchema,
  source: z.string().min(1),
  basis: z.enum(['direct', 'derived']),
  derivedFrom: z.array(z.string().min(1)),
  availability: z.enum(['available', 'unknown', 'not_available']),
  claimKey: z.string().min(1).nullable(),
  observedAt: z.iso.datetime(),
  receivedAt: z.iso.datetime(),
  quality: z.record(z.string(), jsonValueSchema),
}).strict()

const contradictionObservationSchema = z.object({
  value: jsonValueSchema,
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict()

export const responsibilityEvidenceBundleSchema = z.object({
  evidenceVersion: z.string().min(1),
  caseId: z.string().min(1),
  caseType: z.enum(Object.values(responsibilityCaseType)),
  bookingId: z.string().min(1),
  scheduledAt: z.iso.datetime().nullable(),
  occurredAt: z.iso.datetime().nullable(),
  generatedAt: z.iso.datetime(),
  timeline: z.array(responsibilityEvidenceEntrySchema),
  completeness: z.object({
    requiredCategories: z.array(evidenceCategorySchema),
    complete: z.boolean(),
    missing: z.array(evidenceCategorySchema),
    unavailable: z.array(evidenceCategorySchema),
  }).strict(),
  contradictions: z.array(z.object({
    claimKey: z.string().min(1),
    observations: z.array(contradictionObservationSchema).min(2),
  }).strict()),
}).strict()

const factSchema = z.object({
  type: z.literal('FACT'),
  evidenceIds: z.array(z.string().min(1)).min(1),
  statement: z.string().min(1),
}).strict()

const inferenceSchema = z.object({
  type: z.literal('INFERENCE'),
  evidenceIds: z.array(z.string().min(1)).min(1),
  statement: z.string().min(1),
}).strict()

const analysisContradictionSchema = z.object({
  evidenceIds: z.array(z.string().min(1)).min(2),
  summary: z.string().min(1),
}).strict()

const missingEvidenceSchema = z.object({
  category: evidenceCategorySchema,
  reason: z.string().min(1),
}).strict()

export const aiResponsibilityAnalysisSchema = z.object({
  caseId: z.string().min(1),
  suggestedClassification: z.enum(Object.values(responsibilityClassification)),
  confidence: z.number().min(0).max(1),
  factsSupporting: z.array(factSchema),
  factsAgainst: z.array(factSchema),
  contradictions: z.array(analysisContradictionSchema),
  missingEvidence: z.array(missingEvidenceSchema),
  inferences: z.array(inferenceSchema),
  severityAssessment: z.enum(Object.values(responsibilitySeverity)),
  suggestedActionCategory: z.enum(Object.values(suggestedActionCategory)),
  explanationSummary: z.string().min(1),
}).strict()

const responsibilityAnalystUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  requestCount: z.number().int().positive(),
}).strict()

export const responsibilityAnalystEnvelopeSchema = z.object({
  analysisId: z.string().min(1),
  contractVersion: z.literal(AI_RESPONSIBILITY_CONTRACT_VERSION),
  provider: z.string().min(1),
  model: z.string().min(1),
  usage: responsibilityAnalystUsageSchema.optional(),
  output: aiResponsibilityAnalysisSchema,
}).strict()
