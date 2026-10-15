import { defineConfig } from 'prisma/config'

// No dotenv import and no fallback to DATABASE_URL or DIRECT_URL.
const url = process.env.TEST_MIGRATION_DATABASE_URL
if (!url || !/^rcs_verify_[a-f0-9]{32}$/.test(new URL(url).pathname.slice(1))) {
  throw new Error('Migrations require a database created by the isolated test harness')
}
export default defineConfig({
  schema: '../prisma/schema.prisma',
  migrations: { path: '../prisma/migrations' },
  datasource: { url },
})
