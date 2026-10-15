import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const root = new URL('../../', import.meta.url), backend = fileURLToPath(new URL('../', import.meta.url))
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
let dataset
before(async () => {
  await execute(process.execPath, ['scripts/freeze-search-language-robustness.mjs'], { cwd: backend, timeout: 15_000 })
  dataset = await load('docs/search/hindi-hinglish-robustness-v1/dataset.json')
})

test('separate robustness suite freezes labels before scoring without changing Search V1', async () => {
  const { datasetHash, ...content } = dataset
  assert.equal(hash(content), datasetHash)
  assert.equal(dataset.records.length, 80)
  assert.deepEqual(dataset.languageCounts, { HINDI: 30, ROMANIZED_HINDI: 30, HINGLISH: 20 })
  assert.equal(dataset.scoredProviderCalls, 0)
  assert.equal(dataset.frozenBeforeAnyScoredOutput, true)
  const original = await load('docs/search/benchmark-v1/exploratory-unscored.json')
  assert.equal(hash(original), dataset.originalCorpusHash)
  assert.deepEqual(dataset.records.slice(0, 40).map(row => row.modelInput.query), original.map(row => row.modelInput.query))
  const v1 = await load('docs/search/benchmark-v1/frozen-v1/dataset.json')
  assert.equal(hash(v1.records), dataset.SearchV1DatasetHash)
  assert.equal(v1.splitHash, dataset.SearchV1SplitHash)
  assert.equal(dataset.split, 'FROZEN_ROBUSTNESS_SUITE_NO_INDEPENDENT_HELD_OUT_CLAIM')
})

test('every record explicitly labels all required semantic dimensions', () => {
  const fields = ['queryType', 'complexity', 'pickupSpans', 'dropSpans', 'date', 'relativeDate', 'weekday', 'time',
    'timingMode', 'daypart', 'timeZone', 'vehicle', 'vehicleExclusions', 'passengers', 'flags', 'changedMind',
    'conflicts', 'returnIntent', 'stops', 'conditionalAlternatives', 'missingFields', 'unsupportedRequests',
    'plannedFeatureIntent', 'fallbackExpectation', 'formResolutionRequirements', 'supersededLocationSpans']
  for (const row of dataset.records) {
    assert.ok(fields.every(field => Object.hasOwn(row.truth.expected, field)))
    assert.equal(row.truth.labelsFromProviderOutput, false)
    assert.equal(row.truth.reviewer, 'CODEX_AGENT_SEMANTIC_REVIEW_NOT_HUMAN_FINAL')
    assert.equal(row.truth.expected.missingAloneMustNotTriggerLuna, true)
  }
  assert.equal(new Set(dataset.records.map(row => row.id)).size, 80)
  assert.equal(new Set(dataset.records.map(row => row.modelInput.query.normalize('NFC').trim().toLocaleLowerCase('hi'))).size, 80)
})

test('every location, correction, stop and alternative owns exact original UTF-16 source text', () => {
  for (const row of dataset.records) {
    const expected = row.truth.expected
    for (const key of ['pickupSpans', 'dropSpans', 'locationSearchSpans', 'stops', 'destinationAlternatives', 'supersededLocationSpans']) {
      for (const span of expected[key]) {
        assert.ok(span.start >= 0 && span.end > span.start && span.end <= row.modelInput.query.length)
        assert.equal(row.modelInput.query.slice(span.start, span.end), span.exactText)
      }
    }
  }
  assert.ok(dataset.records.some(row => row.modelInput.query.includes('clinc') && row.truth.expected.dropSpans[0]?.exactText === 'clinc'))
})

