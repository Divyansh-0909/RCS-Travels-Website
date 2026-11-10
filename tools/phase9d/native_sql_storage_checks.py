"""Required-chain NULLs, omission precedence and composed retry SQL boundaries.

No routine replacement, profiler, Docker or hosted connection. Before/after
phases retain separate source-bound witnesses, including the original failures.
"""
import hashlib
import json
import os
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres
from native_sql_metadata_fixture import FILES, catalog, install

BASE = ROOT / "output/phase9d-native-sql-storage-2026-10-31"


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    phase = os.environ.get("RCS_SQL_PHASE", "before")
    if phase not in ["before", "baseline", "after"]:
        raise ValueError("PHASE_INVALID")
    out = BASE / ("sql-" + phase)
    if (out / "witness.json").exists():
        raise RuntimeError("FRESH_WITNESS_REQUIRED")
    pins = {str(p.relative_to(ROOT)): digest(p) for p in [Path(__file__), ROOT / "tools/backups/native_postgres.py", ROOT / "tools/phase9d/native_sql_metadata_fixture.py"] + [ROOT / "tools/phase9d" / n for n in FILES]}
    witness = {"status": "FAIL", "phase": phase, "startedUtc": datetime.now(timezone.utc).isoformat(), "sourceHashes": pins, "checks": [], "compositions": [],
               "profiling": False, "routineReplacement": False, "boundary": "Synthetic owner integrity probes; no claim to prevent a trusted owner rewriting both original and captured history."}

    def check(name, actual, expected=True):
        witness["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})

    try:
        for kind in ["source", "receiver"]:
            server = NativePostgres()
            record = {"installation": kind, "fixtureOwner": server.owner}
            witness["compositions"].append(record)
            ledger = json.loads((BASE / "owned-servers.json").read_text()) if (BASE / "owned-servers.json").exists() else []
            ledger.append({"owner": server.owner, "data": str(server.data)})
            (BASE / "owned-servers.json").write_text(json.dumps(ledger, indent=2), encoding="utf-8")
            try:
                with server:
                    record["environment"] = server.identity
                    with server.connect(autocommit=True) as owner:
                        passwords = install(owner, kind)
                        record["catalogBefore"] = catalog(owner)
                        absence = owner.execute("SELECT current_setting('shared_preload_libraries'),current_setting('session_preload_libraries'),current_setting('local_preload_libraries'),EXISTS(SELECT FROM pg_extension WHERE extname='plpgsql_check')").fetchone()
                        check(kind + ":profiler-absent", absence, ("", "", "", False))
                        with server.connect(user="custody_lineage_inspector", password=passwords["custody_lineage_inspector"], autocommit=True) as inspector:
                            check(kind + ":actual-inspector", inspector.execute("SELECT session_user,current_user").fetchone(), ("custody_lineage_inspector", "custody_lineage_inspector"))

                            def status(connection=inspector):
                                with connection.transaction():
                                    connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                                    return connection.execute("SELECT custody_lineage.capture_status()").fetchone()[0]

                            with owner.transaction():
                                owner.execute("SET LOCAL ROLE shadow9d_owner")
                                seq = owner.execute("SELECT custody_lineage.emit('LOCAL_AUDIT','required-fields-probe',NULL,%s,'trusted_observer')", (Jsonb({"synthetic": True}),)).fetchone()[0]
                            event, original_hash = owner.execute("SELECT event,hash FROM custody_lineage.events WHERE seq=%s", (seq,)).fetchone()
                            check(kind + ":valid-chain", status()["status"], "CAPTURE_CONSISTENT")
                            for field in ["sequence", "source", "previous"]:
                                for shape in ["missing", "null", "wrong"]:
                                    changed = deepcopy(event)
                                    if shape == "missing":
                                        del changed[field]
                                    else:
                                        changed[field] = None if shape == "null" else {"sequence": "999", "source": str(uuid.uuid4()), "previous": "f" * 64}[field]
                                    h = owner.execute("SELECT encode(sha256(convert_to('custody-event-v1'||chr(10)||custody_lineage.serialize(%s),'UTF8')),'hex')", (Jsonb(changed),)).fetchone()[0]
                                    with owner.transaction():
                                        owner.execute("UPDATE custody_lineage.events SET event=%s,hash=%s WHERE seq=%s", (Jsonb(changed), h, seq))
                                        owner.execute("UPDATE custody_lineage.control SET head=%s", (h,))
                                    observed = status()
                                    check(kind + ":chain:" + field + ":" + shape, observed["status"], "CAPTURE_GAP")
                                    with owner.transaction():
                                        owner.execute("UPDATE custody_lineage.events SET event=%s,hash=%s WHERE seq=%s", (Jsonb(event), original_hash, seq))
                                        owner.execute("UPDATE custody_lineage.control SET head=%s", (original_hash,))
                                    check(kind + ":chain-restored:" + field + ":" + shape, status()["status"], "CAPTURE_CONSISTENT")
                            # Missing originals take precedence over existing deferral.
                            trigger = "custody_" + kind + "_audit"
                            with owner.transaction():
                                owner.execute(sql.SQL("ALTER TABLE audit9d.events DISABLE TRIGGER {}").format(sql.Identifier(trigger)))
                                owner.execute("INSERT INTO audit9d.events(identity,action,detail) VALUES(session_user,'SYNTHETIC_OMISSION','{}')")
                                owner.execute(sql.SQL("ALTER TABLE audit9d.events ENABLE TRIGGER {}").format(sql.Identifier(trigger)))
                                owner.execute("UPDATE custody_lineage.control SET deferred=1")
                            missing = status()
                            check(kind + ":missing-before-deferred", (missing["status"], missing["missingCommittedRows"], missing["deferredControlObservations"]), ("UNCAPTURED_COMMITTED_SOURCE", 1, 1))
                            # Trusted fixture control restoration, not a new
                            # recovery API: ordinary emit refuses while deferred.
                            owner.execute("UPDATE custody_lineage.control SET deferred=0")
                            with owner.transaction():
                                owner.execute("SET LOCAL ROLE shadow9d_owner")
                                count = owner.execute("SELECT custody_lineage.capture_existing()").fetchone()[0]
                            check(kind + ":backfill-inspected-count", count, 1)
                            owner.execute("UPDATE custody_lineage.control SET deferred=1")
                            check(kind + ":deferred-after-backfill", status()["status"], "DEFERRED_CAPTURE")
                            owner.execute("UPDATE custody_lineage.control SET deferred=0")
                            check(kind + ":post-observation-consistent", status()["status"], "CAPTURE_CONSISTENT")
                            check(kind + ":backfill-actor", owner.execute("SELECT event->>'actor' FROM custody_lineage.events ORDER BY seq DESC LIMIT 1").fetchone()[0], "trusted_observer")
                        if kind == "receiver":
                            with server.connect(user="broker9d_ops", password=passwords["broker9d_ops"], autocommit=True) as ops:
                                answer = ops.execute("SELECT broker9d.operate(%s,NULL,'STOP',0,'OPERATOR_STOP')", (uuid.uuid4(),)).fetchone()[0]
                                check("receiver:retry-real-capture", answer["status"], "APPLIED")
                            seq = owner.execute("SELECT min(seq) FROM custody_export.events").fetchone()[0]
                            with server.connect(user="custody_sender", password=passwords["custody_sender"], autocommit=True) as sender:
                                for _ in range(3):
                                    sender.execute("SELECT custody_export.next()")

                            def queue_state(connection=owner):
                                return connection.execute("SELECT (SELECT jsonb_agg(to_jsonb(e) ORDER BY seq) FROM custody_export.events e),(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM custody_export.retries r),(SELECT jsonb_agg(jsonb_build_array(seq,hash,status,receipt) ORDER BY seq) FROM custody_lineage.events)").fetchone()

                            with server.connect(user="custody_operator", password=passwords["custody_operator"], autocommit=True) as operator:
                                cases = [("null-operation", None, seq, 3, "23502"), ("null-expected", uuid.uuid4(), seq, None, "23502"),
                                         ("null-sequence", uuid.uuid4(), None, 3, False), ("negative-expected", uuid.uuid4(), seq, -1, False)]
                                for name, operation, number, expected, wanted in cases:
                                    before = queue_state()
                                    try:
                                        actual = operator.execute("SELECT custody_export.retry(%s::uuid,%s::bigint,%s::int)", (operation, number, expected)).fetchone()[0]
                                    except psycopg.Error as error:
                                        actual = error.sqlstate
                                    check("receiver:composed-retry:" + name, actual, wanted)
                                    check("receiver:composed-retry-stable:" + name, queue_state(), before)
                        record["catalogAfter"] = catalog(owner)
                        check(kind + ":catalog-unchanged", record["catalogAfter"], record["catalogBefore"])
            finally:
                record.update(stopped=server.stopped, pidFileExists=(server.data / "postmaster.pid").exists())
            check(kind + ":owned-server-stopped", record["stopped"] and not record["pidFileExists"])
        witness["status"] = "PASS" if all(c["pass"] for c in witness["checks"]) else "RED"
    finally:
        witness["counts"] = {"assertions": len(witness["checks"]), "passed": sum(c["pass"] for c in witness["checks"]), "failed": sum(not c["pass"] for c in witness["checks"])}
        witness["sourcesUnchanged"] = all(digest(ROOT / n) == h for n, h in pins.items())
        witness["finishedUtc"] = datetime.now(timezone.utc).isoformat()
        (out / "witness.json").write_text(json.dumps(witness, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"status": witness["status"], **witness["counts"]}))
    return 0 if witness["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
