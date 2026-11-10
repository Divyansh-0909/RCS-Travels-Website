"""Focused exact management capacity conditions, disposable source projection only."""
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

OUT = ROOT / "output/phase9d-open-gates-2026-10-22/capacity-conditions-final.json"


def main():
    paths = [Path(__file__), ROOT / "tools/backups/native_postgres.py", ROOT / "tools/phase9d/management-capacity.sql"]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    witness = {"sourceHashes": pins, "cases": [], "status": "FAIL", "profiling": False,
               "boundary": "Exact capacity SQL; source projection and trusted fixture reports for guard truth tables. No verified quota, production activation or three-node measurement authority is inferred."}
    server = NativePostgres()

    def check(name, actual, expected):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as c:
                c.execute("CREATE SCHEMA outbox9d; CREATE TABLE outbox9d.deliveries(status text); CREATE SCHEMA custody_lineage; CREATE TABLE custody_lineage.events(status text)", prepare=False)
                c.execute(paths[2].read_text(encoding="utf-8-sig"), prepare=False)
                c.execute("""INSERT INTO capacity9d.configuration(singleton,node,cluster_owner,budget,emergency_reserve,admission_bytes,max_operations,stale_seconds,physical_location,max_wal_growth)
VALUES(true,'source',false,1000000000000,100,10,100,60,'synthetic-not-a-quota',1000000000)""")
                c.execute("INSERT INTO capacity9d.global_configuration VALUES(true,false,1000,100,100,true)")
                cat = "SELECT proname,pg_get_functiondef(oid),proowner::regrole::text,proconfig,proacl::text FROM pg_proc WHERE pronamespace='capacity9d'::regnamespace ORDER BY proname"
                before = c.execute(cat).fetchall()
                size_before = c.execute("SELECT pg_database_size(current_database())").fetchone()[0]
                measured = c.execute("SELECT capacity9d.observe()").fetchone()[0]
                size_after = c.execute("SELECT pg_database_size(current_database())").fetchone()[0]
                # observe persists its own report/signals, allocating relation
                # pages. Physical size calls are not one immutable snapshot.
                witness["databaseSizeWindow"] = {"before": size_before, "observed": measured["database_bytes"], "after": size_after}
                check("measure:current-database-size-window", size_before <= measured["database_bytes"] <= size_after, True)
                check("measure:noncluster-owner-no-wal-double-count", measured["wal_bytes"], 0)
                check("measure:noncluster-owner-no-temp-double-count", measured["temp_bytes"], 0)
                check("measure:explicit-boundary", measured["coverage"], "CATALOG_PLUS_DECLARED_EXTERNAL_NOT_VOLUME_QUOTA")
                check("measure:unverified-infrastructure-signal", c.execute("SELECT count(*) FROM capacity9d.signals WHERE reason='INFRASTRUCTURE_UNVERIFIED'").fetchone()[0], 1)
                c.execute("INSERT INTO outbox9d.deliveries VALUES('PENDING'),('PROCESSING'),('RETRYABLE'),('ACKED'),('MANUAL_REVIEW'); INSERT INTO custody_lineage.events VALUES('PENDING'),('REVIEW'),('ACKED')", prepare=False)
                check("measure:source-plus-lineage-pending", c.execute("SELECT capacity9d.observe()->>'pending'").fetchone()[0], "5")
                c.execute("UPDATE capacity9d.configuration SET external_bytes=99")
                check("measure:external-not-double-counted", c.execute("SELECT (capacity9d.observe())->>'external_bytes'").fetchone()[0], "99")
                check("measure:external-growth-signal", c.execute("SELECT count(*) FROM capacity9d.signals WHERE reason='EXTERNAL_GROWTH'").fetchone()[0], 1)
                check("signal:known-ack", c.execute("SELECT capacity9d.ack_signal('EXTERNAL_GROWTH')").fetchone()[0], True)
                c.execute("SELECT capacity9d.signal('EXTERNAL_GROWTH','WARNING')")
                check("signal:new-occurrence-clears-ack", c.execute("SELECT ack_actor IS NULL AND ack_at IS NULL AND occurrences=2 FROM capacity9d.signals WHERE reason='EXTERNAL_GROWTH'").fetchone()[0], True)
                check("signal:missing-ack", c.execute("SELECT capacity9d.ack_signal('missing')").fetchone()[0], False)

                def local(op, cost, kind):
                    return c.execute("SELECT capacity9d.reserve(%s,%s,%s)->>'status'", (op, cost, kind)).fetchone()[0]

                def global_status(op, costs):
                    return c.execute("SELECT capacity9d.global_reserve(%s,%s)->>'status'", (op, None if costs is None else Jsonb(costs))).fetchone()[0]

                for op, cost, kind in [(None, 1, "NORMAL"), ("x" * 201, 1, "NORMAL"), ("x", None, "NORMAL"), ("x", 0, "NORMAL"), ("x", -1, "NORMAL"), ("x", 1, None), ("x", 1, "other")]:
                    check("local:invalid:" + str((op, cost, kind)), local(op, cost, kind), "INVALID")
                check("local:disabled", local("disabled", 1, "NORMAL"), "DISABLED")
                # The report edits below are explicit owner-side condition
                # probes, not claims that these numbers came from storage.
                c.execute("UPDATE capacity9d.configuration SET enabled=true,budget=1000,emergency_reserve=100,external_complete=true,quota_verified=true")
                c.execute("UPDATE capacity9d.measurement SET measured_bytes=100,pending=0,at=clock_timestamp()")
                costs = {"source": 100, "receiver": 100, "custodian": 100}
                check("global:disabled", global_status("disabled", costs), "DISABLED")
                c.execute("UPDATE capacity9d.global_configuration SET enabled=true")
                variants = [("sql-null", None), ("scalar", "bad"), ("array", []), ("extra", dict(costs, extra=1))]
                for key in costs:
                    missing = copy.deepcopy(costs)
                    del missing[key]
                    variants.append(("missing:" + key, missing))
                    for value in [None, True, "1", 0, -1, 1.5, 1000000000000]:
                        variants.append((key + ":" + repr(value), dict(costs, **{key: value})))
                for label, value in variants:
                    check("global:invalid:" + label, global_status("invalid", value), "INVALID")
                for op in [None, "x" * 151]:
                    check("global:invalid-operation:" + str(op), global_status(op, costs), "INVALID")
                check("global:missing-report", global_status("missing", costs), "GLOBAL_STALE_MEASUREMENT")
                c.execute("INSERT INTO capacity9d.global_measurement VALUES(true,clock_timestamp(),100,true,'{\"fixture\":true}')")

                probes = [
                    ("local:stale", "UPDATE capacity9d.measurement SET at=clock_timestamp()-interval '61 seconds'", lambda: local("stale", 1, "NORMAL"), "STALE_MEASUREMENT"),
                    ("local:incomplete-external", "UPDATE capacity9d.configuration SET external_complete=false", lambda: local("external", 1, "NORMAL"), "INFRASTRUCTURE_UNVERIFIED"),
                    ("local:quota-required", "UPDATE capacity9d.configuration SET quota_verified=false", lambda: local("quota", 1, "NORMAL"), "INFRASTRUCTURE_UNVERIFIED"),
                    ("local:backlog-equality", "UPDATE capacity9d.measurement SET pending=1000", lambda: local("backlog", 1, "NORMAL"), "BACKLOG_REFUSED"),
                    ("local:stop-bypasses-backlog", "UPDATE capacity9d.measurement SET pending=1000", lambda: local("stop", 1, "STOP"), "RESERVED"),
                    ("local:normal-boundary", "SELECT 1", lambda: local("normal-edge", 800, "NORMAL"), "RESERVED"),
                    ("local:normal-over-boundary", "SELECT 1", lambda: local("normal-over", 801, "NORMAL"), "CAPACITY_REFUSED"),
                    ("local:stop-boundary", "SELECT 1", lambda: local("stop-edge", 900, "STOP"), "RESERVED"),
                    ("local:stop-over-boundary", "SELECT 1", lambda: local("stop-over", 901, "STOP"), "CAPACITY_REFUSED"),
                    ("global:stale", "UPDATE capacity9d.global_measurement SET at=clock_timestamp()-interval '301 seconds'", lambda: global_status("stale", costs), "GLOBAL_STALE_MEASUREMENT"),
                    ("global:quota", "UPDATE capacity9d.global_measurement SET quota_verified=false", lambda: global_status("quota", costs), "GLOBAL_INFRASTRUCTURE_UNVERIFIED"),
                    ("global:boundary", "UPDATE capacity9d.global_measurement SET measured_bytes=600", lambda: global_status("edge", costs), "RESERVED"),
                    ("global:over-boundary", "UPDATE capacity9d.global_measurement SET measured_bytes=601", lambda: global_status("over", costs), "GLOBAL_CAPACITY_REFUSED"),
                ]
                for label, setup, action, expected in probes:
                    c.execute("BEGIN")
                    try:
                        c.execute(setup)
                        check(label, action(), expected)
                    finally:
                        c.execute("ROLLBACK")
                for label, reserve, release in [
                    ("local", lambda op: local(op, 10, "NORMAL"), lambda op: c.execute("SELECT capacity9d.release(%s)", (op,)).fetchone()[0]),
                    ("global", lambda op: global_status(op, costs), lambda op: c.execute("SELECT capacity9d.global_release(%s)", (op,)).fetchone()[0])]:
                    check(label + ":new", reserve("idempotent"), "RESERVED")
                    check(label + ":duplicate", reserve("idempotent"), "RESERVED")
                    check(label + ":release", release("idempotent"), True)
                    check(label + ":release-duplicate", release("idempotent"), False)
                    check(label + ":released-id-not-reopened", reserve("idempotent"), "CONFLICT")
                    check(label + ":missing-release", release("missing"), False)
                c.execute("UPDATE capacity9d.configuration SET max_operations=1; UPDATE capacity9d.global_configuration SET max_operations=1", prepare=False)
                check("local:released-ledger-still-bounded", local("new", 1, "NORMAL"), "LEDGER_LIMIT")
                check("global:released-ledger-still-bounded", global_status("new", costs), "GLOBAL_LEDGER_LIMIT")
                check("catalog:unchanged", c.execute(cat).fetchall() == before, True)
                witness["definitions"] = [{"name": r[0], "definitionSha256": hashlib.sha256(r[1].encode()).hexdigest(), "owner": r[2], "settings": r[3], "acl": r[4]} for r in before]
                witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with OUT.open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    main()
