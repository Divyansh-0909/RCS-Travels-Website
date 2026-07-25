import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // migrate and studio need a DIRECT (or session-mode) connection: migrate
    // takes an advisory lock and runs DDL in a transaction, neither of which
    // survives a transaction-mode pooler. The app runtime reads DATABASE_URL
    // separately in db/prisma.js, so that one can be the pooler.
    // Falls back when only DATABASE_URL is set (local dev).
    url: process.env['DIRECT_URL'] || process.env['DATABASE_URL'],
  },
})
