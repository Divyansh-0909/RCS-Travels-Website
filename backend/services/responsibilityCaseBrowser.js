import { z } from 'zod'

export const caseBrowserQuery = z.object({
  q: z.string().trim().max(200).default(''),
  status: z.enum(['all', 'Needs review', 'In review', 'Waiting for details']).default('all'),
  reporter: z.enum(['all', 'Driver', 'Rider', 'Booking record']).default('all'),
  period: z.enum(['all', 'today', 'week', 'month']).default('all'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  cursor: z.string().max(1000).optional(),
}).strict()

const needsReview = ['NEEDS_ADMIN_REVIEW', 'APPEAL_OPEN', 'APPEAL_REVIEW']
const finalStates = ['FINAL_UPHELD', 'FINAL_WAIVED']
export function caseBrowserStatus(state) {
  return needsReview.includes(state) ? 'Needs review'
    : state === 'EVIDENCE_COLLECTING' ? 'Waiting for details' : 'In review'
}

// A source identifies who reported a transition; it never assigns responsibility.
export function caseBrowserReporter(snapshot) {
  const roles = new Set()
  const add = value => {
    if (typeof value !== 'string') return
    if (['driver', 'captain'].includes(value.toLowerCase())) roles.add('Driver')
    if (['rider', 'customer'].includes(value.toLowerCase())) roles.add('Rider')
  }
  add(snapshot?.reportedBy)
  add(snapshot?.reporter?.role)
  if (Array.isArray(snapshot?.timeline)) for (const item of snapshot.timeline) add(item?.value?.initiator)
  return roles.size === 1 ? [...roles][0] : 'Booking record'
}

const roleQuery = roles => ({ OR: roles.flatMap(role => [
  { evidenceSnapshot: { path: ['reportedBy'], equals: role } },
  { evidenceSnapshot: { path: ['reporter', 'role'], equals: role } },
  { evidenceSnapshot: { path: ['timeline'], array_contains: [{ value: { initiator: role } }] } },
]) })
const driver = roleQuery(['driver', 'captain', 'Driver', 'DRIVER', 'Captain', 'CAPTAIN'])
const rider = roleQuery(['rider', 'customer', 'Rider', 'RIDER', 'Customer', 'CUSTOMER'])

function periodStart(period, now) {
  const istDay = Math.floor((now.getTime() + 19_800_000) / 86_400_000) * 86_400_000 - 19_800_000
  return new Date(istDay - (period === 'week' ? 6 : period === 'month' ? 29 : 0) * 86_400_000)
}

function cursorValue(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string'
      || !/^\d{4}-\d\d-\d\dT/.test(parsed[0]) || !Number.isFinite(Date.parse(parsed[0]))
      || typeof parsed[1] !== 'string' || !parsed[1] || parsed[1].length > 200) throw new Error()
    return { createdAt: new Date(parsed[0]), id: parsed[1] }
  } catch { throw new TypeError('Invalid case-list cursor') }
}

export async function listResponsibilityCases(input, { db, now = new Date() }) {
  const query = caseBrowserQuery.parse(input)
  const after = cursorValue(query.cursor)
  const AND = [{ state: { notIn: finalStates } }, { finalDecision: { is: null } }]
  if (query.q) AND.push({ OR: ['id', 'bookingId'].map(key => ({ [key]: { contains: query.q, mode: 'insensitive' } })) })
  if (query.status === 'Needs review') AND.push({ state: { in: needsReview } })
  if (query.status === 'Waiting for details') AND.push({ state: 'EVIDENCE_COLLECTING' })
  if (query.status === 'In review') AND.push({ state: { notIn: [...needsReview, 'EVIDENCE_COLLECTING'] } })
  if (query.reporter === 'Driver') AND.push(driver, { NOT: rider })
  if (query.reporter === 'Rider') AND.push(rider, { NOT: driver })
  if (query.reporter === 'Booking record') AND.push({ OR: [{ AND: [{ NOT: driver }, { NOT: rider }] }, { AND: [driver, rider] }] })
  if (query.period !== 'all') AND.push({ createdAt: { gte: periodStart(query.period, now) } })
  const where = { AND }
  const comparison = query.direction === 'asc' ? 'gt' : 'lt'
  const pageWhere = after ? { AND: [where, { OR: [
    { createdAt: { [comparison]: after.createdAt } },
    { createdAt: after.createdAt, id: { [comparison]: after.id } },
  ] }] } : where
  const [rows, total] = await Promise.all([
    db.responsibilityCase.findMany({ where: pageWhere, orderBy: [{ createdAt: query.direction }, { id: query.direction }],
      take: query.limit + 1, select: { id: true, bookingId: true, state: true, caseType: true, createdAt: true, evidenceSnapshot: true } }),
    db.responsibilityCase.count({ where }),
  ])
  const items = rows.slice(0, query.limit).map(row => ({ id: row.id, booking: row.bookingId,
    state: row.state, status: caseBrowserStatus(row.state), issue: row.caseType,
    reporter: caseBrowserReporter(row.evidenceSnapshot), opened: row.createdAt.toISOString() }))
  const last = items.at(-1)
  return { items, total, limit: query.limit,
    nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify([last.opened, last.id])).toString('base64url') : null }
}
