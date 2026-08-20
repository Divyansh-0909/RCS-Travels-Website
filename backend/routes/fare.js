import { Router } from 'express'
import { getRideEstimate } from '../services/rideEstimate.js'
import { isVehicleClass } from '../constants/vehicles.js'
import { getAuth } from '@clerk/express'
import { prisma } from '../db/prisma.js'

const fareRouter = Router();

// Coords are optional refinements (from the pin-confirm screen); only
// well-formed pairs are forwarded.
const cleanCoords = (c) =>
  c && Number.isFinite(c.lat) && Number.isFinite(c.lng) &&
  Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180
    ? { lat: c.lat, lng: c.lng } : null

fareRouter.post('/estimate', async (req, res) => {
  const { pickupAddress, dropAddress, vehicleClass, pickupCoords, dropCoords, preferSafeRoute, needsCarrier, couponId } = req.body

  if (!pickupAddress || !dropAddress || !vehicleClass) {
    return res.status(400).json({ error: 'pickupAddress, dropAddress, and vehicleClass are required' })
  }

  if (!isVehicleClass(vehicleClass)) {
    return res.status(400).json({ error: 'Invalid vehicleClass' })
  }

  try {
    let coupon = null
    if (couponId) {
      const { userId } = getAuth(req)
      if (!userId) return res.status(401).json({ error: 'Sign in to use a coupon' })
      const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
      const row = user && await prisma.coupon.findFirst({ where: { id: couponId, userId: user.id, redeemedAt: null } })
      if (!row) return res.status(409).json({ error: 'Coupon is unavailable or already redeemed', code: 'COUPON_UNAVAILABLE' })
      coupon = { id: row.id, amount: row.amount }
    }
    const result = await getRideEstimate({
      pickupAddress, dropAddress, vehicleClass,
      pickupCoords: cleanCoords(pickupCoords),
      dropCoords: cleanCoords(dropCoords),
      preferSafeRoute: preferSafeRoute === true,
      needsCarrier: needsCarrier === true,
      coupon,
    })
    res.json(result)
  } catch (err) {
    if (err.message === 'GOOGLE_ROUTES_LIMIT_EXCEEDED')
      return res.status(503).json({ error: 'Fare estimation unavailable for this route. Please message us to book.' })
    if (err.message === 'No route found between the given addresses')
      return res.status(422).json({ error: err.message })
    console.error('getRideEstimate failed:', err)
    res.status(500).json({ error: 'Failed to calculate fare' })
  }
})

export default fareRouter
