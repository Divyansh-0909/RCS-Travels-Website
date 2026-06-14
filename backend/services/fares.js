import { prisma } from '../db/prisma.js'

const RATE_PER_KM = {
  4: 14,
  6: 18,
  1: 14, // ANY — use 4-seater base rate
}

const GOOGLE_ROUTES_MONTHLY_LIMIT = 10_000

const currentMonth = () => new Date().toISOString().slice(0, 7) // "YYYY-MM"

// to keep under google free usage limit
async function checkAndIncrementRoutesUsage() {
  const month = currentMonth()

  const usage = await prisma.apiUsage.findUnique({
    where: { service_month: { service: 'google_routes', month } },
  })

  if (usage && usage.count >= GOOGLE_ROUTES_MONTHLY_LIMIT) {
    throw new Error('GOOGLE_ROUTES_LIMIT_EXCEEDED')
  }

  await prisma.apiUsage.upsert({
    where:  { service_month: { service: 'google_routes', month } },
    update: { count: { increment: 1 } },
    create: { service: 'google_routes', month, count: 1 },
  })
}

export async function getFare({ pickupAddress, dropAddress, vehicleType }) {
  const row = await prisma.fareTable.findFirst({
    where: { destinationName: dropAddress, vehicleType, isActive: true },
  })

  if (row) {
    return { fare: row.fixedFare, distanceKm: null, fareSource: 'fixed_table' }
  }

  await checkAndIncrementRoutesUsage()

  const result = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify({
      origin:      { address: pickupAddress },
      destination: { address: dropAddress },
      travelMode:  'DRIVE',
    }),
  })
  const data = await result.json()
  if (!data.routes?.[0]?.distanceMeters)
    throw new Error('No route found between the given addresses')
  const distanceKm = data.routes[0].distanceMeters / 1000
  const fare = distanceKm * RATE_PER_KM[vehicleType]

  return { fare, distanceKm, fareSource: 'per_km' }
}