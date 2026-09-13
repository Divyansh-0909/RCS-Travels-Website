Security review — 13 September 2026

Reviewed the local website, backend and captain app, plus accessible Supabase,
Cloud Run, Cloud Scheduler and Google Cloud Storage security metadata. Existing
unrelated edits were preserved. Remote checks read configuration/catalogs only;
no customer rows were selected and no live settings were changed.

| Finding | Evidence and impact | Result |
| --- | --- | --- |
| High: unencrypted database connection | A connection using `backend/.env`'s original `DATABASE_URL` had `client.connection.stream.encrypted === false`. Supabase accepted that connection, so this endpoint does not enforce TLS. An on-path observer could see database traffic. This does not establish the deployed Cloud Run connection's transport. | `backend/db/connection.js` now requires verified TLS for remote runtime connections. Supabase's public CA is bundled. A new catalog-only connection verified `tls: true` and `certificateVerified: true`. |
| Medium: OTP reuse under concurrency | `/api/auth/verify-otp` read `used: false`, then unconditionally updated it. Two concurrent requests could mint separate tickets from one code. A concurrent resend could also be overwritten. A valid OTP was still required; this was not an OTP-free login bypass. | Atomic conditional consumption matches the phone, hash, unused state and expiry before ticket creation. Regression tests exercise concurrency, resend and expiry. |
| Medium: unauthenticated account-name disclosure | Signup conflicts returned the existing customer's/captain's name for a submitted phone number, before verifying ownership. | Removed the name from the API response and both signup flows. Account existence remains distinguishable by the intentional login/signup response contract and is rate-limited. |
| Medium: public name enumeration | `/check-name` queried rider/captain names before authentication and distinguished registered names. | Public preflight now checks syntax only. The existing authenticated create-me routes retain the authoritative uniqueness check after phone verification. |
| Medium: OTP logging outside explicit development | Any environment other than the exact string `production` logged working login codes. A missing or staging environment could expose credentials to log readers. | Only explicit `development` logs local OTPs. Other environments use WhatsApp delivery. The route's delivery-failure log no longer includes the phone or raw provider error. |
| Payment integrity: late captures after cancellation | A scheduled advance captured after cancellation could remain paid without initiating its refund. | Local payment handling initiates the refund for the cancelled booking, retries it on duplicate captured-event delivery after a network failure, and sends a stable Razorpay refund-idempotency key. |
| Payment integrity: partial refund misclassification | A signed partial `refund.processed` event could mark a whole payment refunded. | Full amount, currency and pending-refund state are required before settling the full refund. |
| Defense in depth: incomplete RLS coverage | Live metadata: 8 original application tables have RLS; 16 newer application tables do not. The migration-history table also has no RLS. Neither `anon` nor `authenticated` currently has effective access to any of the 25 public tables, so missing RLS did not establish a public data leak. | Prepared `backend/prisma/migrations/20260913120000_complete_backend_table_rls/migration.sql`; **not applied to the live database**. Tested both client roles against all 24 application tables on isolated PostgreSQL. |
| Privilege scope: runtime database administrator | The configured runtime role has `BYPASSRLS`, `CREATEROLE` and `CREATEDB`. Application access therefore relies on backend authorization; an application-level compromise would have a large database impact. | Reported. Separate migration and runtime roles before reducing live privileges. The current application has no per-user SQL policies, so removing bypass privileges without an explicit backend access policy would break it. |

Supabase observations: no public-schema functions were found. Remaining default
client grants belong to the `supabase_admin` creator role, not the role used by
the existing Prisma lockdown migration. SQL-editor/service-created future
objects need the same review. Keep Data API access revoked and enable RLS on
new tables. Grants and RLS are independent controls, as explained in
[Supabase's RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

The RLS test simulates accidental SELECT/INSERT/UPDATE/DELETE grants and verifies
that both client roles still cannot see or change synthetic rows. It also checks
the original privilege revocations and that the backend owner retains access.
RLS does not replace revoking privileged operations such as TRUNCATE.

Live service observations:

- The driver-document GCS bucket has enforced public-access prevention and
  uniform bucket-level access. No anonymous IAM member was found. Signed URL
  access remains governed by the backend; public-access prevention does not
  invalidate signed URLs. See [Google's documentation](https://cloud.google.com/storage/docs/public-access-prevention).
- Cloud Run's browser-facing API permits public invocation. The internal job
  routes separately check Google's signed OIDC token, exact audience and caller.
  All three enabled Scheduler jobs use POST with OIDC targeting the API.
- Bucket-scoped object administration and self-scoped token signing were
  present on the runtime service account; no additional exposure was established
  by these checks.
- Clerk dashboard signup/session/JWT-template controls, Vercel dashboard
  configuration, Google Maps key restrictions/quotas, and Supabase management
  settings such as Data API enablement and network allowlists were not verified.
  The lack of public-table access is based on effective database privileges,
  not an assumption that the Data API is disabled.

Deployment follow-up: deploy the reviewed application changes and apply the RLS
migration through the normal migration process. Configure verified TLS for
migration tools and GUI clients as well, then enable Supabase server-side SSL
enforcement. The runtime helper does not rewrite external clients' credentials.
See [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)
and `backend/db/README.md` for certificate maintenance.

This initial review was bounded to code and configuration; it does not
guarantee that all vulnerabilities have been found. Subsequent synthetic HTTP,
destructive SQL and bounded concurrency tests are recorded in
`ACTIVE_SECURITY_TESTS.md`. Additional Clerk/Vercel management reads are recorded
in `SERVICE_SETTINGS_AUDIT.md`. No live payment execution, real-customer
impersonation or destructive production test has been performed.

Compatible dependency updates were applied to the three package lockfiles.
`npm audit --omit=dev` results before and after:

| Surface | Before | After | Remaining high / critical |
| --- | ---: | ---: | --- |
| Backend | 23 | 12 | 4 high, 0 critical |
| Website | 8 | 2 | 0 high, 0 critical |
| Captain app | 32 | 28 | 4 high, 0 critical |

These are npm's package advisory counts, including transitive dependencies and
some bundled development tooling; they are not counts of demonstrated exploits
in this application. The critical backend advisory and direct high-severity
Clerk Expo advisory no longer appear. Remaining advisories include Prisma's
tooling dependency chain, Google/Firebase SDK dependency chains, React Router,
Expo/Metro, and image-size. npm proposes major changes or even framework
downgrades for several chains; these were not forced into the application.
The remaining advisories require dependency-specific reachability review and
tested upgrades. Do not treat the lockfile updates as a clean security audit.

Validation: backend typecheck, website production build and its five tests,
captain-app lint (five existing warnings, no errors), all 333 backend tests,
and the isolated 24-table RLS check passed. The five DB-gated document-scan
suites were not enabled. No native device/simulator build or deployed application
test was performed. Refund transport tests verify the idempotency header and
that Axios errors cannot pass Basic-auth secrets into application logs.
