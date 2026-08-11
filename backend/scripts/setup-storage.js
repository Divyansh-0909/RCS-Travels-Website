import { supabase, DRIVER_DOCUMENTS_BUCKET } from '../lib/supabase.js'
import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
} from '../constants/driverDocuments.js'

// Creates (or re-settles) the driver-documents bucket. Idempotent — run it as
// many times as you like, and run it again after changing the constants above,
// because the bucket's own limits are the only ones a caller holding a signed
// URL cannot argue with.
//
//   npm run storage:setup
//
// There are deliberately NO RLS policies to create. Storage's policies govern
// the anon and authenticated roles, and neither of them ever touches this
// bucket: the captain app uploads with a one-shot signed token (which needs no
// policy at all), and admins read through short-lived signed download URLs this
// server mints with the secret key (which bypasses RLS). A bucket with no
// policies is therefore a bucket nobody but this server can reach, which is
// exactly the intent — leave it that way.

if (!supabase) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY are not set. See backend/.env.example.')
  process.exit(1)
}

const options = {
  public: false,
  allowedMimeTypes: DOCUMENT_CONTENT_TYPES,
  fileSizeLimit: MAX_DOCUMENT_BYTES,
}

const { error: createError } = await supabase.storage.createBucket(DRIVER_DOCUMENTS_BUCKET, options)

if (createError) {
  // Storage answers 409/"already exists" on a second run. That is the expected
  // path once the bucket is live, so it updates rather than failing — this is
  // how a change to MAX_DOCUMENT_BYTES reaches the bucket.
  const alreadyExists =
    createError.message?.toLowerCase().includes('already exists') ||
    createError.statusCode === '409'

  if (!alreadyExists) {
    console.error('Could not create the bucket:', createError)
    process.exit(1)
  }

  const { error: updateError } = await supabase.storage.updateBucket(DRIVER_DOCUMENTS_BUCKET, options)
  if (updateError) {
    console.error('Bucket exists but could not be updated:', updateError)
    process.exit(1)
  }
  console.log(`Bucket "${DRIVER_DOCUMENTS_BUCKET}" already existed — settings re-applied.`)
} else {
  console.log(`Bucket "${DRIVER_DOCUMENTS_BUCKET}" created.`)
}

console.log(`  private:   yes`)
console.log(`  max size:  ${(MAX_DOCUMENT_BYTES / 1024 / 1024).toFixed(0)} MB`)
console.log(`  mime:      ${DOCUMENT_CONTENT_TYPES.join(', ')}`)
