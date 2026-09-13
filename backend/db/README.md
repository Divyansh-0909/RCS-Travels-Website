Remote runtime database connections use `secureDatabaseUrl()` to require TLS,
certificate validation and hostname verification. Plaintext loopback connections
remain available for local PostgreSQL. A remote URL's `sslmode=disable` or
`no-verify` cannot override this requirement.

`supabase-ca.crt` is Supabase's **public CA certificate**, not a private key.
Downloaded over HTTPS from:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

The certificate expires on 26 April 2031. Obtain a replacement through Supabase's
Database Settings when they rotate their CA. Supabase hosts use this bundled CA
unless the URL explicitly sets `sslrootcert` to another trusted CA file. Do not
disable verification to work around a certificate error.

From `backend/`, `node scripts/audit-db-security.mjs` reads only PostgreSQL
catalogs and reports effective public-role privileges, RLS, runtime privileges,
and actual client TLS status. It does not read customer rows. The reported
database-hop SSL field describes the pooler's connection to Postgres; the
`clientTransport` field describes the application's connection to the pooler.

This runtime protection does not rewrite database URLs used by external tools.
Configure verified TLS separately for migration tools and GUI clients. Enable
Supabase server-side SSL enforcement after verifying every legitimate client.
See [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)
and [node-postgres SSL configuration](https://node-postgres.com/features/ssl).
