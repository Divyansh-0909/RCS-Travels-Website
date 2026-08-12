import 'dotenv/config'
import { sweepScheduledRides } from '../services/assignScheduledRides.js'
import { sweepDocumentScans } from '../services/documentScan.js'
import { sweepDocumentExpiry } from '../services/driverDocuments.js'

// The three background sweeps, and the one decision about how they are TRIGGERED.
//
// WHY THIS FILE EXISTS. Until now each sweep was a setInterval started at boot,
// which is correct on Render — a container that is always running has a working
// event loop, so a timer fires. Cloud Run does not work that way. With
// min-instances=0 the CPU is throttled to near zero between requests and the
// instance is reaped once idle, so a setInterval simply never fires: scheduled
// rides would stop being offered to drivers and nothing anywhere would log an
// error, because nothing ran. The failure is invisible, which is the worst kind
// to ship.
//
// The fix is to move the CLOCK outside the process. Cloud Scheduler holds the
// cadence and POSTs /internal/jobs/:name, which is a request, which is the one
// thing Cloud Run reliably wakes up and allocates CPU for.
//
// WHAT DID NOT CHANGE: the sweeps. Each is the same function it was inside its
// timer, exported rather than trapped in a closure. There is exactly one
// implementation of each, and it does not know which trigger called it — a job
// that behaves differently over HTTP than on a timer is a job that cannot be
// tested locally, which defeats the point of having both modes.

/**
 * How the sweeps run in this process.
 *
 *   interval  — in-process setInterval, as it has always been. The DEFAULT, and
 *               deliberately so: Render is still production while Cloud Run is
 *               being tested, and a deploy that silently stopped dispatching
 *               rides there would be the whole migration's first casualty.
 *   scheduler — the timers do not start. Cloud Scheduler is expected to POST the
 *               endpoints instead. Set this ONLY where something else holds the
 *               clock.
 */
const MODES = ['interval', 'scheduler']

export const JOBS_MODE = process.env.JOBS_MODE?.trim() || 'interval'

// Refuses to boot on a typo, and this is load-bearing rather than tidy. Every
// other way of handling an unrecognised value ends at "run nothing" — and "run
// nothing" is indistinguishable from a healthy server right up until the evening
// somebody notices a scheduled booking was never offered to anybody.
if (!MODES.includes(JOBS_MODE)) {
  throw new Error(
    `JOBS_MODE is "${JOBS_MODE}" — it must be one of ${MODES.join(', ')}. ` +
    `Leave it unset for the in-process timers.`,
  )
}

// Name -> sweep. The names are a wire contract: they appear in the Cloud
// Scheduler job definitions, so renaming one silently stops that sweep running
// until the scheduler is updated to match.
const JOBS = {
  'dispatch': sweepScheduledRides,
  'document-scan': sweepDocumentScans,
  'document-expiry': sweepDocumentExpiry,
}

export const JOB_NAMES = Object.keys(JOBS)

export const isJobName = (name) => Object.hasOwn(JOBS, name)

// Which sweeps this process is currently inside. Cloud Scheduler does not wait
// for the previous attempt before firing the next one, and a scan sweep that
// takes longer than five minutes to work through twenty documents would
// otherwise be re-entered while it is still running.
//
// PER-PROCESS, exactly like the flag it replaces in startAssignmentJob. It does
// nothing about two Cloud Run instances sweeping at the same moment, and it does
// not need to: claimDocument's conditional UPDATE, the unique on RideOffer, and
// the adminAlertedAt guard are what make concurrent sweeps safe, and all three
// predate this file. This is a politeness to a free-tier database, not a lock.
const inFlight = new Set()

/**
 * Run one sweep by name, at most once at a time in this process.
 *
 * Resolves to what happened, for the response body — a scheduler tick that found
 * the previous one still running is a normal, uninteresting event, and the log
 * line saying so is the only way to notice a sweep that has started overrunning
 * its own cadence.
 *
 * Does NOT catch. Whether a failing sweep is worth a retry is the sweep's own
 * decision and each one has already made it: dispatch and expiry swallow their
 * errors (the next tick is soon enough), document-scan throws (a captain is
 * watching a "Checking…" screen). Deciding that here would override all three.
 *
 * @param {string} name
 */
export async function runJob(name) {
  if (!isJobName(name)) throw new Error(`No such job: ${name}`)

  if (inFlight.has(name)) {
    console.warn(`jobs: ${name} was still running when the next tick arrived — skipped`)
    return { status: 'skipped' }
  }

  inFlight.add(name)
  const startedAt = Date.now()

  try {
    await JOBS[name]()
    return { status: 'ok', ms: Date.now() - startedAt }
  } finally {
    inFlight.delete(name)
  }
}
