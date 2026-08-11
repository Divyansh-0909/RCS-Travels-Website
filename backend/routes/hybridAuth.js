import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { clerkClient } from '@clerk/express'
import crypto from 'crypto'
// Unused while the send below is commented out — kept so putting it back is one edit.
import { sendOtpWhatsApp } from '../services/notification.js'

// Phone-OTP login without Clerk's hosted UI and without passwords. We own the OTP
// (stored hashed, 5-minute expiry) and Clerk owns the session; the two are bridged
// by a fake email, 91{phone}@rcs-travels.com, which gives every phone a stable Clerk
// identity. Verifying returns a one-time sign-in ticket the frontend redeems via
// signIn.create({ strategy: 'ticket' }).
//
// Because the phone is encoded in that email, the backend can always derive it from
// a verified session and never has to trust a phone sent from the client.
const hybridAuthRouter = Router()

const generateOTP = () => String(crypto.randomInt(100000, 1000000))

// Login and signup share these routes but must not share outcomes: login used to
// get-or-create the Clerk user, so any stranger's number became an account the
// moment they verified. The intent gate splits them — only signup may create,
// and login for an unknown number fails BEFORE an OTP is sent, so no WhatsApp
// message is paid for on a number that can't log in anyway. Anything that isn't
// 'signup' is treated as login: the default must be the path that can't create.
// (This makes send-otp confirm which numbers have accounts; every consumer app
// leaks the same, and the auth limiter throttles anyone harvesting it.)
//
// `audience` says which account the intent is about. Riders and captains are
// separate tables sharing one Clerk instance, so a phone can be in either, both
// or neither — "has an account" means nothing without naming an account of what.
// Checking users for everyone let any rider's number into the captain app, and
// shut out every captain who had never booked a cab as a passenger. The website
// sends no audience, so rider is the default: same rule as intent's, the default
// has to be the side that already existed.
//
// Existence only, deliberately. A captain pending verification, or one an admin
// has deactivated, still has to get in to see documents and status — locking the
// door on verificationStatus would strand them with nowhere to fix it.
async function accountFor(phone, audience) {
  return audience === 'driver'
    ? prisma.driver.findUnique({ where: { phone }, select: { id: true } })
    : prisma.user.findUnique({ where: { phone }, select: { id: true } })
}

async function intentMismatch(phone, intent, audience) {
  const account = await accountFor(phone, audience)

  // Article kept apart from the noun: "No" takes the bare noun, "already has"
  // takes the article, and folding the two into one string gave users "No a
  // captain account found with this number".
  const noun = audience === 'driver' ? 'captain account' : 'account'
  const article = audience === 'driver' ? 'a' : 'an'

  if (intent === 'signup')
    return account ? { status: 409, error: `This number already has ${article} ${noun}` } : null
  return account ? null : { status: 404, error: `No ${noun} found with this number` }
}

hybridAuthRouter.post('/send-otp', async (req, res) => {
  const { phone, intent, audience } = req.body

  if (!phone || phone.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  const mismatch = await intentMismatch(phone, intent, audience)
  if (mismatch) return res.status(mismatch.status).json({ error: mismatch.error })

  // Per-phone cooldown: expiresAt is always sentAt + 5min, so "sent under 45s
  // ago" reads as expiresAt more than 4m15s away — no sentAt column needed. This,
  // not the per-IP limiter, is what stops someone bombarding one victim's phone.
  const existing = await prisma.otpVerification.findUnique({ where: { phone } })
  if (existing && !existing.used &&
      existing.expiresAt > new Date(Date.now() + (5 * 60 - 45) * 1000)) {
    return res.status(429).json({ error: 'Please wait before requesting another OTP' })
  }

  const otp = generateOTP()

  const otpHash = crypto.createHash('sha256').update(otp).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  await prisma.otpVerification.upsert({
    where:  { phone },
    update: { otpHash, expiresAt, used: false },
    create: { phone, otpHash, expiresAt },
  })

  // !! TESTING ONLY — WhatsApp delivery is commented out and the code is printed
  // to this server's console instead, so logging in needs no WhatsApp
  // credentials and costs no messages. Put the block back before anyone outside
  // this machine uses it: a code on stdout is a login for whoever reads the logs.
  //
  // Fail loudly if delivery fails — otherwise the user sits on the OTP screen
  // waiting for a message that will never arrive.
  // try {
  //   await sendOtpWhatsApp(phone, otp)
  // } catch (err) {
  //   console.error(err)
  //   return res.status(502).json({ error: 'Could not send OTP, please retry' })
  // }
  console.log(`\n  ── OTP for ${phone}: ${otp} ──  (WhatsApp send is commented out)\n`)

  return res.json({ ok: true })
})

hybridAuthRouter.post('/verify-otp', async (req, res) => {
  const { phone, otp, intent, audience } = req.body

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' })
  }

  const record = await prisma.otpVerification.findUnique({ where: { phone } })

  if (!record)                        return res.status(400).json({ error: 'OTP not found' })
  if (record.used)                    return res.status(400).json({ error: 'OTP already used' })
  if (record.expiresAt < new Date())  return res.status(400).json({ error: 'OTP expired' })

  const userHash = crypto.createHash('sha256').update(String(otp)).digest('hex')
  if (userHash !== record.otpHash)    return res.status(400).json({ error: 'Invalid OTP' })

  // Re-checked here because send-otp's answer isn't binding — anyone can call
  // this route directly. After the hash check but before the burn: the OTP is
  // both intent-less and audience-less (otp_verifications is keyed by phone
  // alone), so a code declined here stays valid and the other page can verify
  // it — its send-otp will 429 on the cooldown, which the frontend already
  // reads as "previous code still good, go to the OTP step".
  const mismatch = await intentMismatch(phone, intent, audience)
  if (mismatch) return res.status(mismatch.status).json({ error: mismatch.error })

  // Burn it before minting the ticket, so a replayed request can't get a second one.
  await prisma.otpVerification.update({ where: { phone }, data: { used: true } })

  const userEmail = `91${phone}@rcs-travels.com`

  // With the gate above, the create branch is only reachable from signup; for
  // login it is a self-heal for a DB user whose Clerk twin somehow vanished.
  //
  // The email is derived from the phone alone, so the Clerk identity is per
  // person, not per audience: a captain who also books rides is one Clerk user
  // with a row in each table. Audience decides who may sign in, never who they
  // are — which is why the routes authorize by looking their own record up from
  // the session (driver.ts resolves prisma.driver by clerkId), rather than
  // trusting that a valid session came from the matching app.
  const existing = await clerkClient.users.getUserList({ emailAddress: [userEmail] })

  const clerkUser = existing.data.length > 0
    ? existing.data[0]
    : await clerkClient.users.createUser({
        emailAddress: [userEmail],
        skipPasswordChecks: true,
      })

  // 60s is deliberate — the frontend redeems this immediately on the same screen.
  const tokenResource = await clerkClient.signInTokens.createSignInToken({
    userId: clerkUser.id,
    expiresInSeconds: 60,
  })
  return res.json({ ticket: tokenResource.token })
})

export default hybridAuthRouter
