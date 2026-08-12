import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// The pool is capped, and the number is arithmetic rather than taste.
//
// `pg` defaults to 10 connections PER PROCESS. On Render that was one process,
// so ten. On Cloud Run it is ten per INSTANCE, and the platform decides how many
// instances exist — so the real question is what the maximum multiplies out to.
// With --max-instances=4 (see DEPLOY.md) the default would be 40 sockets against
// a free-tier Supabase pooler, before counting a laptop connected to the same
// database or a Render deploy still running beside it during the migration.
//
//   5 per instance x 4 instances = 20, worst case, with headroom left over.
//
// Overridable because the two numbers have to move together: raising
// --max-instances without lowering this is how you exhaust the pooler during the
// one rush that made you raise it.
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 5)

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: POOL_MAX,

  // Shorter than a pooler would normally warrant, because of what Cloud Run does
  // between requests: it throttles the instance's CPU to near zero, so nothing
  // in this process — including the pool's own housekeeping — runs while it is
  // idle. Connections held open across that gap can be closed at the far end and
  // handed back to a query as already-dead sockets. Releasing them quickly while
  // the CPU is still allocated is the cheapest way to shrink that window.
  idleTimeoutMillis: 10_000,

  // Fail rather than hang. Without this, a request that arrives while the pooler
  // is unreachable waits indefinitely, holds a Cloud Run request slot open, and
  // eventually dies to the platform's request timeout with nothing useful in the
  // logs. Ten seconds is long enough to survive a blip and short enough that the
  // error handler still gets to write a `ref`.
  connectionTimeoutMillis: 10_000,
})

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
