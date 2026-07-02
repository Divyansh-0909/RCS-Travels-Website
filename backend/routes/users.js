import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { clerkClient } from '@clerk/express'
import crypto from 'crypto'

const usersRouter = Router()

// 4-digit code (0000–9999). Padded so the full range is usable — this is the
// user's stable ride-verification code, generated once at signup.
const generateBookingCode = () => String(crypto.randomInt(0, 10000)).padStart(4, '0')

usersRouter.get('/me', protect, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(404).json({ error: 'User has not signed up' })

    const { id, phone, name, bookingCode } = user
    return res.json({ id, phone, name, bookingCode })
})

usersRouter.post('/me', protect, async (req, res) => {
  const { name } = req.body

  if (!name || typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'name must be at least 2 characters' })

  // Phone is encoded in the fake Clerk email: 91{10-digit-phone}@rcs-travels.com
  const clerkUser = await clerkClient.users.getUser(req.auth.userId)
  const email = clerkUser.emailAddresses[0]?.emailAddress
  const phone = email?.replace('@rcs-travels.com', '').replace(/^91/, '')

  if (!phone)
    return res.status(400).json({ error: 'Could not resolve phone from account' })

  // The booking code is only ever set on create (it must stay stable for the life
  // of the account), but a create can still collide with an existing code, so we
  // retry with a fresh code on a booking_code unique violation.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const user = await prisma.user.upsert({
        where:  { clerkId: req.auth.userId },
        update: { name: name.trim(), phone },
        create: { clerkId: req.auth.userId, name: name.trim(), phone, bookingCode: generateBookingCode() },
      })

      return res.json({ id: user.id, name: user.name, phone: user.phone, bookingCode: user.bookingCode })
    } catch (e) {
      // P2002 = unique constraint violation. `phone`, `clerkId` and `booking_code`
      // are unique on User. A booking_code clash just needs a fresh code + retry;
      // a phone clash means the derived phone is tied to another account.
      if (e.code === 'P2002') {
        if (String(e.meta?.target).includes('booking_code')) continue
        return res.status(409).json({ error: 'Username is already taken' })
      }
      throw e
    }
  }

  return res.status(500).json({ error: 'Failed to generate booking code' })
})

export default usersRouter