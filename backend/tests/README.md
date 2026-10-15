# Scheduled-ride verification foundation — Phase 1

This is test infrastructure for the frozen Product Spec V1. It does not implement
the new assignment, responsibility, compensation, payout, or appeal behavior.
The authoritative specification and VM matrix remain the approved conversation
artifacts; this file is a usage guide, not a replacement product specification.

## Existing architecture and boundaries

- Runner: Node `node:test`, `node:assert/strict`, and the existing `tsx` loader.
- Most existing backend tests use small Prisma-shaped in-memory fakes. They do
  not reproduce PostgreSQL isolation, locks, or unique constraints.
- `documentConcurrency.test.js` has a legacy `RUN_DB_TESTS=1` path importing the
  application Prisma singleton. It is **not** the new isolated harness. Do not
  set that flag when running ordinary tests against a configured application DB.
- The application singleton and ordinary Prisma config load runtime environment
  variables. New DB tests import neither; they require `TEST_DATABASE_URL`.
- Existing time seams include explicit `now` arguments in dispatch eligibility,
  reminders, and pickup-delay helpers. `fareQuote.test.js` patches `Date.now`.
  The new clock is per-test, not a global timer patch.
- No shared customer/driver/payment factory or backend coverage/mutation gate
  existed. Existing mock tests and cancellation/payment fixtures remain intact.
- Existing GitHub workflows run code-atlas checks and deployment; they do not
  provision a backend integration DB. This phase adds an explicit local/CI command,
  not a deployment gate or production database dependency.

## Commands

```powershell
npm --prefix backend test
npm --prefix backend run typecheck

# Starts and destroys a pinned PostgreSQL 17 + PostGIS 3.5 container.
npm --prefix backend run test:db

# Dedicated sanitized child + network fence + first real backend lifecycle slice.
# This suite is intentionally separate from the general DB runner below.
npm --prefix backend run test:phase9

# Expert-only path for a dedicated disposable cluster; never an application URL.
$env:TEST_DATABASE_URL = 'postgresql://test_user:test_password@127.0.0.1:5432/rcs_test'
npm --prefix backend run test:db:external
```

`test:db` uses Testcontainers with the immutable
`postgis/postgis:17-3.5@sha256:01a6a70e...` image (PostgreSQL 17.5 and PostGIS
3.5.2), provisions the migration-only
Supabase roles as `NOLOGIN`, verifies PostGIS, runs the real Prisma migration
chain and integration tests, and removes the container. It ignores application
`DATABASE_URL` and `DIRECT_URL` values. Docker with Linux-container support is
required locally and in CI. CI must expose a working Docker socket to the job,
allow Linux containers and Testcontainers' Ryuk cleanup container, and permit
pulls from Docker Hub. No database service or application credentials are
required. The first run downloads the image.

`test:db:external` fails if `TEST_DATABASE_URL` or migration prerequisites are
missing. It never silently skips. Ordinary `npm test` does not start a database
or run integration files.

Database prerequisites: PostgreSQL 13+ (DROP DATABASE WITH FORCE), PostGIS, and a
dedicated login permitted to create/drop databases and install the migration's
extension. The repository's security migration also expects `anon` and
`authenticated` roles. On a **dedicated disposable test cluster**, provision
these as NOLOGIN roles once; do not modify roles on an application cluster:

```sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
```

The harness accepts only loopback URLs with a database name containing `test`,
without query overrides. This guards accidental use; it cannot establish that a
local server contains no production data. Use a dedicated disposable server.
It creates a random `rcs_verify_<uuid>` database, applies the actual repository
migrations with an isolated Prisma config, and drops only that owned database.
It never falls back to `DATABASE_URL` or `DIRECT_URL`, runs seeds, or copies real
customers. A killed process can leave an owned database; investigate the failed
run before manually removing it. Migration failures report the migration name
and error codes without printing credential-bearing CLI output.

## Clock

```js
import { createTestClock } from './helpers/testClock.js'
const clock = createTestClock('2026-09-23T12:00:00+05:30')
clock.advance(30 * 60 * 1000)
clock.set('2026-09-24T06:30:00Z')
```

Inputs use explicit offsets; storage/comparison uses absolute UTC instants.
`advance` accepts milliseconds, not calendar days. It does not execute timers,
jobs, routing requests, or network callbacks. Tests invoke the relevant worker
or helper after advancing. Production defaults to `systemClock.now()`.

