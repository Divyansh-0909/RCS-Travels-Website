import {
  APITimeoutError,
  AuthenticationError,
  PermissionDeniedError,
  TypeSafeClient,
  VERSION as JEV_SDK_VERSION,
  choice,
  noul,
  type JsonValue,
  type Questions,
  type SystemOneResult,
} from '@typesafe-ai/sdk'
import { systemClock } from '../../lib/clock.js'
import { SEARCH_LIMITS } from './contracts.js'

export type DecisionQuestion =
  | { kind: 'choice'; instructions: string; choices: Record<string, string> }
  | { kind: 'noul'; instructions: string }

export type DecisionRequest = {
  state: string
  questions: Record<string, DecisionQuestion>
}

export type DecisionBatch = {
  choices: Record<string, { choice: string; confidence: number; probabilities?: Record<string, number> }>
  diagnostics: Record<string, number>
  metadata: {
    provider: string
    model: string
    requestCount: number
    latencyMs: number
    questionCount: number
    usage?: { inputTokens?: number; outputTokens?: number }
    sdkVersion?: string
  }
}

export interface SearchDecisionProvider {
  decide(request: DecisionRequest): Promise<DecisionBatch>
}

export type SearchProviderErrorCode =
  | 'JEV_TIMEOUT'
  | 'JEV_PROVIDER_ERROR'
  | 'JEV_INVALID_RESPONSE'
  | 'JEV_SCHEMA_ERROR'
  | 'JEV_AUTH_ERROR'

export class SearchProviderError extends Error {
  readonly code: SearchProviderErrorCode

  constructor(code: SearchProviderErrorCode) {
    super(code === 'JEV_TIMEOUT' ? 'The decision provider timed out.' : 'The decision provider could not complete the request.')
    this.name = 'SearchProviderError'
    this.code = code
  }
}

type SearchClock = { now(): Date }
type SearchSdkClient = Pick<TypeSafeClient, 'systemOne'>

export type JevSearchProviderOptions = {
  client?: SearchSdkClient
  model?: string
  clock?: SearchClock
  timeoutMs?: number
}

const DEFAULT_MODEL = 'jev-latest'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_CHOICE_OPTIONS = 255
const PROBABILITY_SUM_TOLERANCE = 0.000_001

function recordOf(value: object | JsonValue | undefined): Record<string, JsonValue> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null
}

function finiteProbability(value: JsonValue | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 1) return null
  return value
}

function finiteTokenCount(value: JsonValue | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (!Number.isInteger(value) || value < 0) return null
  return value
}

function sameKeys(actual: Record<string, JsonValue>, expected: string[]): boolean {
  const keys = Object.keys(actual)
  return keys.length === expected.length && keys.every(key => expected.includes(key))
}

function validateRequest(request: DecisionRequest): void {
  if (typeof request.state !== 'string' || !recordOf(request.questions)) throw new SearchProviderError('JEV_SCHEMA_ERROR')
  if (request.state.length > SEARCH_LIMITS.providerContext) throw new SearchProviderError('JEV_SCHEMA_ERROR')
  const keys = Object.keys(request.questions)
  if (keys.length === 0 || keys.length > SEARCH_LIMITS.questionsPerBatch || keys.some(key => key.length === 0)) {
    throw new SearchProviderError('JEV_SCHEMA_ERROR')
  }
  for (const question of Object.values(request.questions)) {
    const rawQuestion = recordOf(question)
    if (!rawQuestion || typeof rawQuestion.instructions !== 'string' || rawQuestion.instructions.length === 0) {
      throw new SearchProviderError('JEV_SCHEMA_ERROR')
    }
    if (rawQuestion.kind === 'noul') continue
    const choices = recordOf(rawQuestion.choices)
    if (rawQuestion.kind !== 'choice' || !choices || Object.keys(choices).length === 0 || Object.keys(choices).length > MAX_CHOICE_OPTIONS) {
      throw new SearchProviderError('JEV_SCHEMA_ERROR')
    }
    if (Object.entries(choices).some(([key, value]) => key.length === 0 || typeof value !== 'string')) {
      throw new SearchProviderError('JEV_SCHEMA_ERROR')
    }
  }
}

function toSdkQuestions(questions: Record<string, DecisionQuestion>): Questions {
  return Object.fromEntries(Object.entries(questions).map(([key, question]) => [
    key,
    question.kind === 'choice' ? choice(question.instructions, question.choices) : noul(question.instructions),
  ]))
}