test('Hindi and Romanized time semantics preserve PM default, daypart and approximation', () => {
  const seed = dataset.records.find(row => row.originId === 'exploratory-001').truth.expected
  assert.equal(seed.relativeDate, 'TOMORROW')
  assert.equal(seed.time.sourcePeriod, null)
  assert.equal(seed.time.effectivePeriod, 'PM')
  const morning = dataset.records.find(row => row.id === 'hh-v1-added-001').truth.expected
  assert.equal(morning.time.effectivePeriod, 'AM')
  const fractional = dataset.records.find(row => row.id === 'hh-v1-added-010').truth.expected
  assert.equal(fractional.time.minute, 30)
  assert.equal(fractional.time.precision, 'APPROXIMATE')
  for (const row of dataset.records.filter(row => row.truth.expected.time.kind === 'DAYPART')) {
    assert.equal(row.truth.expected.time.exactClockMustRemainUnspecified, true)
    assert.ok(row.truth.expected.formResolutionRequirements.includes('EXACT_TIME_REQUIRED'))
  }
})

test('negation, corrected destinations and unresolved alternatives are not flattened', () => {
  const negated = dataset.records.find(row => row.originId === 'exploratory-017').truth.expected
  assert.deepEqual(negated.dropSpans, [])
  assert.equal(negated.supersededLocationSpans[0].start, 12)
  const correction = dataset.records.find(row => row.id === 'hh-v1-added-032').truth.expected
  assert.equal(correction.dropSpans[0].exactText, 'beta 1')
  assert.equal(correction.supersededLocationSpans[0].exactText, 'alpha 2')
  const vehicle = dataset.records.find(row => row.id === 'hh-v1-added-033').truth.expected
  assert.equal(vehicle.vehicle.strength, 'PREFERRED')
  assert.deepEqual(vehicle.vehicleExclusions, ['suv', 'suv_premium'])
  const alternatives = dataset.records.find(row => row.id === 'hh-v1-added-039').truth.expected
  assert.deepEqual(alternatives.dropSpans, [])
  assert.equal(alternatives.destinationAlternatives.length, 2)
  assert.equal(alternatives.time.state, 'AMBIGUOUS')
})

test('unsupported and planned journeys require resolution without implementing multi-stop', () => {
  for (const row of dataset.records.filter(row => row.truth.expected.plannedFeatureIntent.includes('MULTI_STOP'))) {
    assert.ok(row.truth.expected.unsupportedRequests.includes('STOP'))
    assert.ok(row.truth.expected.formResolutionRequirements.includes('RESOLVE_UNSUPPORTED_STOP'))
  }
  const ac = dataset.records.find(row => row.id === 'hh-v1-added-040').truth.expected
  assert.ok(ac.unsupportedRequests.includes('AC_PREFERENCE'))
  assert.ok(ac.unsupportedRequests.includes('CONDITIONAL_PREFERENCE'))
  assert.ok(ac.unsupportedRequests.includes('PASSENGER_COUNT'))
  assert.ok(!ac.formResolutionRequirements.includes('RESOLVE_UNSUPPORTED_AC_PREFERENCE'))
  assert.ok(!ac.formResolutionRequirements.includes('RESOLVE_UNSUPPORTED_PASSENGER_COUNT'))
})

test('past THIS weekday and explicit timezone preserve policy instead of inventing a valid schedule', () => {
  const past = dataset.records.find(row => row.id === 'hh-v1-added-011').truth.expected
  assert.equal(past.date.interpretedDate, '2026-10-02')
  assert.ok(past.formResolutionRequirements.includes('DATE_SCHEDULING_INVALID'))
  const timezone = dataset.records.find(row => row.id === 'hh-v1-added-037').truth.expected
  assert.equal(timezone.timeZone.sourceZone, 'Europe/London')
  assert.equal(timezone.timeZone.interpretedIST, '2026-10-05T22:30:00+05:30')
  assert.equal(dataset.baselineArchitecture, 'RAW_ORIGINAL_QUERY_CURRENT_JEV_PLUS_ELIGIBLE_LUNA_NO_TRANSLATION_NO_NORMALIZATION')
})

test('label builder rejects execution/selective arguments and reproduces unchanged freeze', async () => {
  await assert.rejects(execute(process.execPath, ['scripts/freeze-search-language-robustness.mjs', '--score'], { cwd: backend, timeout: 10_000 }))
  await execute(process.execPath, ['scripts/freeze-search-language-robustness.mjs'], { cwd: backend, timeout: 10_000 })
  assert.deepEqual(await load('docs/search/hindi-hinglish-robustness-v1/dataset.json'), dataset)
})
