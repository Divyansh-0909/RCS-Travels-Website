# Phase 9D-1 SQL coverage inventory and verification plan

18 October 2026 IST. **Read-only source/evidence review. Phase 9D-1 and whole-SQL certification remain PARTIAL; production remains OFF.**

## 1. Scope, source epoch and evidence rules

This report inventories the current local checkout and existing saved results. No Docker command, database test, mutation execution, stress run or full backend regression was launched for this read-only task. No SQL, application, permissions, authentication, frozen V5 or production configuration file was modified. The previously started ACK execution task was superseded; its pending runner/test edits and failed evidence are preserved. Its owned resource observer was stopped. The already-started Docker engine was not queried or changed by this report task.

The accepted starting point is [phase9d-1-custody-verification-checkpoint-2026-10-18.md](phase9d-1-custody-verification-checkpoint-2026-10-18.md), its [source-bound manifest](../../output/phase9d-custody-monitored-2026-10-17/manifest.json), [78-row readiness register](../../output/phase9d-custody-monitored-2026-10-17/readiness-gates-current.json) and [20-row audit matrix](../../output/phase9d-custody-monitored-2026-10-17/audit-coverage-matrix-current.json). All **15 SQL file hashes match that manifest**. The pending `closure-run.mjs` modes and new `phase9dCustodyLineageAck.test.js` are later working-tree changes, so the accepted manifest is not a fresh certificate over the entire current dirty tree.

Historical original-repository evidence was read in place from sibling `RCS-Travels-Website/output/`; nothing was copied, migrated or rewritten. Current-source file identity, historical runtime evidence and numerical profiling are reported separately. A textual test reference is a navigation aid, not proof that every statement or Boolean arm ran. JavaScript unit tests with mocked SQL clients do not establish PostgreSQL function coverage.

### Evidence keys

| Key | Existing evidence and interpretation |
| --- | --- |
| P | [sql-testability-matrix.json](../../../RCS-Travels-Website/output/phase9d-1-sql-broker-2026-10-13/sql-testability-matrix.json) - Original permissions matrix: 11 routines, including eight PL/pgSQL routines with native counts; source SHA matches current permissions.sql. Raw witness: [sql-witness-1791862498766-b33c0b46-b4ed-4529-97ac-8484a8cf057c.json](../../../RCS-Travels-Website/output/phase9d-1-sql-broker-2026-10-13/sql-witness-1791862498766-b33c0b46-b4ed-4529-97ac-8484a8cf057c.json). |
| O | [outbox-witness-1791883229301-4528cff3-ac75-4b80-a0e1-15742cd9b08e.json](../../../RCS-Travels-Website/output/phase9d-outbox-broker-2026-10-13/outbox-witness-1791883229301-4528cff3-ac75-4b80-a0e1-15742cd9b08e.json) - Outbox: seven PL/pgSQL routines report native ratios 1/1; 13 selected omission witnesses. Original source hash matches current outbox.sql. |
| T | [transport-witness-1791903271394.json](../../../RCS-Travels-Website/output/phase9d-transport-2026-10-13/transport-witness-1791903271394.json) - Separate transport behavior, stop races and 12 selected SQL omissions; no complete native routine certificate. |
| B | [broker-witness-1791908874303.json](../../../RCS-Travels-Website/output/phase9d-broker-2026-10-13/broker-witness-1791908874303.json) - Base broker: 13 catalog entries, 10 native routines; several partial ratios. Source SHA matches current broker.sql; later recovery renames must be respected. |
| R | [recovery-witness-bee73aca-a164-463b-88e7-2f780d87ac86.json](../../../RCS-Travels-Website/output/phase9d-broker-recovery-2026-10-14/recovery-witness-bee73aca-a164-463b-88e7-2f780d87ac86.json) - Recovery composition: 22 broker catalog entries and 16 native routines; 10 selected SQL omissions. Source SHA matches current broker-recovery.sql. |
| Q | [sql-witness-35195964-7454-4888-9d0b-9aec17cbe2f9.json](../../output/phase9d-custody-monitored-2026-10-17/sql-witness-35195964-7454-4888-9d0b-9aec17cbe2f9.json) - Current accepted custody catalog/security witness: source 11, receiver 18, custodian 44 catalog entries; extension members identified; three selected omissions. |
| N | [sql-native-witness-72691011-aa1f-4cab-aa2d-62eeac3b9995.json](../../output/phase9d-custody-monitored-2026-10-17/sql-native-witness-72691011-aa1f-4cab-aa2d-62eeac3b9995.json) - Separate profiling-only custody witness: 28 database/routine entries, 11 zero statement ratios. No routine-replacement mutation in this selected execution. |
| DB | [selected-acceptance.json](../../output/phase9d-custody-monitored-2026-10-17/selected-acceptance.json) - Selected actual regressions, capsule pair and saved-input reconstruction; exact source epochs and later differences retained. |
| ICR | [independent-review.json](../../output/phase9d-custody-monitored-2026-10-17/independent-review.json) - Independent source review. ICR-1 remains open: lineage ACK lacks broker-style receipt/key fences and its exact false-ACK detection witness. |

P/O/B/R are historical measurements at their own composed fixture epochs. Their matching SQL bytes preserve source applicability; transitive dependencies and later custody triggers still need their own behavior evidence. Do not add mutation counts across these families or substitute an older passing run for a changed implementation.

### Existing local results available for reuse

| Suite / key | Saved result | Test source |
| --- | --- | --- |
| Custody closure / CC | 9/9 at selected recorded epoch | [phase9dCustodyClosure.test.js](../../backend/tests/integration/phase9dCustodyClosure.test.js) |
| Broker / B | 19/19 at selected recorded epoch | [phase9dBroker.test.js](../../backend/tests/integration/phase9dBroker.test.js) |
| Transport / T | 15/15 at selected recorded epoch | [phase9dTransport.test.js](../../backend/tests/integration/phase9dTransport.test.js) |
| Outbox / O | 21/21 at selected recorded epoch | [phase9dOutbox.test.js](../../backend/tests/integration/phase9dOutbox.test.js) |
| Original custody / C | 20/20 at selected recorded epoch | [phase9dCustody.test.js](../../backend/tests/integration/phase9dCustody.test.js) |
| Committed lineage / L | 7/7 at selected recorded epoch | [phase9dCustodyLineage.test.js](../../backend/tests/integration/phase9dCustodyLineage.test.js) |
| Rotation/pressure/recovery / S | 8/8 at selected recorded epoch | [phase9dCustodySafety.test.js](../../backend/tests/integration/phase9dCustodySafety.test.js) |
| Custody SQL / Q | 1/1 at selected recorded epoch | [phase9dCustodySql.test.js](../../backend/tests/integration/phase9dCustodySql.test.js) |
| Saved-input reconstruction / X | record and independent reconstruction 1/1 each at selected recorded epoch | [phase9dCustodyReplay.test.js](../../backend/tests/integration/phase9dCustodyReplay.test.js) |

The accepted wider disposable suite is 58/58 and backend units are 1,865/1,865 at their recorded epochs. They were not rerun here and are not numerical SQL branch certificates.

### Pending ICR-1 counterexample

The interrupted preceding task produced a real, source-stable [failing PostgreSQL execution](../../output/phase9d-lineage-ack-2026-10-18/lineage-ack-1792274425933-208b7009-b94e-4d42-b3c5-b6b61d3c9a4b.json) (0/1 PASS): [new regression](../../backend/tests/integration/phase9dCustodyLineageAck.test.js) asserts that an extra receipt field must be rejected; the existing routine returns `true`. The retained log says `LINEAGE_ACK_MUST_REJECT_OPEN_RECEIPT`, expected false / actual true. No hardening has been applied. This is a genuine security-contract gap under the documented trusted-verifier boundary, not a profiler blind spot. This read-only task does not rerun or fix it.

## 2. SQL file and routine inventory

There are **81 CREATE/CREATE OR REPLACE FUNCTION declarations in 15 files**, representing **74 distinct declared qualified names**. Five additional installed names arise through explicit renames: four broker `*_before_recovery` routines and `transport9d.receive_committed`. These counts describe custom source declarations/composition, not 81 functions installed in one database. Source and receiver copies of lineage routines are distinct runtime instances. `pgcrypto` extension members are separate dependencies, not custom routines or part of the eleven-zero list.

