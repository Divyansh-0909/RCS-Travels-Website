import 'dotenv/config'
import { Storage } from '@google-cloud/storage'

// Object storage, in this application's terms rather than a vendor's.
//
// WHY THIS EXISTS. Every driver document — a licence, an insurance certificate,
// a photograph of a captain's face — lives in object storage, and it used to be
// reached by calling the vendor's client directly from four places: the
// upload-url and confirm endpoints, the scanner, and the rider-facing photo URL.
// Eighteen call sites, each with its own error handling. This is the seam that
// replaced them: above it nothing knows the vendor, below it is one SDK. It is
// what made swapping Supabase Storage for Google Cloud Storage a rewrite of this
// file and nothing else.
//
// WHAT THIS IS NOT: a general-purpose storage wrapper. There are exactly seven
// operations because the application performs exactly seven, and each signature
// is shaped by its one caller.
//
// ERRORS ARE THROWN, uniformly. The callers each want something different from a
// failure — the scanner treats an unreachable object as retryable, the rider's
// avatar degrades to no picture, a discarded upload is best-effort — and
// encoding those policies here would bury them.
//
// WHY GCS RATHER THAN SUPABASE STORAGE. Two reasons, neither of them "it is
// newer". The credential model: Supabase Storage is reached with a service_role
// key, a single long-lived string that bypasses RLS and can read every object in
// every bucket, which has to be stored somewhere and can leak. Cloud Run holds no
// key at all — it authenticates as an attached service account whose credentials
// are short-lived and rotated by the platform, scoped by IAM to this one bucket.
// And availability: a paused Supabase project takes storage down with the
// database, so a captain's onboarding and a rider's view of his driver's face
// both fail for a reason that has nothing to do with either.
//
// WHAT WE GAVE UP, recorded because it was a real control and is now gone.
// Supabase buckets carry `allowedMimeTypes` and `fileSizeLimit`, enforced by the
// storage service itself — the one check a caller holding a signed URL could not
// talk his way past. GCS has no equivalent. Partially replaced by binding the
// content type into the signature below (a signed URL now only accepts the type
// it was minted for); the rest of the defence is the confirm endpoint reading the
// object's REAL size and first bytes, and the scanner re-encoding it.

// Which bucket, and the switch that says whether storage is usable at all.
// Absent in a checkout without cloud access, exactly as SUPABASE_URL used to be:
// the document routes answer 503 rather than throwing, so every other route still
// works on a laptop with no Google credentials.
const BUCKET = process.env.GCS_BUCKET

// One client for the process. Credentials come from Application Default
// Credentials — the attached service account on Cloud Run, `gcloud auth
// application-default login` on a developer machine. THERE IS NO KEY FILE AND
// THERE MUST NEVER BE ONE: a service-account JSON in the repo or an env var is
// the long-lived secret this migration existed to get rid of.
const storage = BUCKET ? new Storage() : null

/**
 * Is object storage usable at all in this process?
 *
 * Development runs without it, so every route that does not touch documents
 * still works. The endpoints that do need it answer 503 off this.
 */
export const isStorageConfigured = () => storage !== null

function bucket() {
  if (!storage) throw new Error('Storage is not configured (GCS_BUCKET is unset)')
  return storage.bucket(BUCKET)
}

// How long a signed upload URL lives. Long enough for a captain to photograph six
// documents at a taxi stand on 4G and still be uploading; short enough that a URL
// captured from a phone is dead before it is useful. Matches what the endpoint
// reports back to the app as `expiresInSeconds`.
const UPLOAD_URL_TTL_MS = 2 * 60 * 60 * 1000

/**
 * A URL the holder may PUT one object to, with the type AND the size it is
 * allowed to be baked into the signature.
 *
 * The path is composed server-side by the caller (services/driverDocuments.js,
 * uploadPrefix) and never by the uploader — that is the property the whole
 * document security model rests on, and it lives there rather than here because
 * it is about driver identity, not about storage.
 *
 * TWO CONSTRAINTS ARE SIGNED, and between them they are what replaced the
 * bucket-level allowlist Supabase enforced and GCS has no setting for:
 *
 *   contentType                 -> the PUT must carry exactly this Content-Type,
 *                                  so a URL minted for a photograph cannot be
 *                                  used to upload a PDF.
 *   x-goog-content-length-range -> GCS itself measures the body and refuses
 *                                  anything outside the range. Not a header the
 *                                  server trusts the client about: the client
 *                                  must ECHO it (it is part of what was signed,
 *                                  so altering it invalidates the signature) and
 *                                  Google then enforces it against the real byte
 *                                  count.
 *
 * That second one matters more than it looks. Without it the only size checks
 * left are the confirm endpoint and the scanner, both of which run AFTER the
 * bytes have already been paid for and stored — so a caller holding a signed URL
 * could push a 2 GB file and be refused only once it had arrived. This is the one
 * check a holder of the URL cannot argue with.
 *
 * The client must send both headers back verbatim, so they are returned rather
 * than left for the app to reconstruct — the app should never hold a second copy
 * of the size limits.
 *
 * SIGNING ON CLOUD RUN WORKS WITHOUT A PRIVATE KEY, and this is the one piece of
 * setup that is not obvious: the runtime service account has no key to sign with,
 * so the library signs through the IAM credentials API instead. That requires the
 * account to hold roles/iam.serviceAccountTokenCreator ON ITSELF. Without it this
 * call fails with a permission error that says nothing about signing.
 *
 * @param {string} path
 * @param {string} contentType
 * @param {number} maxBytes  the largest this object may be, in bytes
 * @returns {Promise<{ path: string, uploadUrl: string, headers: Record<string,string> }>}
 */
