import { z } from 'zod'
import { systemClock } from '../../../lib/clock.js'

export type PlaceMatch = { placeId: string; displayText: string }

export type ConfirmedLocation = {
  lat: number
  lng: number
  displayText: string
  confirmedAt: string
  source: 'GOOGLE_PLACES'
  placeId: string
  confirmedByUser: 'selection'
}

export type PlaceSearchErrorCode = 'timeout' | 'quota' | 'config' | 'provider' | 'invalid_result' | 'details'

export class PlaceSearchError extends Error {
  readonly code: PlaceSearchErrorCode

  constructor(code: PlaceSearchErrorCode) {
    super({
      timeout: 'Place search timed out.', quota: 'Place search is temporarily unavailable.',
      config: 'Place search is not configured.', provider: 'Place search could not complete.',
      invalid_result: 'Place search returned an invalid result.', details: 'Place details could not be confirmed.',
    }[code])
    this.name = 'PlaceSearchError'
    this.code = code
  }
}

export class PlaceIdentityRefreshError extends PlaceSearchError {
  constructor(readonly requestedPlaceId: string, readonly replacement: PlaceMatch) { super('details') }
}

export type PlaceSearchMetadata = {
  provider: 'google_places'
  requestCount: number
  autocompleteRequests: number
  detailsRequests: number
}

