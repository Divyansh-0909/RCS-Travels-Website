"""Effective catalog and real-login checks in three isolated SQL compositions."""
import hashlib
import json
from pathlib import Path
import sys

from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres  # noqa: E402
from native_sql_metadata_fixture import FILES, catalog, install  # noqa: E402

OUT = ROOT / "output/phase9d-sql-conditions-metadata-2026-10-23"
OWNERS = {"shadow9d": "shadow9d_owner", "audit9d": "shadow9d_auditor", "outbox9d": "shadow9d_owner",
          "transport9d": "shadow9d_owner", "broker9d": "broker9d_owner", "custody_export": "custody_source_owner",
          "custody_lineage": "shadow9d_owner", "custody": "custody_owner"}


def main():
    files = [Path(__file__), ROOT / "tools/phase9d/native_sql_metadata_fixture.py",
             ROOT / "tools/backups/native_postgres.py", ROOT / "backend/tests/helpers/phase9dCustodyLineageFixture.js",
             ROOT / "backend/tests/helpers/phase9dRecoveryFixture.js", ROOT / "backend/tests/helpers/phase9dCustodyFixture.js"]
    files += [ROOT / "tools/phase9d" / name for name in FILES]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins, "compositions": [], "profiling": False,
               "routineReplacementsDuringObservation": False, "p8": "NOT_STARTED", "production": "OFF",
               "boundary": "Full selected custom source composition, minimal original source tables; PG18 not PG17; "
                           "source/receiver/custodian use separate sequential local servers, not independent administrators"}

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    def denied(conn, statement, params=None):
        try:
            conn.execute(statement, params)
            return "UNEXPECTED_ALLOWED"
        except Exception as error:
            return getattr(error, "sqlstate", None)

    try:
        for kind in ["source", "receiver", "custodian"]:
            server = NativePostgres()
            composition = {"name": kind, "serverStopped": False}
            witness["compositions"].append(composition)
            try:
                with server:
                    composition["environment"] = server.identity
                    with server.connect(autocommit=True) as c:
                        passwords = install(c, kind)
                        before = catalog(c)
                        composition["catalog"] = before
                        custom = [r for r in before["routines"] if not r["extensionMember"]]
                        composition["customRoutineCount"] = len(custom)
                        check(kind + ":custom-routines-present", len(custom) > 0)
                        for routine in custom:
                            label = kind + ":routine:" + routine["schema"] + "." + routine["name"]
                            check(label + ":owner", routine["owner"], OWNERS[routine["schema"]])
                            config = routine["settings"] or []
                            path = next((item.split("=", 1)[1] for item in config if item.startswith("search_path=")), "")
                            parts = [part.strip() for part in path.split(",")]
                            check(label + ":explicit-search-path", parts[0] == "pg_catalog" and parts[-1] == "pg_temp")
                            public = c.execute("SELECT EXISTS(SELECT FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a "
                                               "WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM pg_proc WHERE oid=%s", (routine["oid"],)).fetchone()[0]
                            check(label + ":public-execute", public, False)
                        check(kind + ":constraints-validated", all(row[4] for row in before["constraints"]))
                        check(kind + ":triggers-enabled", all(row[3] == "O" for row in before["triggers"]))
                        expected = {"source": {"custody_source_outbox", "custody_source_audit"},
                                    "receiver": {"request_revision", "custody_capture", "custody_analysis_reservation",
                                                 "custody_analysis_registration", "custody_analysis_dispatch", "custody_analysis_send",
                                                 "custody_receiver_receipt", "custody_receiver_work", "custody_receiver_audit", "custody_receiver_retry"},
                                    "custodian": set()}[kind]
                        check(kind + ":exact-trigger-set", sorted(row[2] for row in before["triggers"]), sorted(expected))
                        if kind == "receiver":
                            triggers = {row[2]: row[4] for row in before["triggers"]}
                            check("receiver:dispatch-when-clause", "WHEN" in triggers["custody_analysis_dispatch"] and "DISPATCH_ADMITTED" in triggers["custody_analysis_dispatch"])
                            check("receiver:send-when-clause", "WHEN" in triggers["custody_analysis_send"] and "IS NULL" in triggers["custody_analysis_send"])
                        owners = sorted({r["owner"] for r in custom})
                        for owner in owners:
                            flags = c.execute("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=%s", (owner,)).fetchone()
                            check(kind + ":owner-flags:" + owner, list(flags), [False] * 7)
                            original_schema = next(r["schema"] for r in custom if r["owner"] == owner)
                            for schema in [original_schema, "cert_future_" + owner]:
                                fresh = schema.startswith("cert_future_")
                                if fresh:
                                    c.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}; GRANT USAGE ON SCHEMA {} TO cert_untrusted").format(
                                        sql.Identifier(schema), sql.Identifier(owner), sql.Identifier(schema)), prepare=False)
                                with c.transaction():
                                    c.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(owner)))
                                    c.execute(sql.SQL("CREATE FUNCTION {}.cert_future_function() RETURNS int LANGUAGE sql AS 'SELECT 1'").format(sql.Identifier(schema)))
                                oid = c.execute("SELECT to_regprocedure(%s)::oid", (schema + ".cert_future_function()",)).fetchone()[0]
                                check(kind + ":future-public-execute:" + schema,
                                      c.execute("SELECT has_function_privilege('cert_untrusted',%s,'EXECUTE')", (oid,)).fetchone()[0], False)
                                if fresh:
                                    with server.connect("cert_untrusted", passwords["cert_untrusted"], autocommit=True) as untrusted:
                                        check(kind + ":future-actual-execute-denial:" + owner,
                                              denied(untrusted, sql.SQL("SELECT {}.cert_future_function()").format(sql.Identifier(schema))), "42501")
                                    c.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
                                else:
                                    c.execute(sql.SQL("DROP FUNCTION {}.cert_future_function()").format(sql.Identifier(schema)))
                        acl_matrix = []
                        private_functions = ["custody.accept(jsonb,text,text)", "custody.active_key()"] if kind == "custodian" else [
                            "custody_lineage.emit(text,text,text,jsonb,text)", "custody_lineage.capture_existing()"]
                        private_functions += ["outbox9d.source(text)"] if kind == "source" else []
                        if kind == "receiver":
                            private_functions += ["broker9d.allowed_before_recovery(uuid,uuid,text[])",
                                                  "broker9d.observe_before_recovery(uuid,uuid,jsonb)",
                                                  "broker9d.register_before_recovery(jsonb)", "broker9d.recover_before_recovery(uuid)",
                                                  "shadow9d.broker_payload_cleanup(uuid)", "transport9d.receive_committed(jsonb)",
                                                  "broker9d.set_stop(boolean)"]
                        for role, password in passwords.items():
                            with server.connect(role, password, autocommit=True) as actor:
                                prefix = kind + ":login:" + role
                                check(prefix + ":actual-principal", list(actor.execute("SELECT current_user,session_user").fetchone()), [role, role])
                                flags = c.execute("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=%s", (role,)).fetchone()[0]
                                check(prefix + ":no-privileged-flags", flags, False)
                                memberships = c.execute("SELECT EXISTS(SELECT FROM pg_roles WHERE rolname=ANY(%s) AND pg_has_role(%s,oid,'MEMBER'))", (owners, role)).fetchone()[0]
                                check(prefix + ":no-owner-membership", memberships, False)
                                for signature in private_functions:
                                    allowed = c.execute("SELECT has_function_privilege(%s,%s,'EXECUTE')", (role, signature)).fetchone()[0]
                                    check(prefix + ":private-helper:" + signature, allowed, False)
                                check(prefix + ":no-temp", denied(actor, "CREATE TEMP TABLE cert_escape(id int)"), "42501")
                                check(prefix + ":no-role-escalation", denied(actor, sql.SQL("SET ROLE {}").format(sql.Identifier(owners[0]))), "42501")
                                check(prefix + ":no-role-creation", denied(actor, "CREATE ROLE cert_forbidden NOLOGIN"), "42501")
                                mutation = c.execute("""SELECT EXISTS(SELECT FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace
WHERE n.nspname=ANY(%s) AND p.relkind='r' AND (has_table_privilege(%s,p.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
OR has_any_column_privilege(%s,p.oid,'INSERT,UPDATE')))""", (list(OWNERS), role, role)).fetchone()[0]
                                check(prefix + ":no-direct-table-mutation", mutation, False)
                                permitted = c.execute("SELECT n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                                                      "WHERE n.nspname=ANY(%s) AND has_function_privilege(%s,p.oid,'EXECUTE') ORDER BY 1,2", (list(OWNERS), role)).fetchall()
                                acl_matrix.append({"role": role, "effectiveExecute": permitted})
                                if role == "custody_" + kind + "_sender":
                                    check(prefix + ":authorized-empty-next", actor.execute("SELECT custody_lineage.next()").fetchone()[0], None)
                                    check(prefix + ":emit-denied", denied(actor, "SELECT custody_lineage.emit(NULL,NULL,NULL,NULL,NULL)"), "42501")
                                elif role in {"custody_source_sender", "custody_receiver_sender"}:
                                    check(prefix + ":opposite-service-denied", denied(actor, "SELECT custody_lineage.next()"), "42501")
                                private = {"shadow9d_capture": "SELECT transport9d.receive_committed(NULL)",
                                           "broker9d_exec": "SELECT broker9d.register_before_recovery(NULL)",
                                           "broker9d_ops": "SELECT broker9d.set_stop(false)"}
                                if kind == "receiver" and role in private:
                                    check(prefix + ":private-alias-denied", denied(actor, private[role]), "42501")
                                if role == "custody_lineage_inspector":
                                    check(prefix + ":secret-column-denied", denied(actor, "SELECT secret FROM custody_lineage.control"), "42501")
                                    check(prefix + ":allowed-minimal-column", actor.execute("SELECT count(source) FROM custody_lineage.control").fetchone()[0], 1)
                                secret = {"source": "SELECT privacy_key FROM outbox9d.configuration",
                                          "receiver": "SELECT secret FROM broker9d.usage_authority",
                                          "custodian": "SELECT verification_secret FROM custody.sources"}[kind]
                                check(prefix + ":direct-secret-read-denied", denied(actor, secret), "42501")
                        composition["effectiveExecuteMatrix"] = acl_matrix
                        if kind == "source":
                            with c.transaction():
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                check("source:least-column-select", c.execute("SELECT count(id) FROM public.bookings").fetchone()[0], 0)
                            with c.transaction(force_rollback=True):
                                c.execute("SET LOCAL ROLE shadow9d_owner")
                                check("source:ungranted-column-refused", denied(c, "SELECT ungranted_fixture_field FROM public.bookings"), "42501")
                        after = catalog(c)
                        check(kind + ":definitions-acl-path-owner-trigger-constraint-defaults-stable", after == before)
            finally:
                composition["serverStopped"] = server.stopped
        witness["status"] = "PASS"
    finally:
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "metadata-accepted.json").open("x", encoding="utf-8") as output:
            json.dump(witness, output, indent=2)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"],
                      "serversStopped": all(c["serverStopped"] for c in witness["compositions"])}))


if __name__ == "__main__":
    main()
