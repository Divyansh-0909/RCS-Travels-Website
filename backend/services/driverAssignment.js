import { prisma } from '../db/prisma.js'
import {sendFCM, sendWhatsApp} from './notification.js'

const EARTH_RADIUS_KM = 6371

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function inSameDirectionCorridor(pickupLat, pickupLng, drop1Lat, drop1Lng, drop2Lat, drop2Lng, thresholdDeg = 45) {
  const b1 = bearingDeg(pickupLat, pickupLng, drop1Lat, drop1Lng)
  const b2 = bearingDeg(pickupLat, pickupLng, drop2Lat, drop2Lng)
  const diff = Math.abs(b1 - b2)
  return (diff > 180 ? 360 - diff : diff) <= thresholdDeg
}

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
          ...(row.vehicleType === 1
          ? {
              OR: [
                { vehicleType: 4 },
                { vehicleType: 6 },
              ],
            }
          : {
              vehicleType: row.vehicleType,
            }),
        },
      },
      include: {
        driver: {
          include: {
            bookings: {
              where: { status: { in: ['assigned', 'en_route', 'reached', 'started'] } },
              select: { id: true, dropLat: true, dropLng: true },
            },
          },
        },
      },
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
    

    if(row.sharing){
      const sortedSharing = sorted
        .filter((loc) => loc.sharing === true)
        .filter((loc) => {
          const activeBooking = loc.driver.bookings?.[0]
          if (!activeBooking) return true
          return inSameDirectionCorridor(
            row.pickupLat, row.pickupLng,
            activeBooking.dropLat, activeBooking.dropLng,
            row.dropLat, row.dropLng,
          )
        })
      
      for (const x of sortedSharing) {
        triedDriverIds.add(x.driverId)

        if(x.vehicleCapacity <= 0) continue; 
        
        const response =
          await sendFCM(x.driver.fcmToken, {
            notification: {
              title: row.scheduledAt ? `New Scheduled Sharing Ride, Pick up at ${row.scheduledAt}` : 'Immediate Sharing Pickup',
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

          await prisma.driver.update({
            where: {driverId: assignedDriver},
            data: {
              vehicleCapacity: x.vehicleCapacity - 1
            }
          })

          await prisma.booking.update({
            where: { id: bookingId },
            data: {
              status:      'assigned',
              driverId:    x.driverId,
              confirmedAt: row.confirmedAt ?? new Date(),  // on-spot rides have no confirmedAt yet
            },
          })

          sendWhatsApp(x.driver.phone,
            `You have been assigned a sharing ride.
            \nPickup Time: ${pickupTimeLabel}
            \nPickup Location: ${row.pickupAddress}
            \nDrop Location: ${row.dropAddress}
            \nCustomer Phone Number: ${row.customerPhone}`
          )
          return assignedDriver
        }
      }
    }
    
     
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