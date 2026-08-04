import 'dotenv/config'
import { prisma } from '../db/prisma.js'

// Removes the dummy rows prisma/seed.js and prisma/seed-captain.js create, so a
// database can be handed to real users. The inverse of clean-bookings.js: that
// one deletes everything EXCEPT the seed, this one deletes the seed itself.
//
// Targeted by identifier, never by "delete all" — a real captain or a real
// booking must not be collectable by this script. Keep the three lists below in
// sync with the seeds, the same way clean-bookings.js tracks its booking ids.
//
//   node prisma/clean-seed-data.js          report only
//   node prisma/clean-seed-data.js --write  apply
//
// Fares are deliberately NOT touched. fare_table is the rate card, not test
// data, and an empty one silently changes what riders are quoted.

// seed.js → drivers[], and seed-captain.js's default CAPTAIN_PHONE. Bare 10
// digits since 4 Aug 2026; see lib/phone.js.
const SEED_DRIVER_PHONES = [
  '9810000001',
  '9810000002',
  '9810000003',
  '9810000004',
  '9800000001',
]

// seed.js → seedTestData()
const SEED_USER_PHONES = ['9876543210']

// seed.js → pastBookings()
const SEED_BOOKING_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
]

const WRITE = process.argv.includes('--write')

async function main() {
  const host = (process.env.DATABASE_URL || '').match(/@([^:/]+)/)?.[1] ?? 'unknown'
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  console.log(`Database: ${host}${isLocal ? '' : '   <-- NOT local'}\n`)

  const users = await prisma.user.findMany({
    where:  { phone: { in: SEED_USER_PHONES } },
    select: { id: true, name: true, phone: true },
  })
  const drivers = await prisma.driver.findMany({
    where:  { phone: { in: SEED_DRIVER_PHONES } },
    select: { id: true, name: true, phone: true },
  })

  const userIds = users.map(u => u.id)
  const driverIds = drivers.map(d => d.id)

  // Booking.user and Booking.driver are both Restrict (no cascade in the
  // schema), so every booking touching a seed row has to go first or the
  // deletes below fail on a foreign key. That is wider than SEED_BOOKING_IDS:
  // anything booked against the test rider while testing counts too.
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { id: { in: SEED_BOOKING_IDS } },
        { userId: { in: userIds } },
        { driverId: { in: driverIds } },
      ],
    },
    select: { id: true, status: true },
  })

  for (const b of bookings) console.log(`  booking  ${b.id} (${b.status})`)
  for (const d of drivers) console.log(`  driver   ${d.name} — ${d.phone}`)
  for (const u of users)   console.log(`  user     ${u.name} — ${u.phone}`)

  const total = bookings.length + drivers.length + users.length
  if (total === 0) {
    console.log('  nothing found — database is already clean.')
    return
  }

  if (!WRITE) {
    console.log(`\n${total} rows would be deleted. Re-run with --write to apply.`)
    return
  }

  // One transaction: a half-deleted seed leaves drivers whose bookings are gone
  // and is worse than either end state. DriverLocation, DriverDocument and
  // SavedPlace all cascade, so they need no pass of their own.
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { id: { in: bookings.map(b => b.id) } } }),
    prisma.driver.deleteMany({ where: { id: { in: driverIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ])

  console.log(`\nDeleted ${total} rows.`)
  console.log('Clerk users for these phones are NOT removed — they are in Clerk,')
  console.log('not Postgres. Delete them from the Clerk dashboard if you want the')
  console.log('identities gone too; leaving them only means a re-seed reuses them.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
