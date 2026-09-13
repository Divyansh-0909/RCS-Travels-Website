Active security testing — 13 September 2026

Ran the following locally with synthetic identities, payments and database rows.
No live customer session, real-money transaction or production load was used.

| Probe | Actual execution | Result |
| --- | --- | --- |
| Destructive database operations | A disposable PostgreSQL cluster bound to `127.0.0.1:55439`; 24 synthetic tables using the project's original grant-revocation migration and prepared RLS migration. Separate `anon` and `authenticated` database connections attempted DELETE, UPDATE, TRUNCATE, DROP, SET ROLE postgres and SUPERUSER escalation. | All 196 attempts failed with insufficient privilege. Every synthetic sentinel remained unchanged. The cluster was stopped after testing. |
| Customer impersonation and authorization | HTTP requests through the installed Clerk middleware, production payment routes and production auth guards. Locally generated RSA keys signed fixture sessions. Tried forged identity headers, changed JWT subject/admin claims, expired tokens, non-admin access and customer A reading/ordering customer B's payment. | Nine HTTP tests passed, including positive controls for legitimate owner/admin access. |
| Payment tampering | HTTP verification requests injected customer IDs and amounts; unsigned capture webhook requests attempted to change payment state. Existing payment tests additionally exercised forged checkout signatures, partial refunds, duplicates and retry behavior. | Tampered requests were rejected; unsigned webhooks failed before database access. Payment tests passed. Gateway transports were blocked inside the HTTP fixture. |
| Bounded concurrent requests | Loopback Express harness with the real rate-limiter factories and synthetic route bodies. 318 total requests, including a 300-request burst at concurrency 10. | All burst requests returned 200; configured abuse budgets returned 429; malformed and oversized bodies returned 400 and 413. No unexpected request errors. |
| Clerk/Vercel management settings | Read-only project-associated management requests using existing authenticated tooling. | See `SERVICE_SETTINGS_AUDIT.md` for the settings actually returned and remaining access gaps. |

Final validation passed: all 342 backend tests and backend typecheck. The latest
load run measured complete responses, with burst p50 14.15 ms, p95 28.11 ms and
maximum 49.27 ms. These timings are illustrative local measurements.

The load harness caps execution at 400 requests, concurrency 10 and 45 seconds.
Its metrics describe a small local middleware fixture. They do not establish
whole-application throughput, database performance, Cloud Run scaling or a safe
production request rate. The real application uses additional routing and
database operations that this fixture deliberately does not simulate.

The SQL probe uses simplified synthetic tables to test grants, RLS and ownership.
It does not exercise application foreign keys, triggers, backups, disaster
recovery or all migrations. The prepared RLS migration is still unapplied to
the live database.

The HTTP probe uses a fake data store behind the real route handlers. It verifies
query ownership and token-validation behavior without reading real accounts.
It does not establish the Clerk production instance's signup/session policy.
Clerk supports supplying a public key for networkless token authentication;
see [Clerk authenticateRequest](https://clerk.com/docs/reference/backend/authenticate-request).

Reproduce from the repository root:

```powershell
node backend/scripts/security-load-probe.mjs
Push-Location backend
node --import tsx --test tests/securityHttp.test.js tests/payments.test.js tests/refundGateway.test.js
Pop-Location
```

The destructive probe requires a **fresh, empty disposable local database**
named `rcs_security_test` and local fixture roles that do not already exist.
It does not load `.env` and rejects remote hosts and URL override parameters.
After preparing that isolated database, set `SECURITY_TEST_DATABASE_URL` to its
loopback URI and run `node backend/scripts/security-destructive-probe.mjs`.
Never point it at a normal development database. It leaves its synthetic
fixtures in the disposable cluster for inspection.

Still pending: a named staging/production target and agreed rate/duration limits
for testing the running application, plus dedicated test accounts and an
explicit payment mode/budget before any provider-side payment execution. No
destructive production test or real-customer impersonation was attempted.
