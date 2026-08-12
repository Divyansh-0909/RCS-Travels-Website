import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { prisma } from '../db/prisma.js'
import { isStorageConfigured, readRange, read, write, remove, signedReadUrl } from '../lib/storage.js'
import { maxBytesFor, MAX_DOCUMENT_BYTES } from '../constants/driverDocuments.js'
import { notifyScanFailed } from './documentNotifications.js'
import { recomputeAfterDocumentChange } from './driverDocuments.js'

// File-level verification of driver documents.
//
// WHAT THIS IS: file-format validation, image sanitisation, and PDF
// active-content checks. WHAT IT IS NOT: antivirus. There is no signature
// database and no engine, and `clean` means "passed the checks written below",
// never "guaranteed free of malware". Anywhere that distinction gets blurred,
// somebody will eventually rely on a guarantee nothing here makes.
//
// WHY IT EXISTS AT ALL. Supabase Storage does not look at the bytes it stores.
// Its `allowedMimeTypes` bucket restriction is compared against the Content-Type
// header the UPLOADER sent (storage/src/storage/uploader.ts, fileUploadFromRequest
// -> validateMimeType), and `.info()` hands that same declared string back. So
// the bucket's allowlist and the confirm endpoint's cheap check are both checks
// on a label the client chose. Anything holding a signed URL can PUT an HTML
// file, a Windows executable or a JPEG with a ZIP stapled to its tail, call it
// image/jpeg, and pass both.
//
// That matters here specifically because these files are opened by an admin, in
// a browser, on the dashboard that administers the whole fleet. An "image" that
// is really HTML is stored XSS aimed at the one account worth having.
//
// The three checks, in order of how much they cost:
//
//   1. magic bytes must match the declared type      (kills type confusion)
//   2. images are re-encoded from a decoded bitmap    (kills polyglots, appended
//      payloads, EXIF-embedded scripts — anything that was not pixels)
//   3. PDFs are searched for active content           (JavaScript, launch
//      actions, embedded files)
//
// Step 1 runs inline in the confirm endpoint, before any row is written. Steps 2
// and 3 need the whole file and run against the scan_status column.

// The first bytes of each format we accept. Checked at offset 0 and nowhere
// else: the PDF spec lets a reader tolerate junk before %PDF-, and that
// tolerance is exactly what a polyglot exploits — a file that is a valid GIF to
// one parser and a valid PDF to another. A document scanned by an insurer always
// starts at zero.
const MAGIC = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
}

// Enough for the longest signature above, with room to spare. Fetched as a Range
// request so this costs 16 bytes of transfer, not a 10 MB download.
const SNIFF_BYTES = 16

// 50 megapixels. Decoding is what a decompression bomb attacks: a 3 KB PNG can
// declare 60000x60000 and ask the decoder for ten gigabytes of pixel buffer.
// Read off the header and refused BEFORE any decode, so the bomb never gets the
// allocation it was aiming for.
const MAX_IMAGE_PIXELS = 50_000_000

// The one thing a driver is ever told about a failed scan. The real reason goes
// to scan_reason for the admin and the logs — telling an uploader which check he
// tripped is telling him which check to aim at next.
export const DRIVER_SCAN_MESSAGE = "We couldn't verify this document. Please upload another copy."

const startsWith = (bytes, signature) =>
  signature.every((byte, i) => bytes[i] === byte)

/**
 * The format a run of bytes actually is, by its leading signature — or null for
 * anything not on the list above.
 *
 * Split out from the fetching around it so the decision can be exercised
 * directly: everything interesting about this check is which byte patterns it
 * accepts, and none of that is worth a signed URL and a Range request to test.
 */
export function magicContentType(bytes) {
  for (const [contentType, signature] of Object.entries(MAGIC)) {
    if (startsWith(bytes, signature)) return contentType
  }
  return null
}

/**
 * What the file at `path` actually is, by its first bytes. Returns the matching
 * content type, or null for anything not on the list above.
 *
 * Sixteen bytes, not a download. lib/storage.js owns how that is achieved —
 * Supabase has no range read and needs a signed URL plus an HTTP Range request,
 * where GCS and S3 read the range directly — and this function is deliberately
 * unaware of which.
 */
async function sniffContentType(path) {
  return magicContentType(await readRange(path, 0, SNIFF_BYTES - 1))
}

