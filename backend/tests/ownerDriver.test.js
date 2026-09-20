import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { initialDriverGroup, isOwnerClerkUser } from '../lib/ownerDriver.js'

const originalOwnerClerkUserId = process.env.OWNER_CLERK_USER_ID

afterEach(() => {
  if (originalOwnerClerkUserId === undefined) delete process.env.OWNER_CLERK_USER_ID
  else process.env.OWNER_CLERK_USER_ID = originalOwnerClerkUserId
})

describe('owner driver identity', () => {
  test('maps only the configured Clerk user to the admin dispatch group', () => {
    process.env.OWNER_CLERK_USER_ID = 'user_owner'

    assert.equal(isOwnerClerkUser('user_owner'), true)
    assert.equal(initialDriverGroup('user_owner'), 'admin')
    assert.equal(isOwnerClerkUser('user_other'), false)
    assert.equal(initialDriverGroup('user_other'), 'partner')
  })

  test('does not create an admin driver when the setting is absent', () => {
    delete process.env.OWNER_CLERK_USER_ID

    assert.equal(isOwnerClerkUser('user_owner'), false)
    assert.equal(initialDriverGroup('user_owner'), 'partner')
  })
})