export async function signedUploadUrl(path, contentType, maxBytes) {
  // From zero, not from one. An empty upload is a bad file rather than an
  // attack, and it is already caught by the magic-byte sniff with a message that
  // says something useful; refusing it here would surface as an opaque 403 from
  // Google instead.
  const lengthRange = `0,${maxBytes}`

  const [uploadUrl] = await bucket().file(path).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + UPLOAD_URL_TTL_MS,
    contentType,
    extensionHeaders: { 'x-goog-content-length-range': lengthRange },
  })

  return {
    path,
    uploadUrl,
    headers: {
      'Content-Type': contentType,
      'x-goog-content-length-range': lengthRange,
    },
  }
}

/**
 * A short-lived URL for READING one object.
 *
 * `download` sets Content-Disposition: attachment, so whatever the file turns out
 * to be the browser saves it instead of rendering it in a tab — which is what
 * turns a surviving HTML-in-a-JPEG into an inert file rather than script running
 * on the dashboard that administers the whole fleet.
 */
export async function signedReadUrl(path, expiresInSeconds, { download = false } = {}) {
  const [url] = await bucket().file(path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInSeconds * 1000,
    ...(download ? { responseDisposition: 'attachment' } : {}),
  })
  return url
}

/**
 * What storage BELIEVES about an object: its declared size and content type.
 *
 * "Believes" is the operative word and the caller must treat it that way. The
 * content type is what was declared at upload — the service stores that string
 * and never inspects the bytes — so this is a claim, not a fact. The real check
 * is readRange plus magic bytes, in services/documentScan.js.
 *
 * @returns {Promise<{ size: number | null, contentType: string | null }>}
 */
export async function stat(path) {
  const [metadata] = await bucket().file(path).getMetadata()
  return {
    // GCS reports size as a decimal STRING, not a number. Left uncoerced it
    // silently breaks every size comparison at the call site — '6000000' > 5242880
    // is false, because JavaScript compares those as strings.
    size: metadata.size != null ? Number(metadata.size) : null,
    contentType: metadata.contentType ?? null,
  }
}

/**
 * The first bytes of an object, as a byte range.
 *
 * A native ranged read. The Supabase implementation had to mint a signed URL and
 * issue an HTTP Range request against it, because that API has no range read —
 * two round trips and one vendor's quirk. Exposing "read this range" rather than
 * "give me a URL so I can range it myself" is exactly what kept that from leaking
 * upward, and is why this swap changed no caller.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function readRange(path, start, end) {
  const chunks = []
  // `end` is inclusive here and in the HTTP Range header, so the caller's
  // (0, SNIFF_BYTES - 1) means the same thing it always did.
  for await (const chunk of bucket().file(path).createReadStream({ start, end })) {
    chunks.push(chunk)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

/** The whole object. @returns {Promise<Buffer>} */
export async function read(path) {
  const [buffer] = await bucket().file(path).download()
  return buffer
}

/**
 * Write an object, replacing whatever is there.
 *
 * `contentType` is set by the SERVER here, from what the bytes were found to
 * actually be — which is what makes the stored object's declared type the only
 * one in the system that the uploader did not choose. See verifyDocument.
 *
 * `resumable: false` because every write through this path is a re-encoded image
 * of a few hundred kilobytes. A resumable upload costs an extra round trip to
 * open a session and buys nothing below about 10 MB.
 */
export async function write(path, buffer, contentType) {
  await bucket().file(path).save(buffer, { contentType, resumable: false })
}

/**
 * Delete objects.
 *
 * `ignoreNotFound` because both callers are cleaning up rather than asserting:
 * one discards an upload no row will ever point at, the other collects objects a
 * renewal has replaced. An object already gone is the desired end state, not an
 * error worth failing a captain's upload over.
 *
 * @param {string[]} paths
 */
export async function remove(paths) {
  const b = bucket()
  await Promise.all(paths.map((path) => b.file(path).delete({ ignoreNotFound: true })))
}
