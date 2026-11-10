"""Application-scope PostgreSQL backup. No provisioning or deletion API.

Credentials are environment-only. CLI failures are reduced to error codes: SQL,
URLs, subprocess stderr and decrypted contents must never reach CI logs.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import urlsplit, unquote
import uuid

import boto3
from botocore.config import Config
import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

UTC = dt.timezone.utc
NAME = re.compile(r"[a-z][a-z0-9_]{0,62}\Z")
REPO = Path(__file__).resolve().parents[2]


class Refused(Exception):
    """A sanitized, stable refusal code."""


def require(condition, code):
    if not condition:
        raise Refused(code)


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(argv, *, env=None):
    try:
        result = subprocess.run(argv, env=env, capture_output=True, timeout=300, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Refused("TOOL_UNAVAILABLE_OR_TIMEOUT") from error
    if result.returncode != 0:
        error = Refused("TOOL_FAILED")
        error.tool = Path(argv[0]).name
        stderr = result.stderr.decode(errors="replace")
        patterns = {"SCHEMA_ALREADY_EXISTS": r"schema .*already exists", "EXTENSION_ALREADY_EXISTS": r"extension .*already exists",
                    "ROLE_MISSING": r"role .*does not exist", "FUNCTION_MISSING": r"function .*does not exist",
                    "TYPE_MISSING": r"type .*does not exist", "PERMISSION_DENIED": r"permission denied",
                    "OWNER_REQUIRED": r"must be owner", "CONFIG_PARAMETER_UNSUPPORTED": r"unrecognized configuration parameter",
                    "ARCHIVE_VERSION_UNSUPPORTED": r"unsupported version", "RELATION_MISSING": r"relation .*does not exist",
                    "CONNECTION_FAILED": r"connection .*failed|could not connect", "SCHEMA_MISSING": r"schema .*does not exist"}
        error.diagnostic_codes = [code for code, pattern in patterns.items() if re.search(pattern, stderr, re.I)]
        error.stderr_sha256 = hashlib.sha256(result.stderr).hexdigest()
        raise error
    # Do not forward tool output; it may contain connection strings or SQL.
    return result.stdout


def tool(name):
    return str(Path(os.environ["PG_BIN"]) / name) if os.environ.get("PG_BIN") else name


def database_connect(url, **kwargs):
    """Bound connection negotiation; local plain transport is loopback-only."""
    kwargs.setdefault("connect_timeout", 10)
    if urlsplit(url).hostname in ("localhost", "127.0.0.1"):
        kwargs.update(hostaddr="127.0.0.1", sslmode="disable", gssencmode="disable")
    return psycopg.connect(url, **kwargs)


def connection_env(url):
    p = urlsplit(url)
    require(p.scheme in ("postgres", "postgresql"), "DATABASE_URL_INVALID")
    require(p.port != 6543, "TRANSACTION_POOLER_REFUSED")
    require(p.hostname and p.username and p.path[1:], "DATABASE_URL_INCOMPLETE")
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("PG") and key != "PG_BIN":
            env.pop(key, None)
    mapping = {"host": "PGHOST", "port": "PGPORT", "user": "PGUSER", "password": "PGPASSWORD", "dbname": "PGDATABASE",
               "sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT", "channel_binding": "PGCHANNELBINDING", "connect_timeout": "PGCONNECT_TIMEOUT"}
    options = conninfo_to_dict(url)
    require(p.hostname in ("localhost", "127.0.0.1") or options.get("sslmode") == "verify-full", "HOSTED_TLS_VERIFY_FULL_REQUIRED")
    require(set(options) <= set(mapping), "UNSUPPORTED_CONNECTION_OPTION")
    env.update({mapping[k]: v for k, v in options.items()})
    env.setdefault("PGCONNECT_TIMEOUT", "10")
    if p.hostname in ("localhost", "127.0.0.1"):
        env.update(PGHOSTADDR="127.0.0.1", PGSSLMODE="disable", PGGSSENCMODE="disable")
    return env


def load_config(path, *, synthetic=False):
    c = json.loads(Path(path).read_text(encoding="utf-8"))
    require(c.get("version") == 1 and c.get("enabled") is True, "BACKUP_DISABLED")
    require(c.get("scope") in ("source", "receiver", "custodian"), "SCOPE_INVALID")
    for kind in ("schemas", "roles", "extensions", "excluded_schemas_reviewed"):
        require(isinstance(c.get(kind), list), "CONFIG_LIST_REQUIRED")
        require(all(isinstance(n, str) and NAME.fullmatch(n) for n in c[kind]), "NAME_INVALID")
        require(len(c[kind]) == len(set(c[kind])), "DUPLICATE_NAME")
    require(c["schemas"] and c["roles"], "EMPTY_SCOPE")
    require(c.get("private_bucket_confirmed") is True, "PRIVATE_BUCKET_UNCONFIRMED")
    require(synthetic or c.get("hosting_compatibility_approved") is True, "HOSTING_NOT_APPROVED")
    require(re.fullmatch(r"[a-zA-Z0-9/_-]+", c["prefix"]) and ".." not in c["prefix"], "PREFIX_INVALID")
    require(0 < c["max_archive_bytes"] <= 4 * 1024**3, "ARCHIVE_LIMIT_INVALID")
    require(1 <= c["stale_after_hours"] <= 168, "STALE_LIMIT_INVALID")
    require(c["recipient"].startswith("age1"), "PUBLIC_RECIPIENT_REQUIRED")
    # Production deletion is deliberately unimplemented, regardless of config.
    return c


def storage(*, synthetic=False):
    endpoint = os.environ["R2_ENDPOINT"]
    p = urlsplit(endpoint)
    if synthetic:
        require(p.hostname in ("127.0.0.1", "localhost") and p.scheme == "http", "SYNTHETIC_ENDPOINT_REQUIRED")
    else:
        require(p.scheme == "https" and p.hostname and
                p.hostname.endswith(".r2.cloudflarestorage.com") and not p.username,
                "R2_ENDPOINT_INVALID")
    return boto3.client("s3", endpoint_url=endpoint, region_name="us-east-1" if synthetic else "auto",
                        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                        config=Config(connect_timeout=10, read_timeout=30,
                                      retries={"max_attempts": 2},
                                      request_checksum_calculation="when_required",
                                      response_checksum_validation="when_required",
                                      s3={"addressing_style": "path"}))


def inventory(conn, c):
    require(conn.info.server_version >= 160000, "POSTGRES_16_OR_NEWER_REQUIRED")
    def rows(query, params=()):
        return conn.execute(query, params).fetchall()
    schemas = [r[0] for r in rows("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY 1")]
    require(set(c["schemas"]).issubset(schemas), "SCHEMA_MISSING")
    require(set(schemas) <= set(c["schemas"] + c["excluded_schemas_reviewed"]), "UNREVIEWED_SCHEMA")
    extensions = rows("SELECT e.extname,e.extversion,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1")
    require(set(r[0] for r in extensions) == set(c["extensions"]), "EXTENSION_SET_MISMATCH")
    require(all(r[2] == "pg_catalog" or r[2] in c["schemas"] for r in extensions), "EXTENSION_SCHEMA_EXCLUDED")
    roles = rows("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit,rolconfig FROM pg_roles WHERE rolname=ANY(%s) ORDER BY 1", (c["roles"],))
    require(len(roles) == len(c["roles"]), "ROLE_MISSING")
    require(all(not any(r[i] for i in (2, 3, 4, 6, 7)) for r in roles), "PRIVILEGED_ROLE_REFUSED")
    memberships = rows("SELECT a.rolname,b.rolname,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.roleid JOIN pg_roles b ON b.oid=m.member WHERE a.rolname=ANY(%s) OR b.rolname=ANY(%s) ORDER BY 1,2", (c["roles"], c["roles"]))
    tables = []
    for schema, table in rows("SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY(%s) ORDER BY 1,2", (c["schemas"],)):
        count = conn.execute(sql.SQL("SELECT count(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(table))).fetchone()[0]
        tables.append([schema, table, count])
    return {"server_version": conn.info.server_version, "schemas": schemas, "tables": tables,
            "extensions": extensions, "roles_without_passwords": roles, "memberships": memberships,
            "database_settings": rows("SELECT datcollate,datctype,pg_encoding_to_char(encoding) FROM pg_database WHERE datname=current_database()"),
            "database_role_settings": rows("SELECT COALESCE(r.rolname,'ALL'),s.setconfig FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole WHERE s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())"),
            "schema_owners_acl": rows("SELECT nspname,pg_get_userbyid(nspowner),nspacl::text FROM pg_namespace WHERE nspname=ANY(%s) ORDER BY 1", (c["schemas"],)),
            "default_acl": rows("SELECT pg_get_userbyid(defaclrole),n.nspname,defaclobjtype,defaclacl::text FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3")}


def backup(c, client, url, *, synthetic=False):
    started = time.monotonic()
    env = connection_env(url)
    key = c["prefix"] + "/" + dt.datetime.now(UTC).strftime("%Y/%m/%d/%H%M%S-") + str(uuid.uuid4()) + ".tar.age"
    with tempfile.TemporaryDirectory(prefix="rcs-backup-") as tmp:
        root = Path(tmp)
        require(not root.is_relative_to(REPO), "SCRATCH_INSIDE_REPOSITORY")
        os.chmod(root, 0o700)
        with database_connect(url) as conn:
            conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
            conn.read_only = True
            conn.execute("SET LOCAL statement_timeout='60s'")
            observed = conn.execute("SELECT current_setting('transaction_isolation'),current_setting('transaction_read_only')").fetchone()
            require(observed == ("repeatable read", "on"), "SNAPSHOT_TRANSACTION_NOT_READ_ONLY_REPEATABLE")
            snapshot = conn.execute("SELECT pg_export_snapshot()").fetchone()[0]
            recovery_point = conn.execute("SELECT transaction_timestamp()").fetchone()[0].isoformat()
            details = inventory(conn, c)
            # Same read-only exported snapshot as the dump. Scope metadata is
            # inside the encrypted inventory, never a plaintext public pointer.
            from retention_backup_index import snapshot_index
            details["retention_restore_index"] = snapshot_index(conn)
            dump = root / "database.dump"
            args = [tool("pg_dump"), "--format=custom", "--lock-wait-timeout=10s", "--snapshot=" + snapshot,
                    "--file=" + str(dump), "--large-objects"]
            # Positive schema/extension filters omit owner-wide default ACLs.
            # Inventory first proves the entire user-schema/extension set; dump
            # the database minus only explicitly reviewed exclusions instead.
            for name in c["excluded_schemas_reviewed"]:
                args += ["--exclude-schema=" + name]
            run(args, env=env)
            require(dump.stat().st_size <= c["max_archive_bytes"], "ARCHIVE_TOO_LARGE")
            details.update({"version": 1, "scope": c["scope"], "created_at": dt.datetime.now(UTC).isoformat(),
                            "dump_sha256": digest(dump), "snapshot": snapshot, "recovery_point_at": recovery_point,
                            "snapshot_transaction": list(observed),
                            "export_layout": "database-minus-reviewed-schemas",
                            "pg_dump_version": run([tool("pg_dump"), "--version"]).decode().strip(),
                            "excluded_schemas": c["excluded_schemas_reviewed"],
                            "role_passwords": "EXCLUDED_RESET_REQUIRED", "external_objects": "NOT_INCLUDED"})
        # Only selected restricted custom roles, no role passwords or reserved-role DDL.
        # Keep LOGIN attributes recorded but restore NOLOGIN until credentials are reset.
        roles_path = root / "roles.sql"
        roles_path.write_text("\n".join('CREATE ROLE "' + r[0] + '" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS ' + ("INHERIT" if r[5] else "NOINHERIT") + ';' for r in details["roles_without_passwords"]), encoding="utf-8")
        (root / "inventory.json").write_text(json.dumps(details, default=str), encoding="utf-8")
        bundle = root / "backup.tar"
        with tarfile.open(bundle, "w") as tar:
            for name in ("database.dump", "roles.sql", "inventory.json"):
                tar.add(root / name, arcname=name)
        require(bundle.stat().st_size <= c["max_archive_bytes"], "ARCHIVE_TOO_LARGE")
        encrypted = root / "backup.tar.age"
        run([os.environ.get("AGE_BIN", "age"), "-r", c["recipient"], "-o", str(encrypted), str(bundle)])
        checksum = digest(encrypted)
        # Upload only ciphertext. A success pointer is published only after readback.
        client.upload_file(str(encrypted), c["bucket"], key, ExtraArgs={"ContentType": "application/octet-stream", "Metadata": {"sha256": checksum}})
        check = root / "readback.age"
        client.download_file(c["bucket"], key, str(check))
        require(digest(check) == checksum, "REMOTE_INTEGRITY_FAILED")
        pointer = {"version": 1, "scope": c["scope"], "key": key, "sha256": checksum,
                   "bytes": encrypted.stat().st_size, "recovery_point_at": recovery_point, "completed_at": dt.datetime.now(UTC).isoformat()}
        client.put_object(Bucket=c["bucket"], Key=c["prefix"] + "/latest.json", Body=json.dumps(pointer).encode(), ContentType="application/json")
        return {**pointer, "duration_seconds": round(time.monotonic() - started, 3), "synthetic": synthetic}


def latest(c, client):
    value = json.loads(client.get_object(Bucket=c["bucket"], Key=c["prefix"] + "/latest.json")["Body"].read(8192))
    require(value.get("scope") == c["scope"] and type(value.get("version")) is int and value["version"] == 1, "POINTER_SCOPE_INVALID")
    require(isinstance(value.get("key"), str) and value["key"].startswith(c["prefix"] + "/") and value["key"].endswith(".tar.age"), "POINTER_KEY_INVALID")
    require(re.fullmatch(r"[a-f0-9]{64}", value.get("sha256", "")), "POINTER_HASH_INVALID")
    stamp = dt.datetime.fromisoformat(value["completed_at"])
    age = (dt.datetime.now(UTC) - stamp).total_seconds()
    require(-300 <= age <= c["stale_after_hours"] * 3600, "BACKUP_STALE_OR_FUTURE")
    recovery = dt.datetime.fromisoformat(value["recovery_point_at"])
    recovery_age = (dt.datetime.now(UTC) - recovery).total_seconds()
    require(recovery <= stamp and -300 <= recovery_age <= c["stale_after_hours"] * 3600, "RECOVERY_POINT_STALE_OR_FUTURE")
    require(type(value.get("bytes")) is int and 0 < value["bytes"] <= c["max_archive_bytes"] * 1.01 + 1048576, "CIPHERTEXT_SIZE_INVALID")
    head = client.head_object(Bucket=c["bucket"], Key=value["key"])
    require(head["ContentLength"] == value["bytes"] and head.get("Metadata", {}).get("sha256") == value["sha256"], "REMOTE_METADATA_MISMATCH")
    return value


def verify(c, client):
    value = latest(c, client)
    with tempfile.TemporaryDirectory(prefix="rcs-verify-") as tmp:
        target = Path(tmp) / "cipher.age"
        client.download_file(c["bucket"], value["key"], str(target))
        require(digest(target) == value["sha256"], "REMOTE_INTEGRITY_FAILED")
    return {"status": "FRESH_INTEGRITY_VERIFIED", "scope": c["scope"], "key": value["key"]}


def freshness(c, client):
    value = latest(c, client)
    return {"status": "FRESH_METADATA_ONLY", "scope": c["scope"], "key": value["key"], "full_ciphertext_integrity": "NOT_MEASURED_BY_THIS_CHECK"}


def restore_quarantine(c, client, target_url, identity_path, *, retention_authority=None):
    p = urlsplit(target_url)
    require(p.hostname in ("localhost", "127.0.0.1") and unquote(p.path[1:]).startswith("rcs_restore_"), "RESTORE_LOCAL_QUARANTINE_REQUIRED")
    require(os.environ.get("RCS_DISPOSABLE_RESTORE") == "yes", "RESTORE_CONFIRMATION_REQUIRED")
    value = latest(c, client)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="rcs-restore-") as tmp:
        root = Path(tmp)
        os.chmod(root, 0o700)
        encrypted = root / "cipher.age"
        client.download_file(c["bucket"], value["key"], str(encrypted))
        require(digest(encrypted) == value["sha256"], "REMOTE_INTEGRITY_FAILED")
        bundle = root / "backup.tar"
        run([os.environ.get("AGE_BIN", "age"), "-d", "-i", str(identity_path), "-o", str(bundle), str(encrypted)])
        require(bundle.stat().st_size <= c["max_archive_bytes"], "ARCHIVE_TOO_LARGE")
        with tarfile.open(bundle) as tar:
            members = tar.getmembers()
            require(sorted(m.name for m in members) == ["database.dump", "inventory.json", "roles.sql"] and all(m.isfile() for m in members), "ARCHIVE_LAYOUT_INVALID")
            require(sum(m.size for m in members) <= c["max_archive_bytes"], "ARCHIVE_TOO_LARGE")
            tar.extractall(root, filter="data")
        details = json.loads((root / "inventory.json").read_text(encoding="utf-8"))
        require(details["scope"] == c["scope"] and digest(root / "database.dump") == details["dump_sha256"], "DUMP_INTEGRITY_FAILED")
        require(details.get("export_layout") == "database-minus-reviewed-schemas", "RESTORE_EXPORT_LAYOUT_UNSUPPORTED")
        with database_connect(target_url) as conn:
            count = conn.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')").fetchone()[0]
            require(count == 0, "RESTORE_TARGET_NOT_EMPTY")
            namespaces = conn.execute("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY 1").fetchall()
            require(namespaces == [("public",)], "RESTORE_TARGET_SCHEMA_NOT_PRISTINE")
            require(conn.execute("SELECT extname FROM pg_extension ORDER BY 1").fetchall() == [("plpgsql",)], "RESTORE_TARGET_EXTENSION_NOT_PRISTINE")
            for r in details["roles_without_passwords"]:
                require(r[0] in c["roles"] and NAME.fullmatch(r[0]) and not any(r[i] for i in (2, 3, 4, 6, 7)), "RESTORE_ROLE_INVALID")
                exists = conn.execute("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=%s", (r[0],)).fetchone()
                require(exists is None, "RESTORE_ROLE_ALREADY_EXISTS_USE_FRESH_CLUSTER")
                conn.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS " + ("INHERIT" if r[5] else "NOINHERIT")).format(sql.Identifier(r[0])))
            # Membership edges to managed/admin principals require a separate reviewed mapping.
            for parent, member, admin, inherit, can_set in details["memberships"]:
                if parent in c["roles"] and member in c["roles"]:
                    options = " WITH ADMIN " + str(admin).upper() + ", INHERIT " + str(inherit).upper() + ", SET " + str(can_set).upper()
                    conn.execute(sql.SQL("GRANT {} TO {}" + options).format(sql.Identifier(parent), sql.Identifier(member)))
        run([tool("pg_restore"), "--exit-on-error", "--single-transaction", "--dbname=" + unquote(p.path[1:]), str(root / "database.dump")], env=connection_env(target_url))
        with database_connect(target_url) as conn:
            restored = inventory(conn, c)
            for field in ("tables", "extensions", "schema_owners_acl", "default_acl"):
                actual = json.loads(json.dumps(restored[field], default=str))
                if actual != details[field]:
                    error = Refused("RESTORE_" + field.upper() + "_MISMATCH")
                    error.catalog_difference = {"field": field, "expected": details[field], "observed": actual}
                    raise error
            for role in restored["roles_without_passwords"]:
                require(role[1] is False, "RESTORE_LOGIN_NOT_QUARANTINED")
            internal_memberships = [edge for edge in details["memberships"] if edge[0] in c["roles"] and edge[1] in c["roles"]]
            require(json.loads(json.dumps(restored["memberships"])) == internal_memberships, "RESTORE_MEMBERSHIPS_MISMATCH")
        external_edges = sum(1 for edge in details["memberships"] if edge[0] not in c["roles"] or edge[1] not in c["roles"])
        from retention_backup_index import reconcile_restore
        try:
            retention = reconcile_restore(retention_authority, details.get("retention_restore_index"))
        except Exception:
            # A failed/unreachable current ledger never permits traffic. Do
            # not forward SQL, credentials or raw exception details to logs.
            retention = {"status": "QUARANTINE", "authorityChecked": False,
                         "reason": "CURRENT_RETENTION_CHECK_FAILED", "trafficReleaseAuthorized": False}
        return {"status": "RESTORED_IN_QUARANTINE", "scope": c["scope"], "table_counts_verified": len(restored["tables"]),
                "catalog_sha256": hashlib.sha256(json.dumps({key: restored[key] for key in ("tables", "extensions", "schema_owners_acl", "default_acl", "memberships")}, default=str, sort_keys=True).encode()).hexdigest(),
                "external_memberships_require_review": external_edges,
                "database_role_settings_require_review": len(details["database_role_settings"]),
                "credentials": "ALL_CUSTOM_ROLES_NOLOGIN_RESET_REQUIRED",
                "retention": retention,
                "authority": "NO_APPLICATION_ACTIVATION", "duration_seconds": round(time.monotonic() - started, 3)}


def retention_plan(c, client):
    days = c.get("retention_days")
    require(days is None or isinstance(days, int) and days > 0, "RETENTION_INVALID")
    count = 0
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=c["bucket"], Prefix=c["prefix"] + "/"):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".tar.age") and days and (dt.datetime.now(UTC) - obj["LastModified"]).total_seconds() > days * 86400:
                count += 1
    return {"status": "PLAN_ONLY_NO_DELETE_API", "candidate_count": count, "retention_days": days, "production_deletion": "DISABLED"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("backup", "verify", "freshness", "retention-plan", "restore-quarantine"))
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    try:
        c = load_config(args.config)
        client = storage()
        if args.mode == "backup":
            result = backup(c, client, os.environ["BACKUP_DATABASE_URL"])
        elif args.mode == "verify":
            result = verify(c, client)
        elif args.mode == "freshness":
            result = freshness(c, client)
        elif args.mode == "retention-plan":
            result = retention_plan(c, client)
        else:
            result = restore_quarantine(c, client, os.environ["RESTORE_DATABASE_URL"], os.environ["AGE_IDENTITY_FILE"])
        print(json.dumps(result))
    except Refused as error:
        print(json.dumps({"status": "FAILED", "code": str(error)}))
        raise SystemExit(1) from None
    except Exception:
        print(json.dumps({"status": "FAILED", "code": "BACKUP_OPERATION_FAILED_DETAILS_WITHHELD"}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
