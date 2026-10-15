// The installed Clerk getSession API has no AbortSignal option. Bound the
// caller's wait and retain a slot until the SDK settles, capping outstanding
// lookups during a stalled provider. No retries, cross-request cache or fallback.
const MAX_PENDING = 100
const TIMEOUT_MS = 2500
let pending = 0

function validIdentity({ userId, sessionId, sessionClaims }) {
  if (typeof userId !== 'string' || !userId.trim()) return false
  if (typeof sessionId !== 'string' || !sessionId.startsWith('sess_')) return false
  if (sessionClaims?.sub !== userId || sessionClaims.sid !== sessionId) return false
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY
  if (!publishableKey) return false
  const host = Buffer.from(publishableKey.slice(8), 'base64').toString('utf8').replace(/\$$/, '')
  return sessionClaims.iss === `https://${host}`
}

export async function verifyLiveSession(identity, getSession, timeoutMs = TIMEOUT_MS) {
  if (!validIdentity(identity)) return 'invalid'
  if (pending >= MAX_PENDING) return 'unavailable'
  pending++
  let timer
  try {
    const lookup = Promise.resolve().then(() => getSession(identity.sessionId)).finally(() => { pending-- })
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), timeoutMs) })
    const session = await Promise.race([lookup, timeout])
    if (!session || session.id !== identity.sessionId || session.userId !== identity.userId || session.status !== 'active') return 'invalid'
    return 'active'
  } catch (error) {
    if (error?.status === 404) return 'invalid'
  } finally {
    clearTimeout(timer)
  }
  return 'unavailable'
}
