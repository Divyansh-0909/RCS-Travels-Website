"""Missing expression outcomes on exact SQL bodies, profiling/mutation OFF."""
import hashlib
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import uuid

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres  # noqa: E402
from native_sql_metadata_fixture import FILES, catalog, install  # noqa: E402

OUT = ROOT / "output/phase9d-sql-conditions-metadata-2026-10-23"


def main():
    files = [Path(__file__), ROOT / "tools/phase9d/native_sql_metadata_fixture.py", ROOT / "tools/backups/native_postgres.py"]
    files += [ROOT / "tools/phase9d" / n for n in FILES]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins, "compositions": [],
               "profiling": False, "routineReplacementsDuringObservation": False, "p8": "NOT_STARTED",
               "boundary": "Owner-created deterministic fixtures establish selected expression outcomes, not real "
                           "producer reachability, signature acceptance or all Boolean operand adequacy"}

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    try:
        for kind in ["source", "receiver"]:
            server = NativePostgres()
            composition = {"name": kind}
            witness["compositions"].append(composition)
            try:
                with server:
                    composition["environment"] = server.identity
                    with server.connect(autocommit=True) as c:
                        passwords = install(c, kind)
                        before = catalog(c)
                        crypto = "outbox9d" if kind == "source" else "transport9d"
                        variants = [
                            ("camel-priority", {"evidenceHash": "a" * 64, "evidence_hash": "b" * 64, "payload": {"evidenceHash": "c" * 64}}, "a" * 64),
                            ("snake-fallback", {"evidenceHash": None, "evidence_hash": "b" * 64, "payload": {"evidenceHash": "c" * 64}}, "b" * 64),
                            ("payload-fallback", {"evidence_hash": None, "payload": {"evidenceHash": "c" * 64}}, "c" * 64),
                            ("missing-evidence", {}, None),
                            ("null-evidence", {"evidenceHash": None, "evidence_hash": None, "payload": {"evidenceHash": None}}, None),
                            ("empty-string-does-not-fallback", {"evidenceHash": "", "evidence_hash": "b" * 64}, ""),
                            ("numeric-text-observation", {"evidenceHash": 7}, "7"),
                            ("scalar-payload", {"payload": 7}, None),
                        ]
                        for index, (label, original, expected) in enumerate(variants):
                            identity = kind + "-" + label
                            with c.transaction():
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                seq = c.execute("SELECT custody_lineage.emit('LOCAL_AUDIT',%s,NULL,%s,'trusted_observer')", (identity, Jsonb(original))).fetchone()[0]
                            event, digest = c.execute("SELECT event,hash FROM custody_lineage.events WHERE seq=%s", (seq,)).fetchone()
                            prefix = kind + ":emit:" + label
                            check(prefix + ":evidence-precedence", event["evidenceHash"], expected)
                            check(prefix + ":version-presence", event["evidenceVersion"], None if expected is None else "responsibility-evidence-v1")
                            check(prefix + ":owner-json-null", event["ownerHash"], None)
                            expected_digest = c.execute("SELECT encode(sha256(convert_to(%s::jsonb::text,'UTF8')),'hex')", (Jsonb(original),)).fetchone()[0]
                            check(prefix + ":original-commitment", event["sourceHash"], expected_digest)
                            persisted_hash = c.execute("SELECT encode(sha256(convert_to('custody-event-v1'||chr(10)||custody_lineage.serialize(%s),'UTF8')),'hex')", (Jsonb(event),)).fetchone()[0]
                            check(prefix + ":event-commitment", digest, persisted_hash)
                            with c.transaction():
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                replay = c.execute("SELECT custody_lineage.emit('DIFFERENT_ACTION',%s,'different-owner',%s,'different-actor')", (identity, Jsonb(original))).fetchone()[0]
                            check(prefix + ":same-identity-original-deduplicates", replay, seq)
                            check(prefix + ":dedupe-does-not-rewrite-metadata", c.execute("SELECT event FROM custody_lineage.events WHERE seq=%s", (seq,)).fetchone()[0], event)
                            state = c.execute("SELECT seq,head FROM custody_lineage.control").fetchone()
                            try:
                                with c.transaction():
                                    c.execute("SET LOCAL ROLE shadow9d_owner")
                                    c.execute("SELECT custody_lineage.emit('LOCAL_AUDIT',%s,NULL,%s,'trusted_observer')", (identity, Jsonb(dict(original, conflict=True))))
                                error = "UNEXPECTED_ALLOWED"
                            except Exception as caught:
                                error = getattr(caught, "sqlstate", None)
                            check(prefix + ":conflicting-original", error, "23514")
                            check(prefix + ":conflict-rollback-head", c.execute("SELECT seq,head FROM custody_lineage.control").fetchone(), state)
                        for owner in [None, "", "synthetic-owner"]:
                            identity = "owner-probe-" + str(owner)
                            original = {"receipt": "synthetic-receipt", "epoch": 7}
                            with c.transaction():
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                seq = c.execute("SELECT custody_lineage.emit('LOCAL_AUDIT',%s,%s,%s,NULL)", (identity, owner, Jsonb(original))).fetchone()[0]
                            event = c.execute("SELECT event FROM custody_lineage.events WHERE seq=%s", (seq,)).fetchone()[0]
                            expected = None if owner is None else c.execute("SELECT encode(" + crypto + ".hmac(%s,secret,'sha256'),'hex') FROM custody_lineage.control", (owner,)).fetchone()[0]
                            check(kind + ":owner:" + str(owner) + ":hmac", event["ownerHash"], expected)
                            check(kind + ":owner:" + str(owner) + ":actor-null", event["actor"], None)
                            check(kind + ":owner:" + str(owner) + ":generation-text", event["generation"], "7")
                            check(kind + ":owner:" + str(owner) + ":receipt-observed", event["receipt"], "synthetic-receipt")
                        actual_config = c.execute("SELECT DISTINCT event->>'configuration' FROM custody_lineage.events").fetchall()
                        check(kind + ":configuration-stable-within-service", len(actual_config), 1)
                        composition["configurationHash"] = actual_config[0][0]
                        if kind == "source":
                            with server.connect("shadow9d_worker", passwords["shadow9d_worker"], autocommit=True) as worker:
                                token = uuid.uuid4()
                                variants = ["valid", "null-token", "wrong-token", "missing-row", "wrong-owner", "null-owner",
                                            "wrong-epoch", "null-epoch", "expired", "at-expiry", "null-expiry", "wrong-status", "stopped", "quota-equal", "quota-over"]
                                for index, variant in enumerate(variants):
                                    c.execute("UPDATE shadow9d.control SET stopped=false,epoch=7,used_requests=0,request_budget=3")
                                    c.execute("DELETE FROM shadow9d.work")
                                    row = c.execute("""INSERT INTO shadow9d.work(logical_key,evidence_hash,provenance,status,attempts,lease_token,lease_owner,epoch,lease_until,created_at)
VALUES(%s,repeat('e',64),repeat('a',64),'PROCESSING',1,%s,'shadow9d_worker',7,'2026-10-12T16:01:00Z','2026-10-12T16:00:00Z') RETURNING id""",
                                                    (hashlib.sha256(variant.encode()).hexdigest(), token)).fetchone()[0]
                                    if variant in {"wrong-owner", "null-owner"}:
                                        c.execute("UPDATE shadow9d.work SET lease_owner=%s", ("foreign" if variant == "wrong-owner" else None,))
                                    if variant in {"wrong-epoch", "null-epoch"}:
                                        c.execute("UPDATE shadow9d.work SET epoch=%s", (8 if variant == "wrong-epoch" else None,))
                                    if variant in {"expired", "at-expiry", "null-expiry"}:
                                        expiration = {"expired": "2026-10-12T15:59:59Z", "at-expiry": "2026-10-12T16:00:00Z", "null-expiry": None}[variant]
                                        c.execute("UPDATE shadow9d.work SET lease_until=%s", (expiration,))
                                    if variant == "wrong-status":
                                        c.execute("UPDATE shadow9d.work SET status='PENDING'")
                                    if variant == "stopped":
                                        c.execute("UPDATE shadow9d.control SET stopped=true")
                                    if variant in {"quota-equal", "quota-over"}:
                                        c.execute("UPDATE shadow9d.control SET used_requests=%s", (3 if variant == "quota-equal" else 4,))
                                    before_work = c.execute("SELECT to_jsonb(w) FROM shadow9d.work w").fetchone()[0]
                                    before_used = c.execute("SELECT used_requests FROM shadow9d.control").fetchone()[0]
                                    argument = None if variant == "null-token" else uuid.uuid4() if variant == "wrong-token" else token
                                    allowed = worker.execute("SELECT shadow9d.permit(%s,%s)", (row + 100000 if variant == "missing-row" else row, argument)).fetchone()[0]
                                    expected = variant == "valid"
                                    check("source:permit:" + variant, allowed, expected)
                                    check("source:permit:" + variant + ":usage", c.execute("SELECT used_requests FROM shadow9d.control").fetchone()[0], before_used + int(expected))
                                    check("source:permit:" + variant + ":original-row-stable", c.execute("SELECT to_jsonb(w) FROM shadow9d.work w").fetchone()[0], before_work)
                            # Exact expected-source identity/evidence pair: two
                            # different rows satisfying one operand each do not
                            # substitute for a single matching observation.
                            snapshot = {"caseId": "case", "bookingId": "booking", "caseType": "RIDER_CANCELLATION",
                                        "evidenceVersion": "responsibility-evidence-v1", "timeline": [
                                            {"id": "b1", "category": "booking", "value": {"bookingId": "booking", "userId": "rider"}},
                                            {"id": "t1", "kind": "committed_customer_transition", "value": {"initiator": "rider", "transition": "cancelled"}}]}
                            c.execute("INSERT INTO public.bookings(id,user_id) VALUES('booking','rider'); "
                                      "INSERT INTO public.responsibility_cases VALUES('case','rider-cancellation:booking','booking','RIDER_CANCELLATION',now()); "
                                      "INSERT INTO public.responsibility_adjudication_work VALUES('work','case','evidence','contract','analyst','policy',now())", prepare=False)
                            c.execute("INSERT INTO public.responsibility_evidence_versions VALUES('evidence','case','responsibility-evidence-v1',repeat('e',64),%s,now())", (Jsonb(snapshot),))
                            expected_sources = c.execute("SELECT custody_lineage.expected_sources()").fetchone()[0]
                            check("source:expected-pair:one-valid-original", len(expected_sources), 1)
                            identity = "source:work:" + "e" * 64
                            saved_head = c.execute("SELECT seq,head FROM custody_lineage.control").fetchone()
                            with c.transaction(force_rollback=True):
                                c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                status = c.execute("SELECT custody_lineage.capture_status()").fetchone()[0]
                                check("source:expected-pair:absent-missing", status["missingCommittedRows"], 1)
                                c.execute("SELECT custody_lineage.emit('SOURCE_LINEAGE',%s,NULL,%s,'trusted_observer')", (identity, Jsonb({"evidenceHash": "a" * 64})))
                                status = c.execute("SELECT custody_lineage.capture_status()").fetchone()[0]
                                check("source:expected-pair:identity-only-missing", status["missingCommittedRows"], 1)
                                c.execute("SELECT custody_lineage.emit('SOURCE_LINEAGE','foreign-identity',NULL,%s,'trusted_observer')", (Jsonb({"evidenceHash": "e" * 64}),))
                                status = c.execute("SELECT custody_lineage.capture_status()").fetchone()[0]
                                check("source:expected-pair:separate-rows-do-not-match", status["missingCommittedRows"], 1)
                            check("source:expected-pair:owner-probe-rolled-back", c.execute("SELECT seq,head FROM custody_lineage.control").fetchone(), saved_head)
                            with c.transaction():
                                c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                check("source:expected-pair:deferred-capture-inspected", c.execute("SELECT custody_lineage.capture_committed()").fetchone()[0], 1)
                                status = c.execute("SELECT custody_lineage.capture_status()").fetchone()[0]
                                check("source:expected-pair:exact-record-consistent", status["status"], "CAPTURE_CONSISTENT")
                                check("source:expected-pair:no-missing", status["missingCommittedRows"], 0)
                        else:
                            with server.connect("broker9d_ops", passwords["broker9d_ops"], autocommit=True) as ops:
                                empty = ops.execute("SELECT broker9d.accounting()").fetchone()[0]
                                for field in ["attempts", "lifetimeInputReserved", "lifetimeOutputReserved", "heldMinor", "unknownMinor", "confirmedMinor", "backlog"]:
                                    check("receiver:accounting:empty:" + field, empty[field], 0)
                                check("receiver:inspect:missing", ops.execute("SELECT broker9d.inspect(%s)", (uuid.uuid4(),)).fetchone()[0], None)
                                check("receiver:inspect:null", ops.execute("SELECT broker9d.inspect(NULL)").fetchone()[0], None)
                                requests, attempts = [], []
                                states = [("OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN", "UNKNOWN", 5, False),
                                          ("RESPONSE_OBSERVED", "RESPONSE_OBSERVED", "CONFIRMED", 7, False),
                                          ("TERMINAL", "RELEASED", "RELEASED", 11, False),
                                          ("MANUAL_REVIEW", "REJECTED", "UNKNOWN", 13, True),
                                          ("RESERVED", "RESERVED", "RESERVED", 17, False)]
                                for index, (qstatus, astatus, usage, minor, conflict) in enumerate(states + [("PENDING", None, None, 0, False)]):
                                    request = uuid.uuid4()
                                    requests.append(request)
                                    c.execute("""INSERT INTO broker9d.requests(id,logical_key,receipt,work_id,payload,binding,evidence_hash,configuration,configuration_hash,generation,status)
VALUES(%s,%s,%s,%s,'{"privatePayload":"synthetic-not-for-inspection"}',repeat('b',64),repeat('e',64),'offline-broker-v1',repeat('c',64),0,%s)""",
                                              (request, "fixture-" + str(index), uuid.uuid4(), index + 1, qstatus))
                                    if astatus:
                                        attempt = uuid.uuid4()
                                        attempts.append(attempt)
                                        c.execute("""INSERT INTO broker9d.attempts(id,request_id,number,owner,generation,lease_until,status,input_reserved,output_reserved,minor_reserved,
usage_state,input_used,output_used,minor_used,usage_conflict,response) VALUES(%s,%s,1,'broker9d_exec',0,'2026-10-13T01:00:00Z',%s,100,10,%s,%s,%s,%s,%s,%s,'{"privateResponse":"synthetic-response"}')""",
                                                  (attempt, request, astatus, minor, usage, 10 if usage == "CONFIRMED" else None,
                                                   2 if usage == "CONFIRMED" else None, 3 if usage == "CONFIRMED" else None, conflict))
                                c.execute("INSERT INTO broker9d.usage_receipts VALUES(repeat('d',64),%s,%s,%s,'{}','synthetic-private-mac','ACCEPTED','2026-10-13T00:00:00Z')",
                                          (uuid.uuid4(), requests[1], attempts[1]))
                                c.execute("INSERT INTO broker9d.events(at,actor,action,request_id) VALUES('2026-10-13T00:00:00Z',session_user,'REGISTER',%s),('2026-10-12T00:00:00Z',session_user,'REGISTER',%s)", (requests[-1], requests[0]))
                                accounting = ops.execute("SELECT broker9d.accounting()").fetchone()[0]
                                expected = {"attempts": 5, "lifetimeInputReserved": 500, "lifetimeOutputReserved": 50,
                                            "lifetimeMinorReserved": 53, "confirmedMinor": 3, "unknownMinor": 18,
                                            "disputedMinor": 13, "heldMinor": 42, "availableMinor": 58, "active": 3,
                                            "backlog": 1, "externalReconciliation": 2}
                                for field, value in expected.items():
                                    check("receiver:accounting:mixed:" + field, accounting[field], value)
                                oldest = datetime.fromisoformat(accounting["oldestPending"]).astimezone(timezone.utc).isoformat()
                                check("receiver:accounting:oldest-pending-only", oldest, "2026-10-13T00:00:00+00:00")
                                inspected = ops.execute("SELECT broker9d.inspect(%s)", (requests[1],)).fetchone()[0]
                                check("receiver:inspect:request-payload-omitted", "payload" in inspected["request"], False)
                                check("receiver:inspect:attempt-token-omitted", "token" in inspected["attempts"][0], False)
                                check("receiver:inspect:attempt-response-omitted", "response" in inspected["attempts"][0], False)
                                check("receiver:inspect:receipt-mac-omitted", "mac" in inspected["receipts"][0], False)
                                check("receiver:inspect:no-sensitive-values", all(value not in json.dumps(inspected) for value in
                                      ["synthetic-not-for-inspection", "synthetic-response", "synthetic-private-mac"]))
                        check(kind + ":catalogs-unchanged", catalog(c) == before)
            finally:
                composition["serverStopped"] = server.stopped
        check("composition:configuration-hashes-differ", witness["compositions"][0]["configurationHash"] != witness["compositions"][1]["configurationHash"])
        witness["status"] = "PASS"
    finally:
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "conditions-accepted.json").open("x", encoding="utf-8") as output:
            json.dump(witness, output, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"],
                      "serversStopped": all(c["serverStopped"] for c in witness["compositions"])}))


if __name__ == "__main__":
    main()
