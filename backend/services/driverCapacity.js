import { seatsOf } from '../constants/vehicles.js'

/** Restore capacity released by one finished/cancelled booking. */
export async function releaseDriverCapacity(tx, { driverId, vehicleClass, sharing }) {
  const seats = seatsOf(vehicleClass)
  if (seats === null) return false

  if (sharing) {
    await tx.driver.updateMany({
      where: { id: driverId, vehicleCapacity: { lt: seats } },
      data: { vehicleCapacity: { increment: 1 } },
    })
  } else {
    await tx.driver.update({
      where: { id: driverId },
      data: { vehicleCapacity: seats },
    })
  }

  return true
}
