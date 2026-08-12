import 'dotenv/config'
import { timingSafeEqual } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'

// Who is allowed to POST /internal/jobs/:name.
//
// These endpoints run the sweeps that offer rides, scan documents and take
// drivers off the road for lapsed papers. None of that is destructive on its own
// — every sweep is idempotent and safe to run twice — but they are unauthenticated
// database work on a free-tier Postgres, and an open URL that runs twenty Sharp
// re-encodes is a way to spend somebody's money and pin their CPU from a laptop.
// So they are closed by default and opened only to one named caller.
//
// WHY OIDC AND NOT A SHARED SECRET. Cloud Scheduler can mint a Google-signed ID
// token for a service account and attach it to the request, and Google's public
// keys are what verify it. There is no secret to leak, no secret to rotate, and
// no secret sitting in two places waiting to drift apart. A static bearer string
// would be simpler and is what the dev path below uses, but in production it is a
// password in an environment variable that would still be valid a year after
// somebody pasted it into a chat.
//
// FAILS CLOSED, and every branch below has to. A misconfigured deploy must answer
// 503 rather than "well, nothing was configured, so let it through" — the second
// is how an internal endpoint becomes a public one without anybody editing a line
// of code.

// Every one of these is read PER REQUEST rather than captured at import, and
// that is a deliberate choice rather than an oversight about performance (an
// object property read is free next to an RS256 verification).
//
// Captured at import, the values would be frozen to whatever happened to be set
// the first time some other module pulled this one in — which makes the
// production branch below impossible to exercise from a test, and makes the
// whole file's behaviour depend on import order. A security boundary should be
// something a test can point at, and it cannot be if its configuration is
// baked in before the test runs.

// The Cloud Run service URL the scheduler mints its token FOR, e.g.
// "https://rcs-api-abc123-el.a.run.app". Verified as the token's `aud`, which is
// what stops a token minted for some other service — or some other project — from
// being replayed here.
const audience = () => process.env.INTERNAL_JOBS_AUDIENCE

// The service account Cloud Scheduler runs as, e.g.
// "rcs-scheduler@rcs-travels.iam.gserviceaccount.com". Checked against the
// token's `email`, because a valid Google token proves only that GOOGLE signed
// it — every service account in every project has one. Without this check the
// audience is the only gate, and the audience is a public URL.
const caller = () => process.env.INTERNAL_JOBS_SERVICE_ACCOUNT

// DEVELOPMENT ONLY. There is no Cloud Scheduler on a laptop and no way to mint a
// real OIDC token from one, so a long random string stands in — it exists so the
// endpoints can be exercised with curl before any of this reaches Google.
// Unreachable when NODE_ENV=production, checked below rather than merely
// documented, because "dev-only" enforced by a comment is not enforced.
const devSecret = () => process.env.INTERNAL_JOBS_SECRET

const isProduction = () => process.env.NODE_ENV === 'production'

// One client for the process. It caches Google's public signing keys, so a
// per-request instance would re-fetch them on every scheduler tick.
const oauth = new OAuth2Client()

/** Constant-time string compare that does not leak the length of the secret. */
function secretMatches(given, expected) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would itself be the leak.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** The bearer token on this request, or null. */
function bearer(req) {
  const header = req.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

export async function requireInternalCaller(req, res, next) {
  const token = bearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Internal endpoint', code: 'INTERNAL_AUTH_REQUIRED' })
  }

  // The laptop path. Guarded on NODE_ENV first, so a production deploy that
  // still carries INTERNAL_JOBS_SECRET in its environment — which it will, if
  // somebody copies a .env — cannot be opened with it.
  const secret = devSecret()
  if (!isProduction() && secret && secretMatches(token, secret)) {
    return next()
  }

  const expectedAudience = audience()
  const expectedCaller = caller()

  if (!expectedAudience || !expectedCaller) {
    // Not 401. The caller did nothing wrong and retrying will not help; this is
    // the server admitting it cannot check anybody's credentials, and it must
    // never resolve to "allow". 503 also tells Cloud Scheduler to retry, which
    // is the right behaviour if the variables arrive a moment later.
    console.error(
      'internalAuth: INTERNAL_JOBS_AUDIENCE and INTERNAL_JOBS_SERVICE_ACCOUNT are not set — refusing every internal call.',
    )
    return res.status(503).json({ error: 'Internal endpoints are not configured', code: 'INTERNAL_AUTH_UNCONFIGURED' })
  }

  let payload
  try {
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: expectedAudience })
    payload = ticket.getPayload()
  } catch (err) {
    // Expired, wrong audience, wrong signature, malformed. All the same answer:
    // telling a caller WHICH of those it was is telling him what to fix next.
    console.warn(`internalAuth: rejected a token — ${err.message}`)
    return res.status(401).json({ error: 'Internal endpoint', code: 'INTERNAL_AUTH_REJECTED' })
  }

  // `email_verified` on a service-account token is Google asserting the address
  // is really that account's, not a user confirming a mailbox. Both conditions,
  // because `email` alone on an unverified token is a claim.
  if (payload?.email !== expectedCaller || payload.email_verified !== true) {
    console.warn(`internalAuth: rejected ${payload?.email ?? 'a token with no email'} — not the scheduler account`)
    return res.status(403).json({ error: 'Internal endpoint', code: 'INTERNAL_AUTH_FORBIDDEN' })
  }

  return next()
}
