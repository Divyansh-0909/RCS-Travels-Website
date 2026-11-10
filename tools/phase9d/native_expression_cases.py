"""Focused existing SQL-expression contracts on one fresh native PostgreSQL server."""

import argparse
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


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def declaration(path, name):
    match = re.search(r"CREATE FUNCTION " + re.escape(name) + r"\(.*?\$\$;", path.read_text(encoding="utf-8-sig"), re.S)
    if match is None:
        raise RuntimeError("EXACT_DECLARATION_NOT_FOUND")
    return match.group()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    inputs = [Path(__file__), ROOT / "tools/backups/native_postgres.py", ROOT / "tools/phase9d/broker.sql",
              ROOT / "tools/phase9d/outbox.sql", ROOT / "tools/phase9d/transport-sender.sql"]
    pins = {str(path.relative_to(ROOT)): sha(path) for path in inputs}
    witness = {"scope": "EXACT_SQL_HELPER_EXPRESSIONS_ONLY", "profiling": False, "routineReplacement": False,
               "docker": False, "hostedConnection": False, "sourceHashes": pins, "cases": [],
               "boundary": "Exact three helper declarations and exact transport configuration DDL; genuine pgcrypto dependency. Not full broker/transport composition, service ACL or native coverage certification."}
    server = NativePostgres()

    def record(name, actual, expected):
        row = {"name": name, "actual": actual, "expected": expected, "pass": actual == expected}
        witness["cases"].append(row)
        if not row["pass"]:
            raise AssertionError("EXPRESSION_CASE_FAILED:" + name)

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as admin:
                admin.execute("CREATE ROLE shadow9d_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS")
                admin.execute("CREATE ROLE broker9d_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS")
                admin.execute("CREATE SCHEMA outbox9d AUTHORIZATION shadow9d_owner")
                admin.execute("CREATE SCHEMA broker9d AUTHORIZATION broker9d_owner")
                admin.execute("CREATE EXTENSION pgcrypto WITH SCHEMA outbox9d")
                transport = ROOT / "tools/phase9d/transport-sender.sql"
                table_match = re.search(r"CREATE TABLE outbox9d\.transport_configuration \(.*?\n\);", transport.read_text(encoding="utf-8-sig"), re.S)
                if table_match is None:
                    raise RuntimeError("EXACT_CONFIGURATION_DDL_REQUIRED")
                declarations = [
                    ("shadow9d_owner", declaration(ROOT / "tools/phase9d/outbox.sql", "outbox9d.binding")),
                    ("shadow9d_owner", declaration(transport, "outbox9d.valid_remote_receipt")),
                    ("broker9d_owner", declaration(ROOT / "tools/phase9d/broker.sql", "broker9d.valid_envelope")),
                ]
                with admin.transaction():
                    admin.execute("SET LOCAL ROLE shadow9d_owner")
                    admin.execute("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC")
                    admin.execute(table_match.group())
                for role, text in declarations:
                    with admin.transaction():
                        admin.execute("SET LOCAL ROLE " + role)
                        admin.execute("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC")
                        admin.execute(text)
                catalog_sql = """SELECT p.oid::int,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
                    pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl::text
                    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE (n.nspname,p.proname) IN (('outbox9d','binding'),('outbox9d','valid_remote_receipt'),('broker9d','valid_envelope')) ORDER BY p.oid"""
                before = admin.execute(catalog_sql).fetchall()
                witness["catalogs"] = [{"schema": row[1], "name": row[2], "arguments": row[3], "definition": row[4],
                                        "definitionSha256": hashlib.sha256(row[4].encode()).hexdigest(), "owner": row[5],
                                        "securityDefiner": row[6], "searchPath": row[7], "acl": row[8]} for row in before]

                def owner_query(role, expression, parameters):
                    with admin.transaction():
                        admin.execute("SET LOCAL ROLE " + role)
                        return admin.execute(expression, parameters).fetchone()[0]

                summary = "Bounded Jev V5 categorical recommendation. No freeform facts or citations were returned; independent evidence and policy checks determine eligibility."
                envelope = {"analysisId": "a" * 64, "contractVersion": "responsibility-analysis-v1", "provider": "typesafe-ai", "model": "jev-1.13.0",
                            "output": {"caseId": "synthetic-case", "suggestedClassification": "UNDETERMINED", "confidence": 0.5,
                                       "factsSupporting": [], "factsAgainst": [], "contradictions": [], "missingEvidence": [], "inferences": [],
                                       "severityAssessment": "UNKNOWN", "suggestedActionCategory": "ADMIN_REVIEW", "explanationSummary": summary}}

                def envelope_case(name, value, expected=False, case_id="synthetic-case", sql_null=False):
                    actual = owner_query("broker9d_owner", "SELECT broker9d.valid_envelope(%s::jsonb,%s::text)",
                                         (None if sql_null else Jsonb(value), case_id))
                    record("envelope:" + name, actual, expected)

                envelope_case("valid", envelope, True)
                for name, value in [("sql_null", None), ("json_null", None), ("array", []), ("string", "x"), ("number", 1), ("boolean", True)]:
                    envelope_case(name, value, sql_null=name == "sql_null")
                for field in envelope:
                    altered = copy.deepcopy(envelope)
                    del altered[field]
                    envelope_case("missing:" + field, altered)
                for field in envelope["output"]:
                    altered = copy.deepcopy(envelope)
                    del altered["output"][field]
                    envelope_case("missing_output:" + field, altered)
                for field, value in [("analysisId", "A" * 64), ("analysisId", "a" * 63), ("contractVersion", "other"),
                                     ("provider", "other"), ("model", "other"), ("output", []), ("output", None), ("unexpected", True)]:
                    altered = copy.deepcopy(envelope)
                    altered[field] = value
                    envelope_case("invalid_root:" + field + ":" + str(value)[:12], altered)
                output_bad = [("caseId", "other-case"), ("suggestedClassification", "other"), ("confidence", "0.5"),
                              ("confidence", None), ("confidence", True), ("severityAssessment", "other"),
                              ("suggestedActionCategory", "other"), ("explanationSummary", "untrusted text"), ("unexpected", True)]
                output_bad += [(field, ["untrusted"]) for field in ["factsSupporting", "factsAgainst", "contradictions", "missingEvidence", "inferences"]]
                for index, (field, value) in enumerate(output_bad):
                    altered = copy.deepcopy(envelope)
                    altered["output"][field] = value
                    envelope_case("invalid_output:" + field + ":" + str(index), altered)
                envelope_case("null_case_argument", envelope, case_id=None)
                for field, values in [("suggestedClassification", ["DRIVER_CAUSED", "PLATFORM_CAUSED", "VALID_WAIVED"]),
                                      ("severityAssessment", ["MINIMAL", "MODERATE", "AGGRAVATED"]),
                                      ("suggestedActionCategory", ["AUTO_UPHOLD_CANDIDATE", "AUTO_WAIVE_CANDIDATE"])]:
                    for value in values:
                        altered = copy.deepcopy(envelope)
                        altered["output"][field] = value
                        envelope_case("allowed_output:" + value, altered, True)
                for number in [-1, 2]:
                    altered = copy.deepcopy(envelope)
                    altered["output"]["confidence"] = number
                    envelope_case("existing_numeric_confidence_no_range:" + str(number), altered, True)

                payload = {"key": "synthetic-delivery", "snapshot": {"caseId": "synthetic-case"}}
                service = str(uuid.uuid4())
                admin.execute("INSERT INTO outbox9d.transport_configuration(singleton,service_id,receipt_key) VALUES(true,%s,%s)",
                              (service, "synthetic-receipt-mac-key-" + "x" * 32))
                body = {"schema": "shadow-receipt-v1", "service": service, "key": payload["key"],
                        "payloadBinding": owner_query("shadow9d_owner", "SELECT outbox9d.binding(%s::jsonb)", (Jsonb(payload),)),
                        "receipt": str(uuid.uuid4()), "workId": "1", "status": "PENDING"}

                def signed(value):
                    mac = admin.execute("SELECT encode(outbox9d.hmac(%s::jsonb::text,receipt_key,'sha256'),'hex') FROM outbox9d.transport_configuration",
                                        (Jsonb(value),)).fetchone()[0]
                    return {"body": value, "mac": mac}

                def receipt_case(name, value, expected=False, candidate=None, sql_null=False):
                    actual = owner_query("shadow9d_owner", "SELECT outbox9d.valid_remote_receipt(%s::jsonb,%s::jsonb)",
                                         (Jsonb(payload if candidate is None else candidate), None if sql_null else Jsonb(value)))
                    record("receipt:" + name, actual, expected)

                receipt = signed(body)
                receipt_case("valid", receipt, True)
                receipt_case("sql_null", None, sql_null=True)
                for name, value in [("json_null", None), ("array", []), ("string", "x"), ("number", 1), ("boolean", True)]:
                    receipt_case(name, value)
                for field in ["body", "mac"]:
                    value = copy.deepcopy(receipt)
                    del value[field]
                    receipt_case("missing_outer:" + field, value)
                value = dict(receipt, unexpected=True)
                receipt_case("unexpected_outer", value)
                receipt_case("wrong_mac", dict(receipt, mac="0" * 64))
                receipt_case("wrong_body_type", {"body": [], "mac": "0" * 64})
                for field in body:
                    value = copy.deepcopy(body)
                    del value[field]
                    receipt_case("missing_signed_body:" + field, signed(value))
                invalid = [("schema", "other"), ("service", str(uuid.uuid4())), ("key", "other"),
                           ("payloadBinding", "0" * 64), ("receipt", "invalid"), ("receipt", body["receipt"].upper()),
                           ("workId", "0"), ("workId", "01"), ("workId", "1" * 20), ("status", "other"), ("unexpected", True)]
                for index, (field, value) in enumerate(invalid):
                    altered = copy.deepcopy(body)
                    altered[field] = value
                    receipt_case("invalid_signed_body:" + field + ":" + str(index), signed(altered))
                for status in ["PROCESSING", "RETRYABLE", "COMPLETED", "MANUAL_REVIEW"]:
                    receipt_case("allowed_status:" + status, signed(dict(body, status=status)), True)
                # Observe current text-extraction/regex contract, without inventing stronger validation.
                receipt_case("numeric_work_id_text_coercion", signed(dict(body, workId=1)), True)
                receipt_case("nineteen_digit_work_id_regex_only", signed(dict(body, workId="9999999999999999999")), True)
                receipt_case("changed_payload_binding", receipt, candidate=dict(payload, extra="changed"))
                with admin.transaction(force_rollback=True):
                    admin.execute("DELETE FROM outbox9d.transport_configuration")
                    receipt_case("missing_configuration_returns_sql_null", receipt, None)
                record("catalog:definition_owner_acl_path_unchanged", admin.execute(catalog_sql).fetchall() == before, True)
                record("fixture:configuration_restored", admin.execute("SELECT count(*) FROM outbox9d.transport_configuration").fetchone()[0], 1)
        witness["status"] = "PASS"
    except Exception as error:
        witness.update(status="FAIL", errorType=type(error).__name__, detailsWithheld=True)
        raise
    finally:
        witness["serverStopped"] = server.stopped
        witness["sourcesUnchanged"] = all(sha(ROOT / name) == value for name, value in pins.items())
        witness["caseCount"] = len(witness["cases"])
        with (output / "witness.json").open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(witness, handle, indent=2, default=str)
            handle.write("\n")
    print(json.dumps({"status": witness["status"], "checks": len(witness["cases"]), "serverStopped": server.stopped}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("NATIVE_EXPRESSION_CHECK_FAILED_DETAILS_WITHHELD")
        raise SystemExit(1)
