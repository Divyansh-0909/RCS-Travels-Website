import { prisma } from '../db/prisma.js'

// Seeded booking ids (prisma/seed.js → pastBookings); this script removes everything
// else so the DB matches the seed. Keep in sync with the seed's booking ids.
const SEED_BOOKING_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
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
