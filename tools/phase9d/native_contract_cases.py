"""Selected SQL expression/NULL cases on a fresh native synthetic server, without profiling."""
import argparse
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
from psycopg import sql  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    sources = [Path(__file__), ROOT / "tools/backups/native_postgres.py", ROOT / "tools/phase9d/permissions.sql", ROOT / "tools/phase9d/custody-source.sql"]
    pins = {str(p.relative_to(ROOT)).replace("\\", "/"): digest(p) for p in sources}
    witness = {"scope": "SELECTED_CONTRACT_CASES_NOT_WHOLE_SQL", "profiling": False, "routine_replacements": False,
               "docker": False, "hosted_connections": False, "source_hashes": pins, "cases": [],
               "fixture_boundary": "Full original permissions.sql; custody retry uses exact original table DDL/function slice, without the broker/capture/signing composition."}

    def record(name, actual, expected, **extra):
        row = {"name": name, "actual": actual, "expected": expected, "pass": actual == expected, **extra}
        witness["cases"].append(row)
        if not row["pass"]:
            raise AssertionError("SYNTHETIC_CASE_FAILED:" + name)

    server = NativePostgres()
    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as admin:
                permission_source = (ROOT / "tools/phase9d/permissions.sql").read_text(encoding="utf-8-sig")
                admin.execute(permission_source, prepare=False)
                originals = admin.execute("SELECT p.oid,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner),p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('shadow9d','audit9d') ORDER BY p.oid").fetchall()
                with admin.transaction():
                    admin.execute("SET LOCAL ROLE shadow9d_owner")
                    allowed = ["booking", "assignment", "routing", "location", "connectivity", "notification", "payment", "payout", "cancellation", "feasibility", "progress", "external"]
                    categories = [("allowed_" + x, [x], True) for x in allowed]
                    categories += [("empty", [], True), ("all", allowed, True), ("duplicate", ["booking", "booking"], True),
                                   ("unknown", ["unknown"], False), ("mixed_unknown", ["booking", "unknown"], False),
                                   ("null_element", [None], False), ("number_element", [1], False), ("nested_array", [[]], False),
                                   ("object", {}, False), ("string", "booking", False), ("number", 1, False), ("boolean", True, False), ("json_null", None, False)]
                    for name, value, expected in categories:
                        record("valid_categories:" + name, admin.execute("SELECT shadow9d.valid_categories(%s::jsonb)", (Jsonb(value),)).fetchone()[0], expected)
                    record("valid_categories:sql_null", admin.execute("SELECT shadow9d.valid_categories(NULL::jsonb)").fetchone()[0], False)
                    instants = [("normal", "2026-10-21T00:00:00Z", False, True), ("leap", "2024-02-29T23:59:59.999Z", False, True),
                                ("fraction_one", "2026-01-01T00:00:00.1Z", False, True), ("fraction_two", "2026-01-01T00:00:00.12Z", False, True),
                                ("bad_leap", "2026-02-29T00:00:00Z", False, False), ("hour_24", "2026-01-01T24:00:00Z", False, False),
                                ("minute_60", "2026-01-01T00:60:00Z", False, False), ("second_60", "2026-01-01T00:00:60Z", False, False),
                                ("fraction_four", "2026-01-01T00:00:00.1234Z", False, False), ("offset", "2026-01-01T00:00:00+00:00", False, False),
                                ("lowercase_z", "2026-01-01T00:00:00z", False, False), ("space", "2026-01-01 00:00:00Z", False, False),
                                ("year_zero", "0000-01-01T00:00:00Z", False, False), ("empty", "", False, False),
                                ("number", 123, False, False), ("object", {}, False, False), ("array", [], False, False),
                                ("json_null_required", None, False, False), ("json_null_nullable", None, True, True),
                                ("json_null_unknown_nullable", None, None, None), ("valid_unknown_nullable", "2026-10-21T00:00:00Z", None, True)]
                    for name, value, nullable, expected in instants:
                        record("valid_instant:" + name, admin.execute("SELECT shadow9d.valid_instant(%s::jsonb,%s::boolean)", (Jsonb(value), nullable)).fetchone()[0], expected)
                    for nullable, expected in [(False, False), (True, None), (None, None)]:
                        record("valid_instant:sql_null_nullable_" + str(nullable), admin.execute("SELECT shadow9d.valid_instant(NULL::jsonb,%s::boolean)", (nullable,)).fetchone()[0], expected)
                worker_password = uuid.uuid4().hex
                admin.execute(sql.SQL("ALTER ROLE shadow9d_worker PASSWORD {}").format(sql.Literal(worker_password)))
                with server.connect("shadow9d_worker", worker_password, autocommit=True) as worker:
                    record("worker:authenticated_identity", worker.execute("SELECT current_user").fetchone()[0], "shadow9d_worker")
                    record("worker:restricted_role", worker.execute("SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls) FROM pg_roles WHERE rolname=current_user").fetchone()[0], True)
                    try:
                        worker.execute("SELECT * FROM shadow9d.work")
                        state = "UNEXPECTED_ALLOWED"
                    except Exception as error:
                        state = getattr(error, "sqlstate", None)
                    record("worker:direct_table_denial", state, "42501")
                    record("worker:allowed_claim", worker.execute("SELECT shadow9d.claim()").fetchone()[0], None)
                with admin.transaction():
                    admin.execute("SET LOCAL ROLE shadow9d_owner")
                    admin.execute("CREATE FUNCTION shadow9d.future_contract_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'")
                record("defaults:future_public_execute_denied", admin.execute("SELECT NOT has_function_privilege('shadow9d_worker','shadow9d.future_contract_probe()','EXECUTE')").fetchone()[0], True)

                # Extract original retry DDL/body, without fabricating a producer, receipt or lineage API.
                source = (ROOT / "tools/phase9d/custody-source.sql").read_text(encoding="utf-8-sig")
                tables = source[source.index("CREATE TABLE custody_export.control"):source.index("CREATE FUNCTION custody_export.capture()")]
                declaration = re.search(r"CREATE FUNCTION custody_export\.retry\(.*?END \$\$;", source, re.S).group()
                admin.execute("CREATE ROLE custody_source_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS")
                for name in ["custody_operator", "custody_sender"]:
                    admin.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS").format(sql.Identifier(name)))
                admin.execute("CREATE SCHEMA custody_export AUTHORIZATION custody_source_owner")
                with admin.transaction():
                    admin.execute("SET LOCAL ROLE custody_source_owner")
                    admin.execute("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC")
                    admin.execute(tables, prepare=False)
                    admin.execute(declaration)
                admin.execute("GRANT USAGE ON SCHEMA custody_export TO custody_operator,custody_sender")
                admin.execute("GRANT EXECUTE ON FUNCTION custody_export.retry(uuid,bigint,int) TO custody_operator")
                operator_password = uuid.uuid4().hex
                admin.execute(sql.SQL("ALTER ROLE custody_operator PASSWORD {}").format(sql.Literal(operator_password)))
                witness["retry_declaration_source_sha256"] = hashlib.sha256(declaration.encode()).hexdigest()
                witness["retry_catalog_definition_sha256"] = hashlib.sha256(admin.execute("SELECT pg_get_functiondef('custody_export.retry(uuid,bigint,int)'::regprocedure)").fetchone()[0].encode()).hexdigest()

                def seed(previous=None):
                    with admin.transaction():
                        admin.execute("TRUNCATE custody_export.events,custody_export.retries,custody_export.control")
                        admin.execute("INSERT INTO custody_export.control(singleton,source,secret) VALUES(true,%s,'synthetic-only')", (uuid.uuid4(),))
                        admin.execute("INSERT INTO custody_export.events(seq,local_id,event,hash,attempts,status) VALUES(1,1,'{}',repeat('a',64),3,'REVIEW')")
                        if previous:
                            admin.execute("INSERT INTO custody_export.retries VALUES(%s,1,'custody_operator',3)", (previous,))

                def state():
                    return admin.execute("SELECT (SELECT jsonb_agg(to_jsonb(e) ORDER BY seq) FROM custody_export.events e),(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM custody_export.retries r)").fetchone()

                with server.connect("custody_operator", operator_password, autocommit=True) as operator:
                    cases = [("null_operation", None, 1, 3, "23502"), ("null_sequence", uuid.uuid4(), None, 3, False),
                             ("null_expected", uuid.uuid4(), 1, None, "23502"), ("null_operation_and_expected", None, 1, None, "23502"),
                             ("malformed_operation", "not-a-uuid", 1, 3, "22P02"), ("malformed_sequence", uuid.uuid4(), "not-a-number", 3, "22P02"),
                             ("malformed_expected", uuid.uuid4(), 1, "not-a-number", "22P02"), ("negative_expected", uuid.uuid4(), 1, -1, False),
                             ("missing_sequence", uuid.uuid4(), 0, 3, False)]
                    for name, operation, sequence, expected_count, expected in cases:
                        seed()
                        before = state()
                        try:
                            actual = operator.execute("SELECT custody_export.retry(%s::uuid,%s::bigint,%s::int)", (operation, sequence, expected_count)).fetchone()[0]
                        except Exception as error:
                            actual = getattr(error, "sqlstate", None)
                        record("retry:" + name, actual, expected, unchanged=state() == before)
                        record("retry:" + name + ":persisted_unchanged", state() == before, True)
                    previous = uuid.uuid4()
                    for name, sequence, expected_count in [("duplicate_null_sequence", None, 3), ("duplicate_null_expected", 1, None)]:
                        seed(previous)
                        before = state()
                        record("retry:" + name, operator.execute("SELECT custody_export.retry(%s,%s::bigint,%s::int)", (previous, sequence, expected_count)).fetchone()[0], None)
                        record("retry:" + name + ":persisted_unchanged", state() == before, True)
                    operation = uuid.uuid4()
                    seed()
                    record("retry:valid", operator.execute("SELECT custody_export.retry(%s,1,3)", (operation,)).fetchone()[0], True)
                    record("retry:valid_state", list(admin.execute("SELECT status,attempts,recoveries FROM custody_export.events WHERE seq=1").fetchone()), ["PENDING", 0, 1])
                    before = state()
                    record("retry:exact_duplicate", operator.execute("SELECT custody_export.retry(%s,1,3)", (operation,)).fetchone()[0], True)
                    record("retry:duplicate_unchanged", state() == before, True)
                current = admin.execute("SELECT p.oid,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner),p.proconfig FROM pg_proc p WHERE p.oid=ANY(%s::oid[]) ORDER BY p.oid", ([x[0] for x in originals],)).fetchall()
                record("original_permissions:definitions_acl_owner_path_unchanged", current, originals)
                # Do not place full catalog tuples in the public witness.
                witness["cases"][-1] = {"name": witness["cases"][-1]["name"], "pass": True, "definitions_compared": len(originals)}
        witness["status"] = "PASS"
    except Exception as error:
        witness.update(status="FAIL", error_type=type(error).__name__, details_withheld=True)
        raise
    finally:
        witness["server_stopped"] = server.stopped
        witness["sources_unchanged"] = all(digest(ROOT / name) == value for name, value in pins.items())
        witness["case_count"] = len(witness["cases"])
        witness["private_server_directory"] = str(server.root)
        (output / "witness.json").write_text(json.dumps(witness, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({key: witness[key] for key in ["status", "case_count", "server_stopped", "sources_unchanged"]}))


if __name__ == "__main__":
    main()