/**
 * The inline check, called by POST /driver/me/documents before it writes
 * anything. Resolves to the REAL content type, or null if the file is not one of
 * the three formats we accept.
 *
 * Kept separate from verifyDocument because it is the only part cheap enough to
 * hold a request open for, and the only part that must run before a
 * DriverDocument row exists pointing at the object.
 */
export async function sniffUpload(path) {
  return sniffContentType(path)
}

/** Best-effort removal of an object no row will ever point at. */
export async function discardUpload(path) {
  try {
    await remove([path])
  } catch (err) {
    console.error(`documentScan: could not discard ${path}:`, err.message)
  }
}

// Tokens that have no business inside a scanned licence, permit or insurance
// certificate, searched for in the raw bytes.
//
// SHORT TOKENS ARE DELIBERATELY ABSENT. Most of a PDF is compressed streams —
// effectively random bytes — so a search for a 3-byte token like `/JS` or `/AA`
// hits by chance roughly once every 16.7 million positions. Measured against 5 MB
// of random bytes, `/AA` fired once and every token of 7 bytes or more fired
// zero times. Including the short ones would reject a large share of legitimate
// insurance PDFs for nothing.
//
// This is a heuristic and not a parser: a name written as `/J#61vaScript`, or an
// action buried inside a compressed object stream, goes straight past it. It
// catches the careless case. The careful case is what serving as an attachment
// and rendering with pdf.js is for.
const PDF_REJECT = ['/JavaScript', '/Launch', '/EmbeddedFile', '/RichMedia']

// Recorded but NOT rejected on. /OpenAction is how a PDF asks to open at a
// particular zoom, which plenty of real scanners emit, and /XFA is an Adobe form
// — odd on a scan, not dangerous alone. Logged so the false-positive rate on
// real documents can be read off the logs before either is promoted.
const PDF_FLAG = ['/OpenAction', '/XFA']

function scanPdf(buffer) {
  // latin1, not utf8: every byte maps to exactly one character, so byte offsets
  // survive and no invalid sequence inside a compressed stream is replaced with
  // U+FFFD — which would corrupt the very region being searched.
  const text = buffer.toString('latin1')

  return {
    found: PDF_REJECT.filter((token) => text.includes(token)),
    flagged: PDF_FLAG.filter((token) => text.includes(token)),
  }
}

// Re-encoding is the point, and it is stronger than any scanner: sharp decodes
// the file to a raw pixel buffer and writes a new JPEG out of it, so nothing
// that was not image data survives. An appended ZIP, a polyglot header, a script
// in an EXIF comment, a second image hidden past the end marker — all discarded,
// because none of it is pixels. Verified against each of those.
//
// `rotate()` with no argument applies the EXIF orientation and then drops the
// metadata, so a licence photographed sideways is stored upright and the GPS tag
// of the captain's house does not travel with it.
//
// This is NOT the app's compression step. The app resizes to 1600px and
// compresses for bandwidth, before the file ever leaves the phone; this runs on
// the server, on bytes that cannot be trusted, and exists for what it destroys
// rather than for what it saves.
export async function reencodeImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })

  // Header only — no decode, no allocation. This is what makes the pixel limit a
  // guard rather than a post-mortem.
  const { width, height } = await image.metadata()
  if (!width || !height) throw new Error('unsupported image format')
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`input image exceeds pixel limit (${width}x${height})`)
  }

  return image.rotate().jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/**
 * The full check on one stored object. Resolves to the fields to write:
 * { scanStatus, scanReason, fileHash }.
 *
 * Never throws for a bad FILE — that is a `failed` with a reason. It throws only
 * when the scan could not be carried out at all, which the caller records as
 * `failed` with no reason and retries. The difference is what the sweep uses to
 * decide whether trying again could possibly help.
 */
