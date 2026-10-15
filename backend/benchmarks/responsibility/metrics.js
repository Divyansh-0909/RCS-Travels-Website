import { responsibilityClassification } from '../../services/responsibilityContracts.js'
import { responsibilityGroundTruthSource } from './contracts.js'

export const RESPONSIBILITY_CLASSES = Object.freeze([
  responsibilityClassification.DRIVER_CAUSED,
  responsibilityClassification.PLATFORM_CAUSED,
  responsibilityClassification.VALID_WAIVED,
  responsibilityClassification.EXTERNAL_OR_UNCERTAIN,
])
const PREDICTION_CLASSES = Object.freeze([...RESPONSIBILITY_CLASSES, responsibilityClassification.NEEDS_REVIEW])
const CONSEQUENCE_LEVELS = Object.freeze(['LEVEL_0', 'LEVEL_1', 'LEVEL_2'])

const safeBoolean = value => value === true
const ratio = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator
const mean = values => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
const percentile = (values, fraction) => {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.ceil(fraction * ordered.length) - 1]
}

const createMatrix = (actualClasses, predictedClasses) => Object.fromEntries(
  actualClasses.map(actual => [actual, Object.fromEntries(predictedClasses.map(predicted => [predicted, 0]))]),
)

const perClassMetrics = (matrix, actualClasses, predictedClasses) => Object.fromEntries(actualClasses.map(item => {
  const truePositive = matrix[item][item]
  const falsePositive = actualClasses.reduce((sum, actual) => sum + (actual === item ? 0 : matrix[actual][item]), 0)
  const falseNegative = predictedClasses.reduce((sum, predicted) => sum + (predicted === item ? 0 : matrix[item][predicted]), 0)
  const precision = ratio(truePositive, truePositive + falsePositive)
  const recall = ratio(truePositive, truePositive + falseNegative)
  return [item, { precision, recall, f1: ratio(2 * precision * recall, precision + recall) }]
}))

const updateSafetyMetrics = (safety, label, prediction, predictedClass) => {
  const isDriver = predictedClass === responsibilityClassification.DRIVER_CAUSED
  if (safeBoolean(prediction.autoUpholdAllowed) && (label.autoUpholdAllowed === false || label.responsibility !== responsibilityClassification.DRIVER_CAUSED)) safety.unsafeAutoUphold += 1
  if (isDriver && label.responsibility !== responsibilityClassification.DRIVER_CAUSED) safety.falseDriverCaused += 1
  if (prediction.consequenceLevel === 'LEVEL_2' && label.consequenceLevel !== null && label.consequenceLevel !== 'LEVEL_2') safety.falseLevel2 += 1
  if (safeBoolean(prediction.autoWaiveAllowed) && (label.autoWaiveAllowed === false || label.responsibility === responsibilityClassification.DRIVER_CAUSED)) safety.falseAutoWaive += 1
  if (safeBoolean(prediction.reportedEvidenceSufficient ?? prediction.evidenceSufficient) && label.evidenceSufficient === false) safety.falseEvidenceSufficient += 1
  if (label.responsibility === responsibilityClassification.PLATFORM_CAUSED && isDriver) safety.platformToDriver += 1
  if (label.responsibility === responsibilityClassification.EXTERNAL_OR_UNCERTAIN && isDriver) safety.externalToDriver += 1
  updateEvidenceSafety(safety, label, prediction)
}

const updateEvidenceSafety = (safety, label, prediction) => {
  const unsafe = !safeBoolean(prediction.needsReview) || safeBoolean(prediction.evidenceSufficient)
  if (label.contradictionCritical && unsafe) safety.contradictionSafety += 1
  if (label.requiredMissingEvidence.length > 0 && unsafe) safety.missingEvidenceSafety += 1
}

const eligibleCoverage = (records, field) => {
  const eligible = records.filter(record => record.label[field] === true)
  const covered = eligible.filter(record => record.prediction?.[field] === true).length
  return { eligibleCount: eligible.length, coveredCount: covered, rate: eligible.length ? covered / eligible.length : null }
}

export function checkPredictionInputSeparation(record) {
  const scan = value => {
    if (Array.isArray(value)) return value.every(scan)
    if (!value || typeof value !== 'object') return value !== '__BENCHMARK_LABEL_SENTINEL__'
    return Object.entries(value).every(([key, nested]) => key !== 'label' && scan(nested))
  }
  return Object.keys(record.modelInput).length === 1 && Object.hasOwn(record.modelInput, 'evidence') && scan(record.modelInput)
}

