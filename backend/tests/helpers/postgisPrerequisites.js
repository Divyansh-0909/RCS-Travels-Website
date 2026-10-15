const REQUIRED_ROLES = ['anon', 'authenticated']

export function assertPostgisPrerequisites(roles, versions) {
  const noLoginRoles = new Set(
    roles.filter(role => role.rolcanlogin === false).map(role => role.rolname),
  )
  if (REQUIRED_ROLES.some(role => !noLoginRoles.has(role))) {
    throw new Error('Disposable database roles were not provisioned as NOLOGIN')
  }
  if (versions.postgis_schema !== 'extensions' || versions.test_point !== 'POINT(1 2)') {
    throw new Error('PostGIS is not usable in the required extensions schema')
  }
  if (versions.vector_version !== '0.8.6') throw new Error('Disposable database requires pinned pgvector 0.8.6')
  return {
    postgresVersion: versions.postgres_version,
    postgisVersion: versions.postgis_version,
    vectorVersion: versions.vector_version,
  }
}
