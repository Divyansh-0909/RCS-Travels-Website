import pg from 'pg'
import { GenericContainer } from 'testcontainers'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertPostgisPrerequisites } from './postgisPrerequisites.js'

const fixtureDirectory = fileURLToPath(new URL('../fixtures/', import.meta.url))
const imageRecipeHash = createHash('sha256').update(readFileSync(new URL('../fixtures/postgis-pgvector.Dockerfile', import.meta.url))).digest('hex')
const POSTGIS_IMAGE = `rcs-test-postgis-pgvector:${imageRecipeHash.slice(0, 16)}`

const TEST_DATABASE = 'rcs_container_test'
const TEST_USERNAME = 'rcs_test_user'
const TEST_PASSWORD = 'rcs_test_password'

async function provisionMigrationPrerequisites(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5_000 })
  await client.connect()
  try {
    await client.query(`
      DO $$ BEGIN
        CREATE ROLE anon NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DO $$ BEGIN
        CREATE ROLE authenticated NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DROP EXTENSION IF EXISTS postgis CASCADE;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION postgis WITH SCHEMA extensions;
    `)
    const { rows: roles } = await client.query(`
      SELECT rolname, rolcanlogin
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
      ORDER BY rolname
    `)
    const { rows: [versions] } = await client.query(`
      SELECT current_setting('server_version') AS postgres_version,
             extension.extversion AS postgis_version,
             namespace.nspname AS postgis_schema,
             extensions.ST_AsText('POINT(1 2)'::extensions.geometry) AS test_point
      FROM pg_extension extension
      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
      WHERE extension.extname = 'postgis'
    `)
    const { rows: [vector] } = await client.query("SELECT default_version FROM pg_available_extensions WHERE name = 'vector'")
    return assertPostgisPrerequisites(roles, { ...versions, vector_version: vector?.default_version })
  } finally {
    await client.end()
  }
}

export async function startPostgisTestEnvironment() {
  await GenericContainer.fromDockerfile(fixtureDirectory, 'postgis-pgvector.Dockerfile').build(POSTGIS_IMAGE, { deleteOnExit: false })
  const container = await new PostgreSqlContainer(POSTGIS_IMAGE)
    .withDatabase(TEST_DATABASE)
    .withUsername(TEST_USERNAME)
    .withPassword(TEST_PASSWORD)
    .start()
  try {
    const connectionString = container.getConnectionUri()
    const versions = await provisionMigrationPrerequisites(connectionString)
    return {
      connectionString,
      ...versions,
      imageRecipeHash,
      stop: () => container.stop(),
    }
  } catch (error) {
    await container.stop()
    throw error
  }
}
