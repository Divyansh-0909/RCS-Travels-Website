"""Exact base/recovery allowed helpers; synthetic rows and original table constraints."""
import hashlib
import json
from pathlib import Path
import re
import sys
import uuid

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402


def main():
    base_path = ROOT / "tools/phase9d/broker.sql"
    recovery_path = ROOT / "tools/phase9d/broker-recovery.sql"
    paths = [Path(__file__), base_path, recovery_path, ROOT / "tools/backups/native_postgres.py"]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    base, recovery = [p.read_text(encoding="utf-8-sig") for p in [base_path, recovery_path]]
    original = re.search(r"CREATE FUNCTION broker9d.allowed\(.*?\$\$;", base, re.S).group()
    composed = recovery[recovery.index("ALTER FUNCTION broker9d.allowed("):recovery.index("ALTER FUNCTION broker9d.observe(")]
    witness = {"cases": [], "sourceHashes": pins, "profiling": False, "routineReplacementMutation": False,
               "boundary": "Exact base table constraints and recovery helper composition; minimal transport/work joins, trusted owner row probes. Receipt rows here test SQL fences, not authenticated reconcile acceptance or service grants."}
    server = NativePostgres()

    def check(name, actual, expected):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        assert actual == expected, name

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as c:
                c.execute("CREATE SCHEMA broker9d; CREATE SCHEMA shadow9d; CREATE SCHEMA transport9d; CREATE TABLE shadow9d.work(id bigint PRIMARY KEY,evidence_hash text,snapshot jsonb); CREATE TABLE transport9d.receipts(work_id bigint PRIMARY KEY,payload_binding text,receipt uuid)", prepare=False)
                c.execute(base[base.index("CREATE TABLE broker9d.configuration"):base.index("CREATE FUNCTION broker9d.event(")], prepare=False)
                c.execute(recovery[recovery.index("ALTER TABLE broker9d.requests"):recovery.index("CREATE FUNCTION broker9d.revision(")], prepare=False)
                c.execute(original)
                c.execute(composed, prepare=False)
                catalog_sql = "SELECT proname,pg_get_functiondef(p.oid),proacl::text,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='broker9d' ORDER BY proname"
                before = c.execute(catalog_sql).fetchall()
                request, attempt, token, receipt = [uuid.uuid4() for _ in range(4)]
                frozen = "e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75"
                payload = {"snapshot": {"synthetic": True}, "frozenV5": frozen}
                c.execute("UPDATE broker9d.control SET stopped=false,generation=1")
                c.execute("INSERT INTO shadow9d.work VALUES(1,'evidence','{\"synthetic\":true}')")
                c.execute("INSERT INTO transport9d.receipts VALUES(1,'binding',%s)", (receipt,))
                c.execute("INSERT INTO broker9d.requests(id,logical_key,receipt,work_id,payload,binding,evidence_hash,configuration,configuration_hash,generation,status) SELECT %s,'synthetic',%s,1,%s,'binding','evidence',version,encode(sha256(convert_to(to_jsonb(cfg)::text,'UTF8')),'hex'),1,'RESERVED' FROM broker9d.configuration cfg", (request, receipt, Jsonb(payload)))
                c.execute("INSERT INTO broker9d.attempts(id,request_id,number,token,owner,generation,lease_until,status,input_reserved,output_reserved,minor_reserved,usage_state) SELECT %s,%s,1,%s,'broker9d_exec',1,now_at+interval '60 seconds','RESERVED',1024,256,5,'RESERVED' FROM broker9d.control", (attempt, request, token))

                def allowed(name, identity=attempt, key=token, states=None):
                    states = ["RESERVED"] if states is None else states
                    return c.execute("SELECT broker9d." + name + "(%s,%s,%s)", (identity, key, states)).fetchone()[0]

                check("base:valid", allowed("allowed_before_recovery"), True)
                check("recovery:valid", allowed("allowed"), True)
                probes = [
                    ("stop", "UPDATE broker9d.control SET stopped=true", False, False),
                    ("control-generation", "UPDATE broker9d.control SET generation=2", False, False),
                    ("attempt-generation", "UPDATE broker9d.attempts SET generation=2", False, False),
                    ("request-generation", "UPDATE broker9d.requests SET generation=2", False, False),
                    ("lease-equal-now", "UPDATE broker9d.attempts SET lease_until=(SELECT now_at FROM broker9d.control)", False, False),
                    ("lease-expired", "UPDATE broker9d.attempts SET lease_until=(SELECT now_at-interval '1 second' FROM broker9d.control)", False, False),
                    ("attempt-state", "UPDATE broker9d.attempts SET status='RELEASED'", False, False),
                    ("work-evidence", "UPDATE shadow9d.work SET evidence_hash='different'", False, False),
                    ("work-evidence-null", "UPDATE shadow9d.work SET evidence_hash=NULL", False, False),
                    ("work-snapshot", "UPDATE shadow9d.work SET snapshot='{}'", False, False),
                    ("payload-null", "UPDATE broker9d.requests SET payload=NULL", False, False),
                    ("missing-snapshot", "UPDATE broker9d.requests SET payload=payload-'snapshot'", False, False),
                    ("wrong-frozen", "UPDATE broker9d.requests SET payload=jsonb_set(payload,'{frozenV5}','\"wrong\"')", False, False),
                    ("missing-frozen", "UPDATE broker9d.requests SET payload=payload-'frozenV5'", False, False),
                    ("receipt-binding", "UPDATE transport9d.receipts SET payload_binding='other'", False, False),
                    ("receipt-identity", "UPDATE transport9d.receipts SET receipt='00000000-0000-4000-8000-000000000001'", False, False),
                    ("configuration-hash", "UPDATE broker9d.requests SET configuration_hash='other'", False, False),
                    ("missing-work-join", "DELETE FROM shadow9d.work", None, False),
                    ("missing-receipt-join", "DELETE FROM transport9d.receipts", None, False),
                    ("terminal-wrapper", "UPDATE broker9d.requests SET status='TERMINAL'", True, False),
                    ("manual-review-wrapper", "UPDATE broker9d.requests SET status='MANUAL_REVIEW'", True, False),
                    ("cleaned-wrapper", "UPDATE broker9d.requests SET cleaned=true", True, False),
                    ("usage-conflict-wrapper", "UPDATE broker9d.attempts SET usage_conflict=true", True, False),
                ]
                for label, statement, expected_base, expected_wrapper in probes:
                    with c.transaction(force_rollback=True):
                        c.execute(statement)
                        check("base:" + label, allowed("allowed_before_recovery"), expected_base)
                        check("recovery:" + label, allowed("allowed"), expected_wrapper)
                for label, identity, key, states, expected in [
                    ("missing-attempt", uuid.uuid4(), token, ["RESERVED"], None),
                    ("null-attempt", None, token, ["RESERVED"], None),
                    ("wrong-token", attempt, uuid.uuid4(), ["RESERVED"], False),
                    ("null-token", attempt, None, ["RESERVED"], False),
                    ("empty-states", attempt, token, [], False),
                    ("different-states", attempt, token, ["DISPATCH_ADMITTED"], False),
                    ("null-array-element", attempt, token, [None], False),
                    ("valid-and-null-array-element", attempt, token, [None, "RESERVED"], True),
                ]:
                    check("base:input:" + label, allowed("allowed_before_recovery", identity, key, states), expected)
                    # The wrapper's NOT(response-state = ANY(states)) is UNKNOWN
                    # for a NULL-containing array without a response-state match.
                    wrapper_expected = False if label == "valid-and-null-array-element" else expected
                    check("recovery:input:" + label, allowed("allowed", identity, key, states), wrapper_expected)
                for function in ["allowed_before_recovery", "allowed"]:
                    check(function + ":sql-null-states", c.execute("SELECT broker9d." + function + "(%s,%s,NULL)", (attempt, token)).fetchone()[0], False)
                with c.transaction(force_rollback=True):
                    c.execute("INSERT INTO broker9d.results VALUES(%s,%s,'{}','digest',1,(SELECT now_at FROM broker9d.control))", (request, attempt))
                    check("base:already-result", allowed("allowed_before_recovery"), False)
                    check("recovery:already-result", allowed("allowed"), False)
                with c.transaction(force_rollback=True):
                    c.execute("UPDATE broker9d.attempts SET status='RESPONSE_OBSERVED',response_hash='response'")
                    states = ["RESPONSE_OBSERVED"]
                    check("base:response-observed", allowed("allowed_before_recovery", states=states), True)
                    check("recovery:missing-usage-receipt", allowed("allowed", states=states), False)
                    for outcome, disposition, response_hash, expected in [("SUCCESS", "ACCEPTED", "response", True), ("BILLED_FAILURE", "ACCEPTED", "response", False), ("SUCCESS", "CONFLICT", "response", False), ("SUCCESS", "ACCEPTED", "other", False), ("SUCCESS", "ACCEPTED", None, False)]:
                        c.execute("DELETE FROM broker9d.usage_receipts")
                        c.execute("INSERT INTO broker9d.usage_receipts VALUES('digest',%s,%s,%s,%s,'synthetic-not-authority',%s,(SELECT now_at FROM broker9d.control))", (uuid.uuid4(), request, attempt, Jsonb({"outcome": outcome, "responseHash": response_hash}), disposition))
                        check("recovery:usage:" + outcome + ":" + disposition + ":" + str(response_hash), allowed("allowed", states=states), expected)
                check("fixtures:restored-positive", allowed("allowed"), True)
                check("catalog:preserved", c.execute(catalog_sql).fetchall(), before)
                witness["catalogs"] = [{"name": r[0], "definitionSha256": hashlib.sha256(r[1].encode()).hexdigest(), "definition": r[1], "acl": r[2], "settings": r[3]} for r in before]
                witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourceUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (ROOT / "output/phase9d-engineering-completion-2026-10-21/broker-predicates.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    main()
