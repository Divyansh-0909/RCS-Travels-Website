import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { clerkClient } from '@clerk/express'

const usersRouter = Router()

usersRouter.get('/me', protect, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
    if (!user) return res.status(404).json({ error: 'User has not signed up' })
      
    const { id, phone, name } = user
    return res.json({ id, phone, name })
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

  try {
    const user = await prisma.user.upsert({
      where:  { clerkId: req.auth.userId },
      update: { name: name.trim(), phone },
      create: { clerkId: req.auth.userId, name: name.trim(), phone },
    })

    return res.json({ id: user.id, name: user.name, phone: user.phone })
  } catch (e) {
    // P2002 = unique constraint violation. Only `phone` and `clerkId` are unique
    // on User, so this means the derived phone is already tied to another account.
    if (e.code === 'P2002')
      return res.status(409).json({ error: 'Username is already taken' })
    throw e
  }
})

export default usersRouter