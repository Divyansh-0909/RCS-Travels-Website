import test from 'node:test'
import assert from 'node:assert/strict'
import { caseBrowserQuery, caseBrowserReporter, listResponsibilityCases } from '../services/responsibilityCaseBrowser.js'

function database(rows = []) {
  const calls = []
  return { calls, db: { responsibilityCase: {
    findMany: async query => { calls.push(['findMany', query]); return rows },
    count: async query => { calls.push(['count', query]); return 12 },
  } } }
}
const row = id => ({ id, bookingId: `booking-${id}`, state: 'NEEDS_ADMIN_REVIEW', caseType: 'DRIVER_CANCELLATION',
  createdAt: new Date('2026-11-05T03:00:00Z'), evidenceSnapshot: { reportedBy: 'driver', privateRecord: 'must not be in a list response' } })

test('case browsing validates bounds and rejects arbitrary query keys and cursors before database access', async () => {
  for (const query of [{ limit: 0 }, { limit: 51 }, { limit: 'NaN' }, { q: 'x'.repeat(201) }, { direction: 'DROP TABLE' }, { reporter: 'anyone' }, { unexpected: 'value' }]) {
    assert.equal(caseBrowserQuery.safeParse(query).success, false)
  }
  for (const cursor of ['garbage', Buffer.from(JSON.stringify(['not-a-time', 'id'])).toString('base64url'), Buffer.from(JSON.stringify(['2026-11-05T00:00:00Z', ''])).toString('base64url')]) {
    const fixture = database()
    await assert.rejects(listResponsibilityCases({ cursor }, { db: fixture.db }), /cursor/)
    assert.equal(fixture.calls.length, 0)
  }
})

test('open case list omits full evidence and uses bounded deterministic keyset pagination for ties', async () => {
  const fixture = database([row('b'), row('a'), row('0')])
  const result = await listResponsibilityCases({ limit: 2 }, { db: fixture.db })
  assert.deepEqual(result.items.map(item => item.id), ['b', 'a'])
  assert.equal(result.items[0].reporter, 'Driver')
  assert.equal(result.items[0].status, 'Needs review')
  assert.equal(JSON.stringify(result).includes('privateRecord'), false)
  const query = fixture.calls[0][1]
  assert.equal(query.take, 3)
  assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }])
  assert.deepEqual(query.where.AND.slice(0, 2), [{ state: { notIn: ['FINAL_UPHELD', 'FINAL_WAIVED'] } }, { finalDecision: { is: null } }])
  const next = database()
  await listResponsibilityCases({ limit: 2, cursor: result.nextCursor }, { db: next.db })
  const predicate = next.calls[0][1].where.AND[1].OR
  assert.deepEqual(predicate[1], { createdAt: row('a').createdAt, id: { lt: 'a' } })
  const ascending = database()
  await listResponsibilityCases({ direction: 'asc', cursor: result.nextCursor }, { db: ascending.db })
  assert.equal(ascending.calls[0][1].where.AND[1].OR[1].id.gt, 'a')
})

test('filters search only case/booking IDs and calculate calendar periods in IST', async () => {
  const fixture = database()
  await listResponsibilityCases({ q: "  x%'_  ", status: 'Needs review', reporter: 'Rider', period: 'today' },
    { db: fixture.db, now: new Date('2026-11-04T19:00:00Z') })
  const query = fixture.calls[0][1]
  assert.deepEqual(query.where.AND[2], { OR: [{ id: { contains: "x%'_", mode: 'insensitive' } }, { bookingId: { contains: "x%'_", mode: 'insensitive' } }] })
  assert.ok(query.where.AND[3].state.in.includes('APPEAL_REVIEW'))
  assert.equal(query.where.AND.at(-1).createdAt.gte.toISOString(), '2026-11-04T18:30:00.000Z')
  assert.deepEqual(fixture.calls[1][1].where, query.where)
  for (const period of ['week', 'month']) {
    const sample = database()
    await listResponsibilityCases({ period }, { db: sample.db, now: new Date('2026-11-05T01:00:00Z') })
    assert.equal(sample.calls[0][1].where.AND.at(-1).createdAt.gte.toISOString(), period === 'week' ? '2026-10-29T18:30:00.000Z' : '2026-10-06T18:30:00.000Z')
  }
})

test('source labels need explicit reporter evidence, never case type or causal inference', () => {
  assert.equal(caseBrowserReporter({ caseType: 'DRIVER_CANCELLATION' }), 'Booking record')
  assert.equal(caseBrowserReporter({ timeline: [{ value: { initiator: 'customer' } }] }), 'Rider')
  assert.equal(caseBrowserReporter({ timeline: [{ value: { initiator: 'driver' } }, { value: { initiator: 'rider' } }] }), 'Booking record')
  assert.equal(caseBrowserReporter({ reportedBy: 'CAPTAIN' }), 'Driver')
})
