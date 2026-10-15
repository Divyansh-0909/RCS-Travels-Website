import { createHash } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { TypeSafeClient, VERSION as JEV_SDK_VERSION, choice, noul, score } from '@typesafe-ai/sdk'
import { createOpenAIResponsibilityAnalyst, responsibilityEvidenceHash } from '../../services/responsibilityAnalyst.js'
import { responsibilityEvidenceBundleSchema, responsibilityClassification, responsibilitySeverity } from '../../services/responsibilityContracts.js'
import { responsibilityCaseState } from '../../services/responsibilityCaseState.js'
import { DEFAULT_RESPONSIBILITY_POLICY, evaluateResponsibilityPolicy, responsibilityEvaluationKey, provisionalResponsibilityRoute } from '../../services/responsibilityPolicyGate.js'
import { RESPONSIBILITY_ANALYST_CONFIG_VERSION } from '../../services/responsibilityShadowConfig.js'
import { independentResponsibilityGates } from '../../services/responsibilityEvidenceSafety.js'
import {
  consequenceLevel,
  responsibilityBenchmarkCohort,
  responsibilityBenchmarkLabelSchema,
  responsibilityGroundTruthSource,
} from './contracts.js'

export const RESPONSIBILITY_BENCHMARK_VERSION = 'responsibility-benchmark-v1'
export const JEV_BINARY_THRESHOLD = 0.5
export const JEV_DIRECT_ANALYST_CONTRACT_COMPATIBLE = false
export const JEV_DIRECT_POLICY_GATE_COMPATIBLE = false
export const JEV_ADAPTER_VERSION = 'jev-responsibility-benchmark-adapter-v1'
const jevModelDefault = 'jev-latest'
const jevResponsibilityChoices = Object.freeze([
  responsibilityClassification.DRIVER_CAUSED,
  responsibilityClassification.PLATFORM_CAUSED,
  responsibilityClassification.VALID_WAIVED,
  responsibilityClassification.EXTERNAL_OR_UNCERTAIN,
])

