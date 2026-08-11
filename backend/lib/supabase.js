import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// The server's Supabase client, and the ONLY one in the codebase — there is no
// Supabase client in the captain app or the website, deliberately.
//
// This holds the secret (service_role) key, which bypasses RLS entirely and can
// read every object in every bucket. It exists here so that the only thing the
// phone ever receives is a signed URL scoped to one object it may write once:
// the app never learns a key, so a decompiled APK yields nothing, and revoking
// access is a server restart rather than an app release.
//
// Postgres is NOT accessed through this client. Prisma owns the database (see
// db/prisma.js); this is Storage only.
const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

const missing = [
  !url && 'SUPABASE_URL',
  !secretKey && 'SUPABASE_SECRET_KEY',
].filter(Boolean)

// Production refuses to boot without them, for the same reason FARE_QUOTE_SECRET
// does: a deploy that silently cannot accept documents looks healthy from the
// outside and only fails on the one screen nobody tests after a release.
//
// Development gets a null client instead, so a checkout without Supabase keys
// still runs every other route. The endpoints that need it answer 503 rather
// than throwing a TypeError about reading `storage` of null.
if (missing.length && process.env.NODE_ENV === 'production') {
  throw new Error(
    `Missing ${missing.join(' and ')}. Project Settings -> API Keys in the ` +
    `Supabase dashboard: the URL is the Project URL, the key is the "secret" ` +
    `one (sb_secret_...), or "service_role" on the Legacy tab. It is a SERVER ` +
    `secret — never ship it to the app or the website.`,
  )
}

if (missing.length) {
  console.warn(`supabase: ${missing.join(' and ')} not set — document uploads will answer 503.`)
}

export const supabase = missing.length
  ? null
  : createClient(url, secretKey, {
    // No user ever signs in through this client — Clerk is the identity system
    // and the service key is not a session. Left on, auth-js would try to
    // persist and refresh a session that does not exist, on a server where
    // "the current user" is per-request and not per-process.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

// Private. Nothing in it is ever fetched without a signed URL this server made:
// these are a driver's licence, his insurance and photographs of his car, and a
// public bucket would put all of it behind a guessable path.
export const DRIVER_DOCUMENTS_BUCKET = 'driver-documents'
