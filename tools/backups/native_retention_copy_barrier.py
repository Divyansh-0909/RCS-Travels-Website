"""Persisted extra-copy refusal checks using synthetic SQL rows and copy observations."""
import hashlib
import json
from pathlib import Path
import sys
import uuid

import psycopg
from psycopg import sql

from native_postgres import NativePostgres
from native_retention_integration import DDL as ROW_DDL
from retention_copy_barrier import DDL, minimize_with_copy_barrier
from retention_row_manifest import materialize

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-open-gates-2026-10-22/retention-copy-barrier-final.json"


def main():
    paths = [Path(__file__)] + [ROOT / "tools/backups" / name for name in ["native_postgres.py", "retention_copy_barrier.py", "retention_row_manifest.py", "retention_copy_plan.py", "native_retention_integration.py"]] + [ROOT / "tools/phase9d/management-retention.sql"]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    witness = {"cases": [], "status": "FAIL", "sourceHashes": pins, "syntheticOnly": True,
               "productionExecution": False, "boundary": "Persisted SQL lab rows plus simulated object/backup acknowledgements; no GCS/R2/backup erasure, real policy, independent signature or distributed hold barrier."}
    server = NativePostgres()

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as admin:
                database = "retention_copy_lab_" + uuid.uuid4().hex
                admin.execute(sql.SQL("CREATE DATABASE {} CONNECTION LIMIT 4").format(sql.Identifier(database)))
            with psycopg.connect(host="127.0.0.1", port=server.port, dbname=database, user="proofloop_owner", password=server.password, autocommit=True, connect_timeout=5, options="-c statement_timeout=15000 -c lock_timeout=5000") as c:
                c.execute((ROOT / "tools/phase9d/management-retention.sql").read_text(encoding="utf-8-sig"), prepare=False)
                c.execute(ROW_DDL + DDL, prepare=False)
                c.execute("INSERT INTO retention9d.configuration VALUES(true,'source',false,64)")
                c.execute("INSERT INTO retention9d.policies VALUES('booking-fixture',1,'fixture-observation',60,true,true,'synthetic-only-not-production-policy',true)")
                scope, operation = uuid.uuid4(), uuid.uuid4()
                c.execute("INSERT INTO retention_lab.bookings VALUES(%s,'synthetic-source')", (scope,))
                c.execute("INSERT INTO retention_lab.responsibility_cases VALUES(%s,%s,'synthetic-case')", (uuid.uuid4(), scope))
                manifest = materialize(c, scope)
                c.execute("INSERT INTO retention9d.resources VALUES(%s,'booking-fixture',%s,%s,true,true,'MINIMIZE_PAYLOAD',clock_timestamp()-interval '120 seconds',0,false,false)", (str(scope), str(scope), manifest["commitment"]))
                receipt = c.execute("SELECT retention9d.local_prepare(%s,%s,1,1,'synthetic-only-not-production-policy')", (operation, str(scope))).fetchone()[0]
                check("local:prepared", receipt["status"], "PREPARED")

                def attempt():
                    return minimize_with_copy_barrier(c, operation, manifest, 1, 1)

                def refused(name, expected):
                    try:
                        attempt()
                    except ValueError as error:
                        result = str(error)
                    else:
                        result = "UNEXPECTED_SUCCESS"
                    check(name, result, expected)
                    check(name + ":payload-kept", c.execute("SELECT payload FROM retention_lab.bookings WHERE id=%s", (scope,)).fetchone()[0], "synthetic-source")
                    check(name + ":tombstone-not-advanced", c.execute("SELECT tombstone FROM retention9d.resources WHERE scope=%s", (str(scope),)).fetchone()[0], False)

                refused("no-copy-set", "COPY_SET_BINDING_REQUIRED")
                c.execute("INSERT INTO retention_copy_control.copy_sets VALUES(%s,%s,%s,1,1,false,3)", (operation, str(scope), manifest["commitment"]))
                refused("inventory-incomplete", "COPY_INVENTORY_INCOMPLETE")
                c.execute("UPDATE retention_copy_control.copy_sets SET inventory_complete=true")
                refused("missing-external-acks", "COPY_ACKS_MISSING")
                for name, kind in [("local-rows", "SQL_ROWS"), ("synthetic-object-version", "OBJECT_VERSION"), ("synthetic-backup-generation", "BACKUP_GENERATION")]:
                    c.execute("INSERT INTO retention_copy_control.copy_observations VALUES(%s,%s,%s,%s,1,1,%s,'PREPARED',clock_timestamp(),false)", (operation, name, kind, str(scope), manifest["commitment"]))
                probes = [
                    ("stale", "UPDATE retention_copy_control.copy_observations SET observed_at=clock_timestamp()-interval '61 seconds' WHERE kind='OBJECT_VERSION'", "COPY_OBSERVATION_STALE"),
                    ("wrong-scope", "UPDATE retention_copy_control.copy_observations SET scope='foreign' WHERE kind='OBJECT_VERSION'", "COPY_ACK_BINDING_MISMATCH"),
                    ("wrong-epoch", "UPDATE retention_copy_control.copy_observations SET epoch=2 WHERE kind='OBJECT_VERSION'", "COPY_ACK_BINDING_MISMATCH"),
                    ("wrong-version", "UPDATE retention_copy_control.copy_observations SET policy_version=2 WHERE kind='BACKUP_GENERATION'", "COPY_ACK_BINDING_MISMATCH"),
                    ("wrong-commitment", "UPDATE retention_copy_control.copy_observations SET commitment=repeat('0',64) WHERE kind='OBJECT_VERSION'", "COPY_ACK_BINDING_MISMATCH"),
                    ("waiting", "UPDATE retention_copy_control.copy_observations SET state='WAITING' WHERE kind='OBJECT_VERSION'", "COPY_NOT_PREPARED"),
                    ("held", "UPDATE retention_copy_control.copy_observations SET hold_active=true WHERE kind='BACKUP_GENERATION'", "COPY_HELD"),
                    ("late-hold", "UPDATE retention_copy_control.copy_observations SET hold_active=true WHERE kind='BACKUP_GENERATION'; UPDATE retention_copy_control.copy_observations SET state='PURGED' WHERE kind='OBJECT_VERSION'", "LATE_HOLD_MANUAL_REVIEW_NO_RECOVERY"),
                ]
                for name, setup, reason in probes:
                    c.execute("BEGIN")
                    try:
                        c.execute(setup, prepare=False)
                        refused(name, reason)
                    finally:
                        c.execute("ROLLBACK")
                result = attempt()
                check("all-reviewed-fresh-copies:synthetic-commit", result["status"], "SIMULATED_PAYLOAD_PURGE")
                check("all-reviewed-fresh-copies:payload-minimized", c.execute("SELECT payload IS NULL FROM retention_lab.bookings WHERE id=%s", (scope,)).fetchone()[0])
                check("all-reviewed-fresh-copies:tombstones-retained", c.execute("SELECT count(*) FROM retention_lab.tombstones").fetchone()[0], 2)
                check("production:still-disabled", c.execute("SELECT production_execution FROM retention9d.configuration").fetchone()[0], False)
                witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with OUT.open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