export function scoreResponsibilityBenchmark(records) {
  const labeled = records.filter(record => record.label && record.label.source !== responsibilityGroundTruthSource.UNLABELED
    && RESPONSIBILITY_CLASSES.includes(record.label.responsibility))
  const matrix = createMatrix(RESPONSIBILITY_CLASSES, PREDICTION_CLASSES)
  const levelMatrix = createMatrix(CONSEQUENCE_LEVELS, CONSEQUENCE_LEVELS)
  const safety = {
    unsafeAutoUphold: 0, falseDriverCaused: 0, falseLevel2: 0, falseAutoWaive: 0, missedReview: 0,
    falseEvidenceSufficient: 0, platformToDriver: 0, externalToDriver: 0, contradictionSafety: 0, missingEvidenceSafety: 0,
  }
  let reviewRequired = 0; let reviewCaught = 0
  for (const record of labeled) {
    const label = record.label
    const prediction = record.prediction ?? {}
    const predictedClass = PREDICTION_CLASSES.includes(prediction.responsibility) ? prediction.responsibility : responsibilityClassification.NEEDS_REVIEW
    matrix[label.responsibility][predictedClass] += 1
    if (CONSEQUENCE_LEVELS.includes(label.consequenceLevel) && CONSEQUENCE_LEVELS.includes(prediction.consequenceLevel)) {
      levelMatrix[label.consequenceLevel][prediction.consequenceLevel] += 1
    }
    updateSafetyMetrics(safety, label, prediction, predictedClass)
    if (label.needsReview) { reviewRequired += 1; if (safeBoolean(prediction.needsReview)) reviewCaught += 1; else safety.missedReview += 1 }
  }
  const perClass = perClassMetrics(matrix, RESPONSIBILITY_CLASSES, PREDICTION_CLASSES)
  const correct = RESPONSIBILITY_CLASSES.reduce((sum, item) => sum + matrix[item][item], 0)
  const values = Object.values(perClass)
  const levelPerClass = perClassMetrics(levelMatrix, CONSEQUENCE_LEVELS, CONSEQUENCE_LEVELS)
  const predictedReview = labeled.filter(record => safeBoolean(record.prediction?.needsReview)).length
  const predictedUphold = labeled.filter(record => safeBoolean(record.prediction?.autoUpholdAllowed)).length
  const predictedWaive = labeled.filter(record => safeBoolean(record.prediction?.autoWaiveAllowed)).length
  return {
    labeledCount: labeled.length, overall: { accuracy: ratio(correct, labeled.length) }, perClass,
    macroF1: mean(values.map(item => item.f1)), confusionMatrix: matrix,
    safety: { ...safety, humanReviewRecall: ratio(reviewCaught, reviewRequired) },
    reviewRate: ratio(predictedReview, labeled.length),
    automationCoverage: { autoUphold: ratio(predictedUphold, labeled.length), autoWaive: ratio(predictedWaive, labeled.length), review: ratio(predictedReview, labeled.length) },
    eligibleCoverage: { autoUphold: eligibleCoverage(labeled, 'autoUpholdAllowed'), autoWaive: eligibleCoverage(labeled, 'autoWaiveAllowed'),
      review: eligibleCoverage(labeled, 'needsReview') },
    severity: { confusionMatrix: levelMatrix, perClass: levelPerClass },
  }
}

export function aggregateBenchmarkOperationalStats(rows) {
  const numeric = (field, predicate = value => value >= 0) => rows.map(row => row[field]).filter(value => Number.isFinite(value) && predicate(value))
  const latency = numeric('latencyMs')
  const usage = {}
  for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'requestCount']) {
    const values = numeric(field)
    usage[field] = { total: values.reduce((sum, value) => sum + value, 0), mean: mean(values), count: values.length }
  }
  return { count: rows.length, latencyMs: { mean: mean(latency), p50: percentile(latency, 0.5), p95: percentile(latency, 0.95),
    p99: latency.length >= 100 ? percentile(latency, 0.99) : null, count: latency.length }, usage }
}

export function classifyBenchmarkDisagreements(records) {
  const categories = {
    jevCorrectExistingWrong: [], existingCorrectJevWrong: [], bothWrong: [], bothCorrectSeverityDisagreement: [],
    bothReview: [], oneReviewOtherDecides: [],
  }
  for (const record of records) {
    if (!record.label || record.label.source === responsibilityGroundTruthSource.UNLABELED) continue
    const existing = record.existingPrediction
    const jev = record.jevPrediction
    if (!existing || !jev) continue
    const existingCorrect = existing.responsibility === record.label.responsibility
    const jevCorrect = jev.responsibility === record.label.responsibility
    if (jevCorrect && !existingCorrect) categories.jevCorrectExistingWrong.push(record.id)
    else if (existingCorrect && !jevCorrect) categories.existingCorrectJevWrong.push(record.id)
    else if (!existingCorrect && !jevCorrect) categories.bothWrong.push(record.id)
    if (existingCorrect && jevCorrect && existing.consequenceLevel !== jev.consequenceLevel) categories.bothCorrectSeverityDisagreement.push(record.id)
    if (existing.needsReview && jev.needsReview) categories.bothReview.push(record.id)
    if (Boolean(existing.needsReview) !== Boolean(jev.needsReview)) categories.oneReviewOtherDecides.push(record.id)
  }
  return categories
}

