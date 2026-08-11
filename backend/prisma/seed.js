import { prisma } from '../db/prisma.js'
import { seatsOf } from '../constants/vehicles.js'
import { normalizePhone } from '../lib/phone.js'
import { ensurePrimaryVehicle } from '../services/driverVehicles.js'

// Only the two base classes are stored. Sedan and premium SUV are derived from
// their sibling in rideEstimate (DERIVED_CLASS), so a destination gains both
// without a row of its own — and there is no second copy of the card to keep
// in step when a price moves.
const fareData = [
  // ── Gurgaon ──────────────────────────────────────────────────────────────
  { destinationName: 'Gurgaon',          vehicleClass: 'hatchback', fixedFare: 800  },
  { destinationName: 'Gurgaon',          vehicleClass: 'suv',       fixedFare: 1150 },

  // ── IGI Airport ───────────────────────────────────────────────────────────
  { destinationName: 'IGI Airport',      vehicleClass: 'hatchback', fixedFare: 550  },
  { destinationName: 'IGI Airport',      vehicleClass: 'suv',       fixedFare: 875  },

  // ── Noida ─────────────────────────────────────────────────────────────────
  { destinationName: 'Noida',            vehicleClass: 'hatchback', fixedFare: 625  },
  { destinationName: 'Noida',            vehicleClass: 'suv',       fixedFare: 975  },

  // ── Faridabad ─────────────────────────────────────────────────────────────
  { destinationName: 'Faridabad',        vehicleClass: 'hatchback', fixedFare: 875  },
  { destinationName: 'Faridabad',        vehicleClass: 'suv',       fixedFare: 1300 },

  // ── Greater Noida ─────────────────────────────────────────────────────────
  { destinationName: 'Greater Noida',    vehicleClass: 'hatchback', fixedFare: 1100 },
  { destinationName: 'Greater Noida',    vehicleClass: 'suv',       fixedFare: 1625 },

  // ── Ghaziabad ─────────────────────────────────────────────────────────────
  { destinationName: 'Ghaziabad',        vehicleClass: 'hatchback', fixedFare: 825  },
  { destinationName: 'Ghaziabad',        vehicleClass: 'suv',       fixedFare: 1225 },

  // ── Agra (outstation) ─────────────────────────────────────────────────────
  { destinationName: 'Agra',             vehicleClass: 'hatchback', fixedFare: 3750 },
  { destinationName: 'Agra',             vehicleClass: 'suv',       fixedFare: 5250 },

  // ── Jaipur (outstation) ───────────────────────────────────────────────────
  { destinationName: 'Jaipur',           vehicleClass: 'hatchback', fixedFare: 6000 },
  { destinationName: 'Jaipur',           vehicleClass: 'suv',       fixedFare: 8500 },
]

// Test pickup anchor (Connaught Place) — all test drivers sit here, inside the
// 20km assignment bounding box.
const PICKUP = { lat: 28.6315, lng: 77.2167 }

// MUST equal your real Clerk user id or POST /bookings returns 401.
// Set it before seeding:  SEED_CLERK_ID=user_xxx npm run db:seed
const SEED_CLERK_ID = process.env.SEED_CLERK_ID || 'user_3FdlhBI7SlbMclO523ek4cXH1pl'

// One driver per class — assignment matches the class EXACTLY, so a fleet
// missing a class means every booking of it goes unassigned. vehicleCapacity is
// seeded to the class's full seat count so solo rides pass the
// `capacity < seatsOf(class)` skip check.
//
// Phones are the bare 10 digits, like the test user's above and like every
// other phone in the app — see lib/phone.js. They were E.164 here until
// 4 Aug 2026, which no account lookup could match; scripts/normalize-driver-
// phones.js migrated the rows that already existed.
const drivers = [
  { name: 'Ramesh Kumar', phone: '9810000001', vehicleClass: 'hatchback',   vehicleNumber: 'DL01AB1234' },
  { name: 'Suresh Yadav', phone: '9810000002', vehicleClass: 'suv',         vehicleNumber: 'DL02CD5678' },
  { name: 'Anil Sharma',  phone: '9810000003', vehicleClass: 'sedan',       vehicleNumber: 'DL03EF9012' },
  { name: 'Vikram Singh', phone: '9810000004', vehicleClass: 'suv_premium', vehicleNumber: 'DL04GH3456' },
]

async function seedFares() {
  console.log('Seeding fare_table...')
  await prisma.fareTable.createMany({ data: fareData, skipDuplicates: true })
  console.log(`  Seeded ${fareData.length} fare entries.`)
}

