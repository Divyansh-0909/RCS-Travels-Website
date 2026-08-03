import { randomUUID } from 'node:crypto'
import { getAuth } from '@clerk/express'

// Every uncaught throw in every route ends up here and leaves as the same
// sentence, so the response on its own can never say what broke — a rider
// reporting "Internal server error" used to be the whole of the evidence.
// `ref` is the join between the two halves: the id in the body is the id on the
// log line, which makes a screenshot of the failure enough to find the stack
// behind it, and tells two reports of the same message apart.
export function errorHandler(err, req, res, next) {
  const ref = randomUUID().slice(0, 8)

  // Guarded because this handler also catches what clerkMiddleware itself throws,
  // and a request that never cleared it has no auth object for getAuth to read.
  let userId = null
  try { userId = getAuth(req).userId } catch { /* unauthenticated, or auth never ran */ }

  console.error(`[${ref}] ${req.method} ${req.originalUrl}${userId ? ` user=${userId}` : ''}`)
  console.error(err)

  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Internal server error', ref })
}
