import { randomUUID } from 'node:crypto'
import { createTestClock } from './testClock.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// A fixed instant keeps the time-window cases reproducible. Callers can supply a
// different explicit UTC Date when a boundary is part of the case under test.
export const DEFAULT_NOW = '2026-09-23T10:00:00.000Z'

const at = (now, offset) => new Date(now.getTime() + offset)

function utcClock(value) {
  return createTestClock(value instanceof Date ? value.toISOString() : value).now()
}

/**
 * Builds a small, relationally coherent scheduled-ride fixture.
 *
 * `booking`, `current`, `previous`, and `next` override their corresponding
 * booking rows. Driver overrides are keyed by group, for example
 * `drivers: { partner: { isOnline: false } }`.
 * `metadata` is caller-owned, test-only context for evidence or financial cases;
 * `persist` never writes it.
 *
 * The returned `persist` accepts either a Prisma client or a transaction client.
 * It intentionally never imports the application's production Prisma singleton.
 */
export function createScheduledScenario({
  now = DEFAULT_NOW,
  customer: customerOverrides = {},
  drivers: driverOverrides = {},
  vehicles: vehicleOverrides = {},
  locations: locationOverrides = {},
  booking: bookingOverrides = {},
  current: currentOverrides = {},
  previous: previousOverrides = {},
  next: nextOverrides = {},
  offer: offerOverrides = {},
  payment: paymentOverrides = {},
  metadata: metadataOverrides = {},
} = {}) {
  const clock = utcClock(now)

  const scenarioId = randomUUID()
  const tag = scenarioId.replaceAll('-', '')
  const customer = {
    id: randomUUID(),
    clerkId: `scheduled-scenario-customer-${scenarioId}`,
    phone: `scheduled-customer-${tag}`,
    bookingCode: `SC${tag.slice(0, 10)}`,
    name: 'Scheduled Scenario Customer',
    notifyWhatsapp: true,
    notifyPush: true,
    notifyPromotions: false,
    autoShareLiveLocation: false,
    createdAt: at(clock, -2 * DAY),
    ...customerOverrides,
  }

  const driverFor = (group, payoutVerified) => ({
    id: randomUUID(),
    clerkId: `scheduled-scenario-${group}-${scenarioId}`,
    name: `${group[0].toUpperCase()}${group.slice(1)} Scenario Captain`,
    phone: `scheduled-${group}-${tag}`,
    group,
    isActive: true,
    isOnline: true,
    verificationStatus: 'approved',
    vehicleClass: 'sedan',
    vehicleCapacity: 4,
    vehicleNumber: `SC${group.slice(0, 2).toUpperCase()}${tag.slice(0, 6)}`,
    vehicleModel: 'Scenario Sedan',
    payoutUpiId: `scheduled-${group}-${tag}@upi`,
    payoutUpiVerifiedAt: payoutVerified ? at(clock, -DAY) : null,
    createdAt: at(clock, -2 * DAY),
    ...driverOverrides[group],
  })

  // All three groups make priority and escalation tests readable. Partner is
  // deliberately unverified so payout preconditions have both states available.
  const drivers = [driverFor('admin', true), driverFor('rcs', true), driverFor('partner', false)]
  const driversByGroup = Object.fromEntries(drivers.map((driver) => [driver.group, driver]))
  const vehicles = drivers.map((driver) => ({
    id: randomUUID(),
    driverId: driver.id,
    class: driver.vehicleClass,
    number: driver.vehicleNumber,
    model: driver.vehicleModel,
    verificationStatus: 'approved',
    createdAt: at(clock, -2 * DAY),
    ...vehicleOverrides[driver.group],
  }))
  const vehiclesByDriverId = Object.fromEntries(vehicles.map((vehicle) => [vehicle.driverId, vehicle]))
  for (const driver of drivers) driver.activeVehicleId = vehiclesByDriverId[driver.id].id

  const locations = drivers.map((driver, index) => ({
    driverId: driver.id,
    latitude: 28.6139 + (index * 0.002),
    longitude: 77.209 + (index * 0.002),
    bearing: 90,
    speedKmh: 24,
    updatedAt: new Date(clock),
    ...locationOverrides[driver.group],
  }))

  const bookingFor = (name, offset, defaults, overrides) => ({
    id: randomUUID(),
    reference: `RCS-SC-${name.toUpperCase()}-${tag.slice(0, 12)}`,
    userId: customer.id,
    customerPhone: customer.phone,
    pickupAddress: 'India Gate, New Delhi',
    pickupLat: 28.6129,
    pickupLng: 77.2295,
    dropAddress: 'Connaught Place, New Delhi',
    dropLat: 28.6315,
    dropLng: 77.2167,
    vehicleClass: 'sedan',
    fare: 1_000,
    rideFare: 1_000,
    customerPayment: 1_000,
    distanceKm: 4.2,
    durationMin: 18,
    scheduledAt: at(clock, offset),
    createdAt: at(clock, Math.min(offset - HOUR, -HOUR)),
    ...defaults,
    ...overrides,
  })

  const scheduled = bookingFor('scheduled', 2 * HOUR, {
    status: 'confirmed',
    confirmedAt: at(clock, -20 * 60 * 1000),
    scheduledAdvancePct: 10,
    scheduledAdvanceAmount: 10_000,
    scheduledAdvancePaidAmount: 10_000,
    scheduledRemainingAmount: 90_000,
    scheduledAdvanceDisposition: 'paid',
  }, bookingOverrides)
  const current = bookingFor('current', 0, {
    status: 'assigned',
    driverId: driversByGroup.rcs.id,
    vehicleNumber: vehiclesByDriverId[driversByGroup.rcs.id].number,
    vehicleModel: vehiclesByDriverId[driversByGroup.rcs.id].model,
    confirmedAt: at(clock, -HOUR),
    driverAssignedAt: at(clock, -10 * 60 * 1000),
    scheduledAdvancePct: 10,
    scheduledAdvanceAmount: 10_000,
    scheduledAdvancePaidAmount: 10_000,
    scheduledRemainingAmount: 90_000,
    scheduledAdvanceDisposition: 'paid',
  }, currentOverrides)
  const previous = bookingFor('previous', -DAY, {
    status: 'completed',
    driverId: driversByGroup.rcs.id,
    vehicleNumber: vehiclesByDriverId[driversByGroup.rcs.id].number,
    vehicleModel: vehiclesByDriverId[driversByGroup.rcs.id].model,
    confirmedAt: at(clock, -DAY - HOUR),
    completedAt: at(clock, -DAY + HOUR),
    scheduledAdvancePct: 10,
    scheduledAdvanceAmount: 10_000,
    scheduledAdvancePaidAmount: 10_000,
    scheduledRemainingAmount: 90_000,
    scheduledFinalPaidAmount: 90_000,
    scheduledFinalPaymentMethod: 'upi',
    scheduledFinalPaidAt: at(clock, -DAY + HOUR),
    scheduledAdvanceDisposition: 'paid',
  }, previousOverrides)
  const next = bookingFor('next', DAY, {
    status: 'assigned',
    driverId: driversByGroup.rcs.id,
    vehicleNumber: vehiclesByDriverId[driversByGroup.rcs.id].number,
    vehicleModel: vehiclesByDriverId[driversByGroup.rcs.id].model,
    confirmedAt: at(clock, -30 * 60 * 1000),
    driverAssignedAt: new Date(clock),
    scheduledAdvancePct: 10,
    scheduledAdvanceAmount: 10_000,
    scheduledAdvancePaidAmount: 10_000,
    scheduledRemainingAmount: 90_000,
    scheduledAdvanceDisposition: 'paid',
  }, nextOverrides)
  const bookings = [scheduled, current, previous, next]

  // The three commitment rows represent booking state, not a complete payment
  // event history. Only `scheduled` receives the gateway payment below; tests
  // that need payment history for another commitment should add that row.

  const offer = {
    id: randomUUID(),
    bookingId: scheduled.id,
    driverId: driversByGroup.rcs.id,
    group: 'rcs',
    status: 'pending',
    createdAt: at(clock, -10 * 60 * 1000),
    ...offerOverrides,
  }
  const payment = {
    id: randomUUID(),
    userId: customer.id,
    bookingId: scheduled.id,
    purpose: 'scheduled_ride_advance',
    status: 'captured',
    amount: scheduled.scheduledAdvanceAmount,
    currency: 'INR',
    idempotencyKey: `scheduled-scenario-advance-${scenarioId}`,
    razorpayPaymentId: `pay_scenario_${tag}`,
    originalFareAmount: 100_000,
    couponAmount: 0,
    finalFareAmount: 100_000,
    advancePercentage: 10,
    remainingAmount: scheduled.scheduledRemainingAmount,
    createdAt: at(clock, -20 * 60 * 1000),
    updatedAt: at(clock, -20 * 60 * 1000),
    capturedAt: at(clock, -20 * 60 * 1000),
    ...paymentOverrides,
  }

  const collections = { customers: [customer], drivers, vehicles, locations, bookings, offers: [offer], payments: [payment] }
  // Liability and compensation cases are supplied by the consuming test. They
  // remain separate from current-schema rows until such tables actually exist.
  const metadata = { ...metadataOverrides }

  const writeActors = async (tx) => {
    await tx.user.create({ data: customer })
    // The active-vehicle FK points forward, so create the captain before the
    // car and attach the cache link once both rows exist.
    for (const driver of drivers) {
      const driverData = { ...driver }
      delete driverData.activeVehicleId
      await tx.driver.create({ data: driverData })
    }
    for (const vehicle of vehicles) await tx.vehicle.create({ data: vehicle })
    for (const driver of drivers) {
      await tx.driver.update({ where: { id: driver.id }, data: { activeVehicleId: driver.activeVehicleId } })
    }
    for (const location of locations) await tx.driverLocation.create({ data: location })
    return { customers: [customer], drivers, vehicles, locations }
  }
  const write = async (tx) => {
    await writeActors(tx)
    for (const row of bookings) await tx.booking.create({ data: row })
    await tx.rideOffer.create({ data: offer })
    await tx.payment.create({ data: payment })
    return collections
  }

  return {
    id: scenarioId,
    now: new Date(clock),
    customer,
    drivers,
    driversByGroup,
    vehicles,
    locations,
    bookings,
    bookingStates: { scheduled, current, previous, next },
    offers: [offer],
    payments: [payment],
    collections,
    metadata,
    // Integration consumers create bookings through the real application service.
    persistActors: (db) => typeof db.$transaction === 'function' ? db.$transaction(writeActors) : writeActors(db),
    persist: (db) => typeof db.$transaction === 'function' ? db.$transaction(write) : write(db),
  }
}
