# Phase 9D-1 — authenticated accounting, manual operations and broker recovery

14 October 2026 IST. Continues the [accepted broker slice](phase9d-broker-checkpoint-2026-10-13.md). New evidence is in `output/phase9d-broker-recovery-2026-10-14/`. The original broker SQL, six critical modules, transport/outbox implementations, checkpoints and historical receipts are preserved.

**PHASE 9D-1: PARTIAL. BROKER RECOVERY CLOSURE: VERIFIED_IN_ISOLATION for the requested bounded offline scope. PRODUCTION_READY: NO.** The requested accounting, operations, outage, race, backlog, terminal-retention and replay witnesses execute through actual database connections and separate processes. Production usage, deployment and the subsequent readiness work remain outside this closure.

The earlier checkpoint, matrix, manifest and continuation notice are copied with their original hashes in `acceptance-history.json`. The corrected terminal release and exact duplicate-observation admission now have their own source epoch and permanent regressions. The current manifest selects fresh executions; earlier records are retained without relabelling them.

## Implementation and accounting authority

`broker-recovery.sql` is an optional installer for the owned bare receiver database, after the accepted installers. It is absent from application startup and production migrations. Execution, independent guard and operations retain their distinct logins; `broker9d_reconciler` can submit accounting receipts but cannot inspect keys, dispatch, change configuration, terminate work or commit results.

Worker usage fields remain **UNKNOWN** until a separately authenticated receipt is accepted. The issuer is the **trusted offline test harness**, using `recovery-receipt.mjs` and its own random synthetic HMAC key. The key reaches only the isolated bootstrap/verification table and trusted issuing helper; execution, guard, reconciler and operations cannot read it. A separate restricted reconciler container receives its own login and the signed receipt through stdin, authenticates the effective role with `recoverySession`, and applies accounting itself. The supervisor does not impersonate that service. This supplies the requested authenticated fake-provider boundary; it does not specify a production billing API.

The versioned signed body binds request, exact attempt, distinct dispatch identity, pinned complete configuration hash, attempt generation, frozen V5, provider/model, outcome, response hash when available, integer input/output counts, integer minor units and receipt identity. Canonical serialization and a domain separator bind the signature. Missing/forged/substituted/excess usage is rejected. Exact duplicates return DUPLICATE. Conflicting authenticated receipts retain their original bytes/identities, preserve accepted accounting and fence the attempt from new guarded authority.

Three supported outcomes are SUCCESS, BILLED_FAILURE and NO_DISPATCH. NO_DISPATCH requires no recorded send and zero input/output/currency; a signed zero-charge billed response after send remains a dispatched response. Successful accounting requires a bound response identity. Late accounting can resolve a stale or terminal attempt without reviving result eligibility.

The stricter accepted aggregate semantics remain: **confirmed consumption continues to hold the full worst-case reservation**. Reconciliation does not replenish lifetime spending capacity. Only expired never-admitted reservations, or authenticated no-send/no-charge confirmation, release an unspent hold. All attempts still count toward lifetime attempt/request limits. Confirmed and unresolved consumption, lifetime reservations, held capacity, future currency capacity, active work, backlog, oldest pending work and configuration are independently inspectable. Unknown usage is never released merely because a lease or deadline expired.

## Manual interface and retained history

The isolated CLI is `node tools/phase9d/recovery-cli.mjs`. It reads a JSON object with `connectionString` and `command` from stdin; credentials are not command arguments. Its database must be loopback, owned `rcs_verify_<32 hex>`, with the actual nonprivileged `broker9d_ops` identity. No dotenv, live Clerk session, production bypass or deployed interface is introduced. The actor is the authenticated database login, not independently identified human operators.

Commands: INSPECT, ACCOUNTING, RECONCILE, STOP, RESUME, TERMINATE and CLEAN. State-changing operations bind target, expected request revision/control generation, operation UUID, supported reason and actor. Identical retries return the recorded outcome; conflicting identity reuse and stale versions fail closed. Every successful operation commits an immutable operation/event entry in the same transaction. Services have no direct history/configuration writes. Resume creates a new generation and cannot reopen old requests.

