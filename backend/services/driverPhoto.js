import { supabase, DRIVER_DOCUMENTS_BUCKET } from '../lib/supabase.js'

// The captain's photograph, as a rider sees it.
//
// This is the only file in the system shown to somebody outside the company, and
// it is shown at the moment it matters most: a passenger standing on a road at
// night, deciding whether the man who just pulled up is the man the app sent. So
// it is worth being exact about what it is and is not.
//
// IT IS NOT PUBLIC. The object lives in the same private bucket as the licence
// and the insurance, and a rider is handed a signed URL minted for that one
// response. The alternative — copying approved photos into a public bucket — is
// cheaper per request and was the obvious design, but it makes a permanent,
// guessable, un-revocable URL to a photograph of a named man's face, and a
// driver who leaves the fleet cannot be un-published from a CDN. A URL that
// stops working ten minutes later can.
//
// It is only ever minted from Driver.pfpUrl, which routes/admin.ts writes in
// exactly one place: when an admin approves a `profile_photo` document that has
// already passed the file check. There is no path from an uploaded file to a
// rider's screen that skips both gates.

// Long enough to load on a bad connection and be re-read when the rider glances
// back at his phone; short enough that a URL pasted into a group chat is dead
// before anybody opens it. The rider's app re-asks by re-reading the booking.
const RIDER_URL_TTL_SECONDS = 15 * 60

// The captain looking at his own account is a different case: nothing is being
// shared, the screen is his, and a shorter life just means the avatar breaks
// while he reads the page.
const SELF_URL_TTL_SECONDS = 60 * 60

async function sign(path, expiresIn) {
  if (!path || !supabase) return null

  const { data, error } = await supabase.storage
    .from(DRIVER_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error || !data) {
    // Never throws. A missing avatar is a cosmetic problem on every screen that
    // renders one, and failing a booking response over it would turn that into
    // a rider who cannot see his ride at all.
    console.error(`driverPhoto: could not sign ${path}:`, error?.message)
    return null
  }
  return data.signedUrl
}

/**
 * The photo URL for a rider who has been assigned this driver.
 *
 * @param {{ pfpUrl: string | null } | null} driver
 */
export const signedRiderPhotoUrl = (driver) =>
  sign(driver?.pfpUrl ?? null, RIDER_URL_TTL_SECONDS)

/**
 * The photo URL for the captain's own account screen.
 *
 * @param {{ pfpUrl: string | null } | null} driver
 */
export const signedDriverPhotoUrl = (driver) =>
  sign(driver?.pfpUrl ?? null, SELF_URL_TTL_SECONDS)