export async function verifyDocument(path) {
  const contentType = await sniffContentType(path)
  if (!contentType) {
    return { scanStatus: 'failed', scanReason: 'file signature matches no accepted format', fileHash: null }
  }

  const buffer = await read(path)

  // The first point at which the real byte count is known rather than declared.
  // Per-type, because an image has already been through the app's compression
  // step and a PDF has not — see maxBytesFor.
  const limit = maxBytesFor(contentType)
  if (buffer.byteLength > limit) {
    return {
      scanStatus: 'failed',
      scanReason: `file is ${buffer.byteLength} bytes, over the ${limit} limit for ${contentType}`,
      fileHash: null,
    }
  }

  if (contentType === 'application/pdf') {
    const { found, flagged } = scanPdf(buffer)

    if (flagged.length) {
      console.warn(`documentScan: ${path} carries ${flagged.join(', ')} — allowed, watching`)
    }
    if (found.length) {
      return {
        scanStatus: 'failed',
        scanReason: `PDF contains active content: ${found.join(', ')}`,
        fileHash: null,
      }
    }

    // Nothing is rewritten. A PDF cannot be re-encoded without a full PDF
    // toolchain, and the one thing a naive rewrite reliably destroys is the
    // small print — a policy number at 6pt. It is stored exactly as uploaded,
    // and the admin side never opens it in the OS viewer.
    return { scanStatus: 'clean', scanReason: null, fileHash: sha256(buffer) }
  }

  let reencoded
  try {
    reencoded = await reencodeImage(buffer)
  } catch (err) {
    // sharp could not decode it, or refused it on the pixel limit. The magic
    // bytes said JPEG or PNG, so this is a truncated upload, a decompression
    // bomb, or a deliberately malformed header — a verdict, not an outage.
    return {
      scanStatus: 'failed',
      scanReason: `sharp: ${err.message}`,
      fileHash: null,
    }
  }

  // Overwrites the same path, so `fileUrl` stays correct and the original — the
  // copy that may have had something stapled to it — is gone rather than merely
  // unreferenced.
  //
  // contentType is set HERE, by this server, from what the bytes actually were.
  // From this point the object's declared type is the only one in the system
  // that was not chosen by whoever uploaded it.
  await write(path, reencoded, 'image/jpeg')

  // Hashed AFTER re-encoding, so it fingerprints what is actually stored. Two
  // drivers uploading the same photograph land on the same hash; a file whose
  // payload was stripped does not match the hash of what was uploaded, which is
  // the point.
  return { scanStatus: 'clean', scanReason: null, fileHash: sha256(reencoded) }
}

// How long a row may sit `scanning` before its worker is presumed dead. Longer
// than a scan of a 10 MB PDF plus a re-encode takes, so a slow scan is never
// stolen from a worker that is still on it.
const SCANNING_STALE_MS = 5 * 60 * 1000
// How long a row may sit `pending` before the sweep assumes nothing is coming.
const PENDING_STALE_MS = 2 * 60 * 1000
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
const SWEEP_BATCH = 20

// How long a `failed` document keeps being retried. Without a bound the sweep is
// a perpetual motion machine: a row whose object was deleted from the bucket
// fails every time, lands back on `failed`, and is picked up again five minutes
// later — forever, for the life of the row. A day is far longer than any Storage
// outage and short enough that the retries stop while somebody could still
// plausibly be reading the logs.
const RETRY_FAILED_FOR_MS = 24 * 60 * 60 * 1000

/**
 * Take exclusive ownership of a document for scanning.
 *
 * THE CONCURRENCY STORY IS THIS FUNCTION. Everything else about the scanner is
 * ordinary code; this is the only part where two processes can be wrong at once.
 * The claim is a single conditional UPDATE — the WHERE clause names the states a
 * row may be claimed FROM, so Postgres serialises two simultaneous claims on the
 * same row and the loser's `count` comes back 0.
 *
 * That is why the check is a row count and not a read-then-write: a
 * findFirst followed by an update is two statements with a gap in the middle,
 * and both workers pass the read. It is also why there is no in-memory lock —
 * one would work perfectly on a single instance and silently stop working the
 * first time Render runs two.
 *
 * Returns the claimed row, or null if somebody else had it.
 */
