import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { signedRiderPhotoUrl } from '../services/driverPhoto.js'
import { sharedTripView } from '../lib/shareLink.js'

const shareRouter = Router()

/**
 * THE ONLY UNAUTHENTICATED ROUTE THAT READS A BOOKING. Everything it returns is
 * reachable by anyone holding a link the rider chose to send, which is the whole
 * point — and the reason this is not simply the status endpoint without
 * `protect`. What may cross this line is decided by sharedTripView in
 * lib/shareLink.js, which is pure so that the omissions can be asserted; this
 * route only finds the row and checks the clock.
 */
shareRouter.get('/:token', async (req, res) => {
  const { token } = req.params

  // Bounded before it reaches the database: a token is a fixed 22 characters, so
  // anything far outside that is a probe rather than a link and does not deserve
  // a query.
  if (typeof token !== 'string' || token.length < 16 || token.length > 64) {
    return res.status(404).json({ error: 'This link is not valid' })
  }

  const booking = await prisma.booking.findUnique({
    where: { shareToken: token },
    include: { driver: { include: { location: true } }, user: { select: { name: true } } },
  })

  if (!booking) return res.status(404).json({ error: 'This link is not valid' })

  // 410, not 404: the difference is what the page can say. A lapsed link gets
  // "this has expired, ask them to share again", which is true and actionable;
  // an unknown one gets "not valid". Admitting that an expired booking exists to
  // someone holding a 128-bit token they could only have been given is not a
  // disclosure worth the worse page.
  if (!booking.shareExpiresAt || booking.shareExpiresAt.getTime() <= Date.now()) {
    return res.status(410).json({ error: 'This link has expired', code: 'SHARE_EXPIRED' })
  }

  const photoUrl = booking.driver ? await signedRiderPhotoUrl(booking.driver) : null

  return res.json(sharedTripView(booking, photoUrl))
})

export default shareRouter
