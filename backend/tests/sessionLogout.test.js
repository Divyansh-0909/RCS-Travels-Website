import test from 'node:test'
import assert from 'node:assert/strict'
import { signOutCurrentSession } from '../../shared/auth/signOutCurrentSession.mjs'

test('current-device logout awaits provider termination of the captured session only', async () => {
  const sessions = new Map([['sess_current', 'active'], ['sess_other_device', 'active']])
  let release
  const pending = signOutCurrentSession(async ({ sessionId }) => {
    await new Promise(done => { release = done })
    sessions.set(sessionId, 'ended')
  }, 'sess_current')
  assert.equal(sessions.get('sess_current'), 'active')
  release()
  await pending
  assert.equal(sessions.get('sess_current'), 'ended')
  assert.equal(sessions.get('sess_other_device'), 'active')
})

test('no active session cannot broaden logout; provider failure is propagated to existing UI error handling', async () => {
  await signOutCurrentSession(() => assert.fail('must not sign out all sessions'), null)
  await assert.rejects(signOutCurrentSession(async () => { throw new Error('unavailable') }, 'sess_current'), /unavailable/)
})
