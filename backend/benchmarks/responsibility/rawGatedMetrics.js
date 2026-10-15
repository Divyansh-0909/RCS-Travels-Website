const rate = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null })
const level = normalized => ({ LOW: 'LEVEL_0', MODERATE: 'LEVEL_1', HIGH: 'LEVEL_2' })[normalized?.severity] ?? null
const upheld = run => run?.gate?.route === 'PROVISIONAL_AUTO_UPHELD'
const reviewed = run => Boolean(run.error) || run.gate?.route === 'NEEDS_ADMIN_REVIEW'
export function scoreRawGatedResponsibility(rows, candidate) {
  const known = rows.filter(row => row.label && row.label.source !== 'UNLABELED')
  const runs = known.map(row => ({ row, run: row.results[candidate], output: row.results[candidate].normalized }))
  const successful = runs.filter(({ run, output }) => !run.error && output !== null)
  const severeKnown = successful.map(({ row }) => row).filter(row => row.label.consequenceLevel !== null)
  const eligible = runs.filter(({ row }) => row.label.autoUpholdAllowed === true)
  const review = runs.filter(({ row }) => row.label.needsReview === true)
  const rawAdverse = ({ output }) => output?.classification === 'DRIVER_CAUSED' && output.evidenceSufficient && !output.needsHumanReview
  return { labelled: known.length, providerFailures: runs.filter(({ run }) => run.error).length,
    policyEvaluated: runs.filter(({ run }) => run.gate !== null).length,
    raw: {
      labelledWithResponse: successful.length,
      responsibilityAccuracy: rate(successful.filter(({ row, output }) => output.classification === row.label.responsibility).length, successful.length),
      ordinalSeverityAccuracy: rate(severeKnown.filter(row => level(row.results[candidate].normalized) === row.label.consequenceLevel).length, severeKnown.length),
      conditionedLevelAccuracy: rate(severeKnown.filter(row => row.results[candidate].prediction.consequenceLevel === row.label.consequenceLevel).length, severeKnown.length),
      falseDriverCaused: runs.filter(({ row, output }) => output?.classification === 'DRIVER_CAUSED' && row.label.responsibility !== 'DRIVER_CAUSED').length,
      falseHighSeverity: severeKnown.filter(row => level(row.results[candidate].normalized) === 'LEVEL_2' && row.label.consequenceLevel !== 'LEVEL_2').length,
      falseLevel2: severeKnown.filter(row => row.results[candidate].prediction.consequenceLevel === 'LEVEL_2' && row.label.consequenceLevel !== 'LEVEL_2').length,
      unsafeAdverseRecommendations: runs.filter(item => rawAdverse(item) && (item.row.label.responsibility !== 'DRIVER_CAUSED'
        || item.row.label.needsReview || item.row.label.evidenceSufficient === false
        || (item.row.label.consequenceLevel !== null && item.row.label.consequenceLevel !== 'LEVEL_2' && level(item.output) === 'LEVEL_2'))).length },
    gated: {
      unsafeAutoUpholds: runs.filter(({ row, run }) => upheld(run) && (row.label.autoUpholdAllowed !== true || row.label.responsibility !== 'DRIVER_CAUSED')).length,
      falseLevel2Routes: severeKnown.filter(row => upheld(row.results[candidate]) && row.results[candidate].prediction.consequenceLevel === 'LEVEL_2' && row.label.consequenceLevel !== 'LEVEL_2').length,
      missingEvidenceUnsafe: runs.filter(({ row, run }) => row.label.requiredMissingEvidence.length && upheld(run)).length,
      contradictionUnsafe: runs.filter(({ row, run }) => row.label.contradictionCritical && upheld(run)).length,
      policyReviewCount: runs.filter(({ run }) => run.gate?.route === 'NEEDS_ADMIN_REVIEW').length,
      failureReviewCount: runs.filter(({ run }) => run.error).length,
      reviewRate: rate(runs.filter(({ run }) => reviewed(run)).length, known.length),
      reviewRecall: rate(review.filter(({ run }) => reviewed(run)).length, review.length),
      safeUpholdPrecision: rate(eligible.filter(({ run }) => upheld(run)).length, runs.filter(({ run }) => upheld(run)).length),
      safeUpholdRecall: rate(eligible.filter(({ run }) => upheld(run)).length, eligible.length) } }
}
