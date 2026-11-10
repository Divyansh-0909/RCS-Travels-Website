"""Real Prisma/account and original outbox cleanup under optional synthetic hold gates."""
import hashlib
import json
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
from native_postgres import NativePostgres
from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-retention-enforcement-2026-10-31/native"
sys.path.insert(0, str(ROOT / "tools/phase9d"))
import native_sql_metadata_fixture as fixture

GATE = ROOT / "tools/backups/application_retention_gate.sql"


def main():
    files = [Path(__file__), GATE, ROOT / "tools/backups/native_postgres.py", ROOT / "tools/backups/retention_registry.sql",
             ROOT / "tools/phase9d/native_sql_metadata_fixture.py", ROOT / "backend/services/accountRetention.js",
             ROOT / "backend/tests/helpers/retentionAccountAction.mjs", ROOT / "backend/routes/users.js"] + [ROOT / "tools/phase9d" / n for n in fixture.FILES]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "checks": [], "sourceHashes": pins, "servers": [],
               "scope": "Actual Prisma service and original outbox SQL; minimal synthetic application projections, optional gates, no production install/provider deletion"}
    owned = []

    def check(name, actual, expected=True):
        witness["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    def new_server():
        server = NativePostgres()
        owned.append({"owner": server.owner, "data": str(server.data)})
        (OUT.parent / "owned-servers.json").write_text(json.dumps(owned), encoding="utf-8")
        return server

    def connect(server, database, role=None, password=None):
        return psycopg.connect(host="127.0.0.1", port=server.port, dbname=database, user=role or "proofloop_owner",
                               password=password or server.password, connect_timeout=5, sslmode="disable", autocommit=True,
                               options="-c statement_timeout=15000 -c lock_timeout=5000")

    def install_gate(admin, executor, policy):
        passwords = {r: uuid.uuid4().hex for r in ["cleanup_proprietor", "cleanup_operator"]}
        admin.execute("CREATE ROLE cleanup_owner NOLOGIN; GRANT CREATE ON DATABASE postgres TO cleanup_owner", prepare=False)
        for role, password in passwords.items():
            admin.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
        database = admin.execute("SELECT current_database()").fetchone()[0]
        admin.execute(sql.SQL("GRANT CREATE ON DATABASE {} TO cleanup_owner").format(sql.Identifier(database)))
        admin.execute("SET ROLE cleanup_owner")
        admin.execute((ROOT / "tools/backups/retention_registry.sql").read_text(encoding="utf-8-sig"), prepare=False)
        admin.execute(GATE.read_text(encoding="utf-8"), prepare=False)
        admin.execute("INSERT INTO retention_registry.configuration VALUES(true,'cleanup_proprietor','cleanup_operator',false)")
        admin.execute("INSERT INTO retention_cleanup.configuration(singleton,executor_logins,policy_hash) VALUES(true,%s,%s)", ([executor], policy))
        admin.execute("RESET ROLE")
        admin.execute(sql.SQL("GRANT USAGE ON SCHEMA retention_registry,retention_cleanup TO cleanup_proprietor,cleanup_operator,{}").format(sql.Identifier(executor)))
        admin.execute("GRANT EXECUTE ON FUNCTION retention_registry.register_copy(text,text,text,text,text,bigint),retention_registry.seal_inventory(text,bigint,text[]),retention_registry.restore_decision(text,bigint) TO cleanup_operator")
        admin.execute("GRANT EXECUTE ON FUNCTION retention_registry.decide_hold(uuid,text,uuid,boolean,bigint,text,text),retention_cleanup.review_cleanup(uuid,text,text,bigint,text,text) TO cleanup_proprietor")
        admin.execute(sql.SQL("GRANT EXECUTE ON FUNCTION retention_cleanup.begin_cleanup(text,text),retention_cleanup.queue_provider(text,text) TO {}").format(sql.Identifier(executor)))
        return passwords

    def enroll(admin, operator, scope, targets):
        epoch = 0
        for identity, kind in [("sql", "SQL_ROWS"), ("backup", "ENCRYPTED_BACKUP"), ("provider", "PROVIDER_COPY")]:
            decision = operator.execute("SELECT retention_registry.register_copy(%s,%s,%s,%s,'PRESENT',%s)", (scope, identity, kind, "a" * 64, epoch)).fetchone()[0]
            epoch = decision["epoch"]
        operator.execute("SELECT retention_registry.seal_inventory(%s,%s,ARRAY['sql','backup','provider'])", (scope, epoch))
        for relation, identity in targets:
            admin.execute("INSERT INTO retention_cleanup.targets VALUES(%s,%s,%s)", (scope, relation, identity))
        return epoch

    def review(proprietor, scope, epoch, action):
        return proprietor.execute("SELECT retention_cleanup.review_cleanup(%s,%s,%s,%s,'synthetic-owner-review',%s)", (uuid.uuid4(), scope, action, epoch, "d" * 64)).fetchone()[0]

    def hold(proprietor, scope, identity, epoch, release=False):
        return proprietor.execute("SELECT retention_registry.decide_hold(%s,%s,%s,%s,%s,'synthetic-owner-hold',%s)", (uuid.uuid4(), scope, identity, release, epoch, "e" * 64)).fetchone()[0]

    try:
        server = new_server()
        try:
            with server:
                database = "retention_cleanup_lab_" + uuid.uuid4().hex
                with server.connect(autocommit=True) as root:
                    root.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
                app_password = uuid.uuid4().hex
                with connect(server, database) as admin:
                    admin.execute(sql.SQL("CREATE ROLE cleanup_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}").format(sql.Literal(app_password)))
                    admin.execute("""CREATE TYPE public."BookingStatus" AS ENUM('pending','payment_pending','confirmed','assigned','en_route','reached','started','completed','cancelled','no_driver');
CREATE TABLE users(id text PRIMARY KEY,clerk_id text UNIQUE NOT NULL,phone text UNIQUE NOT NULL,booking_code text UNIQUE NOT NULL,
 name text,gender text,dob text,"emergencyContact" text,whatsapp_number text,deleted_at timestamptz);
CREATE TABLE saved_places(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),label text NOT NULL,address text NOT NULL);
CREATE TABLE bookings(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),status public."BookingStatus" NOT NULL,fare numeric NOT NULL);
INSERT INTO users VALUES('u1','synthetic-clerk-1','synthetic-phone','1111','Synthetic Name','synthetic','synthetic','synthetic',NULL,NULL);
INSERT INTO users VALUES('u2','synthetic-clerk-2','foreign-synthetic-phone','2222','Foreign synthetic',NULL,NULL,NULL,NULL,NULL);
INSERT INTO saved_places VALUES('p1','u1','Synthetic Home','Synthetic address');
INSERT INTO saved_places VALUES('p2','u2','Foreign place','Foreign synthetic address');
INSERT INTO bookings VALUES('b1','u1','completed',100);
GRANT USAGE ON SCHEMA public TO cleanup_app;
GRANT SELECT ON users,saved_places,bookings TO cleanup_app;GRANT UPDATE ON users TO cleanup_app;GRANT DELETE ON saved_places TO cleanup_app;""", prepare=False)
                    child_config = server.root / "account-action.private.json"

                    def action(kind="account", place="p1"):
                        child_config.write_text(json.dumps({"owner": server.owner, "host": "127.0.0.1", "port": server.port, "database": database,
                                                            "user": "cleanup_app", "password": app_password, "action": kind, "clerkId": "synthetic-clerk-1", "placeId": place}), encoding="utf-8")
                        result = subprocess.run(["node", str(ROOT / "backend/tests/helpers/retentionAccountAction.mjs"), str(child_config)], cwd=ROOT,
                                                env=server.env, capture_output=True, text=True, timeout=25, check=False)
                        if result.returncode:
                            raise RuntimeError("OWNED_PRISMA_CHILD_FAILED")
                        return json.loads(result.stdout)

                    def snapshot():
                        return {"user": admin.execute("SELECT to_jsonb(u) FROM users u WHERE id='u1'").fetchone()[0], "places": admin.execute("SELECT count(*) FROM saved_places WHERE user_id='u1'").fetchone()[0],
                                "booking": admin.execute("SELECT id,user_id,status::text,fare::text FROM bookings").fetchall()}

                    original = snapshot()
                    check("account:missing-registry-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                    check("account:missing-registry-no-write", snapshot(), original)
                    passwords = install_gate(admin, "cleanup_app", "b" * 64)
                    admin.execute("GRANT SELECT,UPDATE ON users,saved_places TO cleanup_owner")
                    admin.execute("CREATE TRIGGER retention_account BEFORE UPDATE OF deleted_at ON users FOR EACH ROW WHEN(NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) EXECUTE FUNCTION retention_cleanup.guard_cleanup()")
                    admin.execute("CREATE TRIGGER retention_place BEFORE DELETE ON saved_places FOR EACH ROW EXECUTE FUNCTION retention_cleanup.guard_cleanup()")
                    with connect(server, database, "cleanup_operator", passwords["cleanup_operator"]) as operator, connect(server, database, "cleanup_proprietor", passwords["cleanup_proprietor"]) as proprietor:
                        scope = "account:u1"
                        epoch = enroll(admin, operator, scope, [("public.users", "u1"), ("public.saved_places", "p1")])
                        check("account:default-disabled", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        check("account:default-disabled-no-write", snapshot(), original)
                        admin.execute("UPDATE retention_cleanup.configuration SET enabled=true")
                        check("account:unreviewed-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        check("account:current-review", review(proprietor, scope, epoch, "ACCOUNT_DELETE")["status"], "REVIEWED")
                        admin.execute("UPDATE retention_cleanup.configuration SET policy_hash=repeat('c',64)")
                        check("account:policy-version-change-stales-review", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        admin.execute("UPDATE retention_cleanup.configuration SET policy_hash=repeat('b',64)")
                        admin.execute("UPDATE retention_registry.scopes SET inventory_complete=false WHERE scope=%s", (scope,))
                        check("account:incomplete-inventory-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        check("account:incomplete-no-write", snapshot(), original)
                        operator.execute("SELECT retention_registry.seal_inventory(%s,%s,ARRAY['sql','backup','provider'])", (scope, epoch))
                        admin.execute("UPDATE retention_registry.copies SET observed_at=clock_timestamp()-interval '301 seconds' WHERE copy_id='provider'")
                        check("account:stale-copy-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        admin.execute("UPDATE retention_registry.copies SET observed_at=clock_timestamp()")
                        admin.execute("UPDATE retention_registry.copies SET state='UNKNOWN' WHERE copy_id='provider'")
                        check("account:unknown-copy-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        admin.execute("UPDATE retention_registry.copies SET state='PRESENT'")
                        one, two = uuid.uuid4(), uuid.uuid4()
                        epoch = hold(proprietor, scope, one, epoch)["epoch"]
                        epoch = hold(proprietor, scope, two, epoch)["epoch"]
                        check("account:overlapping-holds-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        check("account:held-no-profile-place-or-history-change", snapshot(), original)
                        epoch = hold(proprietor, scope, one, epoch, True)["epoch"]
                        check("account:one-release-still-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        epoch = hold(proprietor, scope, two, epoch, True)["epoch"]
                        check("account:released-old-review-stale", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        check("account:fresh-proprietor-review", review(proprietor, scope, epoch, "ACCOUNT_DELETE")["status"], "REVIEWED")
                        admin.execute("UPDATE users SET name='Changed synthetic name' WHERE id='u1'")
                        check("account:changed-row-manifest-refused", action()["code"], "RETENTION_REVIEW_REQUIRED")
                        admin.execute("UPDATE users SET name='Synthetic Name' WHERE id='u1'")
                        admin.execute("UPDATE bookings SET status='started'")
                        check("account:active-ride-refused", action()["code"], "ACTIVE_RIDE")
                        check("account:active-ride-preserves-places", admin.execute("SELECT count(*) FROM saved_places WHERE user_id='u1'").fetchone()[0], 1)
                        admin.execute("UPDATE bookings SET status='completed'")
                        # Inject a local constraint rejection after saved-place deletion.
                        admin.execute("CREATE FUNCTION synthetic_reject_profile() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_ROLLBACK' USING ERRCODE='23514';END$$; CREATE TRIGGER z_synthetic_reject BEFORE UPDATE OF deleted_at ON users FOR EACH ROW EXECUTE FUNCTION synthetic_reject_profile()", prepare=False)
                        marker_before = (server.root / "server.private.log").read_text(encoding="utf-8", errors="replace").count("SYNTHETIC_ROLLBACK")
                        check("account:late-constraint-rejection", action()["status"], "ERROR")
                        check("account:actual-injected-23514-marker-observed", (server.root / "server.private.log").read_text(encoding="utf-8", errors="replace").count("SYNTHETIC_ROLLBACK") > marker_before)
                        check("account:whole-local-transaction-rolled-back", snapshot(), original)
                        check("account:rollback-no-provider-action", admin.execute("SELECT count(*) FROM retention_cleanup.provider_actions").fetchone()[0], 0)
                        admin.execute("DROP TRIGGER z_synthetic_reject ON users")
                        check("saved-place:missing-separate-review-refused", action("place")["code"], "RETENTION_REVIEW_REQUIRED")
                        check("saved-place:explicit-review", review(proprietor, scope, epoch, "SAVED_PLACE_DELETE")["status"], "REVIEWED")
                        check("saved-place:foreign-id-not-deleted", action("place", "p2")["code"], "PLACE_NOT_FOUND")
                        check("saved-place:foreign-row-retained", admin.execute("SELECT count(*) FROM saved_places WHERE id='p2'").fetchone()[0], 1)
                        check("saved-place:reviewed-own-delete-positive", action("place")["status"], "SUCCESS")
                        check("saved-place:other-account-profile-retained", admin.execute("SELECT name FROM users WHERE id='u2'").fetchone()[0], "Foreign synthetic")
                        # Restore this one owned fixture row; no product restore API.
                        admin.execute("INSERT INTO saved_places VALUES('p1','u1','Synthetic Home','Synthetic address')")
                        admin.execute("INSERT INTO saved_places VALUES('p3','u1','New unmapped place','Synthetic changed scope')")
                        marker_before = (server.root / "server.private.log").read_text(encoding="utf-8", errors="replace").count("CLEANUP_TARGET_INVENTORY_REQUIRED")
                        check("account:new-unmapped-child-rolls-back-cleanup", action()["status"], "ERROR")
                        check("account:actual-55000-scope-marker-observed", (server.root / "server.private.log").read_text(encoding="utf-8", errors="replace").count("CLEANUP_TARGET_INVENTORY_REQUIRED") > marker_before)
                        check("account:new-child-retained-after-rollback", admin.execute("SELECT count(*) FROM saved_places WHERE user_id='u1'").fetchone()[0], 2)
                        # Remove that unexpected synthetic target only through a
                        # bounded fixture-owner trigger suspension, then restore.
                        admin.execute("ALTER TABLE saved_places DISABLE TRIGGER retention_place")
                        try:
                            admin.execute("DELETE FROM saved_places WHERE id='p3'")
                        finally:
                            admin.execute("ALTER TABLE saved_places ENABLE TRIGGER retention_place")
                        # No valid permit can survive into a later SQL transaction.
                        with connect(server, database, "cleanup_app", app_password) as app:
                            check("permit:autocommit-only-grants-current-transaction", app.execute("SELECT retention_cleanup.begin_cleanup(%s,'SAVED_PLACE_DELETE')", (scope,)).fetchone()[0]["status"], "ALLOWED_SYNTHETIC_LOCAL_ONLY")
                            try:
                                app.execute("DELETE FROM saved_places WHERE id='p1'")
                            except psycopg.Error as error:
                                state = error.sqlstate
                            else:
                                state = "UNEXPECTED_SUCCESS"
                            check("permit:later-transaction-refused", state, "55000")
                        check("account:positive-local-cleanup", action()["status"], "SUCCESS")
                        check("account:profile-minimized", admin.execute("SELECT deleted_at IS NOT NULL AND name IS NULL AND \"emergencyContact\" IS NULL AND phone='deleted:u1' AND clerk_id='deleted:u1' FROM users WHERE id='u1'").fetchone()[0])
                        check("account:places-removed", admin.execute("SELECT count(*) FROM saved_places WHERE user_id='u1'").fetchone()[0], 0)
                        check("account:foreign-saved-place-retained", admin.execute("SELECT count(*) FROM saved_places WHERE user_id='u2'").fetchone()[0], 1)
                        check("account:ride-and-finance-history-retained", snapshot()["booking"], original["booking"])
                        check("provider:durable-pending-not-executed", admin.execute("SELECT state FROM retention_cleanup.provider_actions").fetchone()[0], "WAITING_PROVIDER_REVIEW")
                        check("production:gate-constraint-disabled", admin.execute("SELECT production_deletion FROM retention_cleanup.configuration").fetchone()[0], False)
                        witness["accountGateCatalog"] = [{"name": n, "definitionSha256": hashlib.sha256(d.encode()).hexdigest(), "owner": owner, "securityDefiner": security, "paths": paths, "acl": acl} for n, d, owner, security, paths, acl in admin.execute("SELECT proname,pg_get_functiondef(oid),proowner::regrole::text,prosecdef,proconfig,proacl::text FROM pg_proc WHERE pronamespace='retention_cleanup'::regnamespace ORDER BY proname")]
        finally:
            witness["servers"].append({"owner": server.owner, "identity": getattr(server, "identity", None), "stopped": server.stopped, "pidExists": (server.data / "postmaster.pid").exists()})

        server = new_server()
        try:
            with server:
                database = "retention_cleanup_lab_" + uuid.uuid4().hex
                with server.connect(autocommit=True) as root:
                    root.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
                with connect(server, database) as admin:
                    identities = fixture.install(admin, "source")
                    passwords = install_gate(admin, "shadow9d_ops", "b" * 64)
                    admin.execute("GRANT USAGE ON SCHEMA outbox9d TO cleanup_owner; GRANT SELECT,UPDATE ON outbox9d.deliveries TO cleanup_owner", prepare=False)
                    definition_before = admin.execute("SELECT pg_get_functiondef('outbox9d.delete_payload(bigint)'::regprocedure)").fetchone()[0]
                    # Bounded trusted seeds test the actual original cleanup routine.
                    admin.execute("INSERT INTO shadow9d.work(logical_key,snapshot,evidence_hash,provenance,status,created_at) VALUES(repeat('f',64),NULL,repeat('a',64),repeat('b',64),'MANUAL_REVIEW',clock_timestamp()) RETURNING id")
                    work = admin.execute("SELECT id FROM shadow9d.work").fetchone()[0]
                    # Retained delivery columns are taken from the real declaration.
                    admin.execute("INSERT INTO outbox9d.deliveries(source_work_id,source_binding,status,receiver_id,payload,created_at) VALUES('synthetic-work',repeat('c',64),'ACKED',%s,'{\"synthetic\":true}',clock_timestamp()) RETURNING id", (work,))
                    delivery = admin.execute("SELECT id FROM outbox9d.deliveries").fetchone()[0]
                    admin.execute("CREATE TRIGGER retention_outbox BEFORE UPDATE OF payload ON outbox9d.deliveries FOR EACH ROW WHEN(OLD.payload IS NOT NULL AND NEW.payload IS NULL) EXECUTE FUNCTION retention_cleanup.guard_cleanup()")
                    with connect(server, database, "cleanup_operator", passwords["cleanup_operator"]) as operator, connect(server, database, "cleanup_proprietor", passwords["cleanup_proprietor"]) as proprietor, connect(server, database, "shadow9d_ops", identities["shadow9d_ops"]) as ops:
                        scope = "pipeline:synthetic"
                        epoch = enroll(admin, operator, scope, [("outbox9d.deliveries", str(delivery))])
                        admin.execute("UPDATE retention_cleanup.configuration SET enabled=true")
                        check("pipeline:review", review(proprietor, scope, epoch, "PIPELINE_MINIMIZE")["status"], "REVIEWED")

                        def cleanup():
                            try:
                                with ops.transaction():
                                    decision = ops.execute("SELECT retention_cleanup.begin_cleanup(%s,'PIPELINE_MINIMIZE')", (scope,)).fetchone()[0]
                                    if decision["status"] != "ALLOWED_SYNTHETIC_LOCAL_ONLY":
                                        return decision["status"]
                                    return ops.execute("SELECT outbox9d.delete_payload(%s)", (delivery,)).fetchone()[0]
                            except psycopg.Error as error:
                                return error.sqlstate

                        hold_id = uuid.uuid4()
                        proprietor.execute("BEGIN")
                        hold(proprietor, scope, hold_id, epoch)
                        with ThreadPoolExecutor(max_workers=1) as pool:
                            pending = pool.submit(cleanup)
                            try:
                                deadline = time.monotonic() + 2
                                blocked = False
                                while time.monotonic() < deadline:
                                    if proprietor.info.backend_pid in admin.execute("SELECT pg_blocking_pids(%s)", (ops.info.backend_pid,)).fetchone()[0]:
                                        blocked = True
                                        break
                                    time.sleep(0.02)
                                check("pipeline:actual-hold-lock-blocks-cleanup", blocked)
                            finally:
                                proprietor.execute("COMMIT")
                            check("pipeline:committed-hold-refuses-cleanup", pending.result(timeout=6), "HELD")
                        check("pipeline:held-payload-retained", admin.execute("SELECT payload IS NOT NULL FROM outbox9d.deliveries").fetchone()[0])
                        epoch += 1
                        epoch = hold(proprietor, scope, hold_id, epoch, True)["epoch"]
                        check("pipeline:released-stale-review-refused", cleanup(), "STALE_REVIEW")
                        review(proprietor, scope, epoch, "PIPELINE_MINIMIZE")
                        check("pipeline:actual-original-cleanup-positive", cleanup())
                        check("pipeline:payload-cleared-identity-retained", admin.execute("SELECT id=%s AND payload IS NULL FROM outbox9d.deliveries", (delivery,)).fetchone()[0])
                        check("pipeline:original-definition-unchanged", admin.execute("SELECT pg_get_functiondef('outbox9d.delete_payload(bigint)'::regprocedure)").fetchone()[0], definition_before)
                        witness["outboxDefinitionSha256"] = hashlib.sha256(definition_before.encode()).hexdigest()
            witness["status"] = "PASS"
        finally:
            witness["servers"].append({"owner": server.owner, "identity": getattr(server, "identity", None), "stopped": server.stopped, "pidExists": (server.data / "postmaster.pid").exists()})
    finally:
        witness["counts"] = {"assertions": len(witness["checks"]), "passed": sum(c["pass"] for c in witness["checks"])}
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "witness.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], **witness["counts"]}))


if __name__ == "__main__":
    main()