TERMINATE ends operational processing while leaving unresolved spending intact. It cannot supply Responsibility finality, alter a booking/wallet/reliability state, fabricate a receipt, increase budgets or reopen stale work. CLEAN is limited to a terminal request or a committed advisory result. It clears broker evidence/response payloads and the precisely linked receiver snapshot, while retaining request/receipt/evidence/configuration commitments, attempts, usage receipts, response hashes, results and chronological events. Receiver/source tombstones remain distinct. Duplicate delivery/registration cannot recreate the logical request or reset accounting. Source journal retention is unchanged; retention periods and legal holds remain unapproved proposals.

## Executed recovery boundaries

Real PostgreSQL connections exercise uncommitted rollback and committed-but-unacknowledged registration, reservation, dispatch admission, begin_send, observation, signed reconciliation, result commit and terminal cleanup. The latter fault executes COMMIT followed by a held query, then an independent connection terminates that backend before query completion. Inspection occurs through a different connection. Provider execution is outside database transactions.

Actual child termination after provider/observation and guard calculation preserves durable state. A pending offline timeout is stopped while its PostgreSQL session is idle; unknown accounting remains and no provider cancellation is claimed. Eighteen recorded process/lock interleavings include independently launched reconciler processes, both stop/reservation, stop/send, stop/observation and stop/reconciliation orders, conflicting accounting versus result, manual terminal versus result/recovery, expiry versus observation, old/new generations and immediate process replacement after stop. The earlier suite also proves both stop/result commit orders, two operations sessions, ABA/configuration changes and stop transaction outages. `pg_stat_activity` lock observations control commit order. These cover the requested boundary categories, not every possible schedule.

The separate server-restart witness restages the previously collected immutable synthetic projection in a bare disposable receiver, closes control connections, restarts the **parent-owned Docker PostgreSQL container**, discovers its current published port and reconnects. It compares complete persisted request/attempt rows and denies another reservation. This is server recovery of that bounded unknown request; it is not a production reconnect policy or application server restart certification.

The fixture contains **five committed incidents across four bookings**, including driver cancellation followed by rider cancellation on one booking, a separate rider cancellation and actual late recovery. It measures a bounded caller-selected four-request batch: unknown work holds in-flight capacity; other eligible work progresses after authoritative accounting, while budget-denied work stays manual. There is no invented fairness guarantee, autonomous scheduler or general production throughput claim. Additional evidence-version/provider mixes and the complete requested race matrix remain acceptance work.

## Replay, containment and quality

The new versioned saved-input recipe executes actual cancellation, accepted outbox/HTTP transport and explicit initial/journal identities in fresh databases. It records response observation followed by broker death before worker acknowledgement, lease expiry, unsafe retry denial, authenticated accounting, expired guarded-result denial, explicit manual termination, payload cleanup and late duplicates. Canonical outcomes include financial state, configuration/bindings, attempts, accounting receipts, operations and events. Generated request/attempt/dispatch and transport receipt identities are omitted from cross-run comparison and checked within each run. This is bounded backend replay; container execution is separate recipe evidence.

Exact accepted executions are selected in the [source-bound manifest](../../output/phase9d-broker-recovery-2026-10-14/manifest.json). The [acceptance matrix](../../output/phase9d-broker-recovery-2026-10-14/acceptance-matrix.json) inventories transitions, fifteen bounded fault points and remaining scope; [readiness gates](../../output/phase9d-broker-recovery-2026-10-14/readiness-gates.json) preserve previous criteria and append this continuation.

