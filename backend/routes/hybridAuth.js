import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { clerkClient } from '@clerk/express'
import crypto from 'crypto'

const hybridAuthRouter = Router()

const generateOTP = () => String(crypto.randomInt(1000, 10000))

hybridAuthRouter.post('/send-otp', async (req, res) => {
  const { phone } = req.body

  if (!phone || phone.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }

  const otp = generateOTP()

  const otpHash = crypto.createHash('sha256').update(otp).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  await prisma.otpVerification.upsert({
    where:  { phone },
    update: { otpHash, expiresAt, used: false },
    create: { phone, otpHash, expiresAt },
  })

  // TODO: send otp via WhatsApp here
  console.log(`OTP for ${phone}: ${otp}`) // remove after WhatsApp is wired

  return res.json({ ok: true })
})

hybridAuthRouter.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' })
  }

  const record = await prisma.otpVerification.findUnique({ where: { phone } })

  if (!record)                        return res.status(400).json({ error: 'OTP not found' })
  if (record.used)                    return res.status(400).json({ error: 'OTP already used' })
  if (record.expiresAt < new Date())  return res.status(400).json({ error: 'OTP expired' })

  const userHash = crypto.createHash('sha256').update(String(otp)).digest('hex')
  if (userHash !== record.otpHash)    return res.status(400).json({ error: 'Invalid OTP' })

  // invalidate the OTP
  await prisma.otpVerification.update({ where: { phone }, data: { used: true } })

  const userEmail = `91${phone}@rcs-travels.com`

  const existing = await clerkClient.users.getUserList({ emailAddress: [userEmail] })

  const clerkUser = existing.data.length > 0
    ? existing.data[0]
    : await clerkClient.users.createUser({
        emailAddress: [userEmail],
        skipPasswordChecks: true,
      })

  //issue a one-time sign-in ticket for the frontend 
  const tokenResource = await clerkClient.signInTokens.createSignInToken({
    userId: clerkUser.id,
    expiresInSeconds: 60,
  })
  return res.json({ ticket: tokenResource.token })
})

export default hybridAuthRouter
