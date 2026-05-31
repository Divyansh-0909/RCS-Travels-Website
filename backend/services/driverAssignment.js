import { prisma } from '../db/prisma.js'
import {sendFCM, sendWhatsApp} from './notification.js'

const EARTH_RADIUS_KM = 6371

// to get the distance of drivers from the pickup point
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}


function getBoundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111                          // 1 deg lat = 111 km
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180))  // shrinks near poles

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  }
}

export async function getDriver(bookingId) {
  let assignedDriver = null

  const row = await prisma.booking.findFirst({ where: { id: bookingId } })

  const triedDriverIds = new Set()
  
  for(let i=0; i<70; i+=10){
    const box = getBoundingBox(row.pickupLat, row.pickupLng, 20+i) 

    const locations = await prisma.driverLocation.findMany({
      where: {
        latitude:  { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        driver: {
          isActive:           true,
          isOnline:           true,
          verificationStatus: 'approved',
          vehicleType:        row.vehicleType,
        },
      },
      include: { driver: true },
    })

    const sorted = locations
      .filter(loc => !triedDriverIds.has(loc.driverId))
      .map((loc) => ({ ...loc, distanceKm: haversineDistance(row.pickupLat, row.pickupLng, loc.latitude, loc.longitude) }))
      .filter((loc) => loc.distanceKm <= 20 + i)
      .sort((a, b) =>
        a.distanceKm !== b.distanceKm
          ? a.distanceKm - b.distanceKm
          : new Date(a.driver.createdAt) - new Date(b.driver.createdAt)
      )

    const pickupTimeLabel = row.scheduledAt
      ? new Date(row.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : 'IMMEDIATE PICKUP'

    for (const x of sorted) {
      triedDriverIds.add(x.driverId)
      const response =
        await sendFCM(x.driver.fcmToken, {
          notification: {
            title: row.scheduledAt ? `New Scheduled Ride, Pick up at ${row.scheduledAt}` : 'Immediate Pickup',
            body: `\n${row.pickupAddress} → ${row.dropAddress} \n₹${row.fare}`,
          },
          data: {
            bookingId:      row.id,
            pickupAddress:  row.pickupAddress,
            pickupLat:      String(row.pickupLat),
            pickupLng:      String(row.pickupLng),
            dropAddress:    row.dropAddress,
            dropLat:        String(row.dropLat),
            dropLng:        String(row.dropLng),
            fare:           String(row.fare),
            vehicleType:    row.vehicleType,
            pickupTime:     pickupTimeLabel,
            customerPhone:  row.customerPhone,
          },
        })

      if (response === true ) {
        assignedDriver = x.driverId

        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status:      'assigned',
            driverId:    x.driverId,
            confirmedAt: row.confirmedAt ?? new Date(),  // on-spot rides have no confirmedAt yet
          },
        })

        sendWhatsApp(x.driver.phone,
          `You have been assigned a ride.
          \nPickup Time: ${pickupTimeLabel}
          \nPickup Location: ${row.pickupAddress}
          \nDrop Location: ${row.dropAddress}
          \nCustomer Phone Number: ${row.customerPhone}`
        )
        return assignedDriver
      }
    }
  }

  return null
}