async function seedTestData() {
  if (SEED_CLERK_ID.startsWith('user_REPLACE')) {
    console.warn(
      '\n  ⚠  SEED_CLERK_ID is not set — using a placeholder clerkId.\n' +
      '     Booking will 401 until you reseed with your real Clerk id:\n' +
      '     SEED_CLERK_ID=user_xxxxx npm run db:seed\n'
    )
  }

  console.log('Seeding test user...')
  const user = await prisma.user.upsert({
    where:  { clerkId: SEED_CLERK_ID },
    update: { phone: '9876543210', name: 'Test Rider', bookingCode: '4242' },
    create: {
      clerkId:     SEED_CLERK_ID,
      phone:       '9876543210',
      name:        'Test Rider',
      bookingCode: '4242',
    },
  })
  console.log(`  User ${user.id} (clerkId: ${user.clerkId})`)

  console.log('Seeding drivers + locations...')
  const createdDrivers = []
  for (const d of drivers) {
    // Through the normalizer rather than straight from the literal, so a future
    // edit that pastes a number back in E.164 self-corrects instead of seeding
    // another row nothing can log into.
    const phone = normalizePhone(d.phone)
    if (!phone) throw new Error(`Driver "${d.name}" has an unusable phone: ${d.phone}`)

    const driver = await prisma.driver.upsert({
      where:  { phone },
      update: {
        isActive:           true,
        isOnline:           true,
        verificationStatus: 'approved',
        vehicleCapacity:    seatsOf(d.vehicleClass),
        fcmToken:           `test-fcm-${phone}`,
      },
      create: {
        name:               d.name,
        phone:              phone,
        vehicleClass:       d.vehicleClass,
        vehicleCapacity:    seatsOf(d.vehicleClass),
        vehicleNumber:      d.vehicleNumber,
        isActive:           true,
        isOnline:           true,
        verificationStatus: 'approved',
        fcmToken:           `test-fcm-${phone}`,
      },
    })

    // The Vehicle row behind those four columns. Seeded drivers own exactly one
    // car — the multi-car case is worth exercising by hand rather than baking a
    // second Innova into every developer's database.
    await ensurePrimaryVehicle(driver.id, {
      vehicleClass:  d.vehicleClass,
      vehicleNumber: d.vehicleNumber,
    })

    // Jitter each driver a few hundred metres off the anchor so they don't stack.
    const jitter = () => (Math.random() - 0.5) * 0.01
    await prisma.driverLocation.upsert({
      where:  { driverId: driver.id },
      update: { latitude: PICKUP.lat + jitter(), longitude: PICKUP.lng + jitter() },
      create: {
        driverId:  driver.id,
        latitude:  PICKUP.lat + jitter(),
        longitude: PICKUP.lng + jitter(),
      },
    })
    console.log(`  Driver ${driver.name} (${driver.vehicleClass}) @ ${driver.id}`)
    createdDrivers.push(driver)
  }

  return { user, drivers: createdDrivers }
}

// Finished rides so Ride History has content. Idempotent via upsert on fixed ids.
//
// `reference` is fixed here for the same reason the ids are: a re-run has to land on
// the same rows. Real bookings get a random one from lib/bookingReference.js, but a
// fixture cannot — a fresh reference every run would upsert the row and leave the
// previous code orphaned on nothing. The 9-block is reserved for fixtures so a seeded
// ride is recognisable as one on sight.
function pastBookings(user, drivers) {
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

  return [
    {
      id: '00000000-0000-4000-8000-000000000001', reference: 'RCS9000001', userId: user.id, driverId: drivers[0]?.id ?? null,
      customerPhone: user.phone, vehicleClass: 'hatchback', fare: 850, distanceKm: 32.4,
      pickupAddress: 'Connaught Place, New Delhi', pickupLat: 28.6315, pickupLng: 77.2167,
      dropAddress: 'Cyber Hub, Gurugram',          dropLat: 28.4951, dropLng: 77.0890,
      status: 'completed', confirmedAt: daysAgo(5), createdAt: daysAgo(5), completedAt: daysAgo(5),
    },
    {
      id: '00000000-0000-4000-8000-000000000002', reference: 'RCS9000002', userId: user.id, driverId: drivers[1]?.id ?? null,
      customerPhone: user.phone, vehicleClass: 'suv', fare: 1200, distanceKm: 41.0,
      rideFare: 1200, commissionPct: 5, commissionAmt: 60,
      pickupAddress: 'IGI Airport T3, New Delhi', pickupLat: 28.5562, pickupLng: 77.1000,
      dropAddress: 'Noida Sector 18',             dropLat: 28.5708, dropLng: 77.3260,
      status: 'completed', confirmedAt: daysAgo(3), createdAt: daysAgo(3), completedAt: daysAgo(3),
    },
    {
      id: '00000000-0000-4000-8000-000000000003', reference: 'RCS9000003', userId: user.id, driverId: null,
      customerPhone: user.phone, vehicleClass: 'hatchback', fare: 420, distanceKm: 18.7,
      pickupAddress: 'Karol Bagh, New Delhi', pickupLat: 28.6519, pickupLng: 77.1909,
      dropAddress: 'Saket, New Delhi',        dropLat: 28.5245, dropLng: 77.2066,
      status: 'cancelled', cancelledBy: 'user', cancellationCharge: 50, createdAt: daysAgo(1),
    },
  ]
}

async function seedPastBookings(user, drivers) {
  console.log('Seeding past bookings...')
  const rows = pastBookings(user, drivers)
  for (const b of rows) {
    await prisma.booking.upsert({
      where:  { id: b.id },
      update: b,
      create: b,
    })
    console.log(`  Booking ${b.id} (${b.status})`)
  }
}

async function main() {
  await seedFares()
  const { user, drivers } = await seedTestData()
  await seedPastBookings(user, drivers)
  console.log('\nDone. Book near Connaught Place (28.6315, 77.2167) with any vehicle class (hatchback, sedan, suv, suv_premium, any).')
  console.log('Note: sendFCM is a 30s coin-flip — assignment may take a while or 503; reseeded drivers give it retries.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
