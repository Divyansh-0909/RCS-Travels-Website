import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { explicitTemporalSuffixBoundary } from '../services/search/locations/temporalSuffix.ts'
import { bookingTailStart } from '../services/search/locations/bookingTail.ts'
import { extractSimple } from '../services/search/extractor.ts'
import { collectObservations } from '../services/search/observations.ts'
import { emptyDraft } from '../services/search/contracts.ts'
import * as vehiclePolicy from '../services/search/vehiclePolicy.ts'

const root = new URL('../../output/search-s5-authorized-development/', import.meta.url)
const ledger = JSON.parse(await readFile(new URL('reviewed-equivalence-dispositions.json', root), 'utf8'))
const registry = JSON.parse(await readFile(new URL('mutation-reconciliation.json', root), 'utf8'))
const reports = []
for (const { name } of registry.reportCounts) {
  try { reports.push(JSON.parse(await readFile(new URL(`../coverage/${name}`, import.meta.url), 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const digest = text => createHash('sha256').update(text).digest('hex')
const offset = (source, point) => source.split('\n').slice(0, point.line - 1).reduce((n, line) => n + line.length + 1, 0) + point.column - 1
const fragment = (source, location) => source.slice(offset(source, location.start), offset(source, location.end))
const scope = (source, location) => [...source.slice(0, offset(source, location.start)).matchAll(/(?:export )?function (\w+)(?:<[^>]*>)?\(/g)].at(-1)?.[1]
const inputs = JSON.parse(await readFile(new URL('development-inputs.json', root), 'utf8'))
const corpus = inputs.map(row => ({ id: row.providerQueryId, revision: row.queryRevision, text: row.modelInput.query }))
for (const gap of [' ', '  ', '\t', ' \t ']) {
  for (const route of [
    'from Campus to Airport', 'pickup: Campus; destination: Airport',
    'Airport tomorrow at 7 PM UTC jaana hai Campus se', 'Campus se Airport',
    'Campus near Gate 3 to Airport on tomorrow at 6 PM and at 8 PM',
    'from Campus to Airport, no sedan', 'Campus to Airport on Friday at 7 PM',
    'from Museum 5 December Gallery to Evening Garden', 'pickup: Campus via Airport',
  ]) corpus.push({ id: 'grammar-probe', revision: 0, text: gap + route.replaceAll(' ', gap) + gap })
}
const helperTexts = corpus.map(query => query.text).concat([
  'Garden on Museum 5 December at 7 PM', 'Evening Gallery at 6 PM and at 8 PM',
  'Garden on tomorrow at 6 PM', 'Garden on Friday at 6 PM',
  'Garden 2026-10-05T18:00', 'Garden 5 December7 PM', 'Garden tomorrow7 PM',
  'Airport for  12  people', 'sharing Airport for 3 people', '12 people Airport for 3 people',
  'Airport tomorrow at 6 PM for 3 people, sharing local safe route carrier',
  '  Airport tomorrow at 6 PM for 3 people', 'Airport tomorrow Museum for 3 people',
  'Airport tomorrow   for 3 people', 'no luggage carrier Airport for 3 people X',
  'Airport, carrier needed, roof carrier required', 'Airport, carrier \t needed',
  'Airport,sharing', 'Airport,   sharing', 'carrier required Airport, solo X',
  'Airport, carrier X carrier needed', 'Airport, 3 people sharing',
])
const additions = []
const probes = []
const unreviewed = []
function extractionWitness(module, text) {
  const draft = emptyDraft({ id: 'equivalence-extraction', revision: 1, text })
  const observations = collectObservations(draft.query, [])
  const choices = { pickup_candidate: 'NONE_OR_UNCLEAR', drop_candidate: 'NONE_OR_UNCLEAR',
    vehicle_class: observations.vehicles[0]?.value ?? 'NOT_MENTIONED', vehicle_strength: observations.vehicles.length ? 'REQUIRED' : 'NOT_APPLICABLE',
    vehicle_any: observations.anyVehicle.length ? 'EXPLICIT_ANY' : 'NOT_STATED', timing_mode: 'UNSPECIFIED',
    date_expression: observations.dates[0]?.id ?? 'NONE', time_expression: observations.times[0]?.id ?? 'NONE',
    passenger_candidate: observations.passengers[0]?.id ?? 'NONE', unsupported_service: 'NONE' }
  for (const value of ['hatchback', 'sedan', 'suv', 'suv_premium']) choices[`exclude_${value}`] = 'NOT_EXCLUDED'
  for (const flag of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'])
    choices[flag] = observations.flags[flag][0]?.value ? 'YES' : 'NO'
  const batch = { choices: Object.fromEntries(Object.entries(choices).map(([name, choice]) => [name, { choice, confidence: 0.9 }])) }
  const issues = []
  try { module.extractSimple(draft, batch, observations, issues); return JSON.stringify({ draft, issues }) }
  catch (error) { return JSON.stringify({ error: error.code, draft, issues }) }
}
function vehicleWitness(module, text) {
  const draft = emptyDraft({ id: 'equivalence-vehicle', revision: 1, text })
  const observations = collectObservations(draft.query, [])
  const excluded = module.statedVehicleExclusions(draft, observations.vehicles)
  const positive = observations.vehicles.filter(candidate => !module.excludedMention(draft, candidate))
  const refs = [...observations.vehicles.map(candidate => candidate.ref), ...observations.anyVehicle]
  const issues = []
  return JSON.stringify({ excluded, positive,
    statedAny: module.statedAnyAcceptance(draft, observations.anyVehicle),
    sourceAny: module.sourceOnlyAnyPreference(draft, observations.vehicles, observations.anyVehicle),
    exclusionOnly: module.exclusionOnlyPreference(excluded, positive.length > 0, refs, issues), issues })
}
for (const entry of registry.entries.filter(row => row.status === 'PENDING_MEANINGFUL_REVIEW')) {
  const source = await readFile(new URL(`../${entry.file}`, import.meta.url), 'utf8')
  assert.equal(digest(source), entry.sourceHash)
  const currentDetail = reports.map(report => report.files[entry.file]).find(detail => detail && digest(detail.source) === entry.sourceHash)
  assert.ok(currentDetail, 'A current full-file mutation report is required')
  const matches = ledger.entries.filter(proof => {
    if (proof.file !== entry.file || proof.mutator !== entry.mutator || proof.replacement !== entry.replacement) return false
    const oldSource = reports.map(report => report.files[entry.file]?.source)
      .find(text => text !== undefined && digest(text) === proof.sourceHash)
    return oldSource !== undefined && fragment(oldSource, proof.location) === fragment(source, entry.location)
      && scope(oldSource, proof.location) === scope(source, entry.location)
  })
  let rationale
  if (matches.length > 0 && new Set(matches.map(proof => proof.rationale)).size === 1) rationale = matches[0].rationale
  else if (scope(source, entry.location) === 'withoutSuffix' && fragment(source, entry.location) === 'phraseEnd - start'
    && entry.replacement === 'phraseEnd + start')
    rationale = 'Each mutation enlarges one Math.min default from phraseEnd-start to phraseEnd+start. If both detectors are absent, the unchanged other default still bounds the result at phraseEnd-start. If the other detector exists, its offset is within the admitted phrase and is no larger than phraseEnd-start. Nonnegative start therefore makes the enlarged default unobservable. This is a single-mutant proof, not a claim about changing both defaults.'
  else if ((entry.file.endsWith('temporalSuffix.ts') || entry.file.endsWith('bookingTail.ts')) && entry.mutator === 'StringLiteral'
    && ["'candidate-temporal-view'", "'candidate-booking-tail-view'"].includes(fragment(source, entry.location)))
    rationale = 'The local lexer query ID is never returned or used in candidate identity or decisions. Only numeric offsets are consumed; all public references are built later against the original query. Changing this internal ID does not change observable output.'
  else if ((entry.file.endsWith('temporalSuffix.ts') || entry.file.endsWith('bookingTail.ts')) && entry.mutator === 'ArrayDeclaration'
    && fragment(source, entry.location) === '[]')
    rationale = 'The string placeholder has undefined start/end; lexer masking requires numeric comparisons to both. Neither comparison can be true, so this placeholder masks no tokens, exactly like the empty array. No placeholder is returned.'
  else if (entry.file.endsWith('temporalSuffix.ts') && entry.mutator === 'EqualityOperator'
    && fragment(source, entry.location) === 'observed.ref.end <= first.ref.start'
    && entry.replacement === 'observed.ref.end < first.ref.start')
    rationale = 'Recognized dates and clocks cannot be adjacent with date.end===clock.start: date endings and clock beginnings are word characters requiring a word boundary. A separating character creates a positive gap; contiguous forms fail one lexer. The <= to < mutation therefore leaves every admitted date/clock pair unchanged.'
  else if (entry.file.endsWith('candidates.ts') && scope(source, entry.location) === 'addSimpleToCandidates'
    && entry.mutator === 'MethodExpression' && entry.replacement === 'text.slice(start, withoutSuffix(text, start, originEnd))')
    rationale = 'The admitted whole-route capture is trimmed by the grammar and prefix start before slicing. withoutSuffix ends before delimiter/temporal separator whitespace, or retains the unchanged already-trimmed capture end. The resulting substring has no leading or trailing whitespace, so this trim is redundant. No trimStart/trimEnd substitution is waived.'
  else if (entry.file.endsWith('bookingTail.ts') && entry.replacement === 'field.ref.start <= marker.index')
    rationale = 'The marker starts at the word for. Passenger references start at its following number; supported flag references start at sharing/solo/local/outstation/route/carrier words or their negators, none of which is for. No admitted reference can start exactly at the marker, so < and <= skip precisely the same references.'
  else if (entry.file.endsWith('bookingTail.ts') && scope(source, entry.location) === 'closedTail'
    && ['field.ref.start <= start', 'carrier.ref.start <= start'].includes(entry.replacement))
    rationale = 'The private closedTail start is either the word for before the passenger number, or the comma/semicolon before the first flag. Passenger/flag/carrier references cannot start at for or punctuation. Equality at start is unreachable in every caller; < and <= therefore skip the same earlier references.'
  else if (entry.file.endsWith('temporalSuffix.ts') && fragment(source, entry.location) === 'bookingTail !== undefined'
    && entry.replacement === 'true')
    rationale = 'When bookingTail is undefined, slice(0, undefined) preserves the entire string and trimEnd removes only trailing whitespace. Date/clock recognition and all returned numeric starts remain unchanged; suffix checks already discard trailing whitespace. When the tail exists, the original branch already runs. Leading whitespace is preserved in both paths.'
  else if (entry.file.endsWith('temporalSuffix.ts') && entry.replacement === 'text.slice(observed.ref.end)')
    rationale = 'This trailing-date predicate is reached only after a closed booking tail has caused text to be trimmed at its end. A date has a word-character ending; its suffix is either empty or contains a non-whitespace character because the text has no trailing whitespace. Removing trim cannot change emptiness. This does not waive changing trimEnd to trimStart.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'answer'
    && entry.replacement === 'false' && fragment(source, entry.location) === 'value === undefined')
    rationale = 'Allowed choices are strings. Undefined cannot be included in the allowed string list, so !allowed.includes(value) is true whenever value is undefined. Removing this earlier undefined check leaves the same recoverable exception for every admitted finite-answer input.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'extractVehicle'
    && ((entry.replacement === 'false' && fragment(source, entry.location) === "strength === 'NOT_APPLICABLE'")
      || (entry.replacement === '""' && fragment(source, entry.location) === "'NOT_APPLICABLE'")))
    rationale = 'An absent selected class still fails the unchanged positive-membership guard. A present selected class reaches statedStrength, which returns only REQUIRED or PREFERRED; NOT_APPLICABLE differs from either and the unchanged mismatch guard throws the same JEV_INVALID_RESPONSE without changing draft or issues.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'preserveUnsupported'
    && ((entry.replacement === 'false' && fragment(source, entry.location) === "selected === 'UNCLEAR'")
      || (entry.replacement === '""' && fragment(source, entry.location) === "'UNCLEAR'")
      || (entry.replacement === '{}' && fragment(source, entry.location).includes("issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', 'unsupportedRequests', 'AMBIGUOUS'))"))))
    rationale = 'UNCLEAR is a finite provider choice but not an admissible unsupported-request kind. Without this early branch it reaches the existing unmatched-kind branch, where UNCLEAR differs from OTHER and emits the exact same binding issue before returning. Draft contents and issue order remain identical.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'selectObserved'
    && entry.replacement === 'true' && fragment(source, entry.location) === 'value.id === selected')
    rationale = 'The preceding finite-answer membership check excludes NONE/UNCLEAR, and the ambiguity guard returns for more than one candidate. A reachable find has exactly one candidate with the selected ID; predicate true selects that same candidate.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'extractVehicle'
    && entry.replacement === 'true' && fragment(source, entry.location) === 'candidate.value === selected')
    rationale = 'The conflict guard returns for more than one distinct positive class, and the membership guard rejects a selected class absent from positive mentions. At this find every positive mention has the selected class; true still selects the first matching mention, including repeated mentions with distinct strength wording.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'extractFlag'
    && entry.replacement === 'candidates.every(candidate => candidate.value === value)')
    rationale = 'Empty candidates return before selection, and mixed boolean values return ambiguous before binding. Reachable candidates are nonempty and all have the same boolean value, so some and every agree for both selected values.'
  else if (entry.file.endsWith('vehiclePolicy.ts') && scope(source, entry.location) === 'sourceOnlyAnyPreference'
    && entry.replacement === 'true' && fragment(source, entry.location) === "ref.kind === 'QUERY_SPAN'")
    rationale = 'The preceding statedAnyAcceptance guard requires nonempty references and every reference kind QUERY_SPAN. The later explicit phrase predicate can only receive QUERY_SPAN references, so replacing its repeated kind check with true preserves every admitted result.'
  else if (entry.file.endsWith('vehiclePolicy.ts') && scope(source, entry.location) === 'statedAnyAcceptance'
    && entry.replacement === "/\\b(?:no|not|except|without|don't|do\\snot)\\s*$/i")
    rationale = 'The changed do-not alternative admits only one separating whitespace, but every removed multi-whitespace do-not phrase is still matched by the unchanged word-boundary not alternative. The terminal not is a separate word after whitespace. No new match is introduced by shortening the separator.'
  else if (entry.file.endsWith('extractor.ts') && scope(source, entry.location) === 'unsupportedRequests'
    && entry.replacement === 'true' && fragment(source, entry.location) === "request.ref.kind === 'QUERY_SPAN'")
    rationale = 'QUERY_SPAN references pass this check unchanged. The other strict SourceRef variant USER_FIELD has no start/end properties; numeric comparisons to undefined are false. Removing the kind check therefore still excludes every candidate for a USER_FIELD reference. Invalid extra start/end properties are rejected by the strict shared reference schema.'
  else if (entry.witnesses.some(witness => witness.status === 'Timeout')) {
    additions.push({ ...entry, disposition: 'NON_ACTIONABLE', rationale: 'Removing the whole-route leading regex anchor triggers the bounded resource witness and is detected as a mutation-test timeout. This is a caught resource failure, not a passing semantic survivor or an application timeout.' })
    continue
  } else if (!entry.key.startsWith('0d2c5d59c335')) { unreviewed.push(entry.key); continue }

  const target = new URL(`../${entry.file.replace(/\.ts$/, '.equivalence-probe.ts')}`, import.meta.url)
  const backendRoot = fileURLToPath(new URL('../', import.meta.url))
  assert.ok(fileURLToPath(target).startsWith(backendRoot))
  const mutated = source.slice(0, offset(source, entry.location.start)) + entry.replacement + source.slice(offset(source, entry.location.end))
  let differences = 0
  let comparisons = 0
  try {
    await writeFile(target, mutated)
    const module = await import(`${pathToFileURL(fileURLToPath(target)).href}?mutation=${entry.key}`)
    if (entry.file.endsWith('candidates.ts')) {
      for (const query of corpus) for (const type of ['BOOKING_REQUEST', 'LOCATION_SEARCH', 'UNCLEAR_OR_UNRELATED']) {
        comparisons += 1
        if (JSON.stringify(module.generateLocationCandidates(query, type)) !== JSON.stringify(generateLocationCandidates(query, type))) differences += 1
      }
    } else if (entry.file.endsWith('vehiclePolicy.ts')) {
      for (const text of helperTexts.concat(['any car', 'any  cab', 'ANY vehicle', 'anything', 'anything except sedan',
        'no any car', 'not any cab', 'without any vehicle', 'do  not any car', 'piano any car', 'knot any cab'])) {
        comparisons += 1
        if (vehicleWitness(module, text) !== vehicleWitness(vehiclePolicy, text)) differences += 1
      }
    } else if (entry.file.endsWith('extractor.ts')) {
      for (const text of helperTexts.concat(['prefer sedan, sedan only', 'sedan, prefer sedan', 'shared and shared', 'not shared and no sharing'])) {
        comparisons += 1
        if (extractionWitness(module, text) !== extractionWitness({ extractSimple }, text)) differences += 1
      }
    } else for (const text of helperTexts) {
      comparisons += 1
      const method = entry.file.endsWith('bookingTail.ts') ? 'bookingTailStart' : 'explicitTemporalSuffixBoundary'
      const expected = method === 'bookingTailStart' ? bookingTailStart(text) : explicitTemporalSuffixBoundary(text)
      if (module[method](text) !== expected) differences += 1
    }
  } finally { await unlink(target) }
  probes.push({ key: entry.key, comparisons, differences, inputs: 'Development inputs and bounded grammar witnesses only; no held-out or provider output' })
  if (rationale) {
    if (differences !== 0) { unreviewed.push(entry.key); continue }
    additions.push({ ...entry, disposition: 'EQUIVALENT', rationale,
      proofScope: 'Current source hash and public output. Differential probe supports the semantic argument; it is not exhaustive proof or a mutation kill.',
      predecessorProof: matches.length > 0 ? matches[0].key : undefined })
  } else assert.ok(differences > 0, 'The span-shifting mutation must remain actionable')
}
ledger.entries.push(...additions.filter(entry => !ledger.entries.some(old => old.key === entry.key)))
await writeFile(new URL('reviewed-equivalence-dispositions.json', root), JSON.stringify(ledger, null, 2) + '\n')
await writeFile(new URL('current-equivalence-probes.json', root), JSON.stringify({ sourceBound: true, proofsAdded: additions.length, probes, unreviewed }, null, 2) + '\n')
console.log(JSON.stringify({ proofsAdded: additions.length, predecessors: additions.filter(entry => entry.predecessorProof).length,
  comparisons: probes.reduce((total, probe) => total + probe.comparisons, 0), actionableCounterexamples: probes.filter(probe => probe.differences > 0).length, unreviewed: unreviewed.length }))
