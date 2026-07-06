import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { clerkClient } from '@clerk/express'
import crypto from 'crypto'

const usersRouter = Router()

const generateBookingCode = () => String(crypto.randomInt(0, 10000)).padStart(4, '0')

usersRouter.get('/me', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  const { id, phone, name, bookingCode, gender, dob, emergencyContact } = user
  return res.json({ id, phone, name, bookingCode, gender, dob, emergencyContact })
})

usersRouter.post('/me/updateGender', protect, async (req, res) => {
  const { gender } = req.body;

  try {
    await prisma.user.update({
      where: {
        clerkId: req.auth.userId,
      },
      data: {
        gender,
      },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: "User not found" });
  }
});

usersRouter.post('/me/updateEmergencyContact', protect, async (req, res) => {
  const { emergencyContact } = req.body;

  // Stored as a string (10-digit numbers overflow a 4-byte int), matching `phone`.
  if (!/^\d{10}$/.test(String(emergencyContact ?? '')))
    return res.status(400).json({ error: "Emergency contact must be a 10-digit number" });

  try {
    await prisma.user.update({
      where: { clerkId: req.auth.userId },
      data: { emergencyContact: String(emergencyContact) },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: "User not found" });
  }
});

usersRouter.post('/me/updateDOB', protect, async (req, res) => {
  const { dob } = req.body;

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(dob ?? '')))
    return res.status(400).json({ error: "DOB must be in DD/MM/YYYY format" });

  try {
    await prisma.user.update({
      where: { clerkId: req.auth.userId },
      data: { dob },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: "User not found" });
  }
});

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
        where: { clerkId: req.auth.userId },
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