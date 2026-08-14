import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { driverGroupSchema } from '../types.ts'

// The body of PATCH /api/admin/drivers/:id/group, which is one field and one
// question: can `admin` be reached from a screen?
//
// It must not be. `admin` is a single row — the owner's — and it is what the
// owner-first hold on every scheduled booking resolves to (eligibleGroup in
// constants/dispatch.js). Promoting a second captain into it hands him first
// refusal on all of that work; the route separately refuses to move the owner OUT
// of it, because offerScheduledRide's empty-group fallback covers only `rcs` and
// a hold with nobody in it leaves bookings unoffered until it expires.
//
// Tested at the schema rather than through the route because this is where the
// guarantee actually lives: a value the body cannot express is one no later
// caller, and no mistake in the route, can smuggle through.

describe('driverGroupSchema', () => {
  test('accepts the two groups an admin may move a captain between', () => {
    for (const group of ['rcs', 'partner']) {
      const parsed = driverGroupSchema.safeParse({ group })
      assert.equal(parsed.success, true, `${group} should be accepted`)
      assert.equal(parsed.data.group, group)
    }
  })

  test('refuses `admin` — the owner-first hold is not a dashboard button', () => {
    assert.equal(driverGroupSchema.safeParse({ group: 'admin' }).success, false)
  })

  test('refuses anything that is not a group at all', () => {
    for (const body of [{}, { group: '' }, { group: 'RCS' }, { group: null }, { group: ['rcs'] }]) {
      assert.equal(
        driverGroupSchema.safeParse(body).success,
        false,
        `${JSON.stringify(body)} should be refused`,
      )
    }
  })
})
