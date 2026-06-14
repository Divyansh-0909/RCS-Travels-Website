import { Router } from 'express'
import { getFare } from '../services/fares.js'

const fareRouter = Router();

fareRouter.post('/estimate', async (req, res) => {
  const { pickupAddress, dropAddress, vehicleType } = req.body

  if (!pickupAddress || !dropAddress || !vehicleType) {
    return res.status(400).json({ error: 'pickupAddress, dropAddress, and vehicleType are required' })
  }

  const validTypes = [4,6,1]
  if (!validTypes.includes(vehicleType)) {
    return res.status(400).json({ error: 'Invalid vehicleType' })
  }

  try {
    const result = await getFare({ pickupAddress, dropAddress, vehicleType })
    res.json(result)
  } catch (err) {
    if (err.message === 'GOOGLE_ROUTES_LIMIT_EXCEEDED')
      return res.status(503).json({ error: 'Fare estimation unavailable for this route. Please message us to book.' })
    if (err.message === 'No route found between the given addresses')
      return res.status(422).json({ error: err.message })
    console.error('getFare failed:', err)
    res.status(500).json({ error: 'Failed to calculate fare' })
  }
})

export default fareRouter