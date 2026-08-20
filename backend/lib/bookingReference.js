import crypto from 'crypto'
// db/prisma.js, not the lib/prisma.js sitting next to this file — that one is a
// dead CommonJS leftover pointing at a generated/ path this app no longer builds.
import { prisma } from '../db/prisma.js'

// The human-readable name of a ride: "RCS4831902".
//
// Booking.id is a v4 uuid and stays the key everything joins on. It is not a
// thing a rider can read down a phone line, and support had been asking people
// to spell out 36 characters of hex. This is the id that gets spoken, typed into
// WhatsApp, and quoted back in a complaint.
//
// Digits only, no letters. These get read aloud in a Hindi/English mix, where
// B/V, D/E and M/N collide constantly by voice; digits survive that, and a
// denser base-32 alphabet would buy two characters at the cost of every support
// call ending in "no, V for Victor". For the same reason there is no separator
// stored — the canonical value is one unbroken token that can be pasted into a
// search box or a URL, and a UI wanting "RCS 483 1902" can group it for display.
export const REFERENCE_PREFIX = 'RCS'

// 10^7 values. Sized off the business, not off a round number: at a plausible
// ceiling of ~200 rides a day this table takes ~73k rows a year, so a 6-digit
// space (1M) actually saturates inside the company's lifetime and its collision
// retries get worse every year on the way there. 7 digits leaves ~10x headroom —
// at 1M existing bookings only ~10% of inserts collide once, which the retry
// below absorbs invisibly — and costs one character less to read out than 8.
const REFERENCE_DIGITS = 7
const REFERENCE_SPACE = 10 ** REFERENCE_DIGITS

// Random, not a counter. A sequential reference tells every driver and every
// competitor how many rides this company ran last month, and it invites someone
// to walk the range the first time this value is accepted as a lookup key. The
// cost of random is the retry loop below, and the codebase already carries that
// idiom for User.bookingCode (routes/users.js).
export const generateReference = () =>
  `${REFERENCE_PREFIX}${String(crypto.randomInt(0, REFERENCE_SPACE)).padStart(REFERENCE_DIGITS, '0')}`

// Matches a whole reference, with or without the prefix, in either case — what a
// rider actually pastes into a search box.
const REFERENCE_RE = new RegExp(`^(?:${REFERENCE_PREFIX})?(\\d{${REFERENCE_DIGITS}})$`, 'i')

/**
 * Read a search box's contents as a reference, in whatever shape it was pasted:
 * "RCS4831902", "rcs4831902", "4831902", "RCS 483 1902". Returns the canonical
 * stored form, or null when the query is not a reference at all.
 *
 * Search call sites test this BEFORE they test for a phone number. A bare
 * 7-digit tail is all-digits too, and the phone branch would otherwise swallow
 * it and match nothing.
 *
 * @param {string} input
 * @returns {string|null}
 */
export function normalizeReference(input) {
  const compact = String(input ?? '').replace(/[\s+\-()]/g, '')
  const match = REFERENCE_RE.exec(compact)
  return match ? `${REFERENCE_PREFIX}${match[1]}` : null
}

// Five, matching the User.bookingCode loop. Even at 1M bookings a single attempt
// collides ~10% of the time, so five independent draws fail at ~1e-5 — and that
// only becomes reachable at a table size this business will not see for a decade.
const MAX_ATTEMPTS = 5

// Prisma reports a unique violation as P2002 and names the offending constraint
// in `meta.target` — an array of column names on some versions, the index name on
// others. Both shapes have to be recognised, because retrying on the WRONG
// constraint is the failure mode that matters: Booking.id is unique too, and a
// blind retry on any P2002 would redraw a reference five times over an id clash
// and then report the id problem as a reference problem.
const isReferenceConflict = (e) => {
  if (e?.code !== 'P2002') return false
  const target = e.meta?.target
  if (Array.isArray(target)) return target.includes('reference')
  return typeof target === 'string' && target.includes('reference')
}

/**
 * Create a booking, allocating its reference and retrying past collisions.
 *
 * The only supported way to insert a booking. Generation lives here rather than
 * at the call sites because there are two of them — the scheduled and immediate
 * branches of POST /bookings — and a retry loop copied into both is a retry loop
 * that drifts apart.
 *
 * @param {import('@prisma/client').Prisma.BookingUncheckedCreateInput} data booking fields, minus `reference`
 * @returns {Promise<import('@prisma/client').Booking>}
 */
export async function createBooking(data, db = prisma) {
  let lastConflict = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await db.booking.create({
        data: { ...data, reference: generateReference() },
      })
    } catch (e) {
      if (!isReferenceConflict(e)) throw e
      lastConflict = e
    }
  }

  // Five collisions in a row is not bad luck at any table size this app will
  // reach — it means the space is full or the unique index is on the wrong
  // thing. Surfacing the original Prisma error keeps that diagnosable.
  throw lastConflict
}
