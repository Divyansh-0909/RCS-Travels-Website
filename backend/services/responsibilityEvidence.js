import { systemClock } from '../lib/clock.js'

export const RESPONSIBILITY_EVIDENCE_VERSION = 'responsibility-evidence-v1'

export const responsibilityCaseType = Object.freeze({
  DRIVER_CANCELLATION: 'DRIVER_CANCELLATION',
  FAILED_PICKUP: 'FAILED_PICKUP',
  DRIVER_LATE: 'DRIVER_LATE',
  DRIVER_OFFLINE: 'DRIVER_OFFLINE',
  RIDER_CANCELLATION: 'RIDER_CANCELLATION',
  PLATFORM_ASSIGNMENT_FAILURE: 'PLATFORM_ASSIGNMENT_FAILURE',
  REPLACEMENT_FAILURE: 'REPLACEMENT_FAILURE',
})

export const evidenceCategory = Object.freeze({
  BOOKING: 'booking', ASSIGNMENT: 'assignment', ROUTING: 'routing', LOCATION: 'location',
  CONNECTIVITY: 'connectivity', NOTIFICATION: 'notification', PAYMENT: 'payment', PAYOUT: 'payout',
  CANCELLATION: 'cancellation', FEASIBILITY: 'feasibility', PROGRESS: 'progress', EXTERNAL: 'external',
})

export const responsibilityRequiredEvidenceByCase = Object.freeze({
  DRIVER_CANCELLATION: ['booking', 'assignment', 'cancellation'],
  FAILED_PICKUP: ['booking', 'assignment', 'routing', 'location', 'connectivity', 'notification'],
  DRIVER_LATE: ['booking', 'assignment', 'routing', 'location'],
  DRIVER_OFFLINE: ['booking', 'assignment', 'connectivity'],
  RIDER_CANCELLATION: ['booking', 'assignment', 'cancellation', 'location'],
  PLATFORM_ASSIGNMENT_FAILURE: ['booking', 'assignment', 'feasibility'],
  REPLACEMENT_FAILURE: ['booking', 'assignment', 'feasibility'],
})

const copy = value => structuredClone(value)
const iso = value => new Date(value).toISOString()
const nullableIso = value => value == null ? null : iso(value)

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
}

export const stableSerializeResponsibilityEvidence = value => JSON.stringify(stableValue(value))

function contradictionGroups(entries) {
  const claims = new Map()
  for (const entry of entries) {
    if (!entry.claimKey || entry.availability !== 'available') continue
    const bucket = claims.get(entry.claimKey) ?? new Map()
    const key = stableSerializeResponsibilityEvidence(entry.value)
    const item = bucket.get(key) ?? { value: copy(entry.value), evidenceIds: [] }
    item.evidenceIds.push(entry.id)
    bucket.set(key, item)
    claims.set(entry.claimKey, bucket)
  }
  return [...claims.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([claimKey, values]) => ({ claimKey, observations: [...values.values()] }))
    .sort((a, b) => a.claimKey.localeCompare(b.claimKey))
}

function completenessFor(entries, requiredCategories) {
  const categories = new Map()
  for (const entry of entries) {
    const states = categories.get(entry.category) ?? new Set()
    states.add(entry.availability)
    categories.set(entry.category, states)
  }
  const missing = requiredCategories.filter(category => !categories.has(category))
  const unavailable = requiredCategories.filter((category) => {
    const states = categories.get(category)
    return states && !states.has('available')
  })
  return {
    requiredCategories: [...requiredCategories],
    complete: missing.length === 0 && unavailable.length === 0,
    missing,
    unavailable,
  }
}

/** Normalized evidence journal. It records facts and uncertainty, never responsibility. */
export function createResponsibilityEvidence({
  caseId,
  caseType,
  bookingId,
  scheduledAt = null,
  occurredAt = null,
  clock = systemClock,
  requiredCategories = responsibilityRequiredEvidenceByCase[caseType],
} = {}) {
  if (!Object.values(responsibilityCaseType).includes(caseType)) throw new Error('Unsupported responsibility case type')
  if (!caseId || !bookingId) throw new Error('caseId and bookingId are required')
  if (!requiredCategories) throw new Error('Required evidence categories are missing')
  const entries = []
  let sequence = 0

  const record = ({
    category,
    kind,
    value = null,
    source,
    observedAt = clock.now(),
    receivedAt = clock.now(),
    basis = 'direct',
    derivedFrom = [],
    availability = 'available',
    claimKey = null,
    quality = {},
  }) => {
    if (!Object.values(evidenceCategory).includes(category)) throw new Error(`Unsupported evidence category: ${category}`)
    if (!kind || !source) throw new Error('kind and source are required')
    if (!['direct', 'derived'].includes(basis)) throw new Error('basis must be direct or derived')
    if (!['available', 'unknown', 'not_available'].includes(availability)) throw new Error('Invalid availability')
    if (basis === 'derived' && derivedFrom.length === 0) throw new Error('Derived evidence requires derivedFrom')
    const entry = {
      id: `ev_${String(++sequence).padStart(4, '0')}`,
      category,
      kind,
      value: copy(value),
      source,
      basis,
      derivedFrom: [...derivedFrom],
      availability,
      claimKey,
      observedAt: iso(observedAt),
      receivedAt: iso(receivedAt),
      quality: copy(quality),
    }
    entries.push(entry)
    return copy(entry)
  }

  const timeline = () => copy(entries).sort((a, b) => a.observedAt.localeCompare(b.observedAt)
    || a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id))

  const snapshot = () => {
    const ordered = timeline()
    return deepFreeze({
      evidenceVersion: RESPONSIBILITY_EVIDENCE_VERSION,
      caseId,
      caseType,
      bookingId,
      scheduledAt: nullableIso(scheduledAt),
      occurredAt: nullableIso(occurredAt),
      generatedAt: iso(clock.now()),
      timeline: ordered,
      completeness: completenessFor(ordered, requiredCategories),
      contradictions: contradictionGroups(ordered),
    })
  }

  const serialize = () => stableSerializeResponsibilityEvidence(snapshot())
  const reset = () => { entries.length = 0; sequence = 0 }
  return { record, timeline, snapshot, serialize, reset }
}
