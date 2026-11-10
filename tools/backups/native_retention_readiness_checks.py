"""Focused synthetic copy snapshots and real-session hold ordering; no provider access."""
import hashlib
import json
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from native_postgres import NativePostgres
from psycopg import Error, sql
from retention_backup_index import reconcile_restore, snapshot_index
from retention_scope_manifest import collect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-retention-readiness-2026-10-31/native"
SOURCES = [Path(__file__), ROOT / "tools/backups/native_postgres.py",
           ROOT / "tools/backups/retention_scope_manifest.py", ROOT / "tools/backups/retention_backup_index.py",
           ROOT / "tools/backups/retention_provider_inventory.py", ROOT / "tools/backups/retention_registry.sql",
           ROOT / "tools/phase9d/management-retention.sql", ROOT / "tools/phase9d/management-hold-guards.sql"]


def main():
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCES}
    witness = {"status": "FAIL", "checks": [], "sourceHashes": pins,
               "scope": "Synthetic minimal row projections and optional local hold bridge; no application enrollment or distributed/provider hold proof"}
    server = NativePostgres()

    def check(name, actual, expected=True):
        witness["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    try:
        ledger = OUT.parent / "owned-servers.json"
        ledger.write_text(json.dumps([{"owner": server.owner, "data": str(server.data)}]), encoding="utf-8")
        with server:
            witness["environment"] = server.identity
            passwords = {r: uuid.uuid4().hex for r in ["rr_operator", "rr_proprietor"]}
            with server.connect(autocommit=True) as admin:
                check("profiling:preload-empty", admin.execute("SHOW shared_preload_libraries").fetchone()[0], "")
                check("profiling:extension-absent", admin.execute("SELECT count(*) FROM pg_extension WHERE extname='plpgsql_check'").fetchone()[0], 0)
                admin.execute("CREATE ROLE rr_owner NOLOGIN; GRANT CREATE ON DATABASE postgres TO rr_owner", prepare=False)
                for role, password in passwords.items():
                    admin.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
                admin.execute("SET ROLE rr_owner")
                for path in [ROOT / "tools/backups/retention_registry.sql", ROOT / "tools/phase9d/management-retention.sql", ROOT / "tools/phase9d/management-hold-guards.sql"]:
                    admin.execute(path.read_text(encoding="utf-8-sig"), prepare=False)
                admin.execute("""INSERT INTO retention_registry.configuration VALUES(true,'rr_proprietor','rr_operator',false);
INSERT INTO retention9d.configuration VALUES(true,'source',false,32);
CREATE SCHEMA outbox9d; CREATE TABLE outbox9d.deliveries(id bigint PRIMARY KEY,payload jsonb,status text);
INSERT INTO outbox9d.deliveries VALUES(1,'{"synthetic":true}','ACKED');
CREATE TRIGGER retained BEFORE UPDATE OR DELETE ON outbox9d.deliveries FOR EACH ROW EXECUTE FUNCTION retention9d.guard_retained_row('id','payload');
GRANT USAGE ON SCHEMA retention_registry TO rr_operator,rr_proprietor;
GRANT EXECUTE ON FUNCTION retention_registry.register_copy(text,text,text,text,text,bigint),retention_registry.seal_inventory(text,bigint,text[]),retention_registry.restore_decision(text,bigint) TO rr_operator;
GRANT EXECUTE ON FUNCTION retention_registry.decide_hold(uuid,text,uuid,boolean,bigint,text,text) TO rr_proprietor;
RESET ROLE;""", prepare=False)
                scope = "synthetic-retention-scope"
                admin.execute("INSERT INTO retention9d.resources VALUES(%s,'fixture','identity',repeat('a',64),true,true,'MINIMIZE_PAYLOAD',now(),0,false,false)", (scope,))
                admin.execute("INSERT INTO retention9d.guarded_rows VALUES(%s,'outbox9d.deliveries','1')", (scope,))

                def definitions():
                    return admin.execute("""SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proowner::regrole::text,p.prosecdef,p.proconfig,p.proacl::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('retention_registry','retention9d') ORDER BY 1,2,3""").fetchall()

                original = definitions()
                with server.connect(user="rr_operator", password=passwords["rr_operator"], autocommit=True) as operator, server.connect(user="rr_proprietor", password=passwords["rr_proprietor"], autocommit=True) as proprietor:
                    for conn, role in [(operator, "rr_operator"), (proprietor, "rr_proprietor")]:
                        check(role + ":session-authenticated", conn.execute("SELECT session_user").fetchone()[0], role)
                        check(role + ":restricted", admin.execute("SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls) FROM pg_roles WHERE rolname=%s", (role,)).fetchone()[0])
                    for epoch, (identity, kind) in enumerate([("sql", "SQL_ROWS"), ("generation", "GCS_GENERATION"), ("backup", "ENCRYPTED_BACKUP")]):
                        result = operator.execute("SELECT retention_registry.register_copy(%s,%s,%s,%s,'PRESENT',%s)", (scope, identity, kind, "a" * 64, epoch)).fetchone()[0]
                        check(identity + ":copy-enrolled", result["epoch"], epoch + 1)
                    seal = operator.execute("SELECT retention_registry.seal_inventory(%s,3,ARRAY['sql','generation','backup'])", (scope,)).fetchone()[0]
                    check("inventory:declared", seal["status"], "DECLARED")
                    check("inventory:declaration-is-not-independent-proof", seal["independentCompletenessProof"], False)
                    with admin.transaction():
                        admin.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                        old_index = snapshot_index(admin)

                    def hold(conn, op, identity, releasing, expected):
                        return conn.execute("SELECT retention_registry.decide_hold(%s,%s,%s,%s,%s,'synthetic-procedure-review',%s)", (op, scope, identity, releasing, expected, "d" * 64)).fetchone()[0]

                    # A real uncommitted proprietor transaction is invisible to
                    # another session, and rollback preserves both ledger/bridge.
                    proprietor.execute("BEGIN")
                    rolled_back_id = uuid.uuid4()
                    check("rollback:provisional-held", hold(proprietor, uuid.uuid4(), rolled_back_id, False, 3)["status"], "HELD")
                    check("rollback:other-session-does-not-see-hold", admin.execute("SELECT count(*) FROM retention_registry.holds").fetchone()[0], 0)
                    proprietor.execute("ROLLBACK")
                    check("rollback:no-hold-retained", admin.execute("SELECT count(*) FROM retention_registry.holds").fetchone()[0], 0)
                    check("rollback:bridge-unheld", admin.execute("SELECT held FROM retention9d.resources").fetchone()[0], False)
                    check("rollback:no-hold-audit", admin.execute("SELECT count(*) FROM retention_registry.audit WHERE action='HOLD_PLACED'").fetchone()[0], 0)

                    # Observe the actual lock blocker, then commit the hold.
                    # The waiting trusted fixture writer may not alter payload.
                    proprietor.execute("BEGIN")
                    first_id, first_op = uuid.uuid4(), uuid.uuid4()
                    check("hold:first-staged", hold(proprietor, first_op, first_id, False, 3)["status"], "HELD")
                    with server.connect(autocommit=True) as writer, ThreadPoolExecutor(max_workers=1) as pool:
                        pid = writer.info.backend_pid

                        def write():
                            try:
                                writer.execute("UPDATE outbox9d.deliveries SET payload=payload||'{\"probe\":true}' WHERE id=1")
                            except Error as error:
                                return getattr(error, "sqlstate", "NO_SQLSTATE")
                            return "UNEXPECTED_SUCCESS"

                        future = pool.submit(write)
                        try:
                            deadline = time.monotonic() + 2
                            blocked = False
                            while time.monotonic() < deadline:
                                blockers = admin.execute("SELECT pg_blocking_pids(%s)", (pid,)).fetchone()[0]
                                if proprietor.info.backend_pid in blockers:
                                    blocked = True
                                    break
                                time.sleep(0.02)
                            check("hold:writer-blocked-by-proprietor-backend", blocked)
                        finally:
                            proprietor.execute("COMMIT")
                        check("hold:waiting-payload-write-rejected", future.result(timeout=6), "55000")
                    check("hold:original-payload-retained", admin.execute("SELECT payload FROM outbox9d.deliveries").fetchone()[0], {"synthetic": True})
                    check("hold:exact-replay-no-transition", hold(proprietor, first_op, first_id, False, 3)["epoch"], 4)

                    # A second authenticated proprietor session submits the same
                    # expected epoch while the first owns the configuration lock.
                    proprietor.execute("BEGIN")
                    second_id = uuid.uuid4()
                    check("competing:one-staged", hold(proprietor, uuid.uuid4(), second_id, False, 4)["epoch"], 5)
                    with server.connect(user="rr_proprietor", password=passwords["rr_proprietor"], autocommit=True) as competitor, ThreadPoolExecutor(max_workers=1) as pool:
                        future = pool.submit(hold, competitor, uuid.uuid4(), uuid.uuid4(), False, 4)
                        try:
                            deadline = time.monotonic() + 2
                            blocked = False
                            while time.monotonic() < deadline:
                                if proprietor.info.backend_pid in admin.execute("SELECT pg_blocking_pids(%s)", (competitor.info.backend_pid,)).fetchone()[0]:
                                    blocked = True
                                    break
                                time.sleep(0.02)
                            check("competing:actual-lock-observed", blocked)
                        finally:
                            proprietor.execute("COMMIT")
                        check("competing:stale-epoch-rejected-after-commit", future.result(timeout=6)["status"], "STALE")
                    check("competing:only-two-durable-holds", admin.execute("SELECT count(*) FROM retention_registry.holds WHERE release IS NULL").fetchone()[0], 2)
                    # Historical-looking observation times do not expire holds.
                    admin.execute("UPDATE retention_registry.audit SET at=clock_timestamp()-interval '365 days'")
                    check("hold:no-automatic-expiry", operator.execute("SELECT retention_registry.restore_decision(%s,3)", (scope,)).fetchone()[0]["held"])
                    check("release:one-retains-overlap", hold(proprietor, uuid.uuid4(), first_id, True, 5)["status"], "HELD")
                    final = hold(proprietor, uuid.uuid4(), second_id, True, 6)
                    check("release:final-review-required", final["status"], "RELEASED_REVIEW_REQUIRED")
                    check("release:no-production-delete-authority", final["productionDeletion"], False)
                    # Unknown/new generations invalidate a declared inventory.
                    result = operator.execute("SELECT retention_registry.register_copy(%s,'new-generation','GCS_GENERATION',%s,'UNKNOWN',7)", (scope, "b" * 64)).fetchone()[0]
                    check("new-copy:epoch-advanced", result["epoch"], 8)
                    decision = operator.execute("SELECT retention_registry.restore_decision(%s,7)", (scope,)).fetchone()[0]
                    check("new-copy:inventory-invalidated", decision["inventoryDeclared"], False)
                    check("new-copy:unknown-observation-pending", decision["copyObservationPending"])
                    check("new-copy:old-epoch-stale", decision["snapshotStale"])
                    reconciled = reconcile_restore(admin, old_index)
                    check("restore:current-authority-sees-stale-backup", reconciled["decisions"]["staleEpochCount"], 1)
                    check("restore:stays-quarantined", reconciled["trafficReleaseAuthorized"], False)
                    check("production:registry-disabled", admin.execute("SELECT production_deletion FROM retention_registry.configuration").fetchone()[0], False)
                    check("production:optional-management-disabled", admin.execute("SELECT production_execution FROM retention9d.configuration").fetchone()[0], False)
                    check("catalog:definitions-owner-security-path-acl-unchanged", definitions(), original)
                    witness["routineIdentities"] = [{"schema": r[0], "name": r[1], "arguments": r[2], "sha256": hashlib.sha256(r[3].encode()).hexdigest(), "owner": r[4], "securityDefiner": r[5], "settings": r[6], "acl": r[7]} for r in original]

                # Minimal projected copies exercise read-only snapshot/hash
                # boundaries without guessing nested JSON/phone relationships.
                admin.execute("""CREATE SCHEMA scope_projection;
CREATE TABLE scope_projection.bookings(id text PRIMARY KEY,customer_phone text);
CREATE TABLE scope_projection.evidence(id text PRIMARY KEY,booking_id text,snapshot jsonb);
INSERT INTO scope_projection.bookings VALUES('b1','synthetic-phone-a'),('b2','synthetic-phone-a');
INSERT INTO scope_projection.evidence VALUES('e1','b1','{"foreignBooking":"b2","contact":"synthetic-phone-a"}'),('e2','b2','{}');""", prepare=False)
                catalog = {"tables": [{"name": "bookings", "columns": ["id", "customer_phone"]}, {"name": "evidence", "columns": ["id", "booking_id", "snapshot"]}],
                           "foreign_keys": [{"table": "evidence", "parent": "bookings", "columns": ["booking_id"], "parent_columns": ["id"], "constraint": "synthetic-reviewed-link"}]}
                with server.connect(autocommit=True) as observer:
                    observer.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
                    first = collect(observer, catalog, "bookings", ["b1"], schema="scope_projection")
                    admin.execute("UPDATE scope_projection.evidence SET snapshot=snapshot||'{\"later\":true}' WHERE id='e1'")
                    retained = collect(observer, catalog, "bookings", ["b1"], schema="scope_projection")
                    check("mapping:repeatable-read-stable", retained, first)
                    observer.execute("COMMIT")
                    with observer.transaction():
                        observer.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                        fresh = collect(observer, catalog, "bookings", ["b1"], schema="scope_projection")
                    check("mapping:fresh-snapshot-hash-changes", fresh["commitment"] != first["commitment"])
                    check("mapping:only-bound-rows", [(r["table"], r["id"]) for r in fresh["records"]], [("bookings", "b1"), ("evidence", "e1")])
                    check("mapping:json-phone-reference-coverage-explicitly-unresolved", bool(fresh["unresolved"]))
                    check("mapping:provider-not-inferred", fresh["completeProviderInventory"], False)
                    check("mapping:deletion-not-enabled", fresh["productionDeletion"], False)
                witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["pidFileExists"] = (server.data / "postmaster.pid").exists()
        witness["counts"] = {"assertions": len(witness["checks"]), "passed": sum(c["pass"] for c in witness["checks"])}
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "witness.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], **witness["counts"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
