import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { developmentToolAuditPacket, toolAuditReviewSchema } from '../benchmarks/search/toolAudit.js'
import { SEARCH_LIMITS, bookingDraftSchema, parseInputSchema, locationCandidateSchema } from '../services/search/contracts.ts'
import { LUNA_MODEL, LUNA_SCHEMA_VERSION, lunaOutputSchema } from '../services/search/complex/contracts.ts'
import { trustedLocationSchema } from '../services/search/locations/grounding.ts'

const root = new URL('../../docs/search/s6-development/', import.meta.url)
assert.equal(process.argv.length, 2, 'Offline package preparation accepts no execution arguments')
const packet = JSON.parse(await readFile(new URL('verifier-input.json', root), 'utf8'))
assert.deepEqual(developmentToolAuditPacket(packet.traces), packet)
const engineering = JSON.parse(await readFile(new URL('engineering-review.json', root), 'utf8'))
const deferred = engineering.findings.find(finding => finding.id === 'ENG-6')
Object.assign(deferred, { risk: 'LOW', decision: 'DEFER_WITH_JUSTIFICATION',
  rationale: 'Strict SDK validation rejects invalid responses; no schema tolerance, location invention, booking or consequence bypass. Failed attempts remain measured. This intermittent unavailable parse affects availability, not silent interpretation. Full live development must include provider failures before interpretation signoff.',
  blocksInterpretationFreezeIfSystematic: true, noEffectOnHeldOutLabels: true })
const contracts = [
  ['jev_decisions', 'services/search/provider.ts', 'Bounded original-query routing/extraction; choices from supplied IDs only. Noul remains diagnostic.', 'DecisionBatch; strict response/error taxonomy; no executable model tools.'],
  ['luna_interpretation', 'services/search/complex/luna.ts', 'One eligible fallback; original query, candidates and trusted partial draft; missing data remains missing.', 'Strict LunaOutput with shared draft; unsupported intent preserved; no Places or booking access.'],
  ['places_autocomplete', 'services/search/locations/places.ts', 'Application-owned exact candidate search with session token.', 'Offered place IDs/display strings; no match/failure never creates geography.'],
  ['places_details', 'services/search/locations/grounding.ts', 'Explicit offered selection only; canonical-ID mismatch forces reselection.', 'Authoritative trusted place/coordinates or structured failure; no first-result assumption.'],
  ['candidate_generation', 'services/search/locations/candidates.ts', 'Conservative v4 deterministic spans, bounded alternatives and stable query/version identity.', 'LocationCandidate[] plus limitation issues; no semantic model or translation.'],
  ['candidate_provenance', 'services/search/provenance.ts', 'Validate query ownership, revision and exact UTF-16 spans.', 'Invalid provenance fails closed.'],
  ['temporal_resolution', 'services/search/temporal.ts', 'Controlled clock; frozen PM/calendar policy; strict schedule bounds.', 'Resolved instant or explicit form requirements; no invented daypart clock.'],
  ['timezone_conversion', 'services/search/timezonePolicy.ts', 'Mask trusted location-owned tokens; explicit zone aliases/IANA only.', 'Temporal disambiguation rejects DST folds/gaps; unresolved zone stays unresolved.'],
  ['draft_merging', 'services/search/locations/session.ts', 'Explicit field edits preserve original immutable snapshots and user corrections.', 'New form revision/provenance; dependent state invalidated.'],
  ['booking_validation', 'services/search/validation.ts', 'Deterministic supported-field, direction, candidate and missing-field validation.', 'Structured issues; missing is distinct from ambiguity.'],
  ['form_readiness', 'services/search/locations/formResolution.ts', 'One-shot interpretation then deterministic form resolution; no AI conversation.', 'Independent grounding/quote/route/confirmation gates; a ready draft never submits itself.'],
  ['booking_payment_dispatch', 'tests/rideSearchS4Architecture.test.js', 'Prohibited: interpretation cannot create booking, charge or assign.', 'Architecture assertions only; never a Search capability.'],
]
const inventory = []
for (const [id, file, inputBoundary, outputBoundary] of contracts) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  inventory.push({ id, file: `backend/${file}`, sourceHash: createHash('sha256').update(source).digest('hex'), inputBoundary, outputBoundary })
}
const packageData = { version: 'search-s6-development-verifier-package-v1', scope: 'DEVELOPMENT_ONLY',
  datasetLabelsIncluded: false, heldOutIncluded: false, providerCredentialsIncluded: false,
  executionContractFrozen: false, packet, capabilityContracts: inventory,
  schemaIdentifiers: { draft: 'ride-search-draft-v1', luna: LUNA_SCHEMA_VERSION, model: LUNA_MODEL, limits: SEARCH_LIMITS },
  schemas: Object.fromEntries(Object.entries({ bookingDraft: bookingDraftSchema, parseInput: parseInputSchema,
    locationCandidate: locationCandidateSchema, lunaOutput: lunaOutputSchema, trustedLocation: trustedLocationSchema })
    .map(([name, schema]) => [name, z.toJSONSchema(schema)])),
  schemaLimitations: ['JSON Schema preserves structural constraints. Context-dependent source ownership, exact query spans, role consistency, shared scheduling bounds and immutable history still require the recorded deterministic validators.'],
  engineering, instructions: 'Advisory development audit only. Evaluate the recorded contracts and traces for boundary, schema, recovery, efficiency and safety defects. Cite only registered capability and development trace IDs. Do not execute anything, request hidden reasoning, access held-out labels, add tools for their own sake, change product policy or enable rollout. Missing live data is a limitation, never a passing inference.',
  reviewerOutputSchemaPrepared: true, verifierExecuted: false, verifierStatus: 'BLOCKED_PROVIDER_SERVER_RETRY_WINDOW' }