| SQL source | Declarations; language | Declared owners | SHA-256 (matches accepted baseline) |
| --- | --- | --- | --- |
| [broker-recovery.sql](../../tools/phase9d/broker-recovery.sql) | 10; 7 plpgsql, 3 sql | broker9d_owner, shadow9d_owner | `395e3feb220694e361271f7b8416b63f3ea260142b47200fc4cff653afeb0f91` |
| [broker.sql](../../tools/phase9d/broker.sql) | 13; 10 plpgsql, 3 sql | broker9d_owner | `1889888b229b8b3286c640b9f85cb94da1d7ea81bd1e824850c9177e9fac74ce` |
| [closure-admission.sql](../../tools/phase9d/closure-admission.sql) | 3; 2 plpgsql, 1 sql | custody_owner | `c3873a8085dca77483f2d821bb48f5350a0c641de62ddfeb38fd6eb6f25fa4fc` |
| [closure-consistency.sql](../../tools/phase9d/closure-consistency.sql) | 3; 3 plpgsql | shadow9d_owner | `9a3010d5bd92702b1bb855115496b3919514be5038323967a03830c757c243be` |
| [closure-lineage.sql](../../tools/phase9d/closure-lineage.sql) | 6; 4 plpgsql, 2 sql | shadow9d_owner | `f97bbfdd800d49bc492597ae67109804cb338d6c597a7e165c8fd33cb75b66bb` |
| [closure-source-lineage.sql](../../tools/phase9d/closure-source-lineage.sql) | 2; 1 plpgsql, 1 sql | shadow9d_owner | `1486b0ee5e4fd8a43511ec28a5c10b0b4463c890aeab22cb2407e43bf493c7b2` |
| [closure-source.sql](../../tools/phase9d/closure-source.sql) | 3; 2 plpgsql, 1 sql | custody_source_owner | `ecaf91b56f91ac2371f67b54b400ff28f666696fa22c51812f66a12e5775def1` |
| [closure-store.sql](../../tools/phase9d/closure-store.sql) | 5; 3 plpgsql, 2 sql | custody_owner | `e4abc2fea9e838dda12d1f456869ab70e1fb952db3a6c550fb0259504c765fc8` |
| [closure-transport.sql](../../tools/phase9d/closure-transport.sql) | 1; 1 plpgsql | shadow9d_owner | `a664e8c620e20dd4728582c5270e8b0541158e93626405f98426b74c74d44a90` |
| [custody-source.sql](../../tools/phase9d/custody-source.sql) | 5; 5 plpgsql | custody_source_owner | `9afc0f55a806272316111e0935da2117434b1c03bb969df54aa650585fdd1e4e` |
| [custody-store.sql](../../tools/phase9d/custody-store.sql) | 1; 1 plpgsql | custody_owner | `81926b3667d6207b0b7c295f391eb4bdce6335e8812444992ed447515a32b4f8` |
| [outbox.sql](../../tools/phase9d/outbox.sql) | 12; 7 plpgsql, 5 sql | shadow9d_owner | `66c27019b46a901cb4304cbe72564e471a9df4cda91c63cce02626d9bccd6fc2` |
| [permissions.sql](../../tools/phase9d/permissions.sql) | 11; 8 plpgsql, 3 sql | shadow9d_auditor, shadow9d_owner | `177303e26f8bd65c2033c00fbdcb391f1fbb14bcb430ac9c82d3bbb7639ad7b2` |
| [transport-receiver.sql](../../tools/phase9d/transport-receiver.sql) | 2; 2 plpgsql | shadow9d_owner | `1116cf0c22e328cb737569794cec1218264aa0d5191f66a8a2e31dcc95de2862` |
| [transport-sender.sql](../../tools/phase9d/transport-sender.sql) | 4; 3 plpgsql, 1 sql | shadow9d_owner | `3c5998bd31eca90607b71bcbf48fadec5fc815ff2f1302007443aeaf39a52d10` |

### Per-routine mapping

`D` = SECURITY DEFINER; `I` = invoker. Owners are the source SET ROLE context; runtime owners/search paths/ACLs are independently catalogued in P, O, B, R and Q for their stated scopes. Native `S/B` below are the saved API statement/branch **ratios**, not logical-condition coverage or merged percentages. `N` uses source/receiver/custodian instance names. A ratio of 1 may be the tool convention for a routine with zero procedural branches. `NR` means no numerical attribution in the selected witnesses; it does not mean unused. SQL-language expression branches are unsupported by the PL/pgSQL metric.

#### broker-recovery.sql

