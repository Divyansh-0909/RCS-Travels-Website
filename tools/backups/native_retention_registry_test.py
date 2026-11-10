"""Actual restricted logins, overlapping holds and local cleanup/restore fences."""
import hashlib
import json
from pathlib import Path
import sys
import uuid

from psycopg import sql

from native_postgres import NativePostgres
from retention_backup_index import reconcile_restore, snapshot_index

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-retention-integration-2026-10-22"


def main():
    files = [Path(__file__)] + [ROOT / "tools/backups" / p for p in ["retention_registry.sql", "retention_backup_index.py", "retention_provider_inventory.py", "native_postgres.py"]]
    files += [ROOT / "tools/phase9d" / p for p in ["management-retention.sql", "management-hold-guards.sql"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins, "boundary": "Real synthetic SQL logins and persisted bridge/guards; not Rajuddin's deployed account, production policy approval or remote provider hold proof"}
    server = NativePostgres()

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    def denial(name, callback, expected="42501"):
        try:
            callback()
        except Exception as error:
            actual = getattr(error, "sqlstate", None)
        else:
            actual = "UNEXPECTED_SUCCESS"
        check(name, actual, expected)

    try:
        with server:
            witness["environment"] = server.identity
            passwords = {n: uuid.uuid4().hex for n in ["rr_proprietor", "rr_operator"]}
            with server.connect(autocommit=True) as admin:
                admin.execute("CREATE ROLE rr_owner NOLOGIN; GRANT CREATE ON DATABASE postgres TO rr_owner", prepare=False)
                for role, password in passwords.items():
                    admin.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
                admin.execute("SET ROLE rr_owner")
                for path in [files[1], files[-2], files[-1]]:
                    admin.execute(path.read_text(encoding="utf-8-sig"), prepare=False)
                admin.execute("""INSERT INTO retention_registry.configuration VALUES(true,'rr_proprietor','rr_operator',false);
INSERT INTO retention9d.configuration VALUES(true,'source',false,64);
CREATE SCHEMA outbox9d;CREATE TABLE outbox9d.deliveries(id bigint PRIMARY KEY,payload jsonb,status text);
INSERT INTO outbox9d.deliveries VALUES(1,'{"synthetic":true}','ACKED');
CREATE TRIGGER held_payload BEFORE UPDATE OR DELETE ON outbox9d.deliveries FOR EACH ROW EXECUTE FUNCTION retention9d.guard_retained_row('id','payload');
REVOKE ALL ON outbox9d.deliveries FROM PUBLIC;
GRANT USAGE ON SCHEMA retention_registry TO rr_operator,rr_proprietor;
GRANT EXECUTE ON FUNCTION retention_registry.register_copy(text,text,text,text,text,bigint),retention_registry.seal_inventory(text,bigint,text[]),retention_registry.restore_decision(text,bigint) TO rr_operator;
GRANT EXECUTE ON FUNCTION retention_registry.decide_hold(uuid,text,uuid,boolean,bigint,text,text) TO rr_proprietor,rr_operator;
RESET ROLE;""", prepare=False)
                scope = "synthetic-scope-" + uuid.uuid4().hex
                admin.execute("INSERT INTO retention9d.resources VALUES(%s,'fixture','identity',repeat('a',64),true,true,'MINIMIZE_PAYLOAD',now(),0,false,false)", (scope,))
                admin.execute("INSERT INTO retention9d.guarded_rows VALUES(%s,'outbox9d.deliveries','1')", (scope,))
                with server.connect(user="rr_operator", password=passwords["rr_operator"], autocommit=True) as operator, server.connect(user="rr_proprietor", password=passwords["rr_proprietor"], autocommit=True) as proprietor:
                    check("authenticated-operator", operator.execute("SELECT session_user").fetchone()[0], "rr_operator")
                    check("authenticated-proprietor", proprietor.execute("SELECT session_user").fetchone()[0], "rr_proprietor")
                    epoch = 0
                    for copy_id, kind in [("sql", "SQL_ROWS"), ("object-generation", "GCS_GENERATION"), ("cipher-backup", "ENCRYPTED_BACKUP")]:
                        result = operator.execute("SELECT retention_registry.register_copy(%s,%s,%s,%s,'PRESENT',%s)", (scope, copy_id, kind, "a" * 64, epoch)).fetchone()[0]
                        epoch = result["epoch"]
                        check(copy_id + ":registered", result["status"], "RECORDED")
                    check("inventory:incomplete-refused", operator.execute("SELECT retention_registry.seal_inventory(%s,%s,ARRAY['sql'])", (scope, epoch)).fetchone()[0]["status"], "INCOMPLETE_COPY_SET")
                    check("inventory:exact-declared", operator.execute("SELECT retention_registry.seal_inventory(%s,%s,ARRAY['sql','object-generation','cipher-backup'])", (scope, epoch)).fetchone()[0]["status"], "DECLARED")
                    check("copy:identity-binding-immutable", operator.execute("SELECT retention_registry.register_copy(%s,'sql','SQL_ROWS',%s,'PRESENT',%s)", (scope, "b" * 64, epoch)).fetchone()[0]["status"], "COPY_ID_CONFLICT")
                    op1, hold1 = uuid.uuid4(), uuid.uuid4()

                    def hold(c, op, identity, release, expected, document="d" * 64):
                        return c.execute("SELECT retention_registry.decide_hold(%s,%s,%s,%s,%s,'synthetic-owner-review',%s)", (op, scope, identity, release, expected, document)).fetchone()[0]

                    denial("operator:cannot-place-even-with-fixture-execute", lambda: hold(operator, op1, hold1, False, epoch))
                    denial("proprietor:cannot-edit-audit-table", lambda: proprietor.execute("DELETE FROM retention_registry.audit"))
                    check("hold:stale-CAS", hold(proprietor, op1, hold1, False, epoch-1)["status"], "STALE")
                    check("hold:approval-hash-required", hold(proprietor, op1, hold1, False, epoch, "bad")["status"], "INVALID")
                    first = hold(proprietor, op1, hold1, False, epoch)
                    check("hold:first", first["status"], "HELD")
                    check("hold:exact-operation-replay", hold(proprietor, op1, hold1, False, epoch), first)
                    check("hold:operation-conflict", hold(proprietor, op1, uuid.uuid4(), False, epoch)["status"], "OPERATION_CONFLICT")
                    epoch = first["epoch"]
                    check("bridge:actual-local-resource-held", admin.execute("SELECT held FROM retention9d.resources WHERE scope=%s", (scope,)).fetchone()[0])
                    denial("guard:held-cleanup-refused", lambda: admin.execute("UPDATE outbox9d.deliveries SET payload=NULL WHERE id=1"), "55000")
                    second_hold = uuid.uuid4()
                    second = hold(proprietor, uuid.uuid4(), second_hold, False, epoch)
                    epoch = second["epoch"]
                    check("hold:two-active", second["activeHolds"], 2)
                    released_one = hold(proprietor, uuid.uuid4(), hold1, True, epoch)
                    epoch = released_one["epoch"]
                    check("release:one-does-not-clear-other", released_one["status"], "HELD")
                    check("bridge:still-held", admin.execute("SELECT held FROM retention9d.resources WHERE scope=%s", (scope,)).fetchone()[0])
                    check("release:wrong-hold-id", hold(proprietor, uuid.uuid4(), uuid.uuid4(), True, epoch)["status"], "RELEASE_MISMATCH")
                    denial("operator:cannot-release", lambda: hold(operator, uuid.uuid4(), second_hold, True, epoch))
                    last = hold(proprietor, uuid.uuid4(), second_hold, True, epoch)
                    epoch = last["epoch"]
                    check("release:explicit-final-review-required", last["status"], "RELEASED_REVIEW_REQUIRED")
                    with admin.transaction():
                        admin.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                        old_index = snapshot_index(admin)
                    admin.execute("UPDATE outbox9d.deliveries SET payload=NULL WHERE id=1")
                    check("guard:cleanup-retains-tombstone", admin.execute("SELECT tombstone FROM retention9d.resources WHERE scope=%s", (scope,)).fetchone()[0])
                    operator.execute("SELECT retention_registry.register_copy(%s,'sql','SQL_ROWS',%s,'PURGED',%s)", (scope, "a" * 64, epoch))
                    late_id = uuid.uuid4()
                    late = hold(proprietor, uuid.uuid4(), late_id, False, epoch)
                    epoch = late["epoch"]
                    check("late-hold:manual-review-durable", late["manualReview"])
                    check("late-hold:no-erased-payload-recovery", admin.execute("SELECT payload IS NULL FROM outbox9d.deliveries WHERE id=1").fetchone()[0])
                    restored = reconcile_restore(admin, old_index)
                    check("backup:old-snapshot-current-hold-detected", restored["decisions"]["heldCount"], 1)
                    check("backup:old-snapshot-stale-epoch", restored["decisions"]["staleEpochCount"], 1)
                    check("backup:traffic-remains-quarantined", restored["trafficReleaseAuthorized"], False)
                    check("backup:authority-absent-quarantined", reconcile_restore(None, old_index)["authorityChecked"], False)
                    hold(proprietor, uuid.uuid4(), late_id, True, epoch)
                    denial("restore:payload-tombstone-still-fenced-after-release", lambda: admin.execute("UPDATE outbox9d.deliveries SET payload='{}' WHERE id=1"), "55000")
                    check("audit:actual-session-actors-only", set(r[0] for r in admin.execute("SELECT DISTINCT actor FROM retention_registry.audit")), {"rr_operator", "rr_proprietor"})
                    check("production:constraint-remains-disabled", admin.execute("SELECT production_deletion FROM retention_registry.configuration").fetchone()[0], False)
                    witness["catalog"] = [{"name": name, "sha256": hashlib.sha256(definition.encode()).hexdigest(), "owner": owner, "settings": settings, "acl": acl} for name, definition, owner, settings, acl in admin.execute("SELECT proname,pg_get_functiondef(oid),proowner::regrole::text,proconfig,proacl::text FROM pg_proc WHERE pronamespace='retention_registry'::regnamespace ORDER BY proname")]
                    witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "registry-final2.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=lambda x: sorted(x) if isinstance(x, set) else str(x))
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
