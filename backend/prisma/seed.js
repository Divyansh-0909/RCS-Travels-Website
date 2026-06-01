import { prisma } from '../db/prisma.js'

const fareData = [
  // ── Gurgaon ──────────────────────────────────────────────────────────────
  { destinationName: 'Gurgaon',          vehicleType: 'HATCHBACK', fixedFare: 700  },
  { destinationName: 'Gurgaon',          vehicleType: 'SEDAN',     fixedFare: 850  },
  { destinationName: 'Gurgaon',          vehicleType: 'SUV',       fixedFare: 1100 },
  { destinationName: 'Gurgaon',          vehicleType: 'INNOVA',    fixedFare: 1250 },

  // ── IGI Airport ───────────────────────────────────────────────────────────
  { destinationName: 'IGI Airport',      vehicleType: 'HATCHBACK', fixedFare: 500  },
  { destinationName: 'IGI Airport',      vehicleType: 'SEDAN',     fixedFare: 600  },
  { destinationName: 'IGI Airport',      vehicleType: 'SUV',       fixedFare: 800  },
  { destinationName: 'IGI Airport',      vehicleType: 'INNOVA',    fixedFare: 950  },

  // ── Noida ─────────────────────────────────────────────────────────────────
  { destinationName: 'Noida',            vehicleType: 'HATCHBACK', fixedFare: 550  },
  { destinationName: 'Noida',            vehicleType: 'SEDAN',     fixedFare: 700  },
  { destinationName: 'Noida',            vehicleType: 'SUV',       fixedFare: 900  },
  { destinationName: 'Noida',            vehicleType: 'INNOVA',    fixedFare: 1050 },

  // ── Faridabad ─────────────────────────────────────────────────────────────
  { destinationName: 'Faridabad',        vehicleType: 'HATCHBACK', fixedFare: 800  },
  { destinationName: 'Faridabad',        vehicleType: 'SEDAN',     fixedFare: 950  },
  { destinationName: 'Faridabad',        vehicleType: 'SUV',       fixedFare: 1200 },
  { destinationName: 'Faridabad',        vehicleType: 'INNOVA',    fixedFare: 1400 },

  // ── Greater Noida ─────────────────────────────────────────────────────────
  { destinationName: 'Greater Noida',    vehicleType: 'HATCHBACK', fixedFare: 1000 },
  { destinationName: 'Greater Noida',    vehicleType: 'SEDAN',     fixedFare: 1200 },
  { destinationName: 'Greater Noida',    vehicleType: 'SUV',       fixedFare: 1500 },
  { destinationName: 'Greater Noida',    vehicleType: 'INNOVA',    fixedFare: 1750 },

  // ── Ghaziabad ─────────────────────────────────────────────────────────────
  { destinationName: 'Ghaziabad',        vehicleType: 'HATCHBACK', fixedFare: 750  },
  { destinationName: 'Ghaziabad',        vehicleType: 'SEDAN',     fixedFare: 900  },
  { destinationName: 'Ghaziabad',        vehicleType: 'SUV',       fixedFare: 1150 },
  { destinationName: 'Ghaziabad',        vehicleType: 'INNOVA',    fixedFare: 1300 },

  // ── Agra (outstation) ─────────────────────────────────────────────────────
  { destinationName: 'Agra',             vehicleType: 'HATCHBACK', fixedFare: 3500 },
  { destinationName: 'Agra',             vehicleType: 'SEDAN',     fixedFare: 4000 },
  { destinationName: 'Agra',             vehicleType: 'SUV',       fixedFare: 5000 },
  { destinationName: 'Agra',             vehicleType: 'INNOVA',    fixedFare: 5500 },

  // ── Jaipur (outstation) ───────────────────────────────────────────────────
  { destinationName: 'Jaipur',           vehicleType: 'HATCHBACK', fixedFare: 5500 },
  { destinationName: 'Jaipur',           vehicleType: 'SEDAN',     fixedFare: 6500 },
  { destinationName: 'Jaipur',           vehicleType: 'SUV',       fixedFare: 8000 },
  { destinationName: 'Jaipur',           vehicleType: 'INNOVA',    fixedFare: 9000 },
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
