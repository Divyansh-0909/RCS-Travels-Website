import { prisma } from '../db/prisma.js'
import { seatsOf } from '../constants/vehicles.js'
import { recomputeDriverVerification } from './driverDocuments.js'

// A captain's fleet, and the one operation that makes it a fleet rather than a
// list: switching which car he is driving.
//
// THE INVARIANT THIS FILE EXISTS TO HOLD. Driver.vehicleClass, vehicleCapacity,
// vehicleNumber and vehicleModel are a CACHE of Driver.activeVehicle — see the
// schema comment for why they are not simply read through the relation. A cache
// is only worth having while it cannot disagree with its source, so every write
// that moves the active car moves all five columns in one transaction, and
// nothing outside this file is allowed to write any of them.

/**
 * The rides that stop a captain changing cars, and why each one does.
 *
 * IN PROGRESS — assigned, en route, waiting at the pickup, or driving. Blocked
 * unconditionally: a rider is standing on a road matching a plate against his
 * phone, and the seat counter is mid-flight. Nothing about the fleet is urgent
 * enough to be worth that.
 *
 * ACCEPTED AND SCHEDULED — `confirmed`, possibly days out. Blocked ONLY when the
 * new car cannot serve it. Blocking on all of them instead would lock a captain
 * out of his own second car for a week over one Tuesday booking, which is how a
 * feature quietly stops being used; blocking on none of them lets him turn up to
 * an SUV booking in a hatchback, which is how a rider stops using the app.
 */
const IN_PROGRESS_STATUSES = ['assigned', 'en_route', 'reached', 'started']

/**
 * A refusal, with the status the route should answer with.
 *
 * Declared rather than inferred because the callers are TypeScript: inference
 * across the .js boundary collapses the success and failure shapes into one
 * object of optional properties, and `if ('error' in result)` then narrows to
 * something whose `status` is still possibly undefined. Naming the two shapes is
 * what makes the routes' one-line early return type-check.
 *
 * @typedef {{ error: string, status: number, booking?: unknown, vehicleId?: string }} VehicleRefusal
 */

/**
 * Why this captain may not switch to this car right now, or null if he may.
 *
 * Returns the reason rather than throwing, and names the ride, because "you have
 * a booking" is a message that sends a man hunting through his own app for which
 * one.
 *
 * @param {string} driverId
 * @param {{ id: string, class: string }} vehicle
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
export async function blockingRideFor(driverId, vehicle, tx = prisma) {
  const inProgress = await tx.booking.findFirst({
    where: { driverId, status: { in: IN_PROGRESS_STATUSES } },
    select: { id: true, reference: true, status: true },
  })
  if (inProgress) {
    return {
      error: 'Finish your current ride before you change cars',
      booking: inProgress,
    }
  }

  // Only the mismatched ones. A scheduled SUV ride does not stand in the way of
  // switching between two SUVs.
  const mismatched = await tx.booking.findFirst({
    where: {
      driverId,
      status: 'confirmed',
      vehicleClass: { not: vehicle.class },
    },
    select: { id: true, reference: true, vehicleClass: true, scheduledAt: true },
  })
  if (mismatched) {
    return {
      error: `You've accepted a ${mismatched.vehicleClass} ride (${mismatched.reference}). Cancel it or finish it before switching to this car.`,
      booking: mismatched,
    }
  }

  return null
}

/**
 * Make `vehicleId` the car this captain is driving.
 *
 * Writes the FK and all four cached columns in ONE transaction, then recomputes
 * his verification — because the new car's paperwork is not the old car's, and
 * the whole point of the switch is that the two can differ. A captain moving
 * from an approved Dzire to an Innova whose insurance is still under review goes
 * from `approved` to `pending` on this call, and the recompute takes him offline
 * as part of the same write.
 *
 * vehicleCapacity resets to the new car's full seat count. Safe precisely
 * because blockingRideFor has already refused if a ride is in progress: there is
 * nobody in the car whose seat would be forgotten.
 *
 * @param {string} driverId
 * @param {string} vehicleId
 * @returns {Promise<VehicleRefusal | { vehicle: import('@prisma/client').Vehicle, verificationStatus: string | null }>}
 */
export async function switchActiveVehicle(driverId, vehicleId) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })

  // Ownership is checked here rather than trusted from the route, because this
  // is the function that writes the plate onto a driver row and a car belonging
  // to somebody else is the one thing it must never do.
  if (!vehicle || vehicle.driverId !== driverId) {
    return { error: 'That car is not on your account', status: 404 }
  }

  const seats = seatsOf(vehicle.class)
  if (seats === null) {
    // Unreachable through the API — the class is a Prisma enum — but this is the
    // value that becomes the seat counter, and a null landing in it would make
    // every capacity comparison in claimBookingForDriver behave unpredictably.
    return { error: 'That car has no seat count on record', status: 500 }
  }

  const blocked = await blockingRideFor(driverId, vehicle)
  if (blocked) return { ...blocked, status: 409 }

  return prisma.$transaction(async (tx) => {
    // Re-checked inside the transaction. The read above is a courtesy that gives
    // a good error message; this is the one that is actually safe, because a ride
    // can be assigned to him in the gap between the two.
    const stillBlocked = await blockingRideFor(driverId, vehicle, tx)
    if (stillBlocked) return { ...stillBlocked, status: 409 }

    await tx.driver.update({
      where: { id: driverId },
      data: {
        activeVehicleId: vehicle.id,
        vehicleClass: vehicle.class,
        vehicleNumber: vehicle.number,
        vehicleModel: vehicle.model,
        vehicleCapacity: seats,
      },
    })

    const verificationStatus = await recomputeDriverVerification(driverId, tx)

    return { vehicle, verificationStatus }
  })
}

