// ONE phone format across the app: the bare 10 digits, no country code, no +,
// no spaces. This is not a preference, it is what the code already assumes in
// three places that cannot disagree —
//
//   routes/hybridAuth.js  rejects anything where phone.length !== 10, then
//                         looks the account up by that exact string
//   routes/hybridAuth.js  derives the Clerk identity as `91${phone}@rcs-travels.com`
//   services/notification.js  sends WhatsApp to `91${phone}`
//
// Driver rows seeded before 4 Aug 2026 stored E.164 ('+919810000001') instead.
// No login could ever match them, and had one somehow got through, the Clerk
// email would have been `91+919810000001@rcs-travels.com` — created without
// complaint, matching nothing a real sign-in produces.
//
// Normalize on write. The API boundary keeps its own strict check, so a client
// sending a formatted number still gets a 400 rather than being quietly fixed.

/**
 * @param {unknown} input
 * @returns {string|null} the 10-digit number, or null if it isn't one
 */
export function normalizePhone(input) {
  if (input == null) return null

  const digits = String(input).replace(/\D/g, '')

  // 91 is a country code only when it isn't part of the number itself — a valid
  // 10-digit mobile can begin with 91, so strip it from a 12-digit string only.
  const local = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits

  return /^\d{10}$/.test(local) ? local : null
}

export const isPhone = (input) => normalizePhone(input) !== null