function normalizeChoice(answer: JsonValue, question: Extract<DecisionQuestion, { kind: 'choice' }>): { choice: string; confidence: number; probabilities?: Record<string, number> } {
  const result = recordOf(answer)
  const selected = result && typeof result.choice === 'string' ? result.choice : null
  const confidence = result ? finiteProbability(result.confidence) : null
  const probabilities = result ? recordOf(result.probabilities) : null
  if (!result || result.type !== 'choice' || !selected || !Object.hasOwn(question.choices, selected) || confidence === null || !probabilities) {
    throw new SearchProviderError('JEV_INVALID_RESPONSE')
  }
  if (!sameKeys(probabilities, Object.keys(question.choices))) throw new SearchProviderError('JEV_INVALID_RESPONSE')
  let sum = 0
  const normalized = Object.fromEntries(Object.entries(probabilities).map(([key, value]) => {
    const probability = finiteProbability(value)
    if (probability === null) throw new SearchProviderError('JEV_INVALID_RESPONSE')
    sum += probability
    return [key, probability]
  }))
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) throw new SearchProviderError('JEV_INVALID_RESPONSE')
  return { choice: selected, confidence, probabilities: normalized }
}

function normalizeNoul(answer: JsonValue): number {
  const result = recordOf(answer)
  const probability = result ? finiteProbability(result.noul) : null
  if (!result || result.type !== 'noul' || probability === null) throw new SearchProviderError('JEV_INVALID_RESPONSE')
  return probability
}

function normalizeUsage(value: JsonValue | undefined): DecisionBatch['metadata']['usage'] {
  const usage = recordOf(value)
  if (!usage) return undefined
  const inputTokens = usage.input_tokens === undefined ? undefined : finiteTokenCount(usage.input_tokens)
  const outputTokens = usage.output_tokens === undefined ? undefined : finiteTokenCount(usage.output_tokens)
  if (inputTokens === null || outputTokens === null) throw new SearchProviderError('JEV_INVALID_RESPONSE')
  return inputTokens === undefined && outputTokens === undefined ? undefined : { inputTokens, outputTokens }
}

function normalizeResponse(response: SystemOneResult<Questions>, request: DecisionRequest, latencyMs: number): DecisionBatch {
  const raw = recordOf(response)
  const answers = raw ? recordOf(raw.answers) : null
  if (!raw || !answers || !sameKeys(answers, Object.keys(request.questions)) || typeof raw.model !== 'string' || raw.model.length === 0) {
    throw new SearchProviderError('JEV_INVALID_RESPONSE')
  }
  const choices: DecisionBatch['choices'] = {}
  const diagnostics: DecisionBatch['diagnostics'] = {}
  for (const [key, question] of Object.entries(request.questions)) {
    const answer = answers[key]
    if (question.kind === 'choice') choices[key] = normalizeChoice(answer, question)
    else diagnostics[key] = normalizeNoul(answer)
  }
  const usage = normalizeUsage(raw.usage)
  return {
    choices,
    diagnostics,
    metadata: {
      provider: 'typesafe-ai',
      model: raw.model,
      requestCount: 1,
      latencyMs,
      questionCount: Object.keys(request.questions).length,
      ...(usage === undefined ? {} : { usage }),
      sdkVersion: JEV_SDK_VERSION,
    },
  }
}

export function createJevSearchProvider({
  client,
  model = DEFAULT_MODEL,
  clock = systemClock,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: JevSearchProviderOptions = {}): SearchDecisionProvider {
  if (typeof model !== 'string' || model.length === 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new SearchProviderError('JEV_SCHEMA_ERROR')
  }
  const sdkClient: SearchSdkClient = client ?? new TypeSafeClient({ timeout: timeoutMs, retry: { maxRetries: 0 } })
  return {
    async decide(request) {
      validateRequest(request)
      const startedAt = clock.now().getTime()
      try {
        const response = await sdkClient.systemOne(
          { state: request.state, questions: toSdkQuestions(request.questions), model },
          { timeout: timeoutMs, retry: { maxRetries: 0 } },
        )
        return normalizeResponse(response, request, Math.max(0, clock.now().getTime() - startedAt))
      } catch (error) {
        if (error instanceof SearchProviderError) throw error
        if (error instanceof APITimeoutError) throw new SearchProviderError('JEV_TIMEOUT')
        if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) throw new SearchProviderError('JEV_AUTH_ERROR')
        throw new SearchProviderError('JEV_PROVIDER_ERROR')
      }
    },
  }
}