packageData.metricBoundaries = {
  rawProviderQuality: 'Retain original categorical decisions and SDK failures. Wrong roles, unsupported values and inconsistent routing remain provider-quality failures even when caught.',
  intermediateValidatedInterpretation: 'Diagnostic drafts can contain literal source candidates in incorrect roles. Schema/provenance validity alone does not establish accepted interpretation or application adoption.',
  finalApplicationSafeOutput: 'Check parser fallback, grounding eligibility, S4 adoption, explicit selection, canonical-ID validation and submission separately. Blocked failures remain pending, never correct completed executions.',
  fields: ['locations', 'conflicting times', 'conflicting vehicles', 'unsupported intent', 'role reversal', 'missing fields', 'exact candidate spans'],
  fullSystemSignoffRequiresCompleteDevelopment: true,
}
const temporalDependency = await readFile(new URL('../services/search/locations/temporalSuffix.ts', import.meta.url), 'utf8')
packageData.candidateGenerationDependency = { file: 'backend/services/search/locations/temporalSuffix.ts',
  sourceHash: createHash('sha256').update(temporalDependency).digest('hex'),
  purpose: 'Reuse existing date/time lexers to keep explicit on-date and linked-clock suffixes out of geography; local lexer references never enter the draft.' }
packageData.additionalSourceDependencies = []
for (const [file, purpose] of [
  ['services/search/locations/requestPrefix.ts', 'Clip only leading courtesy/request spans without rewriting original UTF-16 provenance.'],
  ['services/search/locations/bookingTail.ts', 'Keep closed explicit passenger/flag clauses outside geography; unknown trailing words remain unresolved.'],
  ['services/search/questions.ts', 'Provider-independent bounded question contracts; numbered location names and unrelated information remain distinct.'],
  ['services/search/extractor.ts', 'Source-bound vehicle strength and exclusions reject invented or silently softened preferences.'],
  ['services/search/vehiclePolicy.ts', 'Literal positive ANY requests retain exact source references; negated or competing requests remain on the bounded decision path.'],
]) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  packageData.additionalSourceDependencies.push({ file: `backend/${file}`, purpose,
    sourceHash: createHash('sha256').update(source).digest('hex') })
}
// Construct the actual strict schema before claiming package readiness.
assert.equal(toolAuditReviewSchema(packet).safeParse({ inventoryVersion: packet.inventoryVersion,
  inputPacketHash: packet.inputPacketHash, modelCallableToolsRequired: false, findings: [], limitations: ['Provider unavailable'] }).success, true)
const content = JSON.stringify(packageData)
packageData.packageHash = createHash('sha256').update(content).digest('hex')
await writeFile(new URL('engineering-review.json', root), JSON.stringify(engineering, null, 2) + '\n')
await writeFile(new URL('verifier-package.json', root), JSON.stringify(packageData, null, 2) + '\n')
console.log(JSON.stringify({ packageReady: true, traces: packet.traces.length, capabilities: inventory.length,
  packageHash: packageData.packageHash, deferredRisk: deferred.risk, verifierExecuted: false }))
