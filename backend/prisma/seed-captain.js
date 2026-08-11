import 'dotenv/config'
import { clerkClient } from '@clerk/express'
import { prisma } from '../db/prisma.js'
import { isVehicleClass, seatsOf } from '../constants/vehicles.js'
import { ensurePrimaryVehicle } from '../services/driverVehicles.js'

// A captain you can actually sign into the driver app as.
//
// seed.js already makes four drivers and NONE of them can log in, for two
// separate reasons:
//
//   1. Their phones are stored E.164 ('+919810000001'), but /api/auth/send-otp
//      takes the bare 10 digits the login screen collects and looks the row up
//      by that string. The audience gate can never match them.
//   2. Nothing in the backend has ever written Driver.clerkId, and every route
//      in driver.ts resolves the captain with findUnique({ where: { clerkId } }).
//      A row with a null clerkId 404s at /api/driver/me no matter how cleanly
//      the sign-in went.
//
// This script fixes both for one row: a 10-digit phone, and the Clerk identity
// created and linked up front. It is a TEST fixture, not the onboarding flow —
// see the driver-app entry under IMPORTANT in ROADMAP.txt for the real thing.
//
//   node prisma/seed-captain.js
//   CAPTAIN_PHONE=9876500001 CAPTAIN_CLASS=hatchback node prisma/seed-captain.js

const PHONE = process.env.CAPTAIN_PHONE || '9800000001'
const VEHICLE_CLASS = process.env.CAPTAIN_CLASS || 'suv'

// A plausible car per class, so the Account screen has a real model to render rather
// than falling back to the class label. Fixture data only — nothing in the app may
// branch on vehicleModel, which is exactly why a made-up name here is harmless.
const MODEL_FOR = {
  hatchback:   'Maruti Suzuki Swift',
  sedan:       'Honda City',
  suv:         'Toyota Innova Crysta',
  suv_premium: 'Toyota Fortuner',
}

// Same anchor seed.js uses (Connaught Place), so this captain sits inside the
// 20km assignment box with the rest of the test fleet.
const PICKUP = { lat: 28.6315, lng: 77.2167 }

async function main() {
  if (!/^\d{10}$/.test(PHONE)) {
    throw new Error(`CAPTAIN_PHONE must be exactly 10 digits — got "${PHONE}"`)
  }
  if (!isVehicleClass(VEHICLE_CLASS)) {
    throw new Error(`CAPTAIN_CLASS "${VEHICLE_CLASS}" is not a vehicle class`)
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is not set — this script has to create the Clerk user')
  }

  // The exact derivation hybridAuth.js uses. It has to match, or verify-otp
  // mints a SECOND Clerk user for the same phone and links to neither.
  const email = `91${PHONE}@rcs-travels.com`

  const found = await clerkClient.users.getUserList({ emailAddress: [email] })
  const clerkUser = found.data.length > 0
    ? found.data[0]
    : await clerkClient.users.createUser({ emailAddress: [email], skipPasswordChecks: true })

  console.log(`Clerk user ${clerkUser.id} (${email})`)

  const driver = await prisma.driver.upsert({
    where: { phone: PHONE },
    update: {
      clerkId:            clerkUser.id,
      isActive:           true,
      verificationStatus: 'approved',
      // In the update branch as well as the create one, so a captain seeded before
      // the column existed picks the model up on a re-run instead of keeping the
      // NULL that makes the Account screen fall back to "SUV".
      vehicleModel:       MODEL_FOR[VEHICLE_CLASS] ?? null,
    },
    create: {
      clerkId:            clerkUser.id,
      name:               'Test Captain',
      phone:              PHONE,
      vehicleClass:       VEHICLE_CLASS,
      vehicleCapacity:    seatsOf(VEHICLE_CLASS),
      vehicleNumber:      'DL09TEST01',
      vehicleModel:       MODEL_FOR[VEHICLE_CLASS] ?? null,
      isActive:           true,
      // Offline on purpose: going online is the first thing the app's toggle
      // does, and a captain seeded online makes that button a no-op.
      isOnline:           false,
      verificationStatus: 'approved',
    },
  })

  // The Vehicle row the four columns above are a cache of. Also re-points the
  // cache, which is what makes changing VEHICLE_CLASS at the top of this file and
  // re-running it do the right thing rather than leaving the car behind.
  await ensurePrimaryVehicle(driver.id, {
    vehicleClass:  VEHICLE_CLASS,
    vehicleNumber: 'DL09TEST01',
    vehicleModel:  MODEL_FOR[VEHICLE_CLASS] ?? null,
  })

  await prisma.driverLocation.upsert({
    where:  { driverId: driver.id },
    update: { latitude: PICKUP.lat, longitude: PICKUP.lng },
    create: { driverId: driver.id, latitude: PICKUP.lat, longitude: PICKUP.lng },
  })

  console.log(`Driver ${driver.name} (${driver.vehicleClass}) @ ${driver.id}`)
  console.log(`\n  Log in with: ${PHONE}`)
  console.log('  The OTP prints to the backend console — WhatsApp delivery is')
  console.log('  commented out in routes/hybridAuth.js.\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