Integration family: **R**. Related JavaScript unit family: [phase9dRecovery.test.js](../../backend/tests/phase9dRecovery.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `broker9d.revision()` [source:25](../../tools/phase9d/broker-recovery.sql#L25) | plpgsql / I | R S/B 0.8/0.5 | No direct literal; inspect family R and its fixture/runtime callers |
| `broker9d.allowed(uuid,uuid,text[])` [source:36](../../tools/phase9d/broker-recovery.sql#L36) | sql / I | SQL expressions: native N/A | No direct literal; inspect family R and its fixture/runtime callers |
| `broker9d.observe(uuid,uuid,jsonb)` [source:48](../../tools/phase9d/broker-recovery.sql#L48) | plpgsql / D | R S/B 0.777778/0.545455 | No direct literal; inspect family R and its fixture/runtime callers |
| `broker9d.register(jsonb)` [source:70](../../tools/phase9d/broker-recovery.sql#L70) | plpgsql / D | R S/B 0.875/0.75 | [BrokerReplay.test](../../backend/tests/integration/phase9dBrokerReplay.test.js#L60); [CustodySafety.test](../../backend/tests/integration/phase9dCustodySafety.test.js#L56); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L81) |
| `broker9d.recover(uuid)` [source:88](../../tools/phase9d/broker-recovery.sql#L88) | plpgsql / D | R S/B 1/1 | [BrokerReplay.test](../../backend/tests/integration/phase9dBrokerReplay.test.js#L64) |
| `broker9d.reconcile(jsonb)` [source:102](../../tools/phase9d/broker-recovery.sql#L102) | plpgsql / D | R S/B 0.945946/0.909091 | No direct literal; inspect family R and its fixture/runtime callers |
| `broker9d.inspect(uuid)` [source:150](../../tools/phase9d/broker-recovery.sql#L150) | sql / D | SQL expressions: native N/A | No direct literal; inspect family R and its fixture/runtime callers |
| `broker9d.accounting()` [source:158](../../tools/phase9d/broker-recovery.sql#L158) | sql / D | SQL expressions: native N/A | No direct literal; inspect family R and its fixture/runtime callers |
| `broker9d.operate(uuid,uuid,text,bigint,text)` [source:172](../../tools/phase9d/broker-recovery.sql#L172) | plpgsql / D | R S/B 0.83871/0.736842 | No direct literal; inspect family R and its fixture/runtime callers |
| `shadow9d.broker_payload_cleanup(uuid)` [source:212](../../tools/phase9d/broker-recovery.sql#L212) | plpgsql / D | NR; retain behavior evidence from R | No direct literal; inspect family R and its fixture/runtime callers |
#### broker.sql

Integration family: **B/R**. Related JavaScript unit family: [phase9dBroker.test.js](../../backend/tests/phase9dBroker.test.js), [phase9dRecovery.test.js](../../backend/tests/phase9dRecovery.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `broker9d.event(text,uuid,uuid)` [source:52](../../tools/phase9d/broker.sql#L52) | sql / I | SQL expressions: native N/A | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.set_stop(boolean)` [source:56](../../tools/phase9d/broker.sql#L56) | plpgsql / D | R S/B 0/1 | [Broker.test](../../backend/tests/integration/phase9dBroker.test.js#L146); [BrokerReplay.test](../../backend/tests/integration/phase9dBrokerReplay.test.js#L58); [RecoveryReplay.test](../../backend/tests/integration/phase9dRecoveryReplay.test.js#L61) |
| `broker9d.register(jsonb)` [source:63](../../tools/phase9d/broker.sql#L63) -> `broker9d.register_before_recovery(jsonb)` | plpgsql / D | R S/B 0.888889/0.75 | [BrokerReplay.test](../../backend/tests/integration/phase9dBrokerReplay.test.js#L60); [CustodySafety.test](../../backend/tests/integration/phase9dCustodySafety.test.js#L56); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L81) |
| `broker9d.reserve(uuid)` [source:90](../../tools/phase9d/broker.sql#L90) | plpgsql / D | R S/B 1/1 | [Broker.test](../../backend/tests/integration/phase9dBroker.test.js#L146); [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L101); [CustodySafety.test](../../backend/tests/integration/phase9dCustodySafety.test.js#L53) |
| `broker9d.allowed(uuid,uuid,text[])` [source:115](../../tools/phase9d/broker.sql#L115) -> `broker9d.allowed_before_recovery(uuid,uuid,text[])` | sql / I | SQL expressions: native N/A | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.admit(uuid,uuid)` [source:126](../../tools/phase9d/broker.sql#L126) | plpgsql / D | R S/B 1/1 | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.begin_send(uuid,uuid)` [source:139](../../tools/phase9d/broker.sql#L139) | plpgsql / D | R S/B 1/1 | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.valid_envelope(jsonb,text)` [source:149](../../tools/phase9d/broker.sql#L149) | sql / I | SQL expressions: native N/A | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.observe(uuid,uuid,jsonb)` [source:163](../../tools/phase9d/broker.sql#L163) -> `broker9d.observe_before_recovery(uuid,uuid,jsonb)` | plpgsql / D | R S/B 0.8/0.5 | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.unknown(uuid,uuid)` [source:187](../../tools/phase9d/broker.sql#L187) | plpgsql / D | R S/B 0.888889/0.5 | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.recover(uuid)` [source:198](../../tools/phase9d/broker.sql#L198) -> `broker9d.recover_before_recovery(uuid)` | plpgsql / D | R S/B 0.846154/0.6 | [BrokerReplay.test](../../backend/tests/integration/phase9dBrokerReplay.test.js#L64) |
| `broker9d.guard_input(uuid,uuid)` [source:215](../../tools/phase9d/broker.sql#L215) | plpgsql / D | R S/B 1/1 | No direct literal; inspect family B/R and its fixture/runtime callers |
| `broker9d.commit_result(uuid,uuid,jsonb)` [source:222](../../tools/phase9d/broker.sql#L222) | plpgsql / D | R S/B 0.941176/0.833333 | [Broker.test](../../backend/tests/integration/phase9dBroker.test.js#L146) |
#### closure-admission.sql

Integration family: **Q/CC**. Related JavaScript unit family: [phase9dCustodyClosure.test.js](../../backend/tests/phase9dCustodyClosure.test.js), [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody.serialize(jsonb)` [source:7](../../tools/phase9d/closure-admission.sql#L7) | sql / I | SQL expressions: native N/A | No direct literal; inspect family Q/CC and its fixture/runtime callers |
| `custody.valid_event(jsonb,text)` [source:11](../../tools/phase9d/closure-admission.sql#L11) | plpgsql / I | N custodian S/B 0.647059/0.625 | No direct literal; inspect family Q/CC and its fixture/runtime callers |
| `custody.ingest(jsonb)` [source:59](../../tools/phase9d/closure-admission.sql#L59) | plpgsql / D | N custodian S/B 0.75/0.5 | [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L12); [CustodyLineageAck.test](../../backend/tests/integration/phase9dCustodyLineageAck.test.js#L11); [CustodyReplay.test](../../backend/tests/integration/phase9dCustodyReplay.test.js#L73) |
#### closure-consistency.sql

Integration family: **L/Q**. Related JavaScript unit family: [phase9dCustodyBoundary.test.js](../../backend/tests/phase9dCustodyBoundary.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody_lineage.committed_rows()` [source:6](../../tools/phase9d/closure-consistency.sql#L6) | plpgsql / D | N source S/B 0.571429/0.5; N receiver S/B 0.857143/0.5 | No direct literal; inspect family L/Q and its fixture/runtime callers |
| `custody_lineage.capture_existing()` [source:18](../../tools/phase9d/closure-consistency.sql#L18) | plpgsql / D | N source S/B 0.875/0.666667; N receiver S/B 0.875/0.666667 | No direct literal; inspect family L/Q and its fixture/runtime callers |
| `custody_lineage.capture_status()` [source:29](../../tools/phase9d/closure-consistency.sql#L29) | plpgsql / D | N source S/B 0/0; N receiver S/B 0/0 | [CustodyLineage.test](../../backend/tests/integration/phase9dCustodyLineage.test.js#L86) |
#### closure-lineage.sql

Integration family: **L/Q/X**. Related JavaScript unit family: [phase9dCustodyBoundary.test.js](../../backend/tests/phase9dCustodyBoundary.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody_lineage.serialize(jsonb)` [source:10](../../tools/phase9d/closure-lineage.sql#L10) | sql / I | SQL expressions: native N/A | No direct literal; inspect family L/Q/X and its fixture/runtime callers |
| `custody_lineage.emit(text,text,text,jsonb,text)` [source:14](../../tools/phase9d/closure-lineage.sql#L14) | plpgsql / D | N source S/B 0.727273/0.5; N receiver S/B 0.636364/0.3 | [CustodyLineage.test](../../backend/tests/integration/phase9dCustodyLineage.test.js#L81) |
| `custody_lineage.capture()` [source:49](../../tools/phase9d/closure-lineage.sql#L49) | plpgsql / D | N source S/B 0/0; N receiver S/B 0/0 | No direct literal; inspect family L/Q/X and its fixture/runtime callers |
| `custody_lineage.frame(bigint)` [source:69](../../tools/phase9d/closure-lineage.sql#L69) | sql / D | SQL expressions: native N/A | [CustodyLineageAck.test](../../backend/tests/integration/phase9dCustodyLineageAck.test.js#L10); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L28) |
| `custody_lineage.next()` [source:74](../../tools/phase9d/closure-lineage.sql#L74) | plpgsql / D | N source S/B 0/0; N receiver S/B 0/0 | No direct literal; inspect family L/Q/X and its fixture/runtime callers |
| `custody_lineage.ack(bigint,text,jsonb)` [source:83](../../tools/phase9d/closure-lineage.sql#L83) | plpgsql / D | N source S/B 1/1; N receiver S/B 1/1 | [CustodyLineageAck.test](../../backend/tests/integration/phase9dCustodyLineageAck.test.js#L13); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L31) |
#### closure-source-lineage.sql

Integration family: **L/Q/X**. Related JavaScript unit family: [phase9dCustodyBoundary.test.js](../../backend/tests/phase9dCustodyBoundary.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody_lineage.capture_committed()` [source:3](../../tools/phase9d/closure-source-lineage.sql#L3) | plpgsql / D | N source S/B 1/0.666667 | [CustodyLineage.test](../../backend/tests/integration/phase9dCustodyLineage.test.js#L30); [CustodyReplay.test](../../backend/tests/integration/phase9dCustodyReplay.test.js#L34); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L21) |
| `custody_lineage.expected_sources()` [source:16](../../tools/phase9d/closure-source-lineage.sql#L16) | sql / D | SQL expressions: native N/A | [CustodyLineage.test](../../backend/tests/integration/phase9dCustodyLineage.test.js#L31) |
#### closure-source.sql

Integration family: **Q/S/CC**. Related JavaScript unit family: [phase9dCustodyClosure.test.js](../../backend/tests/phase9dCustodyClosure.test.js), [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody_export.pressure()` [source:14](../../tools/phase9d/closure-source.sql#L14) | sql / D | SQL expressions: native N/A | [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L22) |
| `custody_export.admit_analysis()` [source:24](../../tools/phase9d/closure-source.sql#L24) | plpgsql / D | N receiver S/B 0.833333/0.5 | [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L81) |
| `custody_export.ack(bigint,text,jsonb)` [source:41](../../tools/phase9d/closure-source.sql#L41) | plpgsql / D | N receiver S/B 0.833333/0.5 | [Custody.test](../../backend/tests/integration/phase9dCustody.test.js#L55); [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L17); [CustodyReplay.test](../../backend/tests/integration/phase9dCustodyReplay.test.js#L51) |
#### closure-store.sql

Integration family: **Q/S/CC**. Related JavaScript unit family: [phase9dCustodyClosure.test.js](../../backend/tests/phase9dCustodyClosure.test.js), [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody.rotate(text,text,bigint)` [source:9](../../tools/phase9d/closure-store.sql#L9) | plpgsql / D | N custodian S/B 0/0 | [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L29); [CustodyReplay.test](../../backend/tests/integration/phase9dCustodyReplay.test.js#L53); [CustodySafety.test](../../backend/tests/integration/phase9dCustodySafety.test.js#L19) |
| `custody.active_key()` [source:26](../../tools/phase9d/closure-store.sql#L26) | sql / D | SQL expressions: native N/A | No direct literal; inspect family Q/S/CC and its fixture/runtime callers |
| `custody.accept(jsonb,text,text)` [source:28](../../tools/phase9d/closure-store.sql#L28) | plpgsql / D | N custodian S/B 0.6875/0.4 | [Custody.test](../../backend/tests/integration/phase9dCustody.test.js#L87); [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L36); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L76) |
| `custody.signable(uuid)` [source:48](../../tools/phase9d/closure-store.sql#L48) | sql / D | SQL expressions: native N/A | No direct literal; inspect family Q/S/CC and its fixture/runtime callers |
| `custody.store_signature(uuid,text)` [source:54](../../tools/phase9d/closure-store.sql#L54) | plpgsql / D | N custodian S/B 0.777778/0.5 | No direct literal; inspect family Q/S/CC and its fixture/runtime callers |
#### closure-transport.sql

Integration family: **L/T**. Related JavaScript unit family: [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js), [phase9dTransport.test.js](../../backend/tests/phase9dTransport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `transport9d.receive(jsonb)` [source:6](../../tools/phase9d/closure-transport.sql#L6) | plpgsql / D | N receiver S/B 0/0 | [Recovery.test](../../backend/tests/integration/phase9dRecovery.test.js#L311); [Transport.test](../../backend/tests/integration/phase9dTransport.test.js#L113) |
#### custody-source.sql

Integration family: **C**. Related JavaScript unit family: [phase9dCustody.test.js](../../backend/tests/phase9dCustody.test.js), [phase9dCustodyAdversarial.test.js](../../backend/tests/phase9dCustodyAdversarial.test.js), [phase9dCustodyBoundary.test.js](../../backend/tests/phase9dCustodyBoundary.test.js), [phase9dCustodyClosure.test.js](../../backend/tests/phase9dCustodyClosure.test.js), [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js), [phase9dCustodyObserver.test.js](../../backend/tests/phase9dCustodyObserver.test.js), [phase9dCustodyReplayInput.test.js](../../backend/tests/phase9dCustodyReplayInput.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody_export.capture()` [source:19](../../tools/phase9d/custody-source.sql#L19) | plpgsql / D | N receiver S/B 1/1 | No direct literal; inspect family C and its fixture/runtime callers |
| `custody_export.frame(bigint)` [source:40](../../tools/phase9d/custody-source.sql#L40) | plpgsql / D | N receiver S/B 0.833333/0.5 | No direct literal; inspect family C and its fixture/runtime callers |
| `custody_export.next()` [source:49](../../tools/phase9d/custody-source.sql#L49) | plpgsql / D | N receiver S/B 0/0 | [CustodySafety.test](../../backend/tests/integration/phase9dCustodySafety.test.js#L108) |
| `custody_export.ack(bigint,text,jsonb)` [source:58](../../tools/phase9d/custody-source.sql#L58) (replaced in closure composition) | plpgsql / D | Superseded; counters for replacement are listed with closure file | [Custody.test](../../backend/tests/integration/phase9dCustody.test.js#L55); [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L17); [CustodyReplay.test](../../backend/tests/integration/phase9dCustodyReplay.test.js#L51) |
| `custody_export.retry(uuid,bigint,integer)` [source:65](../../tools/phase9d/custody-source.sql#L65) | plpgsql / D | N receiver S/B 0/0 | [Custody.test](../../backend/tests/integration/phase9dCustody.test.js#L37); [CustodySafety.test](../../backend/tests/integration/phase9dCustodySafety.test.js#L110) |
#### custody-store.sql

Integration family: **C**. Related JavaScript unit family: [phase9dCustody.test.js](../../backend/tests/phase9dCustody.test.js), [phase9dCustodyAdversarial.test.js](../../backend/tests/phase9dCustodyAdversarial.test.js), [phase9dCustodyBoundary.test.js](../../backend/tests/phase9dCustodyBoundary.test.js), [phase9dCustodyClosure.test.js](../../backend/tests/phase9dCustodyClosure.test.js), [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js), [phase9dCustodyObserver.test.js](../../backend/tests/phase9dCustodyObserver.test.js), [phase9dCustodyReplayInput.test.js](../../backend/tests/phase9dCustodyReplayInput.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `custody.accept(jsonb,text,text)` [source:14](../../tools/phase9d/custody-store.sql#L14) (replaced in closure composition) | plpgsql / D | Superseded; counters for replacement are listed with closure file | [Custody.test](../../backend/tests/integration/phase9dCustody.test.js#L87); [CustodyClosure.test](../../backend/tests/integration/phase9dCustodyClosure.test.js#L36); [CustodySql.test](../../backend/tests/integration/phase9dCustodySql.test.js#L76) |
#### outbox.sql

Integration family: **O**. Related JavaScript unit family: [phase9dExport.test.js](../../backend/tests/phase9dExport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `outbox9d.entries(jsonb)` [source:37](../../tools/phase9d/outbox.sql#L37) | sql / I | SQL expressions: native N/A | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.source(text)` [source:41](../../tools/phase9d/outbox.sql#L41) | sql / I | SQL expressions: native N/A | [Outbox.test](../../backend/tests/integration/phase9dOutbox.test.js#L256) |
| `outbox9d.pseudonym(text)` [source:77](../../tools/phase9d/outbox.sql#L77) | sql / I | SQL expressions: native N/A | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.projection(jsonb)` [source:81](../../tools/phase9d/outbox.sql#L81) | sql / I | SQL expressions: native N/A | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.binding(jsonb)` [source:100](../../tools/phase9d/outbox.sql#L100) | sql / I | SQL expressions: native N/A | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.serialize(jsonb)` [source:104](../../tools/phase9d/outbox.sql#L104) | plpgsql / I | O S/B 1/1 | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.scan()` [source:111](../../tools/phase9d/outbox.sql#L111) | plpgsql / D | O S/B 1/1 | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.claim()` [source:132](../../tools/phase9d/outbox.sql#L132) | plpgsql / D | O S/B 1/1 | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.stage(bigint,uuid,jsonb)` [source:152](../../tools/phase9d/outbox.sql#L152) | plpgsql / D | O S/B 1/1 | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.deliver(bigint,uuid)` [source:178](../../tools/phase9d/outbox.sql#L178) | plpgsql / D | O S/B 1/1 | [Transport.test](../../backend/tests/integration/phase9dTransport.test.js#L175) |
| `outbox9d.fail(bigint,uuid,boolean,text)` [source:194](../../tools/phase9d/outbox.sql#L194) | plpgsql / D | O S/B 1/1 | No direct literal; inspect family O and its fixture/runtime callers |
| `outbox9d.delete_payload(bigint)` [source:206](../../tools/phase9d/outbox.sql#L206) | plpgsql / D | O S/B 1/1 | [Outbox.test](../../backend/tests/integration/phase9dOutbox.test.js#L134) |
#### permissions.sql

Integration family: **P**. Related JavaScript unit family: [phase9dReadiness.test.js](../../backend/tests/phase9dReadiness.test.js), [phase9dWorker.test.js](../../backend/tests/phase9dWorker.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `audit9d.append(text,bigint,jsonb)` [source:24](../../tools/phase9d/permissions.sql#L24) | sql / D | SQL expressions: native N/A | [Readiness.test](../../backend/tests/integration/phase9dReadiness.test.js#L96); [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L146) |
| `shadow9d.valid_categories(jsonb)` [source:57](../../tools/phase9d/permissions.sql#L57) | sql / I | SQL expressions: native N/A | [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L73) |
| `shadow9d.valid_instant(jsonb,boolean)` [source:64](../../tools/phase9d/permissions.sql#L64) | sql / I | SQL expressions: native N/A | [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L70) |
| `shadow9d.valid_snapshot(jsonb)` [source:70](../../tools/phase9d/permissions.sql#L70) | plpgsql / I | P: 19/19 statements; 17/17 branches | [Readiness.test](../../backend/tests/integration/phase9dReadiness.test.js#L328); [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L79) |
| `shadow9d.enqueue(text,jsonb,text,text)` [source:111](../../tools/phase9d/permissions.sql#L111) | plpgsql / D | P: 21/21 statements; 10/10 branches | [Outbox.test](../../backend/tests/integration/phase9dOutbox.test.js#L255); [Readiness.test](../../backend/tests/integration/phase9dReadiness.test.js#L85); [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L43) |
| `shadow9d.set_stop(boolean)` [source:136](../../tools/phase9d/permissions.sql#L136) | plpgsql / D | P: 4/4 statements; 0/0 branches | [Outbox.test](../../backend/tests/integration/phase9dOutbox.test.js#L60); [Readiness.test](../../backend/tests/integration/phase9dReadiness.test.js#L86); [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L45) |
| `shadow9d.claim()` [source:144](../../tools/phase9d/permissions.sql#L144) | plpgsql / D | P: 15/15 statements; 6/6 branches | [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L44) |
| `shadow9d.permit(bigint,uuid)` [source:166](../../tools/phase9d/permissions.sql#L166) | plpgsql / D | P: 12/12 statements; 4/4 branches | [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L60) |
| `shadow9d.complete(bigint,uuid,jsonb)` [source:179](../../tools/phase9d/permissions.sql#L179) | plpgsql / D | P: 16/16 statements; 6/6 branches | [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L48) |
| `shadow9d.fail(bigint,uuid,text)` [source:209](../../tools/phase9d/permissions.sql#L209) | plpgsql / D | P: 9/9 statements; 2/2 branches | [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L60) |
| `shadow9d.delete_payload(bigint)` [source:223](../../tools/phase9d/permissions.sql#L223) | plpgsql / D | P: 6/6 statements; 2/2 branches | [Outbox.test](../../backend/tests/integration/phase9dOutbox.test.js#L133); [Readiness.test](../../backend/tests/integration/phase9dReadiness.test.js#L126); [SqlCertification.test](../../backend/tests/integration/phase9dSqlCertification.test.js#L132) |
#### transport-receiver.sql

Integration family: **T**. Related JavaScript unit family: [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js), [phase9dTransport.test.js](../../backend/tests/phase9dTransport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `transport9d.serialize(jsonb)` [source:18](../../tools/phase9d/transport-receiver.sql#L18) | plpgsql / I | NR; retain behavior evidence from T | [Recovery.test](../../backend/tests/integration/phase9dRecovery.test.js#L284) |
| `transport9d.receive(jsonb)` [source:25](../../tools/phase9d/transport-receiver.sql#L25) -> `transport9d.receive_committed(jsonb)` | plpgsql / D | N receiver S/B 0/0 | [Recovery.test](../../backend/tests/integration/phase9dRecovery.test.js#L311); [Transport.test](../../backend/tests/integration/phase9dTransport.test.js#L113) |
#### transport-sender.sql

Integration family: **T**. Related JavaScript unit family: [phase9dCustodyClosureTransport.test.js](../../backend/tests/phase9dCustodyClosureTransport.test.js), [phase9dTransport.test.js](../../backend/tests/phase9dTransport.test.js) (client/contract behavior only).

| Declaration / installed composition | Language / mode | Existing native evidence | Direct integration test navigation |
| --- | --- | --- | --- |
| `outbox9d.remote_payload(bigint,uuid)` [source:11](../../tools/phase9d/transport-sender.sql#L11) | plpgsql / D | NR; retain behavior evidence from T | [Transport.test](../../backend/tests/integration/phase9dTransport.test.js#L153) |
| `outbox9d.valid_remote_receipt(jsonb,jsonb)` [source:22](../../tools/phase9d/transport-sender.sql#L22) | sql / D | SQL expressions: native N/A | No direct literal; inspect family T and its fixture/runtime callers |
| `outbox9d.remote_ack(bigint,uuid,jsonb)` [source:36](../../tools/phase9d/transport-sender.sql#L36) | plpgsql / D | NR; retain behavior evidence from T | [Transport.test](../../backend/tests/integration/phase9dTransport.test.js#L120) |
| `outbox9d.remote_delete_payload(bigint,jsonb)` [source:48](../../tools/phase9d/transport-sender.sql#L48) | plpgsql / D | NR; retain behavior evidence from T | [Transport.test](../../backend/tests/integration/phase9dTransport.test.js#L131); [TransportReplay.test](../../backend/tests/integration/phase9dTransportReplay.test.js#L58) |

`broker9d.set_stop(boolean)` illustrates source versus measurement epochs: R reports statement ratio 0 and branch ratio 1, while B reported 1/1 for the unchanged base function. Retain both records and compare exact definitions/dependencies before reusing the older metric; do not turn the R zero into a claim that STOP was never tested. Likewise later non-profiling broker/outbox regression witnesses in the local DB output contain zero native counters even though their behavior suites pass. Those are not the enabled-profiling N window and must not be mixed into a global coverage score.

## 3. Investigation of the eleven zero-ratio entries

These are **11 database/routine entries for eight distinct routine signatures**, all custom PL/pgSQL. Source/receiver copies account for three repeated names. None is marked an extension member, and source grants, triggers or real callers establish reachability. **No unused/unreachable exemption is justified for any of them.** Their zero ratios are real missing observations in N; existing behavior passes elsewhere do not fill those counters.

| N database / routine | Reachability and existing evidence | Reason for a separate profiling case / remaining behavior |
| --- | --- | --- |
| source / `custody_lineage.capture()` | Installed AFTER INSERT/UPDATE triggers in [lineage fixture](../../backend/tests/helpers/phase9dCustodyLineageFixture.js#L27). L performs real cancellation/export/receiver transitions; capsule/replay also retain resulting lineage. | N mostly backfills through capture_existing/emit, not the post-install producer DML. Reuse L under a profiling-only window; exercise INSERT, changed UPDATE, unchanged UPDATE, and applicable source/receiver table arms. |
| source / `custody_lineage.capture_status()` | Granted to custody_lineage_inspector; L explicitly calls default isolation, REPEATABLE READ consistency, and an owner-injected gap with rollback ([L](../../backend/tests/integration/phase9dCustodyLineage.test.js#L84)). | N never calls this routine. Reuse those L cases, then add missing head/hash/source/sequence, missing committed capture, deferred-control and inspection-limit outcomes. Source-only expected_sources branch is installation-specific. |
| source / `custody_lineage.next()` | Granted to dedicated source/receiver senders. [capsule sender](../../tools/phase9d/closure-capsule-entry.mjs#L40) chooses this schema; [capsule drain loop](../../tools/phase9d/closure-capsule.mjs#L142) invokes sender without an explicit sequence. | N uses frame(seq) directly. Profile actual next(), normal drain/empty, earliest REVIEW blocking and three-attempt exhaustion. Add lineage-specific retry/recovery coverage only where a supported API exists; do not assume export.retry applies to lineage. |
| receiver / `custody_export.next()` | [actual delivery helper](../../tools/phase9d/custody-delivery.mjs#L7), C failed-send/exhaustion cases, S and X sender execution. | N calls frame(seq), bypassing retry-attempt accounting. Reuse normal sender/empty/REVIEW cases; preserve ordered delivery and no work recreation. |
| receiver / `custody_export.retry(uuid,bigint,integer)` | Granted only to custody_operator; C exercises denied sender, valid/idempotent operation, stale expected attempts. S adds competing operators and bounded recovery cycles. | N does not invoke retry. Reuse C/S cases in a separate profile-only fixture, recording false-return and idempotent branches as well as success. |
| receiver / `custody_lineage.capture()` | Installed AFTER INSERT/UPDATE triggers in [lineage fixture](../../backend/tests/helpers/phase9dCustodyLineageFixture.js#L27). L performs real cancellation/export/receiver transitions; capsule/replay also retain resulting lineage. | N mostly backfills through capture_existing/emit, not the post-install producer DML. Reuse L under a profiling-only window; exercise INSERT, changed UPDATE, unchanged UPDATE, and applicable source/receiver table arms. |
| receiver / `custody_lineage.capture_status()` | Granted to custody_lineage_inspector; L explicitly calls default isolation, REPEATABLE READ consistency, and an owner-injected gap with rollback ([L](../../backend/tests/integration/phase9dCustodyLineage.test.js#L84)). | N never calls this routine. Reuse those L cases, then add missing head/hash/source/sequence, missing committed capture, deferred-control and inspection-limit outcomes. Source-only expected_sources branch is installation-specific. |
| receiver / `custody_lineage.next()` | Granted to dedicated source/receiver senders. [capsule sender](../../tools/phase9d/closure-capsule-entry.mjs#L40) chooses this schema; [capsule drain loop](../../tools/phase9d/closure-capsule.mjs#L142) invokes sender without an explicit sequence. | N uses frame(seq) directly. Profile actual next(), normal drain/empty, earliest REVIEW blocking and three-attempt exhaustion. Add lineage-specific retry/recovery coverage only where a supported API exists; do not assume export.retry applies to lineage. |
| receiver / `transport9d.receive_committed(jsonb)` | The real receiver implementation is renamed by [closure adapter](../../tools/phase9d/closure-transport.sql#L4) and invoked by its SECURITY DEFINER wrapper. Direct capture-principal access is revoked and L asserts 42501. | N does not run an actual transport delivery. Reuse L delivery/conflict cases and T valid/duplicate/foreign-binding cases. Retain the private-alias ACL assertion; zero does not imply obsolete code. |
| receiver / `transport9d.receive(jsonb)` | The closure wrapper is granted to shadow9d_capture and calls receive_committed. L observes real work/receipt plus TRANSPORT_BINDING_REJECTED; T tests original transport in its own composition. | N bypasses HTTP/transport acceptance. Profile the closure composition, including an existing-key conflict and malformed/unrelated payload; do not assign original T receive counters to this different body. |
| custodian / `custody.rotate(text,text,bigint)` | Called by the trusted [rotation operator](../../tools/phase9d/closure-rotation.mjs#L4). CC/S/X and the capsule pair exercise actual rotation, historical receipts and epoch races. | N never rotates. Reuse existing unsigned-receipt refusal, matching/mismatched key ID/SPKI, expected-epoch race, duplicate key, retired historical receipt and compromised signer cases. |

The zero list is not a claim that these are the only zero counters anywhere. R also records zero statements for broker9d.set_stop, and later non-profiling broker/outbox witnesses contain additional zeros. Use the named execution window and configuration when interpreting each.

## 4. Unhit statements, procedural branches and expression limits

### Native custody measurement N

The following is copied by interpretation from the saved raw native rows, without executing SQL or changing counters. `stmt@line` identifies a profiler statement ID and its **routine-body** line, not a repository file line. Only visible `lineno > 0` rows with `exec_stmts == 0` are listed. API ratios are retained exactly to six decimal places; no global denominator is manufactured.

| Database / signature | Statement ratio / branch ratio | Visible unhit statement IDs @ body line |
| --- | --- | --- |
| source / `custody_lineage.ack(bigint,text,jsonb)` | 1 / 1 | None in this native statement metric |
| source / `custody_lineage.capture()` | 0 / 0 | `1@3`, `2@4`, `3@4`, `4@5`, `5@5`, `6@6`, `7@7`, `8@8`, `9@9`, `10@10`, `11@11`, `12@13`, `13@14`, `14@15`, `15@16`, `16@17`, `17@18` |
| source / `custody_lineage.capture_committed()` | 1 / 0.666667 | None in this native statement metric |
| source / `custody_lineage.capture_existing()` | 0.875 / 0.666667 | `5@5` |
| source / `custody_lineage.capture_status()` | 0 / 0 | `1@3`, `2@6`, `3@7`, `4@9`, `5@10`, `6@11`, `7@11`, `8@12`, `9@14`, `10@16`, `11@16`, `12@18`, `13@18`, `14@19`, `15@20`, `16@20`, `17@20`, `18@21`, `19@22`, `20@22`, `21@24`, `22@25`, `23@26`, `24@26`, `25@26`, `26@27`, `27@27`, `28@30` |
| source / `custody_lineage.committed_rows()` | 0.571429 / 0.5 | `5@7`, `6@8`, `7@9` |
| source / `custody_lineage.emit(text,text,text,jsonb,text)` | 0.727273 / 0.5 | `8@9`, `11@14`, `12@15`, `13@15`, `14@17`, `17@20` |
| source / `custody_lineage.next()` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@5`, `5@6`, `6@7` |
| receiver / `custody_export.ack(bigint,text,jsonb)` | 0.833333 / 0.5 | `4@17` |
| receiver / `custody_export.admit_analysis()` | 0.833333 / 0.5 | `5@13` |
| receiver / `custody_export.capture()` | 1 / 1 | None in this native statement metric |
| receiver / `custody_export.frame(bigint)` | 0.833333 / 0.5 | `4@5` |
| receiver / `custody_export.next()` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@5`, `5@6`, `6@7` |
| receiver / `custody_export.retry(uuid,bigint,integer)` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@6`, `5@7`, `6@7`, `7@8`, `8@8`, `9@9`, `10@9`, `11@10`, `12@11`, `13@11` |
| receiver / `custody_lineage.ack(bigint,text,jsonb)` | 1 / 1 | None in this native statement metric |
| receiver / `custody_lineage.capture()` | 0 / 0 | `1@3`, `2@4`, `3@4`, `4@5`, `5@5`, `6@6`, `7@7`, `8@8`, `9@9`, `10@10`, `11@11`, `12@13`, `13@14`, `14@15`, `15@16`, `16@17`, `17@18` |
| receiver / `custody_lineage.capture_existing()` | 0.875 / 0.666667 | `5@5` |
| receiver / `custody_lineage.capture_status()` | 0 / 0 | `1@3`, `2@6`, `3@7`, `4@9`, `5@10`, `6@11`, `7@11`, `8@12`, `9@14`, `10@16`, `11@16`, `12@18`, `13@18`, `14@19`, `15@20`, `16@20`, `17@20`, `18@21`, `19@22`, `20@22`, `21@24`, `22@25`, `23@26`, `24@26`, `25@26`, `26@27`, `27@27`, `28@30` |
| receiver / `custody_lineage.committed_rows()` | 0.857143 / 0.5 | `4@5` |
| receiver / `custody_lineage.emit(text,text,text,jsonb,text)` | 0.636364 / 0.3 | `7@9`, `8@9`, `9@10`, `11@14`, `12@15`, `13@15`, `14@17`, `16@19` |
| receiver / `custody_lineage.next()` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@5`, `5@6`, `6@7` |
| receiver / `transport9d.receive_committed(jsonb)` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@21`, `5@22`, `6@22`, `7@23`, `8@24`, `9@24`, `10@25`, `11@26`, `12@27`, `13@28`, `14@28`, `15@30`, `16@30`, `17@31`, `18@32`, `19@32`, `20@33`, `21@35`, `22@38` |
| receiver / `transport9d.receive(jsonb)` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@6`, `5@7`, `6@8`, `7@9`, `8@13` |
| custodian / `custody.accept(jsonb,text,text)` | 0.6875 / 0.4 | `4@5`, `7@8`, `8@8`, `11@12`, `13@13` |
| custodian / `custody.ingest(jsonb)` | 0.75 / 0.5 | `3@7`, `7@11`, `10@15` |
| custodian / `custody.rotate(text,text,bigint)` | 0 / 0 | `1@3`, `2@4`, `3@5`, `4@7`, `5@9`, `6@9`, `7@11`, `8@11`, `9@12`, `10@13`, `11@14`, `12@15` |
| custodian / `custody.store_signature(uuid,text)` | 0.777778 / 0.5 | `4@5`, `8@8` |
| custodian / `custody.valid_event(jsonb,text)` | 0.647059 / 0.625 | `3@4`, `7@6`, `9@8`, `12@10`, `14@14`, `17@16`, `20@19`, `23@22`, `25@27`, `27@28`, `31@34`, `33@42` |

Branch ratios below one establish unhit procedural paths. Exact Boolean subconditions do not follow from those ratios. High-value missing paths include emit source-identity conflict/capacity/deferred STOP; capture_existing overflow; export ACK rejection and frame missing-row return; backpressure raises; custody accept unknown source/conflicting duplicate/key-epoch/gap; ingest malformed frame/source-contract/MAC rejection; signature uncommitted/conflict; and malformed valid_event cases. These paths have differing degrees of existing behavior coverage in CC/L/S/Q/C; schedule only the unmeasured or unasserted cases after matching each source version.

`committed_rows()` contains mutually selected source-versus-receiver arms. Its source ratio is 0.571429 and receiver ratio 0.857143 in N. Some missed RETURN QUERY arms are expected for the other service composition. Measure both valid installations and retain their identities; do not corrupt service identity just to force an impossible per-installation 100%. A definition-matched union can describe common-body path coverage only with explicit context reconciliation, not by summing two percentages.

### Recovery measurement R

| Routine | Statement ratio / branch ratio | Visible unhit statement IDs @ body line |
| --- | --- | --- |
| `broker9d.commit_result(uuid,uuid,jsonb)` | 0.941176 / 0.833333 | `8@9` |
| `broker9d.observe_before_recovery(uuid,uuid,jsonb)` | 0.8 / 0.5 | `6@7`, `8@8`, `11@17` |
| `broker9d.observe(uuid,uuid,jsonb)` | 0.777778 / 0.545455 | `6@7`, `8@8`, `13@11`, `17@17` |
| `broker9d.operate(uuid,uuid,text,bigint,text)` | 0.83871 / 0.736842 | `10@11`, `12@13`, `15@15`, `26@26`, `27@27` |
| `broker9d.reconcile(jsonb)` | 0.945946 / 0.909091 | `7@8`, `12@14` |
| `broker9d.recover_before_recovery(uuid)` | 0.846154 / 0.6 | `5@6`, `11@14` |
| `broker9d.register_before_recovery(jsonb)` | 0.888889 / 0.75 | `4@7`, `15@20` |
| `broker9d.register(jsonb)` | 0.875 / 0.75 | `7@10` |
| `broker9d.revision()` | 0.8 / 0.5 | `3@3` |
| `broker9d.set_stop(boolean)` | 0 / 1 | `1@3`, `2@4`, `3@5`, `4@5` |
| `broker9d.unknown(uuid,uuid)` | 0.888889 / 0.5 | `5@6` |

R is the later recovery composition and includes private legacy aliases. Reuse its exact definitions and ordinary recovery tests before falling back to B. Budget, usage conflict, cleanup/terminal state and current-generation semantics can differ from the original broker-only contract even when an unchanged helper body has earlier coverage.

### What the profiler cannot certify

- The original P matrix records 102/102 native visible statements and 47/47 native branches for eight PL/pgSQL routines, including set_stop with 0/0 actual branches. It does not numerically certify the three SQL-language functions or DDL. O has seven routines at 1/1 API ratios; those do not establish every embedded SQL predicate.
- SQL-language helpers such as valid_categories, valid_instant, allowed/allowed_before_recovery, valid_envelope, valid_remote_receipt, pressure, active_key, signable, frame/serialize and expected_sources have no PL/pgSQL native expression counters. Exercise truth tables and independently invalid scalar/NULL/array/boundary values; do not label them covered by a PL/pgSQL percentage.
- Native coverage also misses individual AND/OR operands, SQL WHERE predicates, NULL three-valued logic, SQL CASE arms, join/ownership conditions and JSON scalar type distinctions within an otherwise executed statement. Record condition-outcome witnesses separately.
- The old lineage ACK is the concrete warning: N reports 1/1 ratios, yet its UPDATE predicate accepts the extra-field receipt in the pending real regression. It has no procedural IF guard for the profiler to distinguish. Full native execution is compatible with a known logical/security gap.
- Schema/role ownership, grants, default privileges, RLS policies, trigger installation, constraints/indexes and signing-key configuration have no meaningful native PL/pgSQL branch denominator. Verify catalogs and denied/permitted behavior as separate invariants.

### DDL and configuration verification inventory

| Boundary | Existing evidence / invariant | Remaining focused verification |
| --- | --- | --- |
| permissions.sql owners, queue/audit tables and global function defaults | P catalog includes 11 routines, constraints, default ACLs and table security; ordinary worker/capture/ops/inspector grants are explicit. | Retain owner-wide future PUBLIC denial, effective login/role/TEMP/schema privileges and table/column access. Do not infer RLS on these three tables; the P matrix records none. |
| Outbox source access / RLS / uniqueness | O securityCatalog records source column grants and two rehearsal SELECT policies on bookings/driver cancellations; source identity and immutable bindings are exercised. | Check installation-specific application RLS, least-column reads, logical-key uniqueness, tombstones and no recreation after cleanup. These are source projection invariants, not native branches. |
| Transport source/receiver configuration and receipts | T has independent service/receipt binding, one logical delivery, ownership and existing-key conflict cases. | Separate source/exporter/receiver grants, no direct enqueue/deliver bypass, receipt identity and MAC/configuration mismatch truth tables; preserve private receive_committed ACL in closure composition. |
| Broker/recovery role and accounting schema | B/R catalog and state/accounting witnesses; requests/attempts/revisions/usage/operations tables and private function aliases. | Check uniqueness/FKs/accounting bounds, owner-only event append, restricted execute set, role escalation, renamed-function ACLs and request_revision trigger coverage. |
| Broker custody capture and pressure | Q/CC/C/S observe broker journal trigger, same-transaction capture, pending/REVIEW limits and STOP survival. | Verify all four admission triggers and their WHEN clauses independently; total retained history/WAL/index/disk bounds remain broader open storage work. |
| Lineage capture/consistency | L installs source outbox/audit and receiver receipt/work/audit/retry triggers; Q catalogs current lineage routines. | Check each trigger relation/event/no-change arm, default execution grants and exact restricted sender/verifier/inspector rights. Preserve distinction between deferred snapshots and original-time capture. |
| Independent custodian keys/signatures/sources | Q/CC/S records ACTIVE/RETIRED/COMPROMISED registry, unique active-key index, source enrollment, durable signature identity and role-separated signing. | Keep unknown/retired new admission, compromised trust, duplicate signatures and key-ID/public material matching explicit. Source registry propagation and trusted-owner compromise are separate trust boundaries. |
| HBA/crypto extension/host trust | Existing capsule and fixture receipts observe SCRAM wrong-password denials and extension-owned catalog entries. | Do not include extension binary routines in custom procedural denominators. Retain HMAC/signature known-valid and tampered tests, actual authenticated principals and deployed/off-host limitations. |

## 5. Reuse existing tests without repeating completed campaigns

| Existing test / helper | Reusable behavior | Profiling/mutation scheduling constraint |
| --- | --- | --- |
| [phase9dCustodyLineage.test.js](../../backend/tests/integration/phase9dCustodyLineage.test.js) | Real producer DML, source/receiver frame delivery, restricted grants, default-isolation refusal, REPEATABLE READ consistency and deletion/gap observation. | Test scenarios need no semantic change. A later profile-only harness must collect counters before fixture teardown; current lineage runner does not by itself supply these counters. |
| [phase9dCustody.test.js](../../backend/tests/integration/phase9dCustody.test.js) | Actual unavailable custody, failed sends, REVIEW, operator retry idempotency, denied sender retry, delayed/duplicate receipts and cleanup. | Ordinary cases can be reused. Keep crash hooks/fixture lifecycle owned and inspect code before enabling a profiler on exception-injection cases. |
| [phase9dCustodyClosure.test.js](../../backend/tests/integration/phase9dCustodyClosure.test.js) | Broker-stream fake local ACK and independent FALSE_ACKNOWLEDGEMENT; key identity/rotation/history/trust. | No routine-replacement campaign in this test. Reuse its approach for lineage only in a separately authorized implementation; the lineage variant is currently missing. |
| [phase9dCustodySafety.test.js](../../backend/tests/integration/phase9dCustodySafety.test.js) | Five pressure dimensions, concurrent rotation/recovery and signing persistence. | Ordinary tests reusable; profiling needs its own counter collector and explicit handling of catalog/DDL probes and fixture teardown. |
| [phase9dCustodyReplay.test.js](../../backend/tests/integration/phase9dCustodyReplay.test.js) | Saved-input lineage/accounting, original receipt recovery, rotation, independent denial delivery, STOP and cleanup. | Reuse passing scenario if a changed dependency requires it; it is not the first tool for isolated predicate gaps. |
| [phase9dCustodySql.test.js](../../backend/tests/integration/phase9dCustodySql.test.js) | Catalog/default PUBLIC probes and chosen custody source/sequence/receipt/backpressure guards. | Existing sql-native mode returns before its mutation block. Reuse that mode unchanged for its existing scope; it does not cover the eleven missing paths. The sql mode belongs in a separate unprofiled database. |
| [phase9dReadiness.test.js](../../backend/tests/integration/phase9dReadiness.test.js) | Original permission/queue/lease/privacy behavior. | Includes nine SQL mutation probes; do not run its whole file as a profiling-only workload. |
| [phase9dSqlCertification.test.js](../../backend/tests/integration/phase9dSqlCertification.test.js) | Original eleven-routine catalogs, adversarial truth tables and eight-routine native proof. | Captures counters, then invokes 26 replacements in the same test. It cannot be reused unmodified as a strictly separated profile-only campaign; preserve its existing completed proof and separate future harness phases. |
| [phase9dOutbox.test.js](../../backend/tests/integration/phase9dOutbox.test.js) | Source lineage, staged binding, duplicate/idempotent delivery, expiry and cleanup. | Contains 13 replacements after counter capture and a nested-trigger failure path that locally toggles profiler off. Do not reuse the entire file as a safe new profiling-only run. |
| [phase9dTransport.test.js](../../backend/tests/integration/phase9dTransport.test.js) | Transport receipt binding, duplicate/conflicting delivery, stop races and principal denials. | Entire suite ends with 12 SQL omissions. Reuse ordinary scenario logic; isolate any future profile-only selection from that mutation block. |
| [phase9dBroker.test.js](../../backend/tests/integration/phase9dBroker.test.js) | Reservation/admission/send/accounting/guard behavior and role isolation. | Includes six SQL mutations. Do not mix the whole test with profiling simply because it also exports nativeSql. |
| [phase9dRecoveryClosure.test.js](../../backend/tests/integration/phase9dRecoveryClosure.test.js) | Recovery fault groups, lease/stop/accounting/cleanup transitions. | Reuse only the small group relevant to an R gap; gather counters through a dedicated profiler-only boundary, with no replacement helper loaded. |
| [phase9dCustodyLineageAck.test.js](../../backend/tests/integration/phase9dCustodyLineageAck.test.js) | The new, currently failing closed-receipt counterexample. | Keep as RED evidence and a future acceptance test; it is not a passing historical baseline and does not yet include all ICR-1 cases. |

Existing JavaScript custody/worker/export/transport/broker/recovery unit tests remain useful for request shape, delegation and error handling. Mock query results cannot close a PostgreSQL permission, procedural or SQL-expression gap. Do not rerun the completed ten-helper 661-identity framework campaign for this SQL inventory.

## 6. Prioritized verification plan (future authorized execution only)

Small groups below are ordered by security consequence and evidence reuse. Each needs a fresh source/definition hash, recorded principals/configuration, explicit expected outcome and a source-stable receipt. Profile runs and routine-replacement mutation runs must use separate databases/process epochs. No group is executed or authorized by this report.

| Priority / group | Small related cases | Reuse and completion evidence |
| --- | --- | --- |
| P0 - evidence/configuration reconciliation | Confirm exact fixture composition, final names/renames, source definitions, role ACLs and profiler enablement before selecting counters. | Reuse P/O/B/R/Q/N and the 15 hashes in this report. Separate valid installation-specific arms from genuinely missing behavior. No rerun just to recreate a historical count. |
| P1 - lineage receipt / independent status (ICR-1) | Valid signed exact-event receipt; extra/missing/wrong-type fields; wrong source/sequence/hash/key; exact duplicate and conflicting receipt; syntactically acceptable false local ACK versus independent status; retired/compromised signer semantics. | Start from the retained RED test and CC/L/closure-status helpers. A later implementation may minimally harden lineage ACK. Independently verified status must require actual remote record/signature binding; preserve explicit trusted-verifier compromise limits and zero human/financial authority. |
| P2 - committed capture / snapshot consistency | Source producer INSERT/changed/unchanged UPDATE; receiver receipt/work/audit/retry trigger arms; ordinary versus REPEATABLE READ status; head/sequence/hash/source gap and missing committed-row outcomes. | Reuse L producer/consistency scenarios. Collect source and receiver counters independently. Add only missing synthetic cases for deferred-control and inspection limits; do not force an invalid service mode for a percentage. |
| P3 - ordered delivery / bounded operator recovery | One normal next and empty; earliest REVIEW blocks later work; attempts 1?3; denied sender retry, operator stale CAS, identical operation reuse and competing recovery. | Reuse C and S; collect next/retry native counters in a separate short profile-only fixture. Explicitly test lineage next separately because its schema has no equivalent exported retry API. |
| P4 - transport / source acceptance | Valid and duplicate delivery; existing-key conflicting payload; foreign evidence/source/owner/configuration; private receive_committed denial; malformed/oversized/incorrect MAC. | Reuse T/L cases and actual shadow9d_capture/exporter identities. Profile both installed receive bodies; run existing 12 omissions only in a different unprofiled mutation epoch if the changed graph requires them. |
| P5 - lease / stop generation / accounting | Reserve/admit/send under current versus stale lease/token/generation; response without accepted usage; duplicate/conflicting/late usage; terminal/cleaned request; bounded request/token/currency totals. | Use the specific R/B unhit lines and existing recovery scenarios. Reuse already proven unaffected paths; add small lock/barrier races only where the predicate or composition changed. |
| P6 - key epoch / historical receipt trust | Wrong key ID/public material; unsigned receipt prevents retirement; one concurrent epoch winner; old durable receipt reused; retired cannot issue new; compromised signature valid but not trusted. | Reuse CC/S/X and closure-keys/rotation helpers. Measure rotate/signature failure arms under profiling without replacements; record public key IDs/epochs only, no private keys. |
| P7 - cleanup / pressure / metadata authority | Cleanup only allowed terminal states; tombstone retains identity/commitments; delayed ACK/usage cannot recreate work; each of five pressure dimensions; STOP survives; future PUBLIC, role escalation and private signing/configuration access denied. | Reuse O/R/C/S/Q and effective role probes. CHECK/UNIQUE/FK/RLS/ACL/WHEN invariants are explicit outcomes, never invented native branches. Total retained storage and legal-hold policy remain separate gates; no host ENOSPC/stress experiment is required for this plan. |
| P8 - targeted mutation after profile closure | Only the changed high-risk guards and genuinely uncovered acceptance/lease/MAC/epoch/cleanup predicates; baseline must reject the seed before replacement. | Fresh unprofiled database; preserve raw mutant identity/definition; restore exact definition/owner/search path/ACL and compare hashes. Do not repeat P26/O13/T12/B6/R10/Q3 unchanged families just to increase totals. |

## 7. Proposed SQL verification contract and remaining gates

1. **Inventory completeness:** enumerate custom definitions and effective renamed/replaced identities per source, receiver and custodian composition. Retain extension membership, source/catalog hashes, owners, SECURITY DEFINER, explicit search paths, effective grants, triggers, constraints and defaults. Missing evidence is reported as unknown.
2. **Behavioral security cases:** keep a per-condition positive/negative matrix for identity/evidence, receipt/key binding, lease/generation, budgets/usage, cleanup/tombstones, retention admission and privileges. Independently falsify operands where a valid contract permits it; record NULL/type/range boundaries. Existing passing behavior may satisfy a case even when no profiler counter exists.
3. **Supported native measurement:** use the pinned PostgreSQL/plpgsql_check version and its actual APIs/statement trees. Report routine-level hit/total only when the profiler?s branch algorithm is independently reconciled for those constructs. Preserve zero/no-branch conventions and installation-specific reachability. No percentages are invented for SQL expressions or DDL.
4. **SQL expressions and DDL:** use truth tables, canonical persisted results, catalog assertions, real-role 42501/28P01 denials and constraint/rollback/uniqueness witnesses. These are separate adequacy measures; there is no impossible requirement for 100% native DDL coverage.
5. **Mutation:** separately scoped source-bound guard omissions only, after clean baselines. No routine replacement on a profiling-enabled server. Preserve survivors/timeouts/errors as unresolved unless an executable equivalence or independent diagnosis supports another classification. The historical PostgreSQL signal-11 crash remains open; capture-before-mutation in the same backend is not sufficient separation.
6. **Acceptance:** close only measured supported scope. Native ratios of one cannot waive ICR-1, missing guard truth tables or metadata denials. Retain whole-SQL/critical-code, universal audit observation, retained storage, trusted-root/off-host administration, real privacy/legal approvals, Clerk production capacity, in-flight financial policy, blind human labels and production deployment gates as open. No audit ACK creates operational, human-final or financial authority.

## 8. Integrity and stop point

The report was generated from read-only source/catalog/counter/test inspection. The 15 SQL sources were hashed before and after report construction and stayed identical to the accepted manifest. Relevant current custody evidence files were checked against that manifest; original P/O/B/R source hash pins were matched to the local SQL. Original working/staged changes, archive, HEAD, accepted Clerk and frozen V5 were not edited or migrated. No commits, pushes, deployments or production configuration changes occurred. No readiness row or historical evidence was rewritten by this report.

### Evidence fingerprints

| Input | SHA-256 |
| --- | --- |
| [manifest.json](../../output/phase9d-custody-monitored-2026-10-17/manifest.json) | `23799e7262f0c015194f1e7a24c78a189f1679fc6e9774f93f7b7234b70fe4e4` |
| [readiness-gates-current.json](../../output/phase9d-custody-monitored-2026-10-17/readiness-gates-current.json) | `237c5531719b7280330f4ea72d8b2234e1270c2521202954107931d1ab54bc07` |
| [audit-coverage-matrix-current.json](../../output/phase9d-custody-monitored-2026-10-17/audit-coverage-matrix-current.json) | `9bd989def1679eea0f0382b6162ac833c3c3b259623d7ffec7d514eb940a22ac` |
| [independent-review.json](../../output/phase9d-custody-monitored-2026-10-17/independent-review.json) | `deb8e689dffe10ee3af60a1482f4b30eb6de3c75f29f37b4068803075e40ea50` |
| [sql-native-witness-72691011-aa1f-4cab-aa2d-62eeac3b9995.json](../../output/phase9d-custody-monitored-2026-10-17/sql-native-witness-72691011-aa1f-4cab-aa2d-62eeac3b9995.json) | `9dc69092e7567e5b1641faef3794f0a96e247e5d5d16d98d4da4eb47bc970eb0` |
| [sql-witness-35195964-7454-4888-9d0b-9aec17cbe2f9.json](../../output/phase9d-custody-monitored-2026-10-17/sql-witness-35195964-7454-4888-9d0b-9aec17cbe2f9.json) | `44e6e23597d6bfa57f2175966e3953e8700fb918a8b68264c87be7175d6595d3` |
| [sql-testability-matrix.json](../../../RCS-Travels-Website/output/phase9d-1-sql-broker-2026-10-13/sql-testability-matrix.json) | `8d64379b22fa40cfa11b763d385d479456191ef5c7085fd287ebf28a77fd292a` |
| [recovery-witness-bee73aca-a164-463b-88e7-2f780d87ac86.json](../../../RCS-Travels-Website/output/phase9d-broker-recovery-2026-10-14/recovery-witness-bee73aca-a164-463b-88e7-2f780d87ac86.json) | `da9c9c10d796f2ed4e762c07611be99c1c8246c050cbc03c437793409592f36b` |

**Stop here.** The next executable work is the focused ICR-1 group followed by the smallest missing profile groups, under a separate authorization. This document does not start that work or claim whole-SQL/Phase 9D-1 completion.
