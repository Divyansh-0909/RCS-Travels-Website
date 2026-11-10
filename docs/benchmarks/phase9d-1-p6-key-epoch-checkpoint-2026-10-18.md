# Phase 9D-1 — P6 signing epochs and historical receipt trust

18 October 2026 IST. Continues the [SQL coverage plan](phase9d-1-sql-coverage-plan.md), [P5 checkpoint](phase9d-1-p5-broker-accounting-checkpoint-2026-10-18.md), [custody verification](phase9d-1-custody-verification-checkpoint-2026-10-18.md) and [ICR-1 correction](phase9d-1-lineage-ack-checkpoint-2026-10-18.md).

**P6 supported unprofiled behavior: VERIFIED_IN_ISOLATION. P6 native profiling: FAILED / INCOMPLETE. P6 overall: PARTIAL. WHOLE-SQL CERTIFICATION: PARTIAL. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.** Two fresh profiling-only executions reproduced a PostgreSQL signal-11 crash before native counter collection. This checkpoint does not declare P6 complete.

Evidence: [source-bound manifest](../../output/phase9d-p6-2026-10-18/manifest.json), [acceptance matrix](../../output/phase9d-p6-2026-10-18/acceptance-matrix.json), [actual selected executions](../../output/phase9d-p6-2026-10-18/selected-acceptance.json), [coverage availability](../../output/phase9d-p6-2026-10-18/coverage-comparison.json), [catalogs](../../output/phase9d-p6-2026-10-18/catalog-definitions.json), [profiler failures](../../output/phase9d-p6-2026-10-18/profiler-failure-register.json). Original execution timestamps and failures are retained.

## Composition and unchanged implementation

**All fifteen SQL files remain byte-identical to the task baseline.** No product defect correction, protocol redesign, signing implementation, key registry, new application grant or operational authority was introduced. The existing closure fixture installs the original custody sources/store and their closure replacements, with broker capture in the receiver and an independent custodian database. The source application database remains a separate synthetic fixture. These are isolated databases on the same host, not separate administrative/off-host custody.

| Installed routine / boundary | Existing responsibility and test mapping |
| --- | --- |
| `custody.rotate(text,text,bigint)` | Owner rotation operator; expected-epoch fencing, SPKI hash/key identity, existing-key refusal, unsigned-receipt retirement fence, epoch/history persistence. New P6 cases and unchanged closure/safety scenarios. |
| `custody.active_key()` | SQL helper selecting the sole ACTIVE key. Existing partial unique index permits at most one ACTIVE key; no-ACTIVE is an explicit fault state, not ruled out by that index. |
| `custody.accept(jsonb,text,text)` | Original store routine replaced by closure-store implementation. Internal SECURITY DEFINER admission checks source/sequence/head, immutable duplicate identity and new issuing key status. Direct ingress EXECUTE remains denied; `ingest` delegates. |
| `custody.ingest(jsonb)` / `valid_event(jsonb,text)` / `serialize(jsonb)` | Existing closure-admission framing, source contract and MAC validation precede internal acceptance. These dependencies are inventoried alongside rotation. |
| `custody.signable(uuid)` / `store_signature(uuid,text)` | Existing restricted signing role reads a committed receipt body and persists one signature per receipt. Format, committed receipt existence and duplicate/conflict constraints are SQL responsibilities. |
| Receiver `custody_export.ack(bigint,text,jsonb)` | Authorized source verifier submits a bound receipt; source public-key enrollment/status is separate from remote rotation. Existing public Ed25519 verification and independent `custodyStatus()` remain separate checks. |

The selected catalog contains eight custodian routines (five PL/pgSQL and three SQL-language) and one receiver PL/pgSQL ACK routine. Custodian ownership is `custody_owner`; receiver ownership is `custody_source_owner`. **Seven** of the nine are SECURITY DEFINER; `custody.serialize` and `custody.valid_event` are invoker routines. Explicit search paths, ACLs and PUBLIC EXECUTE denial are retained in the catalog rather than inferred from language coverage. The test compares all nine definitions and metadata before/after, plus 31 receiver and 28 custodian constraint/index observations. Every selected definition matches the historical native witness after LF/CRLF normalization.

