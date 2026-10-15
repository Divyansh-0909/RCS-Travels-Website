import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { SEARCH_LIMITS, bookingDraftSchema, locationCandidateSchema, parseInputSchema, querySchema } from '../contracts.ts'
import {
  ComplexProviderError,
  LUNA_MODEL,
  LUNA_SCHEMA_VERSION,
  LUNA_TIMEOUT_MS,
  lunaOutputSchema,
  type ComplexBookingInterpreter,
  type ComplexInterpretation,
  type ComplexInterpretationInput,
  type LunaOutput,
} from './contracts.ts'

type LunaResponse = {
  output_parsed?: LunaOutput | null
  model?: string
  usage?: { input_tokens?: number; output_tokens?: number } | null
  output?: Array<{ type?: string; content?: Array<{ type?: string }> }>
}

type LunaRequest = {
  model: typeof LUNA_MODEL
  max_output_tokens: number
  instructions: string
  input: string
  reasoning: { effort: 'low' }
  text: { format: ReturnType<typeof zodTextFormat<typeof lunaOutputSchema>> }
}

export interface LunaTransport {
  parse(request: LunaRequest, options: { signal: AbortSignal }): Promise<LunaResponse>
}

type LunaClock = { now(): number }
export type LunaInterpreterOptions = { transport?: LunaTransport; clock?: LunaClock; timeoutMs?: number }

const inputSchema = z.strictObject({
  query: querySchema,
  candidates: z.array(locationCandidateSchema).max(SEARCH_LIMITS.candidates),
  partialDraft: bookingDraftSchema.nullable(),
  fallbackReasons: z.array(z.string().min(1)).max(24),
  now: z.string().min(1),
  timeZone: z.string().min(1),
  trustedFields: z.array(z.strictObject({ field: z.string().min(1), value: z.object({}).passthrough() })).max(24),
})

const instructions = `Interpret a complex ride-search request using only the supplied context. Return the strict schema.
The source query is authoritative: every source span uses UTF-16 offsets and exactText must equal its exact slice. Reuse supplied candidate IDs whenever possible; locations are only new source spans and never geography, addresses, coordinates, place IDs, or fares.
Do not invent missing fields, date years, passenger counts, time components, locations, service capability, or corrections. Preserve source date components; application code owns omitted-year, weekday and timezone arithmetic. Bare H12 defaults to PM; explicit periods override it. Generic not SUV excludes suv and suv_premium; subtype exclusions remain specific. Missing fields remain UNSPECIFIED and genuine uncertainty remains AMBIGUOUS. Preserve all conflicting time/destination alternatives without selecting one; explicit destination corrections supersede earlier clauses. Preserve stops as PLANNED_PRODUCT_FEATURE and do not flatten journeys. Contextual trusted form state is evidence only; never create USER_FIELD provenance. Return one interpretation for form resolution, never conversational clarification or a booking.`
const LUNA_MAX_OUTPUT_TOKENS = 4_096

function candidateIds(input: ComplexInterpretationInput): Set<string> {
  return new Set(input.candidates.map((candidate) => candidate.candidateId))
}

function isSplitSurrogate(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset])
}

function hasUserField(value: object): boolean {
  const serialized = JSON.stringify(value)
  return serialized.includes('"USER_FIELD"') || serialized.includes('"USER_SELECTION"')
}

function validLocationField(value: LunaOutput['draft']['pickup'], ids: Set<string>): boolean {
  if (value.state === 'UNSPECIFIED') return true
  const locations = value.state === 'RESOLVED' ? [value.value] : value.alternatives
  return locations.every((location) => location.kind !== 'QUERY_CANDIDATE' || ids.has(location.candidateId))
}

function validEvidence(value: object, input: ComplexInterpretationInput, ids: Set<string>): boolean {
  if (Array.isArray(value)) return value.every((item) => typeof item !== 'object' || item === null || validEvidence(item, input, ids))
  const record = value as Record<string, object | string | number | boolean | null>
  if (record.kind === 'QUERY_SPAN') {
    return record.queryId === input.query.id && record.revision === input.query.revision
      && typeof record.start === 'number' && typeof record.end === 'number'
      && Number.isInteger(record.start) && Number.isInteger(record.end) && record.start >= 0 && record.end > record.start
      && record.end <= input.query.text.length && !isSplitSurrogate(input.query.text, record.start) && !isSplitSurrogate(input.query.text, record.end)
  }
  return Object.values(record).every((item) => typeof item !== 'object' || item === null || validEvidence(item, input, ids))
}

function locationKeys(value: LunaOutput['locations'], input: ComplexInterpretationInput): Set<string> {
  const keys = new Set<string>()
  for (const location of value) {
    if (keys.has(location.key) || location.end <= location.start || location.end > input.query.text.length
      || isSplitSurrogate(input.query.text, location.start) || isSplitSurrogate(input.query.text, location.end)
      || input.query.text.slice(location.start, location.end) !== location.exactText) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
    keys.add(location.key)
  }
  return keys
}

