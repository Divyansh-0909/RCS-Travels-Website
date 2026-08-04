import 'dotenv/config'
import { prisma } from '../db/prisma.js'
import { normalizePhone } from '../lib/phone.js'

// One-off, but idempotent — safe to re-run, and worth re-running against any
// database that predates 4 Aug 2026.
//
// prisma/seed.js used to write driver phones in E.164 ('+919810000001') while
// every other phone in the app is the bare 10 digits. Those rows can't be
// logged into: /api/auth/send-otp takes 10 characters and looks the driver up
// by that exact string. See lib/phone.js for the full account.
//
//   node scripts/normalize-driver-phones.js          report only
//   node scripts/normalize-driver-phones.js --write  apply
const WRITE = process.argv.includes('--write')

async function main() {
  const drivers = await prisma.driver.findMany({
    select: { id: true, name: true, phone: true },
  })

  const changes = []
  const unusable = []

  for (const d of drivers) {
    const normalized = normalizePhone(d.phone)
    if (!normalized) { unusable.push(d); continue }
    if (normalized !== d.phone) changes.push({ ...d, normalized })
  }

  for (const d of unusable) {
    console.warn(`  SKIP  ${d.name}: "${d.phone}" is not a phone number at all — fix by hand`)
  }

  if (changes.length === 0) {
    console.log(`${drivers.length} drivers, all already normalized. Nothing to do.`)
    return
  }

  // A row already holding the normalized value blocks the update on the unique
  // index. Report it rather than deleting either side — which of the two is the
  // real captain is not something this script can know.
  const taken = new Set(drivers.map(d => d.phone))

  for (const c of changes) {
    if (taken.has(c.normalized)) {
      console.warn(`  CONFLICT  ${c.name}: ${c.phone} -> ${c.normalized} already exists. Merge by hand.`)
      continue
    }
    console.log(`  ${WRITE ? 'FIXED' : 'would fix'}  ${c.name}: ${c.phone} -> ${c.normalized}`)
    if (WRITE) {
      await prisma.driver.update({ where: { id: c.id }, data: { phone: c.normalized } })
    }
  }

  if (!WRITE) console.log('\nDry run. Re-run with --write to apply.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
