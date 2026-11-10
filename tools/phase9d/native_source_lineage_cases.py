"""Exact source helpers/trigger on minimal synthetic dependency tables, no profiler."""
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

OUT = ROOT / "output/phase9d-open-gates-2026-10-22/source-lineage-final.json"


def declaration(name, text):
    match = re.search(r"CREATE FUNCTION " + re.escape(name) + r"\(.*?\$\$;", text, re.S)
    if not match:
        raise ValueError("EXACT_DECLARATION_REQUIRED")
    return match.group()


def main():
    paths = [Path(__file__), ROOT / "tools/backups/native_postgres.py"]
    paths += [ROOT / "tools/phase9d" / p for p in ["outbox.sql", "closure-lineage.sql", "closure-source-lineage.sql"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    witness = {"sourceHashes": pins, "cases": [], "status": "FAIL", "profiling": False,
               "boundary": "Exact SQL bodies and delivery DDL; minimal synthetic original-table projections, owner-controlled inconsistency probes; no real producer topology or new native counts"}
    server = NativePostgres()

    def check(name, actual, expected):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as c:
                # Trigger to_jsonb runs under SET TimeZone='UTC'; comparisons
                # of timestamptz rows must use that same representation.
                c.execute("SET TimeZone='UTC'")
                c.execute("""
CREATE ROLE shadow9d_owner NOLOGIN; CREATE ROLE shadow9d_exporter NOLOGIN;
CREATE SCHEMA outbox9d AUTHORIZATION shadow9d_owner;
CREATE EXTENSION pgcrypto WITH SCHEMA outbox9d;
CREATE TABLE public.bookings(id text PRIMARY KEY,user_id text);
CREATE TABLE public.responsibility_cases(id text PRIMARY KEY,source_key text,booking_id text,case_type text,occurred_at timestamptz);
CREATE TABLE public.responsibility_evidence_versions(id text PRIMARY KEY,case_id text,evidence_version text,evidence_hash text,snapshot jsonb,generated_at timestamptz);
CREATE TABLE public.responsibility_adjudication_work(id text PRIMARY KEY,case_id text,evidence_version_id text,contract_version text,analyst_config_version text,policy_version text,created_at timestamptz);
CREATE TABLE public.driver_cancellations(id text PRIMARY KEY,booking_id text,driver_id text,created_at timestamptz);
GRANT USAGE ON SCHEMA public TO shadow9d_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO shadow9d_owner;
SET ROLE shadow9d_owner;
CREATE TABLE outbox9d.transport_configuration(service_id uuid);
INSERT INTO outbox9d.transport_configuration VALUES('10000000-0000-4000-8000-000000000001');
""", prepare=False)
                outbox = paths[2].read_text(encoding="utf-8-sig")
                c.execute(re.search(r"CREATE TABLE outbox9d.deliveries \(.*?\n\);", outbox, re.S).group())
                for name in ["outbox9d.entries", "outbox9d.source"]:
                    c.execute(declaration(name, outbox))
                c.execute("RESET ROLE")
                c.execute(paths[3].read_text(encoding="utf-8-sig").replace("__CRYPTO__", "outbox9d"), prepare=False)
                c.execute(paths[4].read_text(encoding="utf-8-sig"), prepare=False)
                c.execute("INSERT INTO custody_lineage.control(singleton,source,service,secret,now_at) VALUES(true,%s,'source-lineage-v2',%s,'2026-10-22T00:00:00Z')", (uuid.uuid4(), uuid.uuid4().hex * 2))
                c.execute("CREATE TRIGGER test_source_capture AFTER INSERT OR UPDATE ON outbox9d.deliveries FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture()")
                catalog = "SELECT n.nspname,proname,pg_get_functiondef(p.oid),proowner::regrole::text,proconfig,proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('custody_lineage','outbox9d') AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1,2"
                before = c.execute(catalog).fetchall()

                def seed(kind):
                    snapshot = {"caseId": "case", "bookingId": "booking", "caseType": kind, "evidenceVersion": "responsibility-evidence-v1",
                                "timeline": [{"id": "b1", "category": "booking", "value": {"bookingId": "booking", "userId": "rider"}}]}
                    assignment = {"id": "a1", "category": "assignment", "value": {"driverId": "driver", "expectedPickupAt": "2026-10-22T01:00:00Z"}}
                    if kind == "RIDER_CANCELLATION":
                        key = "rider-cancellation:booking"
                        snapshot["timeline"].append({"id": "t1", "kind": "committed_customer_transition", "value": {"initiator": "rider", "transition": "cancelled"}})
                    elif kind == "DRIVER_CANCELLATION":
                        key = "driver-cancellation:booking:driver"
                        snapshot["timeline"] += [assignment, {"id": "d1", "kind": "driver_cancellation_recorded", "source": "driver_cancellation:cancel", "value": {"cancellationId": "cancel"}}]
                    else:
                        key = "late-driver-recovery:booking:driver:2026-10-22T01:00:00Z"
                        snapshot["timeline"] += [assignment, {"id": "t1", "kind": "committed_customer_transition", "value": {"previousDriverId": "driver", "transition": "late_driver_recovery", "fault": "UNDETERMINED"}}]
                    c.execute("INSERT INTO public.bookings VALUES('booking','rider')")
                    c.execute("INSERT INTO public.responsibility_cases VALUES('case',%s,'booking',%s,now())", (key, kind))
                    c.execute("INSERT INTO public.responsibility_evidence_versions VALUES('evidence','case','responsibility-evidence-v1',repeat('e',64),%s,now())", (Jsonb(snapshot),))
                    c.execute("INSERT INTO public.responsibility_adjudication_work VALUES('work','case','evidence','contract','analyst','policy',now())")
                    c.execute("INSERT INTO public.driver_cancellations VALUES('cancel','booking','driver',now())")
                    return snapshot

                for kind in ["RIDER_CANCELLATION", "DRIVER_CANCELLATION", "DRIVER_LATE"]:
                    variants = ["valid", "caseId", "bookingId", "caseType", "evidenceVersion", "booking-value", "booking-user", "source-key", "missing-booking", "missing-evidence", "missing-work", "work-evidence-case", "timeline-null", "timeline-object"]
                    variants += {"RIDER_CANCELLATION": ["initiator", "transition"], "DRIVER_CANCELLATION": ["assignment-driver", "cancellation-id", "cancellation-source", "missing-cancellation"], "DRIVER_LATE": ["assignment-driver", "pickup", "previous-driver", "transition", "fault"]}[kind]
                    for variant in variants:
                        c.execute("BEGIN")
                        try:
                            snapshot = seed(kind)
                            changed = copy.deepcopy(snapshot)
                            if variant in ["caseId", "bookingId", "caseType", "evidenceVersion"]:
                                changed[variant] = "foreign"
                            elif variant in ["booking-value", "booking-user"]:
                                changed["timeline"][0]["value"]["bookingId" if variant == "booking-value" else "userId"] = "foreign"
                            elif variant.startswith("timeline-"):
                                changed["timeline"] = None if variant == "timeline-null" else {}
                            elif variant in ["initiator", "transition", "previous-driver", "fault"]:
                                changed["timeline"][-1]["value"][{"previous-driver": "previousDriverId"}.get(variant, variant)] = "foreign"
                            elif variant in ["assignment-driver", "pickup"]:
                                changed["timeline"][1]["value"]["driverId" if variant == "assignment-driver" else "expectedPickupAt"] = "foreign"
                            elif variant == "cancellation-id":
                                changed["timeline"][-1]["value"]["cancellationId"] = "foreign"
                            elif variant == "cancellation-source":
                                changed["timeline"][-1]["source"] = "foreign"
                            if changed != snapshot:
                                c.execute("UPDATE public.responsibility_evidence_versions SET snapshot=%s", (Jsonb(changed),))
                            if variant == "source-key":
                                c.execute("UPDATE public.responsibility_cases SET source_key='foreign'")
                            elif variant == "work-evidence-case":
                                c.execute("UPDATE public.responsibility_evidence_versions SET case_id='foreign'")
                            elif variant.startswith("missing-"):
                                table = {"missing-booking": "bookings", "missing-evidence": "responsibility_evidence_versions", "missing-work": "responsibility_adjudication_work", "missing-cancellation": "driver_cancellations"}[variant]
                                c.execute("DELETE FROM public." + table)
                            source = c.execute("SELECT outbox9d.source('work')").fetchone()[0]
                            valid = source is not None and source["lineageValid"] is True
                            label = kind + ":" + variant
                            check(label + ":source-acceptance", valid, variant == "valid")
                            if variant == "valid":
                                check(label + ":actor", source["actorId"], "rider" if kind == "RIDER_CANCELLATION" else "driver")
                            c.execute("INSERT INTO outbox9d.deliveries(source_work_id,status,created_at) VALUES('work','PENDING',now())")
                            actions = [r[0] for r in c.execute("SELECT event->>'action' FROM custody_lineage.events ORDER BY seq").fetchall()]
                            check(label + ":persisted-actions", actions, ["SOURCE_LINEAGE", "OUTBOX_CREATED"] if valid else ["OUTBOX_CREATED"])
                            check(label + ":exact-row-commitment", c.execute("SELECT e.event->>'sourceHash'=encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex') FROM custody_lineage.events e CROSS JOIN outbox9d.deliveries d WHERE e.event->>'action'='OUTBOX_CREATED'").fetchone()[0], True)
                            expected = c.execute("SELECT custody_lineage.expected_sources()").fetchone()[0]
                            check(label + ":expected-source-count", len(expected), 1 if valid else 0)
                            check(label + ":deferred-capture-count", c.execute("SELECT custody_lineage.capture_committed()").fetchone()[0], 1 if valid else 0)
                            check(label + ":capture-deduplicated", c.execute("SELECT count(*) FROM custody_lineage.events").fetchone()[0], 2 if valid else 1)
                            c.execute("UPDATE outbox9d.deliveries SET status=status")
                            check(label + ":no-change-no-event", c.execute("SELECT count(*) FROM custody_lineage.events").fetchone()[0], 2 if valid else 1)
                        finally:
                            c.execute("ROLLBACK")
                check("transactions:no-retained-fixture-events", c.execute("SELECT count(*) FROM custody_lineage.events").fetchone()[0], 0)
                check("source-service:unchanged", c.execute("SELECT service FROM custody_lineage.control").fetchone()[0], "source-lineage-v2")
                check("catalog:unchanged", c.execute(catalog).fetchall() == before, True)
                witness["definitions"] = [{"schema": r[0], "name": r[1], "definitionSha256": hashlib.sha256(r[2].encode()).hexdigest(), "owner": r[3], "settings": r[4], "acl": r[5]} for r in before]
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
