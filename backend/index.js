import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './db/prisma.js'
import { clerkAuth } from './middleware/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { googleApiLimiter, fareLimiter, authLimiter, shareLimiter } from './middleware/rateLimit.js'
import fareRouter from './routes/fare.js'
import bookingsRouter from './routes/bookings.js'
import driverRouter from './routes/driver.js'
import startAssignmentJob from './services/assignScheduledRides.js'
import { startDocumentScanJob } from './services/documentScan.js'
import { startDocumentExpiryJob } from './services/driverDocuments.js'
import { initFareZones } from './services/fareZones.js'
import usersRouter from './routes/users.js'
import hybridAuthRouter from './routes/hybridAuth.js'
import adminRouter from './routes/admin.js'
import googleRouter from './routes/googleAPI.js'
import internalRouter from './routes/internal.js'
import shareRouter from './routes/share.js'
import { JOBS_MODE } from './lib/jobs.js'
import paymentsRouter, { razorpayWebhookHandler } from './routes/payments.js'

const app = express()
const PORT = process.env.PORT || 5000

// Render terminates TLS at a proxy, and so does Cloud Run's front end — without
// this every request appears to come from the load balancer and the rate
// limiters below would treat the whole internet as one client. `1` = trust
// exactly one hop, which is correct on both; never `true`, which lets a caller
// spoof X-Forwarded-For and slip the limit entirely.
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
// Razorpay signs the exact bytes. This endpoint must run before express.json(),
// which would replace those bytes with a parsed object and make verification
// impossible (or tempt code to re-stringify a subtly different payload).
app.post('/api/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhookHandler)
app.use(express.json())

// BEFORE clerkAuth, and that ordering is the point. These endpoints carry a
// Google-signed OIDC token in the Authorization header, not a Clerk session, and
// clerkMiddleware reads that header — so mounting them after it would hand Clerk
// a token it has no business parsing. They authenticate themselves; see
// middleware/internalAuth.js.
app.use('/internal', internalRouter)

app.use(clerkAuth)

// Both of these proxy billed Google APIs and cannot require auth — a rider sees
// fares and types addresses before logging in.
// Public by design and by necessity: the person following a shared ride has no
// account, which is the entire feature. It sits after clerkAuth like everything
// else — clerkAuth only parses a session it is given, and this route never asks
// for one — and behind its own limiter, being the only unauthenticated way to
// read a booking. routes/share.js documents what it will and will not return.
app.use('/api/share', shareLimiter, shareRouter)

app.use('/api/fare', fareLimiter, fareRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/driver', driverRouter)
app.use('/api/users', usersRouter)
app.use('/api/auth', authLimiter, hybridAuthRouter)
app.use('/api/admin', adminRouter)
app.use('/api/payments', paymentsRouter)
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
  // Before the assignment job, which prices the rides it assigns. Never throws —
  // a failure here leaves the zones.geojson rates loaded, so the server still
  // quotes fares while the database is unreachable.
  await initFareZones()

  // The three background sweeps, started here only when this process is the one
  // holding the clock. On Cloud Run it is not: with min-instances=0 the CPU is
  // throttled between requests and a setInterval never fires, so the cadence
  // lives in Cloud Scheduler and arrives as POST /internal/jobs/:name instead.
  // lib/jobs.js has the full reasoning and validates the mode at import, so an
  // unrecognised JOBS_MODE has already thrown by the time we get here.
  if (JOBS_MODE === 'interval') {
    startAssignmentJob()
    // Picks up documents no verdict was ever recorded for — rows written before
    // the scan existed, and rows whose scan a restart interrupted. Without it
    // `pending` would be a trap rather than a safe default: the admin screen
    // refuses to serve those files and nothing else would ever move them out of
    // it. Runs once now and every five minutes after.
    startDocumentScanJob()
    // The lapse sweep. A licence or an insurance certificate expires on a date,
    // and "expired" has to become true during that day — a driver whose insurance
    // ran out this morning must not still be taking rides tonight because the job
    // runs at 02:00. Recomputes his verification, which is what takes him offline.
    startDocumentExpiryJob()
  }

  // Logged at boot, loudly, on both paths. A service in `scheduler` mode with
  // nothing pointed at it runs no sweeps at all and looks perfectly healthy from
  // outside — this line is the only place that distinction is visible.
  console.log(
    JOBS_MODE === 'interval'
      ? 'jobs: dispatch, document-scan and document-expiry running on in-process timers'
      : 'jobs: timers OFF — expecting Cloud Scheduler to POST /internal/jobs/:name',
  )
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