function validateOutput(value: LunaOutput, input: ComplexInterpretationInput): LunaOutput {
  const parsed = lunaOutputSchema.safeParse(value)
  if (!parsed.success || JSON.stringify(parsed.data.draft.query) !== JSON.stringify(input.query)) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
  const ids = candidateIds(input)
  for (const key of locationKeys(parsed.data.locations, input)) ids.add(key)
  const draft = parsed.data.draft
  if (hasUserField(draft) || !validLocationField(draft.pickup, ids) || !validLocationField(draft.drop, ids)
    || !validLocationField(draft.locationSearch, ids) || !validEvidence(draft, input, ids)) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
  return parsed.data
}

function tokenCount(value: number | undefined): number | null {
  if (value === undefined) return null
  if (!Number.isInteger(value) || value < 0) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
  return value
}

function isRefusal(response: LunaResponse): boolean {
  return response.output?.some((item) => item.content?.some((content) => content.type === 'refusal')) === true
}

function errorCode(error: Error, timedOut: boolean, cancelled: boolean): ComplexProviderError {
  if (timedOut || /timeout/i.test(error.name)) return new ComplexProviderError('LUNA_TIMEOUT')
  if (cancelled || /abort/i.test(error.name)) return new ComplexProviderError('LUNA_CANCELLED')
  if (/authentication|permission/i.test(error.name)) return new ComplexProviderError('LUNA_AUTH_ERROR')
  return new ComplexProviderError('LUNA_PROVIDER_ERROR')
}

function requestFor(input: ComplexInterpretationInput): LunaRequest {
  const context = JSON.stringify(input)
  if (context.length > SEARCH_LIMITS.providerContext) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
  return { model: LUNA_MODEL, max_output_tokens: LUNA_MAX_OUTPUT_TOKENS, instructions, input: context, reasoning: { effort: 'low' },
    text: { format: zodTextFormat(lunaOutputSchema, LUNA_SCHEMA_VERSION) } }
}

async function parseBounded(transport: LunaTransport, request: LunaRequest, signal: AbortSignal | undefined, timeoutMs: number): Promise<LunaResponse> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const interrupted = new Promise<LunaResponse>((_, reject) => {
    timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('Luna timeout')) }, timeoutMs)
    controller.signal.addEventListener('abort', () => {
      if (!timedOut) reject(new Error('Luna cancelled'))
    }, { once: true })
  })
  try {
    return await Promise.race([transport.parse(request, { signal: controller.signal }), interrupted])
  } catch (error) {
    if (error instanceof Error) throw errorCode(error, timedOut, signal?.aborted === true)
    throw new ComplexProviderError('LUNA_PROVIDER_ERROR')
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

const unavailableInterpreter: ComplexBookingInterpreter = {
  async interpret() { throw new ComplexProviderError('LUNA_CONFIG_ERROR') },
}

export function createLunaInterpreter({ transport, clock = Date, timeoutMs = LUNA_TIMEOUT_MS }: LunaInterpreterOptions = {}): ComplexBookingInterpreter {
  if (!transport) return unavailableInterpreter
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > LUNA_TIMEOUT_MS) throw new ComplexProviderError('LUNA_CONFIG_ERROR')
  return {
    async interpret(input, signal) {
      if (signal?.aborted) throw new ComplexProviderError('LUNA_CANCELLED')
      const validated = inputSchema.safeParse(input)
      if (!validated.success) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
      const partial = validated.data.partialDraft
      if (partial !== null && (JSON.stringify(partial.query) !== JSON.stringify(validated.data.query)
        || !validEvidence(partial, validated.data, candidateIds(validated.data)))) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
      const searchInput = parseInputSchema.safeParse({ query: validated.data.query, candidates: validated.data.candidates,
        timeZone: validated.data.timeZone, ...(validated.data.partialDraft === null ? {} : { formDraft: validated.data.partialDraft }) })
      if (!searchInput.success) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
      const request = requestFor(validated.data)
      const startedAt = clock.now()
      const response = await parseBounded(transport, request, signal, timeoutMs)
      if (response.model !== LUNA_MODEL) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
      if (isRefusal(response)) throw new ComplexProviderError('LUNA_REFUSAL')
      if (!response.output_parsed) throw new ComplexProviderError('LUNA_SCHEMA_ERROR')
      const output = validateOutput(response.output_parsed, validated.data)
      const inputTokens = tokenCount(response.usage?.input_tokens)
      const outputTokens = tokenCount(response.usage?.output_tokens)
      return { output, metadata: { provider: 'openai', model: LUNA_MODEL, schemaVersion: LUNA_SCHEMA_VERSION,
        requestCount: 1, latencyMs: Math.max(0, clock.now() - startedAt), inputTokens, outputTokens } } as ComplexInterpretation
    },
  }
}

export function createProductionLunaInterpreter(): ComplexBookingInterpreter {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return unavailableInterpreter
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: LUNA_TIMEOUT_MS })
  return createLunaInterpreter({ transport: { parse: (request, options) => client.responses.parse(request, options) } })
}
