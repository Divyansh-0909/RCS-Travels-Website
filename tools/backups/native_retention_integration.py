"""Actual guarded synthetic payload minimization with the existing retention SQL."""
import hashlib
import json
from pathlib import Path
import sys
import uuid

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from native_postgres import NativePostgres
from retention_row_manifest import materialize, minimize, propagate_hold

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-engineering-completion-2026-10-21/retention-integration.json"
DDL = """
CREATE SCHEMA retention_lab;
CREATE TABLE retention_lab.configuration(singleton bool PRIMARY KEY CHECK(singleton),synthetic_only bool NOT NULL CHECK(synthetic_only),
 production_execution bool NOT NULL CHECK(NOT production_execution),frozen bool NOT NULL DEFAULT false);
INSERT INTO retention_lab.configuration VALUES(true,true,false,false);
CREATE TABLE retention_lab.bookings(id uuid PRIMARY KEY,payload text);
CREATE TABLE retention_lab.responsibility_cases(id uuid PRIMARY KEY,booking_id uuid NOT NULL REFERENCES retention_lab.bookings,payload text);
CREATE TABLE retention_lab.responsibility_events(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES retention_lab.responsibility_cases,payload text);
CREATE TABLE retention_lab.applied(operation uuid PRIMARY KEY,scope text NOT NULL,commitment text NOT NULL,receipt jsonb NOT NULL,actor text NOT NULL);
CREATE TABLE retention_lab.tombstones(operation uuid NOT NULL,table_name text NOT NULL,row_id text NOT NULL,original_hash text NOT NULL,PRIMARY KEY(operation,table_name,row_id));
CREATE TABLE retention_lab.incidents(scope text NOT NULL,approval text NOT NULL,response jsonb NOT NULL,actor text NOT NULL,PRIMARY KEY(scope,approval));
REVOKE ALL ON ALL TABLES IN SCHEMA retention_lab FROM PUBLIC;
"""