Only `expectedPickupAtForAssignment` and `isDriverDelayed` gained an optional
clock argument; existing explicit `now` calls remain compatible. Their existing
rules are unchanged. Future seams to wire when the corresponding behavior is
implemented: scheduled-assignment sweep, owner/RCS deadlines, priority collapse,
reminders, required-online/reconnect deadlines, ETA checkpoints, failed-pickup
grace, delivered-notice appeal deadline, review SLA, and reservation expiry.
Creating a clock does not mean those production paths already consume it.

## Fixtures and real transactions

```js
import { createScheduledScenario } from './helpers/scheduledScenario.js'
import { createTestDatabase, raceTransactions, withRollback } from './helpers/database.js'

const scenario = createScheduledScenario({
  now: '2026-09-23T06:30:00Z',
  drivers: { partner: { isOnline: false } },
  booking: { status: 'cancelled', cancellationReason: 'scenario reason' },
})
const db = await createTestDatabase()
try {
  await scenario.persist(db.client)
  // Each concurrent worker gets a separate session/transaction.
  // Call await rendezvous() immediately before the operation under test.
  // const outcomes = await raceTransactions(db, [workerA, workerB])
} finally {
  await db.close()
}
```

Factories use actual `admin`, `rcs`, and `partner` group values, current payout
verification fields, locations, vehicles, bookings, offers, and payments.
Multiple scenarios provide multiple customers/drivers; override an admin group
when testing several scenarios in the same DB because the schema permits only
one admin driver. Overrides intentionally permit invalid business scenarios.
Legacy money units remain explicit: booking fare fields are rupees; payment and
scheduled advance fields are paise. No future compensation/liability tables or
payout-account versioning are invented. Later evidence/financial metadata is
test-only and is not persisted as current schema fields.

`withRollback` is for one-client tests. Races must commit in separate sessions;
an outer rollback cannot isolate those commits. Database-per-test isolation
handles cleanup instead. `raceTransactions` returns every settled outcome so
callers must assert errors as well as the final DB state. A rendezvous aligns
the competing operations; it does not guarantee which driver wins. Timeouts
bound failures, not operation order. `failFirst` injects a specified number of
retryable failures at a caller-selected boundary without sleeping.

The harness self-test uses `migrations:false` solely for its `harness_probe`
table. Product/fixture integration tests must use the default real migrations.
The probe proves session isolation, rollback, competing conditional updates,
and unique-constraint contention. It does **not** verify ride acceptance or
finalization logic.

## Financial assertions

All helper inputs use integer paise. Build an explicit snapshot of expected and
actual amounts rather than importing current production settlement calculations
as the expected answer. The normal gross earning is supplied independently of
responsibility compensation. Coupon accounting remains separate. Cash already
received is separate from a platform-controlled payout, preventing double pay
or deduction from money RCS does not control.

The assertions cover customer collection sources, normal gross/commission/net,
liability conservation, compensation inventory, RCS balances/receivables, and
deduction ownership. They do not create ledger records, decide responsibility,
finalize cases, choose rates, or contact providers. Synthetic ₹400/₹80/₹320
examples validate the checker, not the missing production compensation system.

## Matrix enablement (not product verification)

| Foundation | Prior matrix IDs it supports | Still required |
| --- | --- | --- |
| Controlled time | VM-008, VM-009, VM-013, VM-015–017, VM-022, VM-025, VM-030, VM-031 | Wire each production seam and test its policy |
| Schema fixtures | VM-001, VM-006, VM-007, VM-010–014, VM-018–025, VM-042 | Scenario-specific assertions; evidence/provider fakes |
| Isolated transactions/races | VM-011, VM-038, VM-046, VM-048 | Actual competing accept/finalization/reservation/webhook operations |
| Financial identities | VM-033, VM-035–041, VM-043, VM-050, VM-052 | Real liability/compensation ledger and payout lifecycle |

**Infrastructure exists; none of these frozen product rules is newly verified.**
AI evidence, provider contracts, notification delivery, final-state immutability,
and production reconciliation are not established by these utilities.

## LEGACY BEHAVIOR — TO BE MIGRATED