| Check | Actual accepted result |
| --- | --- |
| Full backend | **1,829/1,829 PASS**, no skips |
| Recovery units / actual DB and process suite | **5/5 / 28/28 PASS**, including real connection termination and actual PostgreSQL container restart |
| Additional acceptance closure / exact observation admission | **27/27 / 1/1 PASS**; 26 closure groups, 18 recorded interleavings and five terminal variants |
| Transport / outbox / broader disposable DB | **15/15 / 21/21 / 58/58 PASS** |
| Historical paired backend replay | **37/37 PASS**, separate evidence |
| New recovery record / independent saved-input replay | **1/1 / 1/1 PASS**, matching canonical outcomes |
| Restricted broker, guard and reconciler containers | **PASS**, each **17 checks / 30 denials**; all 51 application tables unchanged |
| Three critical JS modules | **100% statements/branches/functions/lines**: 43 statements/lines, 45 native V8 branches, five functions |
| Current framework mutation campaign | **192 unique: 191 killed, one executable reviewed equivalent**, no meaningful survivor/timeout/ignored/error |
| Selected actual SQL omissions | **10/10 killed**, exact routine catalog restored; native profiling retained |
| Structural maxima / clones | Cyclomatic **10**, cognitive **11**, Halstead Difficulty **16.023**, CRAP **10**, source **17 lines**; **zero** scoped clones |
| Backend typecheck / scoped lint / Git whitespace | **PASS** |
| Accepted auth / frozen V5 | **3/3 / 22/22 unchanged** |

Critical JS certification is scoped to `recovery-session`, `recovery-receipt` and `recovery-operations`; CLI, replay/orchestration and the SQL boundary are exercised but do not receive that three-module certificate. The original six-module certificate remains attached to its unchanged source epoch. SQL catalog/owners/search paths, native profiling, logical probes and selected omission mutants are retained; they do not establish complete SQL certification.

The one equivalence changes `<` to `<=` when sorting distinct `Object.entries` keys. Equal keys cannot occur in that comparator; 118 executable paired comparisons preserve canonical bytes and complete signed receipts. Earlier raw meaningful survivors were killed by stronger URI/factory/field/numeric assertions and remain in their original reports. Independent ESLint diagnostics retain line and column, correcting a line-only report mapping that could select a same-line default arrow instead of its enclosing function. Original structural and coverage data remain unchanged; `quality-verified.json` records the correction.

Original failed trials remain: SQL function renaming retained old qualified parameter names; receiver cleanup used an ambiguous variable; an early profiling-enabled PostgreSQL server crashed after that failure; test-runner process isolation hid the supervisor IPC; and reconnect initially used the pre-restart published port. Parallel disposable startup trials exceeded their deadlines; the accepted runs execute serially. Passing runs are not relabelled as executions of later changes. The profiler crash cause is not conclusively diagnosed; original diagnostics remain evidence.

The repeated transport suite also recorded three `TRANSPORT_CHILD_DEADLINE` leaf failures and their parent (11/15 pass). An unchanged standalone rerun passed 15/15; the deadline cause remains unresolved. A broader-DB run lost its execution session while a Prisma migration child was observed and produced no result receipt. Its interruption journal is retained. The restarted attempt recorded `Could not find a working container runtime strategy` before any tests executed; the existing local Docker runtime was restarted. These records are retained as failed/interrupted trials, separately from selected passing executions.

Two actual counterexamples led to corrections in this isolated extension. Expired never-admitted terminal reservations could not release because legacy recovery attempted to reopen the terminal request. The new wrapper releases only the proved unsent reservation and preserves the tombstone; admitted unknown work stays held. Duplicate observation previously accepted matching response bytes before checking the exact executor and attempt token. Actor/token admission now precedes duplicate acknowledgement. Wrong/null tokens and the fixture owner are denied without changing persisted state. The ten seeded SQL omissions include these fences.

The independent read-only review is retained with its original source hashes and original five-service runtime witness. Its inspected files are unchanged. The final manifest also binds the fresh container repeat, verifies identical staged runtime composition, and records the host-runner source hash explicitly. The original review is not rewritten as a new review of the repeat.

## Completed requested acceptance and subsequent readiness gates

The requested bounded broker-closure acceptance is verified in isolation:

- All fifteen outage points have persisted-state and independent-connection assertions, including an actual owned PostgreSQL restart.
- Requested reconciliation and stop/manual/lease boundary categories have real session/process witnesses. Exact duplicate receipts from two reconciler processes create one accounting entry.
- The mixed backlog fixture collects seven incidents across six bookings and three supported families. Four physical broker processes compete for two slots; killed workers retain their costs until authenticated no-send evidence resolves them. New requests bind a changed reservation configuration without rewriting old attempts. Fast/slow providers, immutable evidence versions and an unsupported source family are exercised. The selected closure witness saves elapsed time and throughput. Scheduling remains caller-selected; denied requests become manual review, and there is no ordering or starvation bound. No scheduling policy was invented.
- Guarded-result, manual-review, exhausted, stopped and unknown terminal variants undergo cleanup. Actual replacement processes make zero provider calls afterward. Duplicates and late accounting preserve retained commitments and do not recreate execution.
- The new saved-input recovery family reproduces in a fresh process and database. Restricted broker/guard/reconciler execution, independent review, scoped JavaScript quality, appropriate SQL probes and current regressions are selected by source identity.

Section K of the request leaves independent external audit custody, complete SQL certification, production-shaped Clerk load testing, deployed IAM/TLS/secrets, production server-time/provider pricing/idempotency, approved privacy/retention, independent human labels and production authorization as **subsequent work**. The criterion-level readiness file retains those gates and keeps overall Phase 9D-1 PARTIAL. CLI/replay/orchestration do not inherit the three-module numerical certificate. A separately operated provider accounting ledger can be designed later; it is not an extra completion criterion for the requested authenticated synthetic receipts.

Before production, approve queue ordering, starvation bounds and operational ownership for resolving budget-denied work. The current measured caller-selected behavior supplies no such guarantee.

No additional owner decision blocks further isolated implementation. No live model/provider call, real incident collection, financial policy/authentication change, phone run, cache-cleanup bypass, commit, deployment or Phase 9D-2 work is authorized or performed.

Frozen Jev V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. Each runner checks the accepted three authentication sources and all twenty-two frozen identities. Production shadow, auto-adjudication, consequences and Search rollout remain OFF.

```powershell
node tools/phase9d/recovery-run.mjs unit
node tools/phase9d/recovery-run.mjs integration
node tools/phase9d/recovery-run.mjs adversarial
node tools/phase9d/recovery-run.mjs integrity
node tools/phase9d/recovery-run.mjs record-replay
node tools/phase9d/recovery-run.mjs saved-replay <owned-recovery-input-path>
node tools/phase9d/recovery-capsule.mjs
```

```text
RESPONSIBILITY PHASES 1–8: VERIFIED FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
BROKER RECOVERY CLOSURE: VERIFIED_IN_ISOLATION FOR REQUESTED BOUNDED OFFLINE SCOPE
SUPPORTED ACCOUNTING / OPERATIONS / RECOVERY: VERIFIED_IN_ISOLATION (selected manifest scope)
SEPARATE-SERVICE TRANSPORT: VERIFIED_IN_ISOLATION
STANDALONE BROKER: VERIFIED_IN_ISOLATION FOR SUPPORTED OFFLINE SCOPE
DURABLE BUDGETS: VERIFIED_IN_ISOLATION FOR SUPPORTED SCOPE
USAGE RECONCILIATION: VERIFIED_IN_ISOLATION FOR TRUSTED OFFLINE ISSUER SCOPE
MANUAL OPERATIONS: VERIFIED_IN_ISOLATION FOR DATABASE-LOGIN SCOPE
ATOMIC STOP/DISPATCH/RESULT FENCING: VERIFIED_IN_ISOLATION FOR LISTED INTERLEAVINGS
INDEPENDENT EXTERNAL AUDIT CUSTODY: PARTIAL
WHOLE-SQL CERTIFICATION: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT STARTED
PRODUCTION DEPLOYMENT: NOT AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT STARTED
```