const validProbabilityRow = row => {
  if (row.label?.source === responsibilityGroundTruthSource.UNLABELED
    || !RESPONSIBILITY_CLASSES.includes(row.label?.responsibility)
    || !RESPONSIBILITY_CLASSES.includes(row.predictedResponsibility) || !row.probabilities) return false
  const entries = Object.entries(row.probabilities)
  if (!entries.every(([key, value]) => RESPONSIBILITY_CLASSES.includes(key)
    && Number.isFinite(value) && value >= 0 && value <= 1)) return false
  return Math.abs(entries.reduce((sum, [, value]) => sum + value, 0) - 1) <= 0.000001
}

export function scoreProbabilityCalibration(rows) {
  const usable = rows.filter(validProbabilityRow)
  if (usable.length === 0) return { count: 0, brierScore: null, buckets: [] }
  let squaredError = 0
  const bucketMap = new Map()
  for (const row of usable) {
    for (const item of RESPONSIBILITY_CLASSES) {
      const probability = Number(row.probabilities[item] ?? 0)
      const target = row.label.responsibility === item ? 1 : 0
      squaredError += (probability - target) ** 2
    }
    const confidence = row.probabilities[row.predictedResponsibility] ?? 0
    const bucket = Math.min(9, Math.floor(confidence * 10))
    const current = bucketMap.get(bucket) ?? { bucket, count: 0, confidenceTotal: 0, correct: 0 }
    current.count += 1; current.confidenceTotal += confidence
    if (row.predictedResponsibility === row.label.responsibility) current.correct += 1
    bucketMap.set(bucket, current)
  }
  return { count: usable.length, brierScore: squaredError / usable.length,
    buckets: [...bucketMap.values()].sort((a, b) => a.bucket - b.bucket).map(item => ({ bucket: item.bucket, count: item.count,
      meanConfidence: item.confidenceTotal / item.count, accuracy: item.correct / item.count })) }
}

export function aggregateBenchmarkConsistency(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.consistencyKey ?? row.caseId ?? row.id
    if (typeof key !== 'string' || key.length === 0) continue
    const prediction = row.prediction ?? row
    const signature = JSON.stringify({
      responsibility: prediction.responsibility ?? null, needsReview: safeBoolean(prediction.needsReview),
      consequenceLevel: prediction.consequenceLevel ?? null, autoUpholdAllowed: safeBoolean(prediction.autoUpholdAllowed),
      autoWaiveAllowed: safeBoolean(prediction.autoWaiveAllowed), evidenceSufficient: safeBoolean(prediction.evidenceSufficient),
    })
    groups.set(key, (groups.get(key) ?? []).concat(signature))
  }
  const comparable = [...groups.values()].filter(group => group.length > 1)
  const consistent = comparable.filter(group => group.every(signature => signature === group[0]))
  return {
    groupCount: groups.size, comparedGroupCount: comparable.length, consistentGroupCount: consistent.length,
    consistencyRate: ratio(consistent.length, comparable.length),
  }
}

const numericVariance = values => {
  const finite = values.filter(Number.isFinite)
  if (finite.length < 2) return null
  const average = mean(finite)
  return mean(finite.map(value => (value - average) ** 2))
}

export function benchmarkRepeatDetails(rows) {
  const groups = new Map()
  for (const row of rows) {
    const group = groups.get(row.id) ?? []
    group.push(row)
    groups.set(row.id, group)
  }
  const cases = [...groups.entries()].filter(([, group]) => group.length > 1).map(([id, group]) => {
    const same = field => group.every(row => row.prediction[field] === group[0].prediction[field])
    return { id, runs: group.length, sameClassification: same('responsibility'), sameReview: same('needsReview'),
      sameSeverity: same('consequenceLevel'), confidenceVariance: numericVariance(group.map(row => row.prediction.confidence)),
      severityScoreVariance: numericVariance(group.map(row => row.severityScore)),
      probabilityVariance: Object.fromEntries(RESPONSIBILITY_CLASSES.map(item => [item,
        numericVariance(group.map(row => row.prediction.probabilities?.[item]))])) }
  })
  const rate = field => ratio(cases.filter(row => row[field]).length, cases.length)
  return { comparedCases: cases.length, classificationConsistencyRate: rate('sameClassification'),
    reviewConsistencyRate: rate('sameReview'), severityConsistencyRate: rate('sameSeverity'), cases }
}
