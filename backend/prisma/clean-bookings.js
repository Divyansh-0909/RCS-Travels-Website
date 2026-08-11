import { prisma } from '../db/prisma.js'

// Seeded booking ids (prisma/seed.js → pastBookings, and prisma/seed-captain-rides.js);
// this script removes everything else so the DB matches the seed. Keep in sync with
// both seeds' booking ids.
const SEED_BOOKING_IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  // The test captain's board — one en_route, three assigned.
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000014',
  // His History tab — two completed, two cancelled. Terminal statuses, so nothing
  // else in the app will ever recreate them: dropped here, they are gone until the
  // seed is run again.
  '00000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000016',
  '00000000-0000-4000-8000-000000000017',
  '00000000-0000-4000-8000-000000000018',
]

async function main() {
  const before = await prisma.booking.count()

  const { count } = await prisma.booking.deleteMany({
    where: { id: { notIn: SEED_BOOKING_IDS } },
  })

  const remaining = await prisma.booking.findMany({
    select: { id: true, status: true },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Before: ${before}  |  Deleted: ${count}  |  Remaining: ${remaining.length}`)
  for (const b of remaining) console.log(`  ${b.id} (${b.status})`)
  console.log('\nDone. DB bookings now match the seed.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