const nowIso = () => new Date().toISOString()
const elapsed = started => Math.max(0, Date.now() - started)
const numberOrNull = value => Number.isFinite(value) ? value : null
const redactError = error => {
  const message = error instanceof Error ? error.message : 'benchmark request failed'
  return message.replace(/(?:sk-|Bearer\s+)[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 240)
}
const failureCategory = error => {
  const message = error instanceof Error ? error.message : ''
  const name = error instanceof Error ? error.name : ''
  if (/timeout|timed out|ETIMEDOUT/i.test(`${name}:${message}`)) return 'TIMEOUT'
  if (name === 'ZodError' || /JEV_(?:ANSWER|CLASSIFICATION)_INVALID|structured output|schema|parse|Zod/i.test(message)) return 'SCHEMA'
  return 'PROVIDER'
}
const answerYes = value => Number.isFinite(value) && value >= JEV_BINARY_THRESHOLD
const severityForScore = value => value < 0.5 ? responsibilitySeverity.LOW
  : value < 1.5 ? responsibilitySeverity.MODERATE : responsibilitySeverity.HIGH
const caseKey = id => createHash('sha256').update(id).digest('hex').slice(0, 24)

const jevQuestions = {
  responsibility: choice('Which responsibility classification is best supported by this evidence?', {
    DRIVER_CAUSED: 'The driver caused the outcome.',
    PLATFORM_CAUSED: 'A platform failure materially caused the outcome.',
    VALID_WAIVED: 'The outcome should be waived without driver fault.',
    EXTERNAL_OR_UNCERTAIN: 'External causes or uncertainty prevent a reliable attribution.',
  }),
  evidenceSufficient: noul('Is the supplied evidence sufficient to make a reliable responsibility classification?'),
  platformMateriallyContributed: noul('Did a platform failure materially contribute to the outcome?'),
  externalCauseMaterial: noul('Did an external cause materially contribute to the outcome?'),
  needsHumanReview: noul('Does this case need human review because of uncertainty, conflict, or material risk?'),
  severity: score('What is the severity level?', ['LOW', 'MODERATE', 'HIGH']),
}

export const JEV_BENCHMARK_CONFIGURATION = Object.freeze({
  sdkVersion: JEV_SDK_VERSION,
  adapterVersion: JEV_ADAPTER_VERSION,
  binaryThreshold: JEV_BINARY_THRESHOLD,
  severityThresholds: Object.freeze([0.5, 1.5]),
  questionsHash: createHash('sha256').update(JSON.stringify(jevQuestions)).digest('hex'),
})

const validateJevAnswers = raw => {
  const required = [raw.answers.responsibility.confidence,
    raw.answers.evidenceSufficient.noul, raw.answers.platformMateriallyContributed.noul,
    raw.answers.externalCauseMaterial.noul, raw.answers.needsHumanReview.noul]
  if (required.some(value => value === null || value < 0 || value > 1)) throw new Error('JEV_ANSWER_INVALID')
  const severity = raw.answers.severity.score
  if (severity === null || severity < 0 || severity > 2) throw new Error('JEV_ANSWER_INVALID')
}

const numericProbabilities = value => Object.fromEntries(Object.entries(value ?? {})
  .filter(([, probability]) => Number.isFinite(probability))
  .map(([key, probability]) => [key, probability]))

function safeJevRaw(response) {
  if (!response?.answers || ['responsibility', 'evidenceSufficient', 'platformMateriallyContributed',
    'externalCauseMaterial', 'needsHumanReview', 'severity'].some(field => !response.answers[field])) throw new Error('JEV_ANSWER_INVALID')
  const answers = response.answers
  return {
    model: typeof response.model === 'string' ? response.model : null,
    usage: { inputTokens: numberOrNull(response.usage?.input_tokens), outputTokens: numberOrNull(response.usage?.output_tokens) },
    answers: {
      responsibility: { choice: answers.responsibility.choice, confidence: numberOrNull(answers.responsibility.confidence),
        probabilities: numericProbabilities(answers.responsibility.probabilities) },
      evidenceSufficient: { noul: numberOrNull(answers.evidenceSufficient.noul) },
      platformMateriallyContributed: { noul: numberOrNull(answers.platformMateriallyContributed.noul) },
      externalCauseMaterial: { noul: numberOrNull(answers.externalCauseMaterial.noul) },
      needsHumanReview: { noul: numberOrNull(answers.needsHumanReview.noul) },
      severity: { score: numberOrNull(answers.severity.score), confidence: numberOrNull(answers.severity.confidence),
        probabilities: numericProbabilities(answers.severity.probabilities) },
    },
  }
}

export function normalizeJevResponsibility(response) {
  const raw = safeJevRaw(response)
  const classification = raw.answers.responsibility.choice
  if (!jevResponsibilityChoices.includes(classification)) throw new Error('JEV_CLASSIFICATION_INVALID')
  validateJevAnswers(raw)
  return {
    classification,
    confidence: raw.answers.responsibility.confidence,
    evidenceSufficient: answerYes(raw.answers.evidenceSufficient.noul),
    platformMateriallyContributed: answerYes(raw.answers.platformMateriallyContributed.noul),
    externalCauseMaterial: answerYes(raw.answers.externalCauseMaterial.noul),
    needsHumanReview: answerYes(raw.answers.needsHumanReview.noul),
    severity: severityForScore(raw.answers.severity.score),
    directAnalystContractCompatible: JEV_DIRECT_ANALYST_CONTRACT_COMPATIBLE,
    directPolicyGateCompatible: JEV_DIRECT_POLICY_GATE_COMPATIBLE,
    probabilities: raw.answers.responsibility.probabilities,
  }
}

export function createJevResponsibilityAdapter({ client = new TypeSafeClient(), model = jevModelDefault, timeout = 10_000 } = {}) {
  return {
    provider: 'typesafe-ai', model, configVersion: `${JEV_ADAPTER_VERSION}:${model}`,
    async analyzeResponsibilityCase(evidence) {
      const response = await client.systemOne({ model, state: evidence, questions: jevQuestions }, { timeout, retry: { maxRetries: 0 } })
      return { raw: safeJevRaw(response), normalized: normalizeJevResponsibility(response) }
    },
  }
}

const availableByCategory = evidence => {
  const grouped = new Map()
  for (const item of evidence.timeline) {
    if (item.availability !== 'available') continue
    grouped.set(item.category, (grouped.get(item.category) ?? []).concat(item))
  }
  return grouped
}

const freshnessAge = item => {
  if (item.quality?.fresh === true) return 0
  if (Number.isFinite(item.quality?.ageMs)) return item.quality.ageMs
  const observed = Date.parse(item.observedAt)
  const received = Date.parse(item.receivedAt)
  if (!Number.isFinite(observed) || !Number.isFinite(received)) return Number.POSITIVE_INFINITY
  return Math.max(0, received - observed)
}

const requiredEvidence = (evidence, casePolicy) => {
  const grouped = availableByCategory(evidence)
  const missing = casePolicy.requiredCategories.filter(category => !grouped.has(category))
  return { pass: missing.length === 0, detail: missing.length ? `missing:${missing.join(',')}` : 'complete' }
}

const freshEvidence = (evidence, casePolicy) => {
  const grouped = availableByCategory(evidence)
  const stale = casePolicy.freshnessRequiredCategories.filter(category => {
    const entries = grouped.get(category) ?? []
    const maxAge = casePolicy.maxAgeMsByCategory[category] ?? 0
    return !entries.some(item => freshnessAge(item) <= maxAge)
  })
  return { pass: stale.length === 0, detail: stale.length ? `stale-or-unproven:${stale.join(',')}` : 'fresh' }
}

const evidenceQuality = evidence => {
  const ids = new Set(evidence.timeline.map(item => item.id))
  const invalid = evidence.timeline.filter(item => item.quality?.invalid === true || item.quality?.provenance === 'missing'
    || (item.basis === 'derived' && item.derivedFrom.some(id => !ids.has(id))))
  return { pass: invalid.length === 0, detail: invalid.length ? `invalid:${invalid.map(item => item.id).join(',')}` : 'acceptable' }
}
const audit = (code, pass, detail) => ({ code, pass, detail })

export function simulateJevResponsibilityRoute({ evidence, result, policy = DEFAULT_RESPONSIBILITY_POLICY }) {
  const casePolicy = policy.cases[evidence.caseType]
  const checks = [audit('CASE_TYPE_ALLOWLIST', Boolean(casePolicy), casePolicy ? 'allowed' : 'unknown-or-disabled')]
  if (!casePolicy) return simulatedReview(policy.policyVersion, checks)
  const required = requiredEvidence(evidence, casePolicy)
  const fresh = freshEvidence(evidence, casePolicy)
  const quality = evidenceQuality(evidence)
  checks.push(...independentResponsibilityGates(evidence, result.classification, casePolicy.requiredCategories))
  checks.push(
    audit('REQUIRED_EVIDENCE', required.pass, required.detail),
    audit('EVIDENCE_FRESHNESS', fresh.pass, fresh.detail),
    audit('EVIDENCE_QUALITY', quality.pass, quality.detail),
    audit('MATERIAL_CONTRADICTIONS', evidence.contradictions.length === 0, evidence.contradictions.length ? 'unresolved' : 'none'),
    audit('JEV_EVIDENCE_SUFFICIENT', result.evidenceSufficient, 'reported'),
    audit('JEV_HUMAN_REVIEW', !result.needsHumanReview, 'reported'),
    audit('JEV_EXTERNAL_CAUSE', !result.externalCauseMaterial, 'reported'),
  )
  checks.push(
    audit('CONFIDENCE_FLOOR', result.confidence >= casePolicy.minConfidence, String(result.confidence)),
    audit('SEVERITY_ALLOWLIST', casePolicy.allowedSeverities.includes(result.severity), result.severity),
  )
  const compatible = (result.classification !== responsibilityClassification.DRIVER_CAUSED || !result.platformMateriallyContributed)
    && (result.classification !== responsibilityClassification.PLATFORM_CAUSED || result.platformMateriallyContributed)
  checks.push(audit('CROSS_QUESTION_CONSISTENCY', compatible, result.classification))
  if (checks.some(check => !check.pass) || result.classification === responsibilityClassification.EXTERNAL_OR_UNCERTAIN) {
    return simulatedReview(policy.policyVersion, checks)
  }
  if (result.classification === responsibilityClassification.DRIVER_CAUSED) {
    checks.push(audit('AUTO_UPHOLD_ENABLED', casePolicy.autoUpholdAllowed, 'policy'))
    return checks.at(-1).pass ? simulatedResult(provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD, policy.policyVersion, checks)
      : simulatedReview(policy.policyVersion, checks)
  }
  // Independent route authority has already rejected every unsupported classification.
  checks.push(audit('AUTO_WAIVE_ENABLED', casePolicy.autoWaiveAllowed, 'policy'))
  return checks.at(-1).pass
    ? simulatedResult(provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED, policy.policyVersion, checks)
    : simulatedReview(policy.policyVersion, checks)
}

function simulatedResult(route, policyVersion, checks) {
  return { route, policyVersion, humanReviewRequired: route === provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
    passedGates: checks.filter(check => check.pass), failedGates: checks.filter(check => !check.pass) }
}
function simulatedReview(policyVersion, checks) {
  return simulatedResult(provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW, policyVersion, checks)
}

function safeExistingRaw(envelope) {
  const output = envelope?.output
  return {
    analysisId: typeof envelope?.analysisId === 'string' ? envelope.analysisId : null,
    contractVersion: typeof envelope?.contractVersion === 'string' ? envelope.contractVersion : null,
    provider: typeof envelope?.provider === 'string' ? envelope.provider : null,
    model: typeof envelope?.model === 'string' ? envelope.model : null,
    usage: envelope?.usage ? { inputTokens: numberOrNull(envelope.usage.inputTokens), outputTokens: numberOrNull(envelope.usage.outputTokens),
      totalTokens: numberOrNull(envelope.usage.totalTokens), requestCount: numberOrNull(envelope.usage.requestCount) } : null,
    output: output ? { classification: output.suggestedClassification, confidence: output.confidence, severity: output.severityAssessment,
      action: output.suggestedActionCategory, factCount: output.factsSupporting?.length ?? 0, inferenceCount: output.inferences?.length ?? 0 } : null,
  }
}

export async function runExistingResponsibilityAnalyst(evidence, { analyst = createOpenAIResponsibilityAnalyst(), policy = DEFAULT_RESPONSIBILITY_POLICY } = {}) {
  const started = Date.now()
  const evidenceHash = responsibilityEvidenceHash(evidence)
  try {
    const envelope = await analyst.analyzeResponsibilityCase(evidence)
    const analysisId = envelope?.analysisId ?? 'invalid-analysis'
    const gate = evaluateResponsibilityPolicy({ evidence, analysisEnvelope: envelope, evidenceHash,
      currentState: responsibilityCaseState.POLICY_EVALUATION,
      idempotencyKey: responsibilityEvaluationKey({ caseId: evidence.caseId, evidenceHash, analysisId, policyVersion: policy.policyVersion }), policy })
    return { provider: analyst.provider, model: analyst.model, configVersion: RESPONSIBILITY_ANALYST_CONFIG_VERSION, evidenceHash,
      latencyMs: elapsed(started), raw: safeExistingRaw(envelope), normalized: safeExistingRaw(envelope).output, gate, error: null }
  } catch (error) {
    return { provider: analyst.provider, model: analyst.model, configVersion: RESPONSIBILITY_ANALYST_CONFIG_VERSION, evidenceHash, latencyMs: elapsed(started), raw: null, normalized: null, gate: null, error: redactError(error), errorCategory: failureCategory(error) }
  }
}

export async function runJevResponsibilityAnalyst(evidence, { adapter = createJevResponsibilityAdapter(), policy = DEFAULT_RESPONSIBILITY_POLICY } = {}) {
  const started = Date.now()
  try {
    const result = await adapter.analyzeResponsibilityCase(evidence)
    return { provider: adapter.provider, model: adapter.model, configVersion: adapter.configVersion, latencyMs: elapsed(started),
      raw: result.raw, normalized: result.normalized, gate: simulateJevResponsibilityRoute({ evidence, result: result.normalized, policy }), error: null }
  } catch (error) {
    return { provider: adapter.provider, model: adapter.model, configVersion: adapter.configVersion, latencyMs: elapsed(started), raw: null, normalized: null, gate: null, error: redactError(error), errorCategory: failureCategory(error) }
  }
}

const evidenceGateCodes = new Set([
  'ANALYSIS_VALIDATION', 'REQUIRED_EVIDENCE', 'EVIDENCE_FRESHNESS', 'EVIDENCE_QUALITY', 'MATERIAL_CONTRADICTIONS',
  'AI_REPORTED_MISSING_EVIDENCE', 'AI_REPORTED_CONTRADICTIONS', 'JEV_EVIDENCE_SUFFICIENT',
])

const consequenceForPrediction = normalized => {
  if (!normalized || normalized.classification !== responsibilityClassification.DRIVER_CAUSED) return consequenceLevel.LEVEL_0
  return normalized.severity === responsibilitySeverity.HIGH ? consequenceLevel.LEVEL_2 : consequenceLevel.LEVEL_1
}

export function benchmarkPredictionFromRun(run) {
  const normalized = run?.normalized
  const route = normalized && !run.error ? run.gate?.route ?? provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW
    : provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW
  const failed = new Set((run?.gate?.failedGates ?? []).map(item => item.code))
  return {
    responsibility: normalized?.classification ?? responsibilityClassification.NEEDS_REVIEW,
    needsReview: route === provisionalResponsibilityRoute.NEEDS_ADMIN_REVIEW,
    consequenceLevel: consequenceForPrediction(normalized),
    autoUpholdAllowed: route === provisionalResponsibilityRoute.PROVISIONAL_AUTO_UPHELD,
    autoWaiveAllowed: route === provisionalResponsibilityRoute.PROVISIONAL_AUTO_WAIVED,
    evidenceSufficient: Boolean(normalized && run?.gate && !run.error && ![...failed].some(code => evidenceGateCodes.has(code))),
    reportedEvidenceSufficient: normalized?.evidenceSufficient ?? null,
    confidence: numberOrNull(normalized?.confidence),
    probabilities: normalized?.probabilities ?? null,
  }
}

const humanLabel = (decision, source, evidence) => {
  const responsibility = decision.classification
  if (!jevResponsibilityChoices.includes(responsibility)) return null
  const missing = [...evidence.completeness.missing, ...evidence.completeness.unavailable]
  return responsibilityBenchmarkLabelSchema.parse({
    responsibility,
    needsReview: null,
    consequenceLevel: decision?.consequenceLevel ?? null,
    autoUpholdAllowed: null,
    autoWaiveAllowed: null,
    evidenceSufficient: null,
    requiredMissingEvidence: missing,
    contradictionCritical: evidence.contradictions.length > 0,
    source,
  })
}

const groundTruth = (row, evidence) => {
  if (row.finalDecision?.source === 'APPEAL_REVIEW' || row.finalDecision?.appealId) {
    return humanLabel(row.finalDecision, responsibilityGroundTruthSource.FINAL_APPEAL, evidence)
  }
  if (row.finalDecision && ['NO_APPEAL_ADMIN', 'ADMIN_WAIVER'].includes(row.finalDecision.source)) {
    return humanLabel(row.finalDecision, responsibilityGroundTruthSource.ADMIN_HUMAN, evidence)
  }
  if (row.adminReview) return humanLabel(row.adminReview, responsibilityGroundTruthSource.ADMIN_HUMAN, evidence)
  return null
}

export function createReadOnlyResponsibilityBenchmarkLoader(db) {
  return {
    async load({ take = 100, caseIds = null } = {}) {
      const rows = await db.responsibilityCase.findMany({
        where: { shadowResults: { some: {} }, ...(caseIds ? { id: { in: caseIds } } : {}) }, take, orderBy: { createdAt: 'asc' },
        select: { id: true, state: true, evidenceSnapshot: true,
          finalDecision: { select: { outcome: true, classification: true, consequenceLevel: true, source: true, appealId: true } },
          adminReview: { select: { decision: true, classification: true, consequenceLevel: true } } },
      })
      return rows.flatMap(row => {
        const parsed = responsibilityEvidenceBundleSchema.safeParse(row.evidenceSnapshot)
        if (!parsed.success) return []
        const label = groundTruth(row, parsed.data)
        return [{ id: `real-${caseKey(row.id)}`, caseId: row.id, evidence: parsed.data, label,
          cohort: label ? responsibilityBenchmarkCohort.REAL_LABELED : responsibilityBenchmarkCohort.REAL_UNLABELED,
          scenario: 'real-world' }]
      })
    },
  }
}

export function createResponsibilityBenchmarkRunner({ existingAnalyst, jevAdapter, policy = DEFAULT_RESPONSIBILITY_POLICY } = {}) {
  return {
    async run(cases, { runNumber = 1 } = {}) {
      const records = []
      for (const benchmarkCase of cases) {
        const evidence = benchmarkCase.evidence
        const [existing, jev] = await Promise.all([
          runExistingResponsibilityAnalyst(evidence, { analyst: existingAnalyst, policy }),
          runJevResponsibilityAnalyst(evidence, { adapter: jevAdapter, policy }),
        ])
        records.push({ version: RESPONSIBILITY_BENCHMARK_VERSION, recordedAt: nowIso(), runNumber,
          id: benchmarkCase.id ?? `case-${caseKey(benchmarkCase.caseId ?? evidence.caseId)}`,
          caseKey: caseKey(benchmarkCase.caseId ?? evidence.caseId), caseType: evidence.caseType,
          cohort: benchmarkCase.cohort ?? responsibilityBenchmarkCohort.REAL_UNLABELED,
          scenario: benchmarkCase.scenario ?? 'real-world', evidenceHash: responsibilityEvidenceHash(evidence), evidenceVersion: evidence.evidenceVersion,
          label: benchmarkCase.label ?? null, existing, jev,
          existingPrediction: benchmarkPredictionFromRun(existing), jevPrediction: benchmarkPredictionFromRun(jev) })
      }
      return records
    },
  }
}

export function createAppendOnlyResponsibilityArtifactWriter({ outputDir, runId = new Date().toISOString().slice(0, 10) }) {
  const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const artifacts = join(outputDir, `responsibility-benchmark-${safeRunId}.jsonl`)
  const summary = join(outputDir, `responsibility-benchmark-${safeRunId}-summary.jsonl`)
  return {
    artifacts, summary,
    async append(records, metadata = {}) {
      await mkdir(outputDir, { recursive: true })
      await appendFile(artifacts, records.map(record => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''))
      const failures = records.filter(record => record.existing.error || record.jev.error).length
      await appendFile(summary, `${JSON.stringify({ version: RESPONSIBILITY_BENCHMARK_VERSION, recordedAt: nowIso(), records: records.length, failures, ...metadata })}\n`)
    },
  }
}