export async function claimDocument(id, { allowStale = false } = {}) {
  const now = new Date()

  const claimableFrom = allowStale
    ? [
      // A worker that died mid-scan. Recognised by age, not by liveness —
      // there is nothing to ask.
      { scanStatus: 'scanning', scanStartedAt: { lt: new Date(now - SCANNING_STALE_MS) } },
      { scanStatus: 'pending' },
      {
        scanStatus: 'failed',
        uploadedAt: { gt: new Date(now - RETRY_FAILED_FOR_MS) },
        scannedAt: { lt: new Date(now - SCANNING_STALE_MS) },
      },
    ]
    : [{ scanStatus: 'pending' }]

  const { count } = await prisma.driverDocument.updateMany({
    where: { id, OR: claimableFrom },
    data: { scanStatus: 'scanning', scanStartedAt: now, scanReason: null },
  })

  if (count === 0) return null

  return prisma.driverDocument.findUnique({
    where: { id },
    // vehicleId comes along so the verdict can settle the CAR as well as the
    // man — a captain's second car has its own badge on the checklist, and a
    // scan clearing its last file is what turns that badge from `scanning` to
    // `pending`.
    select: { id: true, fileUrl: true, driverId: true, vehicleId: true, type: true },
  })
}

/**
 * Claim, scan, and record the verdict for one document. Safe to call twice, from
 * two processes, at the same moment: the second call finds nothing to claim and
 * returns without doing any work.
 *
 * Swallows everything. This is called fire-and-forget from the request path,
 * where an unhandled rejection takes the process down.
 */
export async function scanDocument(id, options) {
  let claimed
  try {
    claimed = await claimDocument(id, options)
  } catch (err) {
    console.error(`documentScan: could not claim ${id}:`, err.message)
    return
  }

  // Somebody else is on it, or it is already settled. Both are fine.
  if (!claimed) return

  let result
  try {
    result = await verifyDocument(claimed.fileUrl)
  } catch (err) {
    // The scan could not be carried out — Storage unreachable, the object gone.
    // No reason is stored beyond the technical one, and the row stays eligible
    // for retry, because trying again might genuinely work.
    console.error(`documentScan: could not scan ${claimed.fileUrl}:`, err.message)
    result = { scanStatus: 'failed', scanReason: err.message, fileHash: null }
  }

  let recorded = 0
  try {
    const { count } = await prisma.driverDocument.updateMany({
      // Guarded on `scanning` AND on the path: by the time this lands the driver
      // may have re-uploaded, and the row now points at a different object.
      // Writing this verdict onto it would mark the NEW file clean on the
      // strength of having scanned the old one.
      where: { id, scanStatus: 'scanning', fileUrl: claimed.fileUrl },
      data: { ...result, scannedAt: new Date(), scanStartedAt: null },
    })
    recorded = count
  } catch (err) {
    console.error(`documentScan: could not record the verdict for ${claimed.fileUrl}:`, err.message)
    return
  }

  // Only when the verdict actually landed on this row. A count of 0 means the
  // driver re-uploaded mid-scan, and telling him THAT file failed would be
  // telling him about a file he has already replaced.
  if (recorded === 0) return

  // A clean scan says nothing. It is invisible bookkeeping — the file was fine,
  // which is what he expected, and a notification for it would train him to
  // ignore the one that matters. A FAILED scan is the opposite: it is the only
  // thing standing between him and being paid, and he cannot see it happen.
  if (result.scanStatus === 'failed') {
    await notifyScanFailed(claimed.driverId, claimed.type)
  }

  // The scan is one of the two things that decide a driver's onboarding state
  // (the other is the admin), so his status moves with it — a last file clearing
  // takes him from `scanning` to `pending`, which is what the app renders.
  try {
    await prisma.$transaction((tx) => recomputeAfterDocumentChange(claimed, tx))
  } catch (err) {
    console.error(`documentScan: could not recompute ${claimed.driverId}:`, err.message)
  }
}

/**
 * Picks up documents nothing recorded a verdict for: rows written before this
 * existed, rows whose scan a restart interrupted, rows abandoned mid-scan by a
 * worker that died, and rows left `failed` by a transient outage.
 *
 * Without this, every non-clean state is a trap rather than a safe default — the
 * admin screen refuses to serve those files, and nothing would ever move them
 * out, so one restart at the wrong moment would strand a captain's onboarding
 * with no error visible anywhere.
 *
 * Exported so Cloud Scheduler can drive it over HTTP where a setInterval cannot
 * run (see lib/jobs.js). Unlike the other two sweeps this one is allowed to
 * throw: a Storage outage mid-sweep is worth a 500 and a scheduler retry,
 * because the documents it did not reach are captains sitting on a "Checking…"
 * screen. The timer path below keeps its own .catch for the same reason it
 * always had one.
 */