export interface PlaceSearchProvider {
  searchAutocomplete(request: { input: string; sessionToken?: string }): Promise<PlaceMatch[]>
  getPlaceDetails(request: { placeId: string; sessionToken?: string }): Promise<ConfirmedLocation>
  getMetadata(): PlaceSearchMetadata
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type RcsPlacesTransportRequest =
  | { endpoint: 'autocomplete'; input: string; sessionToken?: string }
  | { endpoint: 'details'; placeId: string; sessionToken?: string }

export type RcsPlacesTransportResponse = { status: number; body: JsonValue }

export interface RcsPlacesTransport {
  request(request: RcsPlacesTransportRequest): Promise<RcsPlacesTransportResponse>
}

type HttpResponse = { status: number; json(): Promise<JsonValue> }
type HttpFetch = (url: string, init: { signal: AbortSignal }) => Promise<HttpResponse>

export type RcsGooglePlacesHttpTransportOptions = { baseUrl: string; fetch?: HttpFetch; timeoutMs?: number }

type Clock = { now(): Date }

export type GooglePlacesProviderOptions = {
  transport?: RcsPlacesTransport
  clock?: Clock
}

const text = z.string().trim().min(1)
const sessionToken = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
export const placeMatchSchema = z.strictObject({ placeId: text, displayText: text })
const placePredictionSchema = z.object({ placeId: text, text: z.object({ text }).passthrough() }).passthrough()
const autocompleteResponseSchema = z.object({
  suggestions: z.array(z.object({ placePrediction: placePredictionSchema.optional() }).passthrough()).optional().default([]),
}).passthrough()
const detailsResponseSchema = z.strictObject({
  lat: z.number().finite(), lng: z.number().finite(), formattedAddress: text, placeId: text.optional(),
})
const autocompleteRequestSchema = z.strictObject({ input: z.string().trim().min(3).max(2_000), sessionToken: sessionToken.optional() })
const detailsRequestSchema = z.strictObject({ placeId: text, sessionToken: sessionToken.optional() })
const identityRefreshSchema = z.strictObject({ error: z.literal('PLACE_ID_REFRESH_SELECTION_REQUIRED'),
  requestedPlaceId: text, replacement: placeMatchSchema, source: z.literal('GOOGLE_DETAILS_ID_REFRESH') })

function rejectIdentityRefresh(response: RcsPlacesTransportResponse, requestedPlaceId: string): void {
  if (response.status !== 409) return
  const refresh = identityRefreshSchema.safeParse(response.body)
  if (!refresh.success || refresh.data.requestedPlaceId !== requestedPlaceId || refresh.data.replacement.placeId === requestedPlaceId) throw new PlaceSearchError('details')
  throw new PlaceIdentityRefreshError(requestedPlaceId, refresh.data.replacement)
}
const DEFAULT_TRANSPORT_TIMEOUT_MS = 10_000

function statusError(status: number, fallback: PlaceSearchErrorCode): PlaceSearchError {
  if (status === 408 || status === 504) return new PlaceSearchError('timeout')
  if (status === 429) return new PlaceSearchError('quota')
  if (status === 401 || status === 403) return new PlaceSearchError('config')
  return new PlaceSearchError(fallback)
}

function safeTransportError(error: Error): PlaceSearchError {
  const named = error.name
  return named === 'AbortError' || named === 'TimeoutError'
    ? new PlaceSearchError('timeout')
    : new PlaceSearchError('provider')
}

function validCoordinates(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function timeoutError(): Error {
  const error = new Error('Place proxy request timed out.')
  error.name = 'TimeoutError'
  return error
}

function boundedRequest(fetch: HttpFetch, url: string, timeoutMs: number): Promise<RcsPlacesTransportResponse> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<RcsPlacesTransportResponse>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(timeoutError()) }, timeoutMs)
  })
  const request = fetch(url, { signal: controller.signal }).then(async (response) => ({
    status: response.status, body: await response.json(),
  }))
  return Promise.race([request, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

function defaultFetch(url: string, init: { signal: AbortSignal }): Promise<HttpResponse> {
  return globalThis.fetch(url, init).then((response) => ({
    status: response.status,
    json: () => response.json() as Promise<JsonValue>,
  }))
}

export function createRcsGooglePlacesHttpTransport({ baseUrl, fetch = defaultFetch, timeoutMs = DEFAULT_TRANSPORT_TIMEOUT_MS }: RcsGooglePlacesHttpTransportOptions): RcsPlacesTransport {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0 || typeof fetch !== 'function') throw new PlaceSearchError('config')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new PlaceSearchError('config')
  const root = baseUrl.replace(/\/$/, '')
  return {
    async request(request) {
      const params = request.endpoint === 'autocomplete'
        ? new URLSearchParams({ input: request.input }) : new URLSearchParams()
      if (request.sessionToken !== undefined) params.set('sessionToken', request.sessionToken)
      const query = params.toString()
      const suffix = request.endpoint === 'autocomplete'
        ? `/api/googleAPI/autocomplete?${query}`
        : `/api/googleAPI/details/${encodeURIComponent(request.placeId)}${query.length === 0 ? '' : `?${query}`}`
      return boundedRequest(fetch, `${root}${suffix}`, timeoutMs)
    },
  }
}

export function createGooglePlacesProvider({ transport, clock = systemClock }: GooglePlacesProviderOptions = {}): PlaceSearchProvider {
  const counts = { requestCount: 0, autocompleteRequests: 0, detailsRequests: 0 }

  async function send(request: RcsPlacesTransportRequest): Promise<RcsPlacesTransportResponse> {
    if (!transport) throw new PlaceSearchError('config')
    counts.requestCount += 1
    if (request.endpoint === 'autocomplete') counts.autocompleteRequests += 1
    else counts.detailsRequests += 1
    try {
      return await transport.request(request)
    } catch (error) {
      throw safeTransportError(error instanceof Error ? error : new Error())
    }
  }

  return {
    async searchAutocomplete(request) {
      const parsed = autocompleteRequestSchema.safeParse(request)
      if (!parsed.success) throw new PlaceSearchError('invalid_result')
      const response = await send({ endpoint: 'autocomplete', ...parsed.data })
      if (response.status < 200 || response.status >= 300) throw statusError(response.status, 'provider')
      const parsedResponse = autocompleteResponseSchema.safeParse(response.body)
      if (!parsedResponse.success) throw new PlaceSearchError('invalid_result')
      return parsedResponse.data.suggestions.flatMap((suggestion) => suggestion.placePrediction === undefined ? [] : [placeMatchSchema.parse({
        placeId: suggestion.placePrediction.placeId, displayText: suggestion.placePrediction.text.text,
      })])
    },

    async getPlaceDetails(request) {
      const parsed = detailsRequestSchema.safeParse(request)
      if (!parsed.success) throw new PlaceSearchError('details')
      const response = await send({ endpoint: 'details', ...parsed.data })
      rejectIdentityRefresh(response, parsed.data.placeId)
      if (response.status < 200 || response.status >= 300) throw statusError(response.status, 'details')
      const parsedResponse = detailsResponseSchema.safeParse(response.body)
      if (!parsedResponse.success) throw new PlaceSearchError('invalid_result')
      if ((parsedResponse.data.placeId !== undefined && parsedResponse.data.placeId !== parsed.data.placeId)
        || (parsed.data.sessionToken !== undefined && parsedResponse.data.placeId !== parsed.data.placeId)) {
        throw new PlaceSearchError('details')
      }
      if (!validCoordinates(parsedResponse.data.lat, parsedResponse.data.lng)) {
        throw new PlaceSearchError('invalid_result')
      }
      return {
        lat: parsedResponse.data.lat,
        lng: parsedResponse.data.lng,
        displayText: parsedResponse.data.formattedAddress,
        confirmedAt: clock.now().toISOString(),
        source: 'GOOGLE_PLACES',
        placeId: parsed.data.placeId,
        confirmedByUser: 'selection',
      }
    },

    getMetadata() {
      return { provider: 'google_places', ...counts }
    },
  }
}
