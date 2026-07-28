import { prisma } from '../db/prisma.js'

const fareData = [
  // ── Gurgaon ──────────────────────────────────────────────────────────────
  { destinationName: 'Gurgaon',          vehicleType: 4, fixedFare: 800  },
  { destinationName: 'Gurgaon',          vehicleType: 6, fixedFare: 1150 },

  // ── IGI Airport ───────────────────────────────────────────────────────────
  { destinationName: 'IGI Airport',      vehicleType: 4, fixedFare: 550  },
  { destinationName: 'IGI Airport',      vehicleType: 6, fixedFare: 875  },

  // ── Noida ─────────────────────────────────────────────────────────────────
  { destinationName: 'Noida',            vehicleType: 4, fixedFare: 625  },
  { destinationName: 'Noida',            vehicleType: 6, fixedFare: 975  },

  // ── Faridabad ─────────────────────────────────────────────────────────────
  { destinationName: 'Faridabad',        vehicleType: 4, fixedFare: 875  },
  { destinationName: 'Faridabad',        vehicleType: 6, fixedFare: 1300 },

  // ── Greater Noida ─────────────────────────────────────────────────────────
  { destinationName: 'Greater Noida',    vehicleType: 4, fixedFare: 1100 },
  { destinationName: 'Greater Noida',    vehicleType: 6, fixedFare: 1625 },

  // ── Ghaziabad ─────────────────────────────────────────────────────────────
  { destinationName: 'Ghaziabad',        vehicleType: 4, fixedFare: 825  },
  { destinationName: 'Ghaziabad',        vehicleType: 6, fixedFare: 1225 },

  // ── Agra (outstation) ─────────────────────────────────────────────────────
  { destinationName: 'Agra',             vehicleType: 4, fixedFare: 3750 },
  { destinationName: 'Agra',             vehicleType: 6, fixedFare: 5250 },

  // ── Jaipur (outstation) ───────────────────────────────────────────────────
  { destinationName: 'Jaipur',           vehicleType: 4, fixedFare: 6000 },
  { destinationName: 'Jaipur',           vehicleType: 6, fixedFare: 8500 },
]

// Test pickup anchor (Connaught Place) — all test drivers sit here, inside the
// 20km assignment bounding box.
const PICKUP = { lat: 28.6315, lng: 77.2167 }

// MUST equal your real Clerk user id or POST /bookings returns 401.
// Set it before seeding:  SEED_CLERK_ID=user_xxx npm run db:seed
const SEED_CLERK_ID = process.env.SEED_CLERK_ID || 'user_3FdlhBI7SlbMclO523ek4cXH1pl'

// vehicleCapacity === vehicleType so solo rides pass the `capacity < vehicleType` skip check.
const drivers = [
  { name: 'Ramesh Kumar', phone: '+919810000001', vehicleType: 4, vehicleNumber: 'DL01AB1234' },
  { name: 'Suresh Yadav', phone: '+919810000002', vehicleType: 6, vehicleNumber: 'DL02CD5678' },
  { name: 'Anil Sharma',  phone: '+919810000003', vehicleType: 4, vehicleNumber: 'DL03EF9012' },
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
    const driver = await prisma.driver.upsert({
      where:  { phone: d.phone },
      update: {
        isActive:           true,
        isOnline:           true,
        verificationStatus: 'approved',
        vehicleCapacity:    d.vehicleType,
        fcmToken:           `test-fcm-${d.phone}`,
      },
      create: {
        name:               d.name,
        phone:              d.phone,
        vehicleType:        d.vehicleType,
        vehicleCapacity:    d.vehicleType,
        vehicleNumber:      d.vehicleNumber,
        isActive:           true,
        isOnline:           true,
        verificationStatus: 'approved',
        fcmToken:           `test-fcm-${d.phone}`,
      },
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
    console.log(`  Driver ${driver.name} (type ${driver.vehicleType}) @ ${driver.id}`)
    createdDrivers.push(driver)
  }

  return { user, drivers: createdDrivers }
}

// Finished rides so Ride History has content. Idempotent via upsert on fixed ids.
function pastBookings(user, drivers) {
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

  return [
    {
      id: '00000000-0000-0000-0000-000000000001', userId: user.id, driverId: drivers[0]?.id ?? null,
      customerPhone: user.phone, vehicleType: 4, fare: 850, distanceKm: 32.4,
      pickupAddress: 'Connaught Place, New Delhi', pickupLat: 28.6315, pickupLng: 77.2167,
      dropAddress: 'Cyber Hub, Gurugram',          dropLat: 28.4951, dropLng: 77.0890,
      status: 'completed', confirmedAt: daysAgo(5), createdAt: daysAgo(5), completedAt: daysAgo(5),
    },
    {
      id: '00000000-0000-0000-0000-000000000002', userId: user.id, driverId: drivers[1]?.id ?? null,
      customerPhone: user.phone, vehicleType: 6, fare: 1200, distanceKm: 41.0,
      rideFare: 1200, commissionPct: 5, commissionAmt: 60,
      pickupAddress: 'IGI Airport T3, New Delhi', pickupLat: 28.5562, pickupLng: 77.1000,
      dropAddress: 'Noida Sector 18',             dropLat: 28.5708, dropLng: 77.3260,
      status: 'completed', confirmedAt: daysAgo(3), createdAt: daysAgo(3), completedAt: daysAgo(3),
    },
    {
      id: '00000000-0000-0000-0000-000000000003', userId: user.id, driverId: null,
      customerPhone: user.phone, vehicleType: 4, fare: 420, distanceKm: 18.7,
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
  console.log('\nDone. Book near Connaught Place (28.6315, 77.2167) with vehicleType 1, 4, or 6.')
  console.log('Note: sendFCM is a 30s coin-flip — assignment may take a while or 503; reseeded drivers give it retries.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
