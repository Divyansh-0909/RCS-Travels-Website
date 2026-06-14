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

async function main() {
  console.log('Seeding fare_table...')

  await prisma.fareTable.createMany({
    data: fareData,
    skipDuplicates: true,
  })

  console.log(`Seeded ${fareData.length} fare entries.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
