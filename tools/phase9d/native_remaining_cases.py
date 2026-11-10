"""Selected remaining SQL-expression contracts; native synthetic PG, no profiler."""
import copy
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


def declaration(name, file):
    found = re.search(r"CREATE FUNCTION " + re.escape(name) + r"\(.*?\$\$;", file.read_text(encoding="utf-8-sig"), re.S)
    if not found:
        raise ValueError("EXACT_SQL_DECLARATION_REQUIRED")
    return found.group()


def main():
    out = ROOT / "output/phase9d-engineering-completion-2026-10-21/remaining-expressions.json"
    paths = [Path(__file__), ROOT / "tools/backups/native_postgres.py"]
    paths += [ROOT / "tools/phase9d" / name for name in ["custody-store.sql", "closure-store.sql", "outbox.sql", "closure-source.sql", "management-retention.sql"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    witness = {"cases": [], "sourceHashes": pins, "profiling": False, "routineReplacementMutation": False,
               "boundary": "Selected exact helper bodies, trusted-owner synthetic rows; minimal pressure/outbox dependencies; not full service composition or exhaustive Boolean certification"}
    server = NativePostgres()

    def check(name, actual, expected):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        assert actual == expected, name

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as c:
                for name in ["custody-store.sql", "closure-store.sql"]:
                    c.execute((ROOT / "tools/phase9d" / name).read_text(encoding="utf-8-sig"), prepare=False)
                # Initial schema composition, before observations; never replace an active measured function.
                c.execute("CREATE SCHEMA outbox9d; CREATE EXTENSION pgcrypto WITH SCHEMA outbox9d; CREATE SCHEMA custody_export; CREATE SCHEMA broker9d; CREATE SCHEMA retention9d", prepare=False)
                c.execute("CREATE TABLE broker9d.control(now_at timestamptz); INSERT INTO broker9d.control VALUES('2026-10-13T00:00:00Z'); CREATE TABLE custody_export.events(seq bigint PRIMARY KEY,status text,event jsonb)", prepare=False)
                original = (ROOT / "tools/phase9d/outbox.sql").read_text(encoding="utf-8-sig")
                ddl = re.search(r"CREATE TABLE outbox9d.configuration \(.*?\n\);", original, re.S).group()
                c.execute(ddl)
                c.execute("INSERT INTO outbox9d.configuration(privacy_key) VALUES(repeat('p',48))")
                names = ["outbox9d.entries", "outbox9d.pseudonym", "outbox9d.projection", "outbox9d.binding", "outbox9d.serialize"]
                for name in names:
                    c.execute(declaration(name, ROOT / "tools/phase9d/outbox.sql"))
                c.execute(declaration("custody_export.pressure", ROOT / "tools/phase9d/closure-source.sql"))
                c.execute(declaration("retention9d.valid_receipt", ROOT / "tools/phase9d/management-retention.sql"))
                catalog_sql = "SELECT n.nspname,proname,pg_get_functiondef(p.oid),pg_get_userbyid(proowner),proacl::text,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname IN('custody','outbox9d','custody_export','retention9d') ORDER BY 1,2"
                before = c.execute(catalog_sql).fetchall()

                for label, value, expected in [("sql-null", None, []), ("json-null", Jsonb(None), []), ("scalar", Jsonb(1), []), ("object", Jsonb({}), []),
                                                ("timeline-null", Jsonb({"timeline": None}), []), ("timeline-scalar", Jsonb({"timeline": "bad"}), []),
                                                ("array-empty", Jsonb({"timeline": []}), []), ("array-preserved", Jsonb({"timeline": [{"id": "x"}]}), [{"id": "x"}])]:
                    check("entries:" + label, c.execute("SELECT outbox9d.entries(%s)", (value,)).fetchone()[0], expected)
                first = c.execute("SELECT outbox9d.pseudonym('identity')").fetchone()[0]
                check("pseudonym:native-hmac", first, c.execute("SELECT encode(outbox9d.hmac('identity',repeat('p',48),'sha256'),'hex')").fetchone()[0])
                check("pseudonym:stable", c.execute("SELECT outbox9d.pseudonym('identity')").fetchone()[0], first)
                check("pseudonym:distinct", c.execute("SELECT outbox9d.pseudonym('other')<>%s", (first,)).fetchone()[0], True)
                check("pseudonym:sql-null", c.execute("SELECT outbox9d.pseudonym(NULL)").fetchone()[0], None)
                c.execute("UPDATE outbox9d.configuration SET privacy_key=repeat('q',48)")
                check("pseudonym:key-change", c.execute("SELECT outbox9d.pseudonym('identity')<>%s", (first,)).fetchone()[0], True)
                c.execute("UPDATE outbox9d.configuration SET privacy_key=repeat('p',48)")
                snapshot = {"caseId": "private-case", "bookingId": "private-booking", "timeline": [{"id": "e1", "kind": "raw", "value": "private", "source": "raw", "derivedFrom": ["e0"], "availability": "available", "claimKey": "claim", "quality": {"raw": True}}],
                            "completeness": {"requiredCategories": ["timing"]}, "contradictions": [{"claimKey": "c", "observations": [{"value": "raw", "evidenceIds": ["e1"]}]}]}
                projected = c.execute("SELECT outbox9d.projection(%s)", (Jsonb(snapshot),)).fetchone()[0]
                check("projection:case-pseudonym", projected["caseId"], c.execute("SELECT outbox9d.pseudonym('private-case')").fetchone()[0])
                check("projection:value-redacted", projected["timeline"][0]["value"], {"redacted": True})
                check("projection:derived-order", projected["timeline"][0]["derivedFrom"], [c.execute("SELECT outbox9d.pseudonym('e0')").fetchone()[0]])
                check("projection:completeness", projected["completeness"], {"requiredCategories": ["timing"], "complete": False, "missing": ["timing"], "unavailable": []})
                check("projection:contradiction-redacted", projected["contradictions"][0]["observations"][0]["value"], {"redacted": True})
                check("projection:no-raw-private-values", "private-" not in json.dumps(projected) and '"raw"' not in json.dumps(projected), True)
                for value in [None, True, 5, "text", [], {}, {"z": [2, None], "a": {"y": False, "x": "a"}}]:
                    expected = json.dumps(value, sort_keys=True, separators=(",", ":"))
                    check("serialize:" + expected, c.execute("SELECT outbox9d.serialize(%s)", (Jsonb(value),)).fetchone()[0], expected)
                check("binding:canonical-key-order", c.execute("SELECT outbox9d.binding('{\"a\":1,\"b\":2}')=outbox9d.binding('{\"b\":2,\"a\":1}')").fetchone()[0], True)
                check("binding:content-change", c.execute("SELECT outbox9d.binding('{\"a\":1}')<>outbox9d.binding('{\"a\":2}')").fetchone()[0], True)
                check("binding:sql-null", c.execute("SELECT outbox9d.binding(NULL)").fetchone()[0], None)

                check("active-key:empty", c.execute("SELECT custody.active_key()").fetchone()[0], None)
                source, receipt = uuid.uuid4(), uuid.uuid4()
                key = "a" * 64
                c.execute("INSERT INTO custody.sources(source) VALUES(%s)", (source,))
                c.execute("INSERT INTO custody.keys VALUES(%s,'synthetic-public',1,'ACTIVE')", (key,))
                c.execute("INSERT INTO custody.events(source,seq,hash,event,receipt,key_id) VALUES(%s,1,repeat('b',64),'{\"synthetic\":true}',%s,%s)", (source, receipt, key))
                check("active-key:active", c.execute("SELECT custody.active_key()").fetchone()[0], key)
                check("signable:missing", c.execute("SELECT custody.signable(%s)", (uuid.uuid4(),)).fetchone()[0], None)
                check("signable:null", c.execute("SELECT custody.signable(NULL)").fetchone()[0], None)
                for status in ["ACTIVE", "RETIRED", "COMPROMISED"]:
                    c.execute("UPDATE custody.keys SET status=%s", (status,))
                    row = c.execute("SELECT custody.signable(%s)", (receipt,)).fetchone()[0]
                    check("signable:" + status + ":body-key", row["body"]["keyId"], key)
                    check("signable:" + status + ":status", row["signerStatus"], status)
                    check("signable:" + status + ":unsigned", row["signature"], None)
                    check("active-key:" + status, c.execute("SELECT custody.active_key()").fetchone()[0], key if status == "ACTIVE" else None)
                c.execute("INSERT INTO custody.signatures VALUES(%s,repeat('A',86)||'==')", (receipt,))
                check("signable:historical-signature-retained", c.execute("SELECT custody.signable(%s)->>'signature'", (receipt,)).fetchone()[0], "A" * 86 + "==")

                def pressure():
                    return c.execute("SELECT custody_export.pressure()").fetchone()[0]

                check("pressure:empty", {k: v for k, v in pressure().items() if k != "storageBytes"}, {"pendingCount": 0, "unacknowledgedCount": 0, "pendingBytes": 0, "reviewCount": 0, "reviewAgeSeconds": 0, "retainedCount": 0})
                c.execute("INSERT INTO custody_export.events VALUES(1,'PENDING','{\"observed\":\"2026-10-12T23:59:00Z\"}'),(2,'REVIEW','{\"observed\":\"2026-10-12T23:58:00Z\"}'),(3,'ACKED','{\"observed\":\"2026-10-12T00:00:00Z\"}')")
                p = pressure()
                for field, expected in {"pendingCount": 1, "unacknowledgedCount": 2, "reviewCount": 1, "reviewAgeSeconds": 120, "retainedCount": 3}.items():
                    check("pressure:mixed:" + field, p[field], expected)
                check("pressure:pending-bytes", p["pendingBytes"], c.execute("SELECT sum(pg_column_size(event)) FROM custody_export.events WHERE status<>'ACKED'").fetchone()[0])
                check("pressure:relation-size", p["storageBytes"], c.execute("SELECT pg_total_relation_size('custody_export.events')").fetchone()[0])
                c.execute("UPDATE custody_export.events SET event='{\"observed\":\"2026-10-14T00:00:00Z\"}' WHERE status='REVIEW'")
                check("pressure:future-age-clamped", pressure()["reviewAgeSeconds"], 0)
                c.execute("UPDATE custody_export.events SET status='ACKED'")
                check("pressure:acked-retained", pressure()["retainedCount"], 3)
                check("pressure:acked-no-pending-bytes", pressure()["pendingBytes"], 0)

                valid = {"schema": "management-receipt-v1", "operation": str(uuid.uuid4()), "status": "PREPARED", "scope": "synthetic", "epoch": "1", "policyVersion": "1", "node": "source", "commitment": "a" * 64}
                variants = [("valid", valid, True), ("sql-null", None, False), ("scalar", "x", False), ("extra", dict(valid, extra="x"), False)]
                for field in valid:
                    missing = copy.deepcopy(valid)
                    missing.pop(field)
                    variants.append(("missing:" + field, missing, False))
                    variants.append(("wrong-type:" + field, dict(valid, **{field: 1}), False))
                for field, values in {"schema": ["wrong"], "operation": ["bad", "A" * 36], "status": ["COMPLETE", "SIMULATED_PAYLOAD_PURGE", "RETAINED_COMMITMENTS"], "epoch": ["0", "-1", "1" * 16], "policyVersion": ["0", "1" * 10], "node": ["receiver", "custodian", "other"], "commitment": ["A" * 64, "a" * 63]}.items():
                    for value in values:
                        expected = value in ["receiver", "custodian", "SIMULATED_PAYLOAD_PURGE", "RETAINED_COMMITMENTS"]
                        variants.append((field + ":" + value, dict(valid, **{field: value}), expected))
                for label, value, expected in variants:
                    observed = c.execute("SELECT retention9d.valid_receipt(%s)", (None if label == "sql-null" else Jsonb(value),)).fetchone()[0]
                    # Missing predicates can be SQL NULL; rejection means IS NOT TRUE.
                    check("management-receipt:" + label, observed is True, expected)
                check("catalog:unchanged", c.execute(catalog_sql).fetchall() == before, True)
                witness["catalogs"] = [{"schema": r[0], "name": r[1], "definitionSha256": hashlib.sha256(r[2].encode()).hexdigest(), "owner": r[3], "acl": r[4], "settings": r[5]} for r in before]
                witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["sourceUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        witness["caseCount"] = len(witness["cases"])
        with out.open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    main()
