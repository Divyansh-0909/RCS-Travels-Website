import 'dotenv/config'
import admin from 'firebase-admin'

// Firebase Admin, initialised once per process and only if it is configured.
//
// The credentials arrive as one base64 blob rather than three separate vars for
// the reason .env.example already gives: the private key is multi-line PEM, and
// as its own environment variable it needs a \n unescape that is easy to forget
// and only fails once deployed.
//
// Lazy, not eager. Nothing here should stop the server booting: a deploy with no
// Firebase credentials must still take bookings and still serve rides, it just
// cannot push. Every caller goes through `messaging()` below and gets null when
// that is the case.
let app = null
let attempted = false

function init() {
  attempted = true

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!encoded) {
    console.warn('firebase: FIREBASE_SERVICE_ACCOUNT_BASE64 not set — push notifications are disabled.')
    return null
  }

  try {
    const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    // getApps() rather than a bare initializeApp: tsx watch re-imports modules on
    // reload, and a second initializeApp with the same name throws.
    return admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  } catch (err) {
    // A malformed blob is a configuration mistake, not a reason to refuse to
    // serve rides. Loud in the log, silent everywhere else.
    console.error('firebase: could not initialise —', err.message)
    return null
  }
}

/** The Messaging instance, or null when Firebase is not configured. */
export function messaging() {
  if (!attempted) app = init()
  return app ? admin.messaging(app) : null
}

export const isPushConfigured = () => {
  if (!attempted) app = init()
  return app !== null
}
