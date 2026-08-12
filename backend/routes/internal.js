import express from 'express'
import { requireInternalCaller } from '../middleware/internalAuth.js'
import { runJob, isJobName, JOB_NAMES, JOBS_MODE } from '../lib/jobs.js'

// The machine-facing half of the API: endpoints nothing human and nothing in a
// browser ever calls.
//
// Mounted BEFORE clerkAuth in index.js, deliberately. Clerk's middleware reads
// the Authorization header, and what arrives here is a Google-signed OIDC token
// rather than a Clerk session — running it through clerkMiddleware would at best
// waste a verification and at worst throw on a token it cannot parse. Nothing
// under /internal has a Clerk identity, so it should never meet Clerk at all.
//
// Also therefore outside CORS' remit and outside the rate limiters: the caller is
// Cloud Scheduler, which is not a browser and is already rate-limited by being
// the only account allowed through.
const internalRouter = express.Router()

// Every route below, no exceptions. Applied at the router rather than per-route
// so that adding an endpoint here cannot accidentally add an unauthenticated one.
internalRouter.use(requireInternalCaller)

/**
 * What this server thinks it should be running, for the human wiring up Cloud
 * Scheduler. Answers the two questions that are otherwise a guess from outside:
 * which job names are real, and whether this instance believes its timers are on.
 *
 * A `scheduler`-mode service reporting jobs nobody is calling, or an
 * `interval`-mode service with a scheduler pointed at it, are both visible here
 * and nowhere else.
 */
internalRouter.get('/jobs', (_req, res) => {
    res.json({ mode: JOBS_MODE, jobs: JOB_NAMES })
})

/**
 * Run one sweep now.
 *
 * A single parameterised route over an allowlist rather than three near-identical
 * handlers: the three jobs differ only in which function they call, and the list
 * they are drawn from lives in lib/jobs.js beside the functions themselves. An
 * unknown name is a 404 rather than a silent 200, because the way this fails in
 * practice is a Cloud Scheduler job pointed at a name that no longer exists, and
 * a 200 would leave that looking healthy in the scheduler's own console.
 *
 * POST, not GET: these are not safe to prefetch, and Cloud Scheduler's HTTP
 * target defaults to POST anyway.
 */
internalRouter.post('/jobs/:name', async (req, res) => {
    const { name } = req.params

    if (!isJobName(name)) {
        return res.status(404).json({ error: `No such job: ${name}`, jobs: JOB_NAMES })
    }

    // Uncaught rejections fall through to errorHandler, which answers 500 with a
    // ref. That is the intended path for a sweep that decided its failure was
    // worth retrying — Cloud Scheduler retries on a 5xx, and the ref is what
    // joins the scheduler's failed attempt to the stack trace in the logs.
    const result = await runJob(name)

    console.log(`jobs: ${name} -> ${result.status}${result.ms === undefined ? '' : ` in ${result.ms}ms`}`)
    return res.json({ job: name, ...result })
})

export default internalRouter