The key table retains unique key IDs and epochs, supported ACTIVE/RETIRED/COMPROMISED states, the unique partial ACTIVE index, receipt/signature identities and rotation operation history. Source-side registry entries contain public material only. Trusted fixture controllers enroll source keys using the existing recipe; there is no atomic cross-database propagation claim.

## Actual lifecycle verification

[phase9dCustodyP6.test.js](../../backend/tests/integration/phase9dCustodyP6.test.js) adds fourteen leaf groups and their parent. Assertions inspect actual persisted PostgreSQL keys, events, signatures, operation history and source ACK state, then use the existing public-key verifier and independent custody comparison. No mocked SQL result establishes acceptance.

| Requirement | Unprofiled executed result |
| --- | --- |
| Initial enrollment | One epoch-1 ACTIVE key; duplicate key, duplicate epoch and second ACTIVE insertion each reject with 23505 in rolled-back owner probes. Actual ingress/signer/verifier privilege denials are asserted. |
| Unsigned receipt | A committed unsigned event prevents retirement/rotation without key/event/history changes. A restricted signer child computes a signature but is killed before storing it; a replacement persists the same deterministic public signature. |
| Valid issuance and independent ACK | Original source commitment, receipt, key ID and durable signature agree. Existing Ed25519 verification succeeds, authorized ACK succeeds and independent status is INDEPENDENTLY_VERIFIED. |
| Signature persistence | Exact duplicate returns the existing signature. Conflicting well-shaped signature, malformed signature and unknown receipt reject with 23514 without changing original persisted state. Unknown signable receipt returns null. |
| Rotation inputs | Stale/NULL expected epoch, reused identity, mismatched key ID/SPKI, missing/oversized/malformed public material are refused. Existing JavaScript rotation validation also rejects an RSA key and wrong identity before querying SQL. SQL is not credited with that JavaScript type check. |
| Valid and competing rotations | Ordinary rotations retain history. Two independent connections wait on the active-key lock with the same expected epoch: exactly one commits epoch 4 and the other returns false. Backend PIDs and the winning identity are retained. |
| Ingestion versus rotation | With profiling disabled, real ingestion waits behind the active-key lock. Its first attempt rejects with 23514 after rotation; a normal retry commits only under epoch 5. No event is committed under the retired epoch. |
| Lost signing reply and process replacement | A second signer child commits a durable signature, withholds its normal receipt reply, and is killed. After rotation a replacement with no retired private keys returns the original receipt/signature. These are owned host signer-process failures, not new database-server restart proofs. |
| Historical trust | Retired receipts remain event-bound, mathematically valid and currently trusted under the existing policy, but not currently issuing. Substituted receipt key IDs/public material are rejected. Original event/receipt/signature identities remain unchanged. |
| Retired new work | New admission under a retired key rejects. A separate explicit trusted-owner fault retires an unsigned key; the existing signer refuses SIGNER_NOT_ISSUING and the fixture restores the original state. Normal rotation does not permit that fault transition. |
| Compromise | Owner-marked historical and current COMPROMISED keys retain mathematically valid signatures, but currentlyTrusted and currentlyIssuing are false. Independent status reports SIGNER_COMPROMISED; local ACK rejects after source registry propagation. Rotation away from a compromised key preserves its compromised status. |
| Source enrollment lag | A valid remote receipt for an unknown source-side key is not locally ACKed. Independent custody comparison reports ACK_MISSING. Explicit trusted fixture registry enrollment allows the unchanged verifier/ACK path; no automatic propagation mechanism is invented. |
| Admission/availability faults | Malformed frame, unknown source, wrong MAC, conflicting retained content, sequence gap and a temporary no-ACTIVE-key state reject without losing original remote receipts. Restoring the fixture's ACTIVE state permits normal issuance. |

Final public state contains **four committed events, four original signatures, six key epochs and five rotation-operation rows**. Epochs 1 and 5 are COMPROMISED, 2–4 RETIRED and 6 ACTIVE. Eleven recorded public verification observations include five valid/trusted RETIRED observations and four mathematically valid/untrusted COMPROMISED observations. They are observations of the four receipts, not eleven unique receipts.

The [signer child](../../backend/tests/helpers/phase9dP6Signer.mjs) uses the existing signing/session helpers, checks its `custody_signer` identity, accepts synthetic private material through IPC only and has a 128 MiB Node heap bound. Evidence contains public receipts, keys, signature commitments and process outcomes, without private signing material or database credentials. The two actual child deaths record SIGKILL. The runner explicitly binds this dynamically launched child in execution source inventories.

