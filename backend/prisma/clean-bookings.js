import { prisma } from '../db/prisma.js'

// Booking codes created by the seed (prisma/seed.js → pastBookings). Anything
// else is a stray booking made through the app — this script removes those so
// the DB matches the seed. Keep this list in sync with the seed's bookingCodes.
const SEED_BOOKING_CODES = ['900001', '900002', '900003']

async function main() {
  const before = await prisma.booking.count()

  const { count } = await prisma.booking.deleteMany({
    where: { bookingCode: { notIn: SEED_BOOKING_CODES } },
  })

  const remaining = await prisma.booking.findMany({
    select: { bookingCode: true, status: true },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Before: ${before}  |  Deleted: ${count}  |  Remaining: ${remaining.length}`)
  for (const b of remaining) console.log(`  ${b.bookingCode} (${b.status})`)
  console.log('\nDone. DB bookings now match the seed.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
