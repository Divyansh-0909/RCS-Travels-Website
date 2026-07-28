import { Router } from 'express'
import { getRideEstimate } from '../services/rideEstimate.js'

const fareRouter = Router();

// Coords are optional refinements (from the pin-confirm screen); only
// well-formed pairs are forwarded.
const cleanCoords = (c) =>
  c && Number.isFinite(c.lat) && Number.isFinite(c.lng) &&
  Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180
    ? { lat: c.lat, lng: c.lng } : null

fareRouter.post('/estimate', async (req, res) => {
  const { pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute, needsCarrier } = req.body

  if (!pickupAddress || !dropAddress || !vehicleType) {
    return res.status(400).json({ error: 'pickupAddress, dropAddress, and vehicleType are required' })
  }

  const validTypes = [4,6,1]
  if (!validTypes.includes(vehicleType)) {
    return res.status(400).json({ error: 'Invalid vehicleType' })
  }

  try {
    const result = await getRideEstimate({
      pickupAddress, dropAddress, vehicleType,
      pickupCoords: cleanCoords(pickupCoords),
      dropCoords: cleanCoords(dropCoords),
      preferSafeRoute: preferSafeRoute === true,
      needsCarrier: needsCarrier === true,
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