## Reused evidence and actual results

| Check | Actual result and boundary |
| --- | --- |
| New P6 behavior, native profiling off | **15/15 PASS**, no skips; all fourteen leaf groups and parent |
| Fresh P6 profiling-only attempt 1 | **9 PASS / 2 FAIL, 11 reported tests**, no skips; one failed leaf plus parent, later groups not reached |
| Fresh P6 profiling-only attempt 2 | **9 PASS / 2 FAIL, 11 reported tests**, no skips; same failure group |
| Selected unchanged closure regressions | **6/6 PASS**, no skips; five leaf groups plus parent |
| Selected unchanged safety regressions | **4/4 PASS**, no skips; three leaf groups plus parent; mutations array empty |
| Backend typecheck | **PASS** |
| Scoped lint | **Four files, zero errors/warnings**; fixture orchestration complexity rule disabled, no numerical complexity certificate |
| Scoped Git and new-code whitespace | **PASS** |
| SQL / staging / HEAD preservation | **15/15 SQL unchanged**; staged-entry projection and HEAD match task baseline |
| Original repository / accepted identities | **19/19 local, 23/23 staged**, archive/HEAD unchanged; Clerk **3/3**, frozen V5 **22/22**, original custody **28/28**, both worktrees |

The unchanged [closure tests](../../backend/tests/integration/phase9dCustodyClosure.test.js) reuse actual false local ACK detection, rotation, signer connection replacement, compromised historical trust and role denials. Their unrelated ingress/observer/saturation groups were excluded. The unchanged [safety tests](../../backend/tests/integration/phase9dCustodySafety.test.js) reuse unsigned retirement refusal/signer backend replacement, competing rotations and catalog/default-privilege probes. Pressure, another ingestion race, SQL omission mutations and operator recovery groups were excluded. Exact selection patterns are in [regression-selection.json](../../output/phase9d-p6-2026-10-18/regression-selection.json).

The accepted [saved-input reconstruction scenario](../../backend/tests/integration/phase9dCustodyReplay.test.js) supplies the existing signing-epoch and durable-receipt recovery recipe. Its previous result remains historical evidence; no new full reconstruction was run. P2–P5, ICR-1 and the earlier 1,865/1,865 backend result retain their original epochs. They were not repeated or relabelled as P6 executions. New P6 witnesses report zero analyst/live calls; no live or paid provider/model call occurred.

## Dedicated native profiling: failure and coverage availability

Both profiling-only attempts used fresh disposable infrastructure with PostgreSQL **17.5**, plpgsql_check extension schema **2.10**, accepted source **v2.10.4** / commit `c882056fac65532dee95fc174c4fdc0cc0965293`, and image `sha256:a2b1801097f195b0a31c9da1c2f9cf2587a542e3c55cbb191b1873667dc45072`. Normal fixture installation precedes counter reset. No routine-replacement operation or mutation helper ran in either attempt.

Both attempts completed the first nine groups, including the competing rotation, then the independent custodian server crashed during group ten's ingestion/rotation path. The error exposed to the test was an unexpectedly terminated connection. The selected diagnostic projections record:

| Attempt | Signal-11 time UTC | Recovery / readiness UTC | Raw server-log commitment |
| --- | --- | --- | --- |
| Initial profile | 11:03:58.632 | Recovery 11:03:58.736; ready 11:03:59.746 | `9c737b6e34c4adb48d1d1a4daca29140392862ac8be1725857ab0f31ad5d2fcf` |
| Fresh repeat | 11:07:05.783 | Recovery 11:07:05.826; ready 11:07:06.686 | `ee805b5375021e0e62f7e460aca22937ab872b8761efb7225d2613291e4b0105` |

Each projection retains signal, peer termination, reinitialization, recovery and readiness observations. Existing runner projections minimize SQL/parameter exposure; the raw server log bytes themselves were not exported, so a commitment does not replace a raw crash dump or stack trace. Original test logs and partial public witnesses remain. No third profiling attempt was made. The later ordinary selected regressions passed with profiling off.

This reproduces a profiler-associated reliability failure without routine replacement. It does not establish whether the fault is in PostgreSQL, the profiler or their interaction, and does not resolve the historical signal-11 finding. The unprofiled pass does not turn either failed execution into acceptance.

Native collection occurs after all P6 scenarios. Both servers crashed before that point; **no new valid P6 native trees/counters were collected**. JavaScript V8 files under coverage-raw are not PostgreSQL native measurements. The collector's exact-shape reconstruction was reconciled against the existing historical native API ratios, but that offline reconciliation is not a fresh measurement.

| Routine / installation | Historical statements | P6 statements | Historical branches | P6 branches |
| --- | ---: | --- | ---: | --- |
| `custody.rotate(...)` / custodian | 0/12 | Unavailable | 0/6 | Unavailable |
| `custody.accept(...)` / custodian | 11/16 | Unavailable | 4/10 | Unavailable |
| `custody.store_signature(...)` / custodian | 7/9 | Unavailable | 2/4 | Unavailable |
| `custody.ingest(jsonb)` / custodian | 9/12 | Unavailable | 3/6 | Unavailable |
| `custody.valid_event(...)` / custodian | 22/34 | Unavailable | 20/32 | Unavailable |
| `custody_export.ack(...)` / receiver | 5/6 | Unavailable | 1/2 | Unavailable |

“Unavailable” is neither zero coverage nor an inferred passing count. Newly observed statement/branch counts and remaining P6 unhit nodes are unknown. Historical unhit statement IDs and branch observations remain in [historical-native-counts.json](../../output/phase9d-p6-2026-10-18/historical-native-counts.json). The unchanged definitions permit historical comparison, but successful assertions cannot fill missing profiler counters.

SQL-language `active_key`, `signable` and `serialize` have no PL/pgSQL native denominator. Individual SQL AND/OR/NULL/CASE/WHERE/join conditions, signature formatting, key-status predicates and DDL/ACL/constraint enforcement require separate assertions. This batch does not claim exhaustive truth tables, whole-SQL structural coverage or mutation adequacy. P5's two private native gaps remain unchanged and open; no service grant was added to force them.

## Trust boundaries

- PostgreSQL does **not** verify Ed25519 signatures. Signature storage enforces committed identity, shape and exact duplicate/conflict behavior; the trusted signing process enforces new issuing status and key material. SQL rotation binds SPKI bytes to an ID; the existing JavaScript operator additionally enforces the cryptographic key type.
- The authorized local verifier remains a trusted root. Its shape/key-bound ACK is distinct from independently committed remote history and public signature verification. The reused closure counterexample still detects a forged local ACK without a matching independent record.
- RETIRED receipts remain trusted under the present policy; COMPROMISED receipts may be mathematically valid but currently untrusted. Cached historical signatures need no retired private key. Trusted owners can alter registry states; explicit owner fault probes do not demonstrate resistance to owner/host compromise.
- Independent/source registries have separate propagation and availability boundaries. An ACK supplies no human-final, financial, promotion or operational authority. No lineage registry, crypto implementation or production policy was added.

## Source identities and preservation

| New/changed code | SHA-256 |
| --- | --- |
| `backend/tests/integration/phase9dCustodyP6.test.js` | `1a8e5f9866f7c5469e9f888cbd9229b614b42c2758be08d1d9e1c33971f4a6a8` |
| `backend/tests/helpers/phase9dP6Profile.js` | `3eac8aca6fffd8705ed402fc0d3011ae966bc29b02c84b9f4cd13c33055680dd` |
| `backend/tests/helpers/phase9dP6Signer.mjs` | `fdf576f5c2d2134b415524a1099374559afc0b69d93864173b207bd9e45722e3` |
| `tools/phase9d/closure-run.mjs` | `782ccd392ea9bbe40983fda07937c2385e5fb724c15546475100057c3051d8e1` |

Only the runner changed among **1,937** pre-existing inventoried working files. Its byte-exact before version is preserved with hash `8e4def9cbb8dd407ca96f0055f46bc7dbfeb0610d4319017ebee7dca264bcfc3`. Changes add P6 modes, scope/child binding and narrow existing-test selections. Existing fixtures, regression files, signing helpers, SQL and ICR-1 remain unchanged. All selected executions record sourcesUnchanged:true; final readback checks every selected bound source against current bytes.

| Installed catalog definition | SHA-256 |
| --- | --- |
| `custody.rotate(text,text,bigint)` | `a22896da4bf7208e7769d0d1feb20e92a6d8bb6f35f33272623da8d695a288fe` |
| `custody.active_key()` | `1efc005694cfe90db9767f261074c48493167a6d861515a01fb09a94fb3bb95c` |
| `custody.accept(jsonb,text,text)` | `8d76da620d05514076a76ba7d99e2846864bbe04f9cd7bad808fd0fe9dc30dc4` |
| `custody.signable(uuid)` | `5bfe8a42d85939f2a93649904c22afaf13cf6ae75415fcd6c4a3b1e3a1418894` |
| `custody.store_signature(uuid,text)` | `c2d0804babc7f4994f505d9cccc97c3f3b3b10e1d4e8d6df97309b1fd1cc8773` |
| `custody.ingest(jsonb)` | `3c6d1ac2f46fc00bde26cd5633791af92c05f737863cd5ba06881b5f1c84e5d6` |
| `custody.valid_event(jsonb,text)` | `84780336be0f3fe2d78769be23ae36d0586d1399683209c1a930368466b9da12` |
| `custody.serialize(jsonb)` | `d61fcdc954c2822674308d145db9dc27da5e4819ae161874ba2983096d64516a` |
| Receiver `custody_export.ack(bigint,text,jsonb)` | `377d4af5079b64a195a7c1338800fab0a38b255fe5b7ce534b45eb8a68b53553` |

The manifest separately inventories checkpoint, catalogs, original failures, wrappers, execution tools and public witnesses. Initial evidence assembly stopped on a builder interpretation of the baseline's staged-entry hash as raw index bytes. Comparing the correct `git ls-files --stage -z` projection succeeds exactly; the original builder and annotation are retained. No index/source/test correction was needed. Staged migration contents, historical evidence and original repository files remain preserved; no evidence migration occurred.

## Host monitoring, cleanup and next work

[Scripted monitoring](../../output/phase9d-p6-2026-10-18/host-observer-summary.json) contains **493 samples**, minimum available RAM **1,509.7 MiB**, minimum commit headroom **14,990.9 MiB**, **zero** heartbeat gaps above eight seconds and **zero** unresponsive taskbar samples. Owner-approved RAM admission/abort thresholds remained disabled; deadlines and child/process controls remained. Between-job checks held the next expensive job for a stale observer, sustained taskbar unresponsiveness or a sampled gap above thirty seconds; none triggered. Same-host observations cannot rule out an OS freeze.

Host space minima were C: **85.82 GiB**, D: **469.67 GiB**; every selected database receipt retains startup filesystem availability. These observations are not WAL/index bounds, full-disk recovery or production capacity proof. P5's 9.118-second heartbeat gap, historical ENOSPC/transport deadlines and earlier profiler crash remain separate reliability history. New signal-11 failures are retained alongside them.

[Cleanup readback](../../output/phase9d-p6-2026-10-18/cleanup-readback.json) found **zero running containers**, then Docker stopped normally. DellTechHub and SupportAssistAgent remain Running/Auto. No unrelated process/service was terminated, existing volume pruned or global cache/Docker cleanup performed. Only accepted owned fixture cleanup ran.

**Remaining P6 work:** investigate the reproduced profiler-associated ingestion/rotation crash before another expensive repeat. Preserve pinned runtime/source identities; obtain an appropriate crash stack/core in an explicitly isolated diagnostic task, without secrets. Any bounded serial profiling recipe must be labelled separately from the failed concurrent scenario and must not substitute for its missing acceptance. Future measurement must retain raw native counters and exact SQL definitions. Profiling and routine replacement must remain in separate servers/processes. No root cause is claimed here.

**P7, when separately requested:** reconcile cleanup/terminal-state eligibility, retained tombstone/receipt identity, late ACK/usage without work recreation, five pressure dimensions and STOP survival; verify explicit role/default-grant/metadata denials. Reuse O/R/C/S/Q cases and isolate any embedded mutation groups from profiling. Total retained history/WAL/index/disk capacity and owner-approved legal retention/hold policies remain separate gates. Do not add deletion policy or operational authority to manufacture coverage.

P7 and P8 were not started. Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No full backend, restricted capsule, broad SQL/JavaScript mutation, live incident collection, paid/live provider/model evaluation, guard/financial/auth change, commit, push, merge, deployment or activation occurred. **Production remains OFF. Stop after this P6 checkpoint; P6 native closure remains blocked by the recorded server failure.**
