// Test-only deterministic provider adapter. Never imported by application code.
import { clerkClient } from '@clerk/express'

export function installLiveSessionFake(actors) {
  const original = clerkClient.sessions.getSession
  const sessions = new Map(Object.values(actors).map(actor => [`sess_${actor.id}`, {
    id: `sess_${actor.id}`, userId: actor.clerkId, status: 'active',
  }]))
  const calls = []
  clerkClient.sessions.getSession = async id => {
    calls.push(id)
    const session = sessions.get(id)
    if (!session) throw Object.assign(new Error('Synthetic session missing'), { status: 404 })
    return { ...session }
  }
  return { sessions, calls, restore() { clerkClient.sessions.getSession = original } }
}
