import 'dotenv/config'
import { CloudTasksClient } from '@google-cloud/tasks'

// Handing one document to a background worker.
//
// WHY THIS EXISTS, and it is the same reason lib/jobs.js exists one level up.
// The confirm endpoint used to finish with `setImmediate(() => scanDocument(id))`
// — schedule the heavy half after the response, so the captain is not held
// through six downloads and six JPEG re-encodes. That is correct on a server that
// keeps running after it answers. Cloud Run is not one: once the response is
// sent, the instance's CPU is throttled to near zero, so work scheduled for
// "after the response" may get a few milliseconds and then nothing until some
// later request happens to wake the instance.
//
// The five-minute sweep does rescue those documents, so nothing is lost. But
// "rescued in five minutes" is a captain watching a Checking… screen for five
// minutes instead of five seconds, on the screen standing between him and being
// paid. A task is a REQUEST, and a request is the one thing Cloud Run reliably
// wakes up and allocates CPU for.
//
// THE SWEEP STAYS. This is the fast path, not a replacement — see the comment on
// enqueueDocumentScan. Two layers: Cloud Tasks for the normal case, the sweep to
// catch anything the queue never delivered.

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
const LOCATION = process.env.TASKS_LOCATION ?? 'asia-south1'
const QUEUE = process.env.TASKS_QUEUE ?? 'document-scan'

// Where the task will POST. The Cloud Run URL rather than any public custom
// domain, deliberately: this is an internal hop that no app bundle ever sees, so
// pointing it at the service directly keeps it working through a DNS change.
const TARGET = process.env.INTERNAL_JOBS_AUDIENCE

// The identity the task presents. The same account Cloud Scheduler uses, because
// middleware/internalAuth.js checks the caller against exactly ONE address —
// giving Tasks its own account would mean teaching that check a list, and a list
// of trusted callers is harder to read than one name. Read it as "the internal
// invoker", not strictly "the scheduler".
const INVOKER = process.env.INTERNAL_JOBS_SERVICE_ACCOUNT

/**
 * Is the queue usable in this process?
 *
 * False on a laptop and false anywhere the internal endpoints are unconfigured,
 * which is exactly when the caller should fall back to running the scan inline.
 */
export const isTaskQueueConfigured = () =>
  Boolean(PROJECT && TARGET && INVOKER)

// One client per process; it holds a gRPC channel.
let client = null
const tasks = () => (client ??= new CloudTasksClient())

/**
 * Ask for one document to be scanned, soon, by whichever instance takes the task.
 *
 * NEVER THROWS, and that is the whole contract. This is called from the confirm
 * endpoint after the rows are committed, and a captain whose six documents saved
 * correctly must not be told the upload failed because a queue was unreachable.
 * A dropped task costs at most one sweep interval, because the sweep picks up
 * anything still sitting at `pending` — which is precisely why it was worth
 * keeping the sweep rather than replacing it.
 *
 * Resolves true when the task was accepted, false when it was not and the sweep
 * is now the safety net.
 *
 * @param {string} documentId
 */
export async function enqueueDocumentScan(documentId) {
  if (!isTaskQueueConfigured()) return false

  try {
    const parent = tasks().queuePath(PROJECT, LOCATION, QUEUE)

    await tasks().createTask({
      parent,
      task: {
        // Named after the document, so the queue itself deduplicates: the same
        // id enqueued twice inside the dedup window is accepted once. That
        // matters because a captain re-submitting a batch, or a retry landing
        // beside a sweep, would otherwise put two tasks on the same row — and
        // while claimDocument makes that safe, it is two downloads and two sharp
        // decodes to reach the same verdict.
        //
        // Not the bare id: task names are reserved for a while after completion,
        // and a re-upload of the same document is a genuinely new scan that must
        // not be swallowed. The timestamp keeps them distinct while still
        // collapsing a burst.
        name: `${parent}/tasks/scan-${documentId}-${Date.now()}`,
        httpRequest: {
          httpMethod: 'POST',
          url: `${TARGET}/internal/scan/${documentId}`,
          // The same OIDC shape Cloud Scheduler uses, verified by the same
          // middleware. Nothing about /internal knows or cares which Google
          // service made the call.
          oidcToken: { serviceAccountEmail: INVOKER, audience: TARGET },
        },
      },
    })

    return true
  } catch (err) {
    // Logged, not raised. The document is saved, the row says `pending`, and the
    // sweep will reach it.
    console.error(`tasks: could not enqueue a scan for ${documentId}:`, err.message)
    return false
  }
}
