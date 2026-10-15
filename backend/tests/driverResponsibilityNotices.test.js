import test from 'node:test'
import assert from 'node:assert/strict'
import { getDriverResponsibilityNotices } from '../services/driverResponsibilityNotices.js'

const at = '2026-10-11T12:00:00.000Z'
const fixture = () => {
  const incident = { id: 'case', bookingId: 'booking', state: 'APPEAL_WINDOW', evidenceVersion: 'v1', evidenceHash: 'hash',
    adminReview: { reason: 'Human provisional reason', reviewerId: 'private-admin' },
    appealWindow: { appealStartedAt: at, appealDeadline: at }, appeal: null, finalDecision: null }
  const calls = []
  const db = { driverCancellation: { findMany: async query => {
    assert.deepEqual(query, { where: { driverId: 'original' }, select: { bookingId: true },
      orderBy: { createdAt: 'desc' }, take: 50 })
    return [{ bookingId: 'booking' }]
  } }, responsibilityCase: { findMany: async query => {
    assert.deepEqual(query.where, { caseType: 'DRIVER_CANCELLATION', bookingId: { in: ['booking'] } })
    assert.deepEqual(query.include, { adminReview: true, appealWindow: true, appeal: true, finalDecision: true })
    assert.deepEqual(query.orderBy, { updatedAt: 'desc' }); assert.equal(query.take, 50); return [incident]
  } } }
  const findOwner = async (input, record) => {
    assert.equal(input, db); assert.equal(record, incident); calls.push(record.id)
    return { driverId: 'original', reference: 'SYNTHETIC', driver: { phone: 'private-fixture' } }
  }
  return { incident, calls, options: { db, findOwner, clock: { now: () => new Date(at) } } }
}

test('notice projection requires an authenticated driver identity', async () => {
  for (const id of [null, undefined, 0, '', ' ']) await assert.rejects(() => getDriverResponsibilityNotices(id, {}), /Authenticated driver/)
})

test('original actor reads a bounded notice with exact deadline semantics and no private fields', async () => {
  const { calls, options } = fixture()
  const result = await getDriverResponsibilityNotices('original', options)
  assert.deepEqual(calls, ['case'])
  assert.deepEqual(result, { notices: [{ caseId: 'case', reference: 'SYNTHETIC', state: 'APPEAL_WINDOW',
    evidenceVersion: 'v1', evidenceHash: 'hash', noticeDeliveredAt: at, appealDeadline: at,
    reviewReason: 'Human provisional reason', appeal: null, finalOutcome: null, canAppeal: true }] })
})

test('foreign, replacement and unverifiable owners cannot read an original incident notice', async () => {
  for (const owner of [null, { driverId: 'replacement' }, { driverId: '' }]) {
    const { options } = fixture(); options.findOwner = async () => owner
    assert.deepEqual(await getDriverResponsibilityNotices('original', options), { notices: [] })
  }
  const { incident, options } = fixture(); incident.appealWindow = null
  assert.deepEqual(await getDriverResponsibilityNotices('original', options), { notices: [] })
})

test('missing delivery, deadline, expired and other case states never enable an appeal', async () => {
  const variants = [
    item => { item.appealWindow.appealStartedAt = null },
    item => { item.appealWindow.appealDeadline = null },
    item => { item.appealWindow.appealDeadline = '2026-10-11T11:59:59.999Z' },
    item => { item.appealWindow.appealDeadline = 'invalid' },
    item => { item.state = 'PROVISIONAL_ADMIN_UPHELD' },
  ]
  for (const change of variants) {
    const { incident, options } = fixture(); change(incident)
    assert.equal((await getDriverResponsibilityNotices('original', options)).notices[0].canAppeal, false)
  }
})

test('submitted appeal and final authority are displayed without another submission action', async () => {
  const { incident, options } = fixture()
  incident.appeal = { status: 'OPEN', reason: 'Original actor appeal', submittedAt: at, driverId: 'original' }
  incident.adminReview = null
  let notice = (await getDriverResponsibilityNotices('original', options)).notices[0]
  assert.equal(notice.canAppeal, false); assert.equal(notice.reviewReason, null)
  assert.deepEqual(notice.appeal, { status: 'OPEN', reason: 'Original actor appeal', submittedAt: at })
  incident.appeal = null; incident.finalDecision = { outcome: 'FINAL_WAIVED' }
  notice = (await getDriverResponsibilityNotices('original', options)).notices[0]
  assert.equal(notice.canAppeal, false); assert.equal(notice.finalOutcome, 'FINAL_WAIVED')
})
test('default ownership verifier and clock preserve an empty history without creating authority', async () => {
  const db = { driverCancellation: { findMany: async () => [] }, responsibilityCase: { findMany: async query => {
    assert.deepEqual(query.where.bookingId, { in: [] }); return []
  } } }
  assert.deepEqual(await getDriverResponsibilityNotices('original', { db }), { notices: [] })
})
test('a missing deadline remains ineligible even at the Unix epoch', async () => {
  const { incident, options } = fixture(); incident.appealWindow.appealDeadline = null
  options.clock.now = () => new Date(0)
  assert.equal((await getDriverResponsibilityNotices('original', options)).notices[0].canAppeal, false)
})