/**
 * Add a car to this captain's account, and make it active if he has none.
 *
 * The "if he has none" is what makes signup a single call: the first car a
 * driver adds is by definition the one he is driving, and asking a man who owns
 * one car to also pick it would be a screen that never has two options on it.
 * The second and later cars do NOT switch him automatically — that is a decision
 * with a ride attached to it, and it goes through switchActiveVehicle's guards.
 *
 * @param {string} driverId
 * @param {{ vehicleClass: string, vehicleNumber: string, vehicleModel: string }} input
 * @returns {Promise<VehicleRefusal | { vehicle: import('@prisma/client').Vehicle, verificationStatus: string | null, madeActive: boolean }>}
 */
export async function addVehicle(driverId, { vehicleClass, vehicleNumber, vehicleModel }) {
  const seats = seatsOf(vehicleClass)
  if (seats === null) return { error: 'Unknown vehicle class', status: 400 }

  const number = vehicleNumber.trim().toUpperCase()

  const clash = await prisma.vehicle.findUnique({
    where: { driverId_number: { driverId, number } },
    select: { id: true },
  })
  // Answered before the insert rather than caught as a P2002, so the message can
  // say what actually happened: he is adding a car he already has, and what he
  // probably wants is to switch to it.
  if (clash) return { error: 'That car is already on your account', status: 409, vehicleId: clash.id }

  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.create({
      // Its only caller is the route behind addVehicleSchema, which requires a
      // model — so no null branch here either. Vehicle.model stays nullable for
      // the cars added before that rule, not for the ones added through here.
      data: { driverId, class: vehicleClass, number, model: vehicleModel.trim() },
    })

    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      select: { activeVehicleId: true },
    })

    if (!driver?.activeVehicleId) {
      await tx.driver.update({
        where: { id: driverId },
        data: {
          activeVehicleId: vehicle.id,
          vehicleClass: vehicle.class,
          vehicleNumber: vehicle.number,
          vehicleModel: vehicle.model,
          vehicleCapacity: seats,
        },
      })
    }

    // His paperwork now measures against a car that exists, where a moment ago
    // the nine vehicle-owned types were unheld by construction. Usually moves
    // him from `notUploaded` to `uploading`, which is what puts the new car's
    // checklist on his screen.
    const verificationStatus = await recomputeDriverVerification(driverId, tx)

    return { vehicle, verificationStatus, madeActive: !driver?.activeVehicleId }
  })
}

/**
 * Idempotently give a driver this car and make it the one he is driving.
 *
 * For SEEDS and BACKFILLS, not for the API — it has none of addVehicle's guards
 * because it is the one caller that legitimately wants to overwrite the active
 * car without asking about rides in progress. Re-running a seed must land on the
 * same state rather than a second row or a 409, which is what separates it from
 * addVehicle.
 *
 * Required here as well as on the API, even though nothing validates a seed: a
 * fixture that may omit the model puts rows in every developer's database that
 * the app can no longer produce, and the fallback path becomes the one that gets
 * tested while the real one does not.
 *
 * @param {string} driverId
 * @param {{ vehicleClass: string, vehicleNumber: string, vehicleModel: string }} input
 */
export async function ensurePrimaryVehicle(driverId, { vehicleClass, vehicleNumber, vehicleModel }) {
  const seats = seatsOf(vehicleClass)
  if (seats === null) throw new Error(`Unknown vehicle class "${vehicleClass}"`)

  if (!vehicleModel?.trim()) throw new Error(`Vehicle "${vehicleNumber}" needs a model`)

  const number = vehicleNumber.trim().toUpperCase()
  const model = vehicleModel.trim()

  const vehicle = await prisma.vehicle.upsert({
    where: { driverId_number: { driverId, number } },
    // model in the update branch too, so a car seeded before the name was asked
    // for picks one up on the next run instead of keeping the NULL that sends
    // every screen to the class label.
    update: { class: vehicleClass, model },
    create: { driverId, class: vehicleClass, number, model },
  })

  // The cache moves with it, in the same shape switchActiveVehicle writes — a
  // seed that set the FK without the four columns would leave a driver whose
  // dispatch class disagreed with his own car from the first run.
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      activeVehicleId: vehicle.id,
      vehicleClass: vehicle.class,
      vehicleNumber: vehicle.number,
      vehicleModel: vehicle.model,
      vehicleCapacity: seats,
    },
  })

  return vehicle
}

/**
 * Take a car off the account.
 *
 * Its documents go with it (DriverDocument cascades on the FK) but the ARCHIVE
 * does not — DriverDocumentArchive.vehicleId is a plain column precisely so the
 * question "what insurance was in force on the day of that ride" survives the
 * car being sold.
 *
 * Refused while it is the car he is driving. Not because the database could not
 * cope — activeVehicleId is ON DELETE SET NULL — but because the four cached
 * columns on Driver are non-nullable and would be left describing a car that no
 * longer exists. He switches first, which is the same order the real world
 * happens in.
 *
 * @param {string} driverId
 * @param {string} vehicleId
 * @returns {Promise<VehicleRefusal | { removed: string }>}
 */
export async function removeVehicle(driverId, vehicleId) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle || vehicle.driverId !== driverId) {
    return { error: 'That car is not on your account', status: 404 }
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { activeVehicleId: true },
  })

  if (driver?.activeVehicleId === vehicleId) {
    return {
      error: "That's the car you're driving. Switch to another one first.",
      status: 409,
    }
  }

  await prisma.vehicle.delete({ where: { id: vehicleId } })
  return { removed: vehicleId }
}
