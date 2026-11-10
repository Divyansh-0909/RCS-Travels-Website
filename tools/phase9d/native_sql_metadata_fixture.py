"""Full custom SQL composition on minimal original-table projections.

One native server per composition; same-host administration is not independent
custody. Application projections do not certify production RLS/PostGIS behavior.
"""
import hashlib
from pathlib import Path
import uuid

from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
SQL = ROOT / "tools/phase9d"
FILES = ["permissions.sql", "outbox.sql", "transport-sender.sql", "transport-receiver.sql",
         "broker.sql", "broker-recovery.sql", "custody-source.sql", "closure-source.sql",
         "closure-lineage.sql", "closure-source-lineage.sql", "closure-consistency.sql",
         "closure-transport.sql", "custody-store.sql", "closure-store.sql", "closure-admission.sql"]


def asset(name):
    return (SQL / name).read_text(encoding="utf-8-sig")


def install(c, composition):
    if composition == "custodian":
        for name in ["custody-store.sql", "closure-store.sql", "closure-admission.sql"]:
            c.execute(asset(name), prepare=False)
    else:
        c.execute(asset("permissions.sql"), prepare=False)
        if composition == "source":
            c.execute("""CREATE TABLE public.bookings(id text PRIMARY KEY,user_id text,ungranted_fixture_field text);
CREATE TABLE public.responsibility_cases(id text PRIMARY KEY,source_key text,booking_id text,case_type text,occurred_at timestamptz);
CREATE TABLE public.responsibility_evidence_versions(id text PRIMARY KEY,case_id text,evidence_version text,evidence_hash text,snapshot jsonb,generated_at timestamptz);
CREATE TABLE public.responsibility_adjudication_work(id text PRIMARY KEY,case_id text,evidence_version_id text,contract_version text,analyst_config_version text,policy_version text,created_at timestamptz);
CREATE TABLE public.driver_cancellations(id text PRIMARY KEY,booking_id text,driver_id text,created_at timestamptz);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_cancellations ENABLE ROW LEVEL SECURITY;""", prepare=False)
            for name in ["outbox.sql", "transport-sender.sql"]:
                c.execute(asset(name), prepare=False)
            c.execute("INSERT INTO outbox9d.transport_configuration VALUES(true,%s,%s)",
                      (uuid.uuid4(), uuid.uuid4().hex * 2))
        elif composition == "receiver":
            for name in ["transport-receiver.sql", "broker.sql", "broker-recovery.sql", "custody-source.sql", "closure-source.sql"]:
                c.execute(asset(name), prepare=False)
            c.execute("INSERT INTO custody_export.control(singleton,source,secret) VALUES(true,%s,%s)",
                      (uuid.uuid4(), uuid.uuid4().hex * 2))
            c.execute("INSERT INTO transport9d.configuration VALUES(true,%s,%s)", (uuid.uuid4(), uuid.uuid4().hex * 2))
        else:
            raise ValueError("COMPOSITION_REQUIRED")
        for role in ["custody_source_sender", "custody_receiver_sender", "custody_lineage_inspector", "custody_lineage_verifier"]:
            c.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS").format(sql.Identifier(role)))
        crypto = "outbox9d" if composition == "source" else "transport9d"
        c.execute(asset("closure-lineage.sql").replace("__CRYPTO__", crypto), prepare=False)
        c.execute("INSERT INTO custody_lineage.control(singleton,source,service,secret,now_at) VALUES(true,%s,%s,%s,'2026-10-23T00:00:00Z')",
                  (uuid.uuid4(), composition + "-lineage-v2", uuid.uuid4().hex * 2))
        sender = "custody_" + composition + "_sender"
        c.execute(sql.SQL("GRANT USAGE ON SCHEMA custody_lineage TO {},custody_lineage_inspector,custody_lineage_verifier; "
                          "GRANT EXECUTE ON FUNCTION custody_lineage.frame(bigint),custody_lineage.next() TO {}; "
                          "GRANT EXECUTE ON FUNCTION custody_lineage.ack(bigint,text,jsonb) TO custody_lineage_verifier; "
                          "GRANT SELECT ON custody_lineage.events TO custody_lineage_inspector; "
                          "GRANT SELECT(source,seq,head,max_events,deferred,last_deferred_hash) ON custody_lineage.control TO custody_lineage_inspector").format(
                              sql.Identifier(sender), sql.Identifier(sender)), prepare=False)
        if composition == "source":
            c.execute(asset("closure-source-lineage.sql"), prepare=False)
            c.execute("GRANT EXECUTE ON FUNCTION custody_lineage.expected_sources() TO custody_lineage_inspector; "
                      "CREATE TRIGGER custody_source_outbox AFTER INSERT OR UPDATE ON outbox9d.deliveries FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture(); "
                      "CREATE TRIGGER custody_source_audit AFTER INSERT ON audit9d.events FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture()", prepare=False)
        else:
            for name, event, table in [("receipt", "INSERT", "transport9d.receipts"),
                                       ("work", "INSERT OR UPDATE", "shadow9d.work"),
                                       ("audit", "INSERT", "audit9d.events"),
                                       ("retry", "INSERT", "custody_export.retries")]:
                c.execute(sql.SQL("CREATE TRIGGER {} AFTER " + event + " ON " + table +
                                  " FOR EACH ROW EXECUTE FUNCTION custody_lineage.capture()").format(sql.Identifier("custody_receiver_" + name)))
            c.execute(asset("closure-transport.sql"), prepare=False)
        c.execute(asset("closure-consistency.sql"), prepare=False)
    # Same bootstrap TEMP denial as the existing recovery/custody fixtures.
    c.execute("REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC")
    c.execute("CREATE ROLE cert_untrusted LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS")
    roles = c.execute("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname<>'proofloop_owner' AND rolcanlogin ORDER BY 1").fetchall()
    passwords = {}
    for (role,) in roles:
        password = uuid.uuid4().hex
        c.execute(sql.SQL("ALTER ROLE {} PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
        passwords[role] = password
    return passwords


def catalog(c):
    namespaces = ["shadow9d", "audit9d", "outbox9d", "transport9d", "broker9d", "custody_export", "custody_lineage", "custody"]
    routines = c.execute("""SELECT p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,p.provolatile,p.proconfig,p.proacl::text,
EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY(%s) ORDER BY n.nspname,p.proname,p.oid""", (namespaces,)).fetchall()
    tables = c.execute("""SELECT n.nspname,p.relname,p.relkind,pg_get_userbyid(p.relowner),p.relrowsecurity,p.relforcerowsecurity,p.relacl::text
FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname=ANY(%s) AND p.relkind IN('r','S') ORDER BY 1,2""", (namespaces,)).fetchall()
    triggers = c.execute("""SELECT n.nspname,r.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname=ANY(%s) AND NOT t.tgisinternal ORDER BY 1,2,3""", (namespaces,)).fetchall()
    constraints = c.execute("""SELECT n.nspname,r.relname,t.conname,t.contype,t.convalidated,pg_get_constraintdef(t.oid)
FROM pg_constraint t JOIN pg_class r ON r.oid=t.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname=ANY(%s) ORDER BY 1,2,3""", (namespaces,)).fetchall()
    defaults = c.execute("SELECT pg_get_userbyid(defaclrole),defaclnamespace::regnamespace::text,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY 1,2,3").fetchall()
    return {"routines": [{"oid": r[0], "schema": r[1], "name": r[2], "arguments": r[3],
                          "definition": r[4], "definitionSha256": hashlib.sha256(r[4].encode()).hexdigest(),
                          "owner": r[5], "securityDefiner": r[6], "volatility": r[7], "settings": r[8],
                          "acl": r[9], "extensionMember": r[10]} for r in routines],
            "tables": tables, "triggers": triggers, "constraints": constraints, "defaults": defaults}