export async function sweepDocumentScans() {
  if (!isStorageConfigured()) return

  const now = Date.now()

  const stale = await prisma.driverDocument.findMany({
    where: {
      OR: [
        // Never scanned, and long enough ago that whatever should have scanned
        // it is gone. Rows predating the scanner land here too — their
        // uploadedAt is months old, so the first sweep picks them up.
        { scanStatus: 'pending', uploadedAt: { lt: new Date(now - PENDING_STALE_MS) } },
        // Claimed, then abandoned. A worker that is still alive re-stamps
        // nothing, so age is the only available signal — hence a window long
        // enough that a slow scan is never stolen.
        { scanStatus: 'scanning', scanStartedAt: { lt: new Date(now - SCANNING_STALE_MS) } },
        // Tried and could not be scanned. Bounded twice: not again within the
        // stale window, and not at all once the upload is a day old. A document
        // out of retries KEEPS `failed` — which is what the admin screen shows
        // and refuses to serve — rather than being promoted to a verdict nobody
        // ever reached.
        {
          scanStatus: 'failed',
          uploadedAt: { gt: new Date(now - RETRY_FAILED_FOR_MS) },
          scannedAt: { lt: new Date(now - SCANNING_STALE_MS) },
        },
      ],
    },
    select: { id: true },
    orderBy: { uploadedAt: 'asc' },
    // Bounded. A backlog after an outage should drain over several sweeps rather
    // than pull every document ever uploaded into one process's memory at once.
    take: SWEEP_BATCH,
  })

  if (!stale.length) return

  console.log(`documentScan: re-scanning ${stale.length} document(s)`)
  // Sequentially, not Promise.all: this runs on the same 512 MB instance that
  // serves rides, and twenty concurrent sharp decodes is how that instance runs
  // out of memory during a Friday evening rush. Each call re-claims, so a row
  // another instance took in the meantime is skipped rather than duplicated.
  for (const { id } of stale) {
    await scanDocument(id, { allowStale: true })
  }
}

export function startDocumentScanJob() {
  if (!isStorageConfigured()) {
    console.warn('documentScan: storage not configured — the scan sweep will not run.')
    return
  }

  // Never awaited and never allowed to throw: this is a timer, and an unhandled
  // rejection inside one takes the whole server with it.
  const run = () => { sweepDocumentScans().catch((err) => console.error('documentScan sweep:', err.message)) }

  run()
  const timer = setInterval(run, SWEEP_INTERVAL_MS)
  // Does not hold the process open on its own, so Ctrl+C still exits at once.
  timer.unref?.()
}

/**
 * A short-lived URL an admin can open a document with.
 *
 * `download: true` sets Content-Disposition: attachment, so whatever the file
 * turns out to be the browser saves it instead of rendering it in a tab — which
 * is what turns a surviving HTML-in-a-JPEG into an inert file rather than script
 * running on the dashboard's own origin.
 *
 * FAILS CLOSED, and this is the single most important line in the file: anything
 * not `clean` gets null. `pending`, `scanning` and `failed` all mean the same
 * thing from here — nothing is known about those bytes — and the only safe
 * default for a file nothing has vouched for is that nobody can open it.
 */
export async function signedDocumentUrl(document, expiresInSeconds = 120) {
  // BEFORE the configuration check, deliberately. This is the stronger of the
  // two invariants and it needs nothing to hold: a document that has not passed
  // the file check gets no URL whether or not Storage is reachable, whether or
  // not the keys are set, and whether or not anything else about the process is
  // working. Ordered the other way it would be a rule that depends on a
  // dependency being healthy, which is not what "fails closed" means.
  if (!document || document.scanStatus !== 'clean') return null

  // Still a throw, and still separate from the failure below. "Storage is not
  // configured" is a deployment fault the operator has to see; a signing error
  // on a correctly configured bucket is a transient the admin screen can render
  // as a missing link. Collapsing the two would hide the first behind the second.
  if (!isStorageConfigured()) throw new Error('Storage is not configured')

  try {
    return await signedReadUrl(document.fileUrl, expiresInSeconds, { download: true })
  } catch (err) {
    console.error(`documentScan: could not sign ${document.fileUrl}:`, err.message)
    return null
  }
}

export { MAX_IMAGE_PIXELS, MAX_DOCUMENT_BYTES, PDF_REJECT, PDF_FLAG, scanPdf, sha256 }
