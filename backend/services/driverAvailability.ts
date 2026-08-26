import type { BookingStatus, Prisma } from '@prisma/client'
import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'
import { seatsOf } from '../constants/vehicles.js'
import { prisma } from '../db/prisma.js'

const LIVE_RIDE_STATUSES = ['assigned', 'en_route', 'reached', 'started'] as const satisfies readonly BookingStatus[]

type LastLocation = { updatedAt: Date } | null | undefined

/**
 * The exact server-side meaning of the captain app's green Online state.
 *
 * `isOnline` records intent. Dispatchability additionally requires a recent
 * heartbeat, using the same cutoff as both geographic dispatch queries. Keeping
 * the derivation here stops /driver/me and the matching engine from explaining
 * the same row differently.
 */
export function isDriverDispatchReady(
    isOnline: boolean,
    location: LastLocation,
    now = new Date(),
) {
    return Boolean(
        isOnline &&
        location &&
        location.updatedAt.getTime() > now.getTime() - LOCATION_STALE_AFTER_MS,
    )
}

/**
 * Repair the denormalised free-seat counter when a captain starts a shift.
 *
 * `vehicleCapacity` is changed while rides are claimed and released, so an old
 * interrupted/manual booking flow can leave it at zero even though the captain
 * has nobody in the car. Both customer preview and assignment then reject an
 * otherwise eligible captain. The absence of a live ride is the authoritative
 * proof that every seat is free; the relation guard keeps this safe if a claim
 * races the online transition.
 */
export async function restoreIdleDriverCapacity(
    driver: { id: string; vehicleClass: string },
    db: Pick<Prisma.TransactionClient, 'driver'> = prisma,
) {
    const seats = seatsOf(driver.vehicleClass)
    if (seats === null) return false

    const repaired = await db.driver.updateMany({
        where: {
            id: driver.id,
            vehicleCapacity: { not: seats },
            bookings: {
                none: { status: { in: [...LIVE_RIDE_STATUSES] } },
            },
        },
        data: { vehicleCapacity: seats },
    })

    return repaired.count > 0
}
