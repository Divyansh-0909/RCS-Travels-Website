import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

const globalForPrisma = globalThis

// The annotation is load-bearing, not decoration. This file is .js, and tsconfig
// runs allowJs with checkJs off — so TS infers types out of here but reports no
// errors inside. `globalForPrisma.prisma` is an undeclared property on globalThis,
// hence `any`, and `any ?? X` widens the whole expression to `any`. Without this
// tag every `prisma.*` call in every .ts route silently type-checks against
// nothing: wrong field names, impossible selects and columns that don't exist all
// pass. Verified by probe — removing it makes tsc stop catching all of them.
/** @type {import('@prisma/client').PrismaClient} */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