Scheduled acceptance deposits, immediate strike effects, old priority windows,
and legacy payout-UPI replacement tests intentionally keep their current
expectations. Migrate them alongside their production behavior, not here.

## Phase 1 handoff

Phase 1 recommended payment/payout provider fakes at the existing service boundaries, with
captured requests, duplicate webhook delivery, and explicit success/failure
outcomes. Existing payment mocks already provide a starting point. This makes
booking persistence and financial failure scenarios repeatable without live
payments. Those provider fakes are implemented below. Routing/GPS evidence
adapters and a notification sink remain later work.

## Phase 2B provider fakes

Run the provider-infrastructure tests without network calls or real money:

```powershell
npm --prefix backend run test:providers
```

`createRazorpayFake` uses the existing gateway arguments accepted by payment and
refund services. It records every order, payment lookup, refund, and webhook
delivery; generates valid Checkout and webhook signatures; keeps deterministic
IDs and timestamps; and supports provider errors, timeouts, lost responses,
missing refund IDs, delayed or repeated webhooks, partial refunds, and explicit
provider state changes. Delivering a webhook still passes through production
signature verification.

`createRazorpayXFake` uses the existing driver-payout gateway boundary. It
records request destinations, amounts, references, idempotency keys, fetches,
and callback deliveries. Reusing an idempotency key returns the same logical
payout while every call remains visible; using a different key creates another
payout so application duplication is observable.

`directCashSettlement` and `platformControlledSettlement` are test-only
descriptors. They preserve gross earning and make provider control explicit;
they do not change settlement, wallet, liability, or payout production logic.
Each fake is created per test and also has an explicit `reset` method.

Phase 2A is validated. The disposable PostgreSQL/PostGIS container completed
the full migration chain, the scheduled fixture test, and the transaction race
test. The container and its Testcontainers cleanup process were absent after
the run. This removes the former local PostGIS blocker; CI still needs the
Docker capabilities listed above.

## Phase 3 evidence fixtures

`phase3Evidence.test.js` exercises test-only routing, GPS, connectivity, and
notification helpers with the Phase 1 clock. Each factory returns independent
state and a `reset` method. Routing observations retain normal and traffic ETA,
route distance, source, calculated/received times, and cache age. A failed route
query exposes the failure and any previous route separately; it does not decide
whether the pickup is feasible. The routing fake also exposes the current
`getNavigationRoute`/`getNavigationEtaMinutes` return shape for callers that
only need navigation ETA. Location evidence retains device observation
and server receipt times separately. `pickupProgress` returns raw ETA and route
distance reductions without applying a responsibility threshold. Connectivity
signals form an ordered journal rather than inferring offline state from missing
GPS. The notification sink records every attempt and requires an explicit
`deliver` call before marking a message delivered, including when a provider
accepted the send. Its `messaging` and `whatsappRequest` adapters fit the
existing `sendPush` and `sendWhatsAppTemplate` test seams.

These helpers do not persist Phase 3 evidence to the current schema or replace
production routing and notification providers. Tests using the existing
scheduled scenario can keep the evidence in scenario-owned test context.

## Phase 4 responsibility evidence fixture engine

`responsibilityEvidence.test.js` exercises a test-only evidence journal for
`DRIVER_CANCELLATION`, `FAILED_PICKUP`, `DRIVER_LATE`, `DRIVER_OFFLINE`,
`RIDER_CANCELLATION`, `PLATFORM_ASSIGNMENT_FAILURE`, and `REPLACEMENT_FAILURE`.
It combines caller-supplied booking/assignment, routing, GPS, connectivity,
notification, payment/payout, cancellation, feasibility/progress, and external
observations without deciding who is responsible.

Every evidence item preserves source, direct-versus-derived provenance,
observation and receipt times, availability, claim identity, and caller-owned
quality metadata. Derived facts must name their source evidence IDs. Snapshots
are immutable, timelines are deterministic, conflicting values for the same
claim are retained as contradictions, and case-specific completeness reports
distinguish evidence that is missing from evidence explicitly observed as
`unknown` or `not_available`.

The fixture does not run AI analysis, assign blame, create penalties or strikes,
move money, issue compensation, adjudicate appeals, implement assignment
feasibility, or persist new production evidence. The Phase 3 production
provenance gaps therefore remain visible prerequisites for later verification.