def main():
    paths = [Path(__file__), ROOT / "tools/backups/retention_row_manifest.py", ROOT / "tools/backups/retention_copy_plan.py", ROOT / "tools/backups/native_postgres.py", ROOT / "tools/phase9d/management-retention.sql"]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    witness = {"cases": [], "sourceHashes": pins, "syntheticOnly": True, "productionExecution": False,
               "boundary": "Three disposable DBs on one native cluster; actual synthetic rows only. Not independent administration, real customer deletion or approved category/backup/provider integration."}
    server = NativePostgres()
    nodes = {}
    created = []

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        assert actual == expected, name

    def refused(name, callback, expected):
        try:
            callback()
        except ValueError as error:
            actual = str(error)
        else:
            actual = "UNEXPECTED_SUCCESS"
        check(name, actual, expected)

    def scalar(c, statement, values=()):
        return c.execute(statement, values).fetchone()[0]

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as admin:
                for node in ["source", "receiver", "custodian"]:
                    database = "retention_copy_lab_" + uuid.uuid4().hex
                    admin.execute(sql.SQL("CREATE DATABASE {} CONNECTION LIMIT 4").format(sql.Identifier(database)))
                    created.append(database)
                    c = psycopg.connect(host="127.0.0.1", port=server.port, dbname=database, user="proofloop_owner", password=server.password, autocommit=True, connect_timeout=5, options="-c statement_timeout=15000 -c lock_timeout=5000")
                    nodes[node] = c
                    c.execute((ROOT / "tools/phase9d/management-retention.sql").read_text(encoding="utf-8-sig"), prepare=False)
                    c.execute(DDL, prepare=False)
                    c.execute("INSERT INTO retention9d.configuration VALUES(true,%s,false,64)", (node,))
                    c.execute("INSERT INTO retention9d.policies VALUES('booking-fixture',1,'fixture-observation',60,false,false,'synthetic-only-not-production-policy',true)")
                source = nodes["source"]
                scope = uuid.uuid4()
                unrelated = uuid.uuid4()
                manifests = {}
                for node, c in nodes.items():
                    c.execute("INSERT INTO retention_lab.bookings VALUES(%s,%s),(%s,'unrelated-kept')", (scope, "synthetic-" + node, unrelated))
                    case, event = uuid.uuid4(), uuid.uuid4()
                    c.execute("INSERT INTO retention_lab.responsibility_cases VALUES(%s,%s,'synthetic-evidence')", (case, scope))
                    c.execute("INSERT INTO retention_lab.responsibility_events VALUES(%s,%s,'synthetic-observation')", (event, case))
                    with c.transaction():
                        c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                        manifest = materialize(c, scope)
                    manifests[node] = manifest
                    check(node + ":three-bound-fk-rows", len(manifest["rows"]), 3)
                    check(node + ":unrelated-not-selected", str(unrelated) not in {r["id"] for r in manifest["rows"]})
                    c.execute("INSERT INTO retention9d.resources VALUES(%s,'booking-fixture',%s,%s,true,true,'MINIMIZE_PAYLOAD',clock_timestamp()-interval '120 seconds',0,false,false)", (str(scope), str(scope), manifest["commitment"]))
                operation = uuid.uuid4()
                def begin():
                    return scalar(source, "SELECT retention9d.begin_delete(%s,%s,1,'synthetic-only-not-production-policy')", (operation, str(scope)))
                check("default-disabled-policy", begin()["status"], "POLICY_DISABLED")
                for c in nodes.values():
                    c.execute("UPDATE retention9d.policies SET enabled=true,approved=true")
                check("existing-coordinator:begin", begin()["status"], "PREPARING")
                check("missing-copy-not-authorized", scalar(source, "SELECT retention9d.authorize(%s)", (operation,))["status"], "PENDING_ACKS")
                prepared = {}
                for node, c in nodes.items():
                    receipt = scalar(c, "SELECT retention9d.local_prepare(%s,%s,1,1,'synthetic-only-not-production-policy')", (operation, str(scope)))
                    check(node + ":prepared", receipt["status"], "PREPARED")
                    check(node + ":commitment-bound", receipt["commitment"], manifests[node]["commitment"])
                    prepared[node] = receipt
                    wrong = dict(receipt, commitment="0" * 64, node="other")
                    check(node + ":wrong-node-rejected", scalar(source, "SELECT retention9d.ack_prepare(%s,%s,%s)", (operation, node, Jsonb(wrong))), False)
                    check(node + ":prepare-ack", scalar(source, "SELECT retention9d.ack_prepare(%s,%s,%s)", (operation, node, Jsonb(receipt))))
                check("all-copy-prepare-authorized", scalar(source, "SELECT retention9d.authorize(%s)", (operation,))["status"], "COMMITTING")
                receiver = nodes["receiver"]
                receiver.execute("UPDATE retention_lab.bookings SET payload='changed-after-manifest' WHERE id=%s", (scope,))
                refused("stale-real-row-refused", lambda: minimize(receiver, operation, manifests["receiver"], 1, 1), "ROW_MANIFEST_CHANGED")
                check("stale-attempt-rolls-back-tombstone", scalar(receiver, "SELECT tombstone FROM retention9d.resources WHERE scope=%s", (str(scope),)), False)
                receiver.execute("UPDATE retention_lab.bookings SET payload='synthetic-receiver' WHERE id=%s", (scope,))
                done = minimize(source, operation, manifests["source"], 1, 1)
                check("source:actual-payload-cleared", scalar(source, "SELECT payload IS NULL FROM retention_lab.bookings WHERE id=%s", (scope,)))
                check("source:child-payloads-cleared", scalar(source, "SELECT (SELECT bool_and(payload IS NULL) FROM retention_lab.responsibility_cases) AND (SELECT bool_and(payload IS NULL) FROM retention_lab.responsibility_events)"))
                check("source:tombstones-retained", scalar(source, "SELECT count(*) FROM retention_lab.tombstones"), 3)
                check("source:ids-and-fks-retained", scalar(source, "SELECT count(*) FROM retention_lab.responsibility_events e JOIN retention_lab.responsibility_cases c ON c.id=e.case_id JOIN retention_lab.bookings b ON b.id=c.booking_id WHERE b.id=%s", (scope,)), 1)
                check("source:exact-operation-reuse", minimize(source, operation, manifests["source"], 1, 1), done)
                altered = dict(manifests["source"], commitment="0" * 64)
                refused("source:conflicting-reuse", lambda: minimize(source, operation, altered, 1, 1), "MINIMIZATION_OPERATION_CONFLICT")
                check("source:unrelated-kept", scalar(source, "SELECT payload FROM retention_lab.bookings WHERE id=%s", (unrelated,)), "unrelated-kept")
                check("source:commit-ack", scalar(source, "SELECT retention9d.ack_commit(%s,'source',%s)", (operation, Jsonb(done))))
                for c in nodes.values():
                    c.execute("INSERT INTO retention9d.hold_approvals VALUES('synthetic-late-hold',%s,false,true)", (str(scope),))
                held = propagate_hold(nodes, scope, "synthetic-late-hold")
                check("late-hold:manual-review", held["status"], "MANUAL_REVIEW")
                check("late-hold:deleted-copy-not-recovered", held["alreadyPurgedCopyRecovered"], False)
                check("late-hold:source-conflict", held["nodes"]["source"]["status"], "LATE_HOLD_CONFLICT")
                for node in ["receiver", "custodian"]:
                    c = nodes[node]
                    check(node + ":held", scalar(c, "SELECT held FROM retention9d.resources WHERE scope=%s", (str(scope),)))
                    check(node + ":remaining-payload-preserved", scalar(c, "SELECT payload IS NOT NULL FROM retention_lab.bookings WHERE id=%s", (scope,)))
                    refused(node + ":further-delete-frozen", lambda c=c, node=node: minimize(c, operation, manifests[node], 1, 1), "SYNTHETIC_RETENTION_FROZEN")
                    check(node + ":durable-manual-review", scalar(c, "SELECT count(*) FROM retention_lab.incidents"), 1)
                check("late-hold:retry-idempotent", propagate_hold(nodes, scope, "synthetic-late-hold")["status"], "MANUAL_REVIEW")
                check("stale-backup:quarantine", scalar(source, "SELECT retention9d.restore_allowed(%s)", (str(scope),)), False)
                check("held-copy:quarantine", scalar(receiver, "SELECT retention9d.restore_allowed(%s)", (str(scope),)), False)
                check("production-delete-disabled", scalar(source, "SELECT retention9d.local_commit(%s,%s,1,1,true)", (operation, str(scope)))["status"], "PRODUCTION_DELETION_DISABLED")
                # A real separate login can inspect synthetic tombstones but cannot alter them.
                read_password = uuid.uuid4().hex
                admin.execute(sql.SQL("CREATE ROLE retention_lab_reader LOGIN PASSWORD {}").format(sql.Literal(read_password)))
                source.execute("GRANT USAGE ON SCHEMA retention_lab TO retention_lab_reader; GRANT SELECT ON retention_lab.tombstones TO retention_lab_reader", prepare=False)
                with psycopg.connect(host="127.0.0.1", port=server.port, dbname=created[0], user="retention_lab_reader", password=read_password, autocommit=True, connect_timeout=5) as reader:
                    check("reader:authenticated-role", scalar(reader, "SELECT current_user"), "retention_lab_reader")
                    check("reader:tombstones-visible", scalar(reader, "SELECT count(*) FROM retention_lab.tombstones"), 3)
                    try:
                        reader.execute("DELETE FROM retention_lab.tombstones")
                    except psycopg.Error as error:
                        code = error.sqlstate
                    else:
                        code = "UNEXPECTED_SUCCESS"
                    check("reader:delete-denied", code, "42501")
                witness["manifestSummaries"] = {node: {"rowCount": len(m["rows"]), "commitment": m["commitment"], "catalogHash": m["catalogHash"]} for node, m in manifests.items()}
                witness["status"] = "PASS"
    finally:
        for c in nodes.values():
            c.close()
        witness["serverStopped"] = server.stopped
        witness["sourceUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        witness["caseCount"] = len(witness["cases"])
        with OUT.open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
