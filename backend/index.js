import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './db/prisma.js'
import { clerkAuth } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { googleApiLimiter, fareLimiter } from './middleware/rateLimit.js'
import fareRouter from './routes/fare.js'
import bookingsRouter from './routes/bookings.js'
import driverRouter from './routes/driver.js'
import startAssignmentJob from './services/assignScheduledRides.js'
import usersRouter from './routes/users.js'
import hybridAuthRouter from './routes/hybridAuth.js'
import adminRouter from './routes/admin.js'
import googleRouter from './routes/googleAPI.js'

const app = express()
const PORT = process.env.PORT || 5000

// Render terminates TLS at a proxy, so without this every request appears to
// come from the load balancer and the rate limiters below would treat the whole
// internet as one client. `1` = trust exactly one hop; never `true`, which lets
// a caller spoof X-Forwarded-For and slip the limit entirely.
app.set('trust proxy', 1)

// Comma-separated allowlist, e.g. "https://rcstravels.vercel.app". Defaults to
// the local Vite ports so dev needs no configuration.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:1574,http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    // No Origin header means a same-origin request, curl, or a native app. CORS
    // is a browser-enforced control and was never able to police those, so
    // rejecting here would only break tooling while stopping no attacker.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    // Deny by omitting the CORS headers rather than throwing: the browser blocks
    // the response, and the server answers normally instead of 500-ing.
    return callback(null, false)
  },
  credentials: true,
}))
app.use(express.json())
app.use(clerkAuth)

// Both of these proxy billed Google APIs and cannot require auth — a rider sees
// fares and types addresses before logging in.
app.use('/api/fare', fareLimiter, fareRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/driver', driverRouter)
app.use('/api/users', usersRouter)
app.use('/api/auth', hybridAuthRouter)
app.use('/api/admin', adminRouter)
app.use('/api/googleAPI', googleApiLimiter, googleRouter)

// The database round trip is load-bearing, not decorative. Supabase's free tier
// pauses a project after 7 days without database activity, and the keep-alive cron
// that stops Render sleeping only ever hits this endpoint — so one ping keeps both
// awake, instead of depending on assignScheduledRides happening to touch Postgres.
//
// Always 200, even when the query fails: this is the liveness URL an uptime
// monitor polls, and if Render is configured to health-check it, a transient
// pooler blip returning 503 would trigger a restart loop at the worst moment.
// The `db` field carries the real status for anyone watching the body.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`select 1`
    res.json({ status: 'ok', db: 'ok' })
  } catch (err) {
    console.error('health: database unreachable:', err.message)
    res.json({ status: 'ok', db: 'error' })
  }
})

// Must be registered after all routes — Express runs error middleware in order.
app.use(errorHandler)

const server = app.listen(PORT, async () => {
  await prisma.$connect()
  startAssignmentJob()
  console.log(`Server running on port ${PORT}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run "npm run dev" (it frees the port first) or kill the process holding it.`)
    process.exit(1)
  }
  throw err
})

// Release the port on clean exits (Ctrl+C, nodemon restart) so it isn't orphaned.
let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close()
  await prisma.$disconnect().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
