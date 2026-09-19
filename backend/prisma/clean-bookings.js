import { prisma } from '../db/prisma.js'

const WRITE = process.argv.includes('--write')
const ALLOW_REMOTE = process.argv.includes('--allow-remote')

function databaseHost() {
  try {
    return new URL(process.env.DATABASE_URL).hostname
  } catch {
    return null
  }
}

function isLocalDatabase(host) {
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host?.startsWith('192.168.')
    || host?.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host ?? '')
}

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

  const candidates = await prisma.booking.groupBy({
    by: ['status'],
    where: { id: { notIn: SEED_BOOKING_IDS } },
    _count: { _all: true },
    orderBy: { status: 'asc' },
  })

  const candidateCount = candidates.reduce((sum, row) => sum + row._count._all, 0)

  console.log(`Bookings: ${before} total | ${candidateCount} non-seeded would be deleted`)
  for (const row of candidates) console.log(`  ${row.status}: ${row._count._all}`)

  if (!WRITE) {
    console.log('\nReport only. Re-run with --write to delete these bookings.')
    return
  }

  const host = databaseHost()
  if (!host) {
    throw new Error('Refusing to delete bookings: DATABASE_URL is missing or invalid.')
  }
  if (!isLocalDatabase(host) && !ALLOW_REMOTE) {
    throw new Error(
      `Refusing to delete bookings from remote database ${host}. `
      + 'If this is intentional, re-run with --write --allow-remote.',
    )
  }

  const { count } = await prisma.booking.deleteMany({
    where: { id: { notIn: SEED_BOOKING_IDS } },
  })

  console.log(`\nDeleted: ${count} | Remaining: ${before - count}`)
  console.log('Done. DB bookings now match the seed.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
