import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPostgisPrerequisites } from './helpers/postgisPrerequisites.js'

const versions = {
  postgres_version: '17.5',
  postgis_version: '3.5.2',
  postgis_schema: 'extensions',
  test_point: 'POINT(1 2)',
  vector_version: '0.8.6',
}
const roles = [
  { rolname: 'anon', rolcanlogin: false },
  { rolname: 'authenticated', rolcanlogin: false },
]

test('PostGIS prerequisites accept the required NOLOGIN roles and extension schema', () => {
  assert.deepEqual(assertPostgisPrerequisites(roles, versions), {
    postgresVersion: '17.5',
    postgisVersion: '3.5.2',
    vectorVersion: '0.8.6',
  })
})

test('disposable database requires the exact pgvector package needed by current migrations', () => {
  for (const vector_version of [undefined, null, '0.8.5']) {
    assert.throws(() => assertPostgisPrerequisites(roles, { ...versions, vector_version }), /pinned pgvector/)
  }
})

test('PostGIS prerequisites reject missing or login-enabled Supabase roles', () => {
  const message = 'Disposable database roles were not provisioned as NOLOGIN'
  assert.throws(() => assertPostgisPrerequisites(roles.slice(0, 1), versions), { message })
  assert.throws(() => assertPostgisPrerequisites(roles.slice(1), versions), { message })
  for (const role of roles) {
    const loginRoles = roles.map(candidate => (
      candidate.rolname === role.rolname ? { ...candidate, rolcanlogin: true } : candidate
    ))
    assert.throws(() => assertPostgisPrerequisites(loginRoles, versions), { message })
  }
})

test('PostGIS prerequisites reject the wrong schema or an unusable spatial function', () => {
  const message = 'PostGIS is not usable in the required extensions schema'
  assert.throws(() => assertPostgisPrerequisites(roles, {
    ...versions,
    postgis_schema: 'public',
  }), { message })
  assert.throws(() => assertPostgisPrerequisites(roles, {
    ...versions,
    test_point: 'POINT(2 1)',
  }), { message })
})
