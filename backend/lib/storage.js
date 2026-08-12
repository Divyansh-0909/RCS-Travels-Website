import { supabase, DRIVER_DOCUMENTS_BUCKET } from './supabase.js'

// Object storage, in this application's terms rather than a vendor's.
//
// WHY THIS EXISTS. Every driver document — a licence, an insurance certificate,
// a photograph of a captain's face — lives in object storage, and until now the
// vendor's own client was called directly from four places: the upload-url and
// confirm endpoints, the scanner, and the rider-facing photo URL. That is fine
// while there is one vendor. It stops being fine the moment there are two,
// because "move to Google Cloud Storage" then means edits scattered across a
// route file, a scanner and a notification helper, each with its own error
// handling, and no single place to be sure they all agree.
//
// So this is the seam. Everything above it speaks in paths and buffers;
// everything below it is one vendor's SDK. Swapping Supabase Storage for GCS
// becomes a rewrite of this file and nothing else.
//
// WHAT THIS IS NOT: a general-purpose storage wrapper. There are exactly seven
// operations because the application performs exactly seven, and each signature
// is shaped by its one caller. A thin pass-through of the vendor's API would
// have moved the coupling rather than removed it — `readRange` is the clearest
// case, see its comment.
//
// ERRORS ARE THROWN, uniformly. The vendor returns `{ data, error }` tuples and
// the callers each want something different from a failure: the scanner treats
// an unreachable object as retryable, the rider's avatar degrades to no picture,
// a discarded upload is best-effort. Encoding those policies here would bury
// them; throwing keeps each decision at the call site that owns it.

/**
 * Is object storage usable at all in this process?
 *
 * Development runs without keys — lib/supabase.js hands back a null client
 * rather than refusing to boot, so every route that does not touch documents
 * still works. The endpoints that do need it answer 503 off this.
 */
export const isStorageConfigured = () => supabase !== null

function bucket() {
  // The same sentence lib/supabase.js documents at length: production cannot
  // reach here (it throws at import without keys), so this is the development
  // path, and a clear message beats a TypeError about reading `storage` of null.
  if (!supabase) throw new Error('Storage is not configured')
  return supabase.storage.from(DRIVER_DOCUMENTS_BUCKET)
}

/** Fail with the vendor's message where there is one, and a usable one where there isn't. */
const fail = (what, error) => {
  throw error instanceof Error ? error : new Error(`${what}: ${error?.message ?? 'unknown storage error'}`)
}

/**
 * A URL the holder may PUT one object to, once.
 *
 * The path is composed server-side by the caller (services/driverDocuments.js,
 * uploadPrefix) and never by the uploader — that is the property the whole
 * document security model rests on, and it lives there rather than here because
 * it is about driver identity, not about storage.
 *
 * @returns {Promise<{ path: string, uploadUrl: string }>}
 */
export async function signedUploadUrl(path) {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: true })
  if (error || !data) fail(`could not sign an upload for ${path}`, error)

  // `token` is deliberately dropped. Supabase returns it alongside the URL and
  // it is already embedded IN that URL; the captain app has never read it
  // (src/lib/uploadDocuments.ts takes path and uploadUrl only), and a signed PUT
  // on any other vendor has no such concept. Returning it would put a
  // Supabase-shaped field into an interface meant to outlive Supabase.
  return { path: data.path, uploadUrl: data.signedUrl }
}

/**
 * A short-lived URL for READING one object.
 *
 * `download` sets Content-Disposition: attachment, which is what turns a file
 * that survived the scanner into something a browser saves rather than renders —
 * see the comment on signedDocumentUrl for why that matters on the admin
 * dashboard specifically.
 */
export async function signedReadUrl(path, expiresInSeconds, { download = false } = {}) {
  const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds, { download })
  if (error || !data) fail(`could not sign a read for ${path}`, error)
  return data.signedUrl
}

/**
 * What storage BELIEVES about an object: its declared size and content type.
 *
 * "Believes" is the operative word and the caller must treat it that way. The
 * content type is the header the uploader sent — Supabase stores that string and
 * never inspects the bytes — so this is a claim, not a fact. The real check is
 * readRange plus magic bytes, in services/documentScan.js.
 *
 * @returns {Promise<{ size: number | null, contentType: string | null }>}
 */
export async function stat(path) {
  const { data, error } = await bucket().info(path)
  if (error || !data) fail(`could not stat ${path}`, error)
  return { size: data.size ?? null, contentType: data.contentType ?? null }
}

/**
 * The first bytes of an object, as a byte range.
 *
 * THE REASON THIS IS AN OPERATION AND NOT A HELPER. Supabase Storage has no
 * range read, so the only way to get sixteen bytes without downloading a 10 MB
 * PDF is to mint a signed URL and issue an HTTP Range request against it — two
 * round trips and an implementation detail of one vendor. Google Cloud Storage
 * does have one (`createReadStream({ start, end })`), and so does S3.
 *
 * Exposing "read this range" rather than "give me a signed URL so I can range it
 * myself" is exactly what stops that vendor quirk leaking upward. The scanner
 * asks for bytes and gets bytes.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function readRange(path, start, end) {
  const url = await signedReadUrl(path, 60)

  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
  // 206 is the expected answer; 200 means the range was ignored and the whole
  // object is coming, which is affordable for the sixteen bytes this is used for
  // and would not be for a large file. Either way the first bytes are the first
  // bytes, so this does not fail on it.
  if (!response.ok) throw new Error(`could not read ${path} (${response.status})`)

  return new Uint8Array(await response.arrayBuffer())
}

/** The whole object. @returns {Promise<Buffer>} */
export async function read(path) {
  const { data, error } = await bucket().download(path)
  if (error || !data) fail(`could not download ${path}`, error)
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Write an object, replacing whatever is there.
 *
 * `contentType` is set by the SERVER here, from what the bytes were found to
 * actually be — which is what makes the stored object's declared type the only
 * one in the system that the uploader did not choose. See verifyDocument.
 */
export async function write(path, buffer, contentType) {
  const { error } = await bucket().upload(path, buffer, { contentType, upsert: true })
  if (error) fail(`could not write ${path}`, error)
}

/** Delete objects. @param {string[]} paths */
export async function remove(paths) {
  const { error } = await bucket().remove(paths)
  if (error) fail(`could not remove ${paths.join(', ')}`, error)
}
