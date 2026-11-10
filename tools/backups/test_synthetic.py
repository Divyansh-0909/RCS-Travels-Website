"""Sequential end-to-end test: real PostgreSQL + age + local S3 emulator.

No hosted account is contacted. Private keys and plaintext stay in OS temp.
Run from repository root, only with an already-running owned Docker engine.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from urllib.parse import urlsplit, urlunsplit

from moto.server import ThreadedMotoServer
from psycopg import sql

import backup as b
from owned_postgres import OwnedPostgres


ROOT = Path(__file__).resolve().parents[2]
IMAGE = "sha256:a2b1801097f195b0a31c9da1c2f9cf2587a542e3c55cbb191b1873667dc45072"


def database_url(base, name):
    p = urlsplit(base)
    return urlunsplit((p.scheme, p.netloc, "/" + name, "", ""))


def main():
    started = time.monotonic()
    checks, outputs, resources = [], [], []
    receipt_path = Path(os.environ["BACKUP_TEST_RECEIPT"])
    # Moto logs keys/HTTP calls, not data; keep logs outside repository regardless.
    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    child = None
    try:
        server.start()
        host, port = server.get_host_and_port()
        os.environ.update(R2_ENDPOINT=f"http://{host}:{port}", R2_ACCESS_KEY_ID="synthetic", R2_SECRET_ACCESS_KEY="synthetic", RCS_DISPOSABLE_RESTORE="yes")
        client = b.storage(synthetic=True)
        client.create_bucket(Bucket="rcs-synthetic-backups")
        with tempfile.TemporaryDirectory(prefix="rcs-backup-test-") as tmp:
            temp = Path(tmp)
            os.chmod(temp, 0o700)
            identity = temp / "identity"
            age_keygen = str(Path(os.environ["AGE_BIN"]).with_name("age-keygen" + (".exe" if os.name == "nt" else "")))
            b.run([age_keygen, "-o", str(identity)])
            recipient = b.run([age_keygen, "-y", str(identity)]).decode().strip()
            configs, proofs = {}, {}
            with OwnedPostgres(IMAGE) as primary:
                resources.append(primary.resources)
                # Match the accepted closure runner's Supabase-role prerequisites.
                # The unchanged public-schema revocation migration names both roles.
                with b.database_connect(primary.url, autocommit=True) as conn:
                    conn.execute("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN")
                # The actual custodian gets its own physical PostgreSQL server.
                with OwnedPostgres(IMAGE) as custodian:
                    resources.append(custodian.resources)
                    custodian_name = "rcs_verify_" + secrets.token_hex(16)
                    with b.database_connect(custodian.url, autocommit=True) as conn:
                        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(custodian_name)))
                    custody_url = database_url(custodian.url, custodian_name)
                    env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "WINDIR", "USERPROFILE", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "ComSpec") if key in os.environ}
                    env.update(TEST_DATABASE_URL=primary.url, CUSTODY_DATABASE_URL=custody_url,
                               DATABASE_URL="postgresql://denied:denied@127.0.0.1:1/phase9_forbidden", DIRECT_URL="postgresql://denied:denied@127.0.0.1:1/phase9_forbidden",
                               NODE_ENV="test", PHASE9_ISOLATED="1", DOTENV_CONFIG_PATH=str(ROOT / "backend/tests/helpers/phase9-empty.env"))
                    ready_path = temp / "fixture-ready.json"
                    env["BACKUP_FIXTURE_READY"] = str(ready_path)
                    child = subprocess.Popen(["node", "--import", "tsx", "--import", "./tests/helpers/phase9Isolation.js", "../tools/backups/synthetic_fixture.mjs"], cwd=ROOT / "backend", env=env,
                                             stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True)
                    deadline = time.monotonic() + 210
                    while not ready_path.exists():
                        b.require(child.poll() is None, "FIXTURE_EXITED_BEFORE_READY")
                        b.require(time.monotonic() < deadline, "FIXTURE_READY_DEADLINE")
                        time.sleep(0.25)
                    names = json.loads(ready_path.read_text(encoding="utf-8"))
                    if names and "code" in names:
                        print(json.dumps(names), flush=True)
                    b.require(names is not None and "source" in names, "FIXTURE_START_FAILED")
                    checks.append("existing migrated source/receiver and physically separate custodian fixture installed")
                    with b.database_connect(primary.url, autocommit=True) as conn:
                        conn.execute("GRANT shadow9d_inspector TO shadow9d_recorder WITH ADMIN FALSE, INHERIT FALSE, SET FALSE")
                    urls = {"source": database_url(primary.url, names["source"]), "receiver": database_url(primary.url, names["receiver"]), "custodian": custody_url}
                    for scope, url in urls.items():
                        with b.database_connect(url) as conn:
                            owner = "custody_owner" if scope == "custodian" else "shadow9d_owner"
                            conn.execute(sql.SQL("CREATE SCHEMA backup_probe AUTHORIZATION {}").format(sql.Identifier(owner)))
                            conn.execute("CREATE TABLE backup_probe.records(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, body jsonb NOT NULL, payload bytea NOT NULL)")
                            conn.execute("INSERT INTO backup_probe.records(body,payload) VALUES(%s,%s)", (json.dumps({"synthetic": scope, "text": "à¤­à¤¾à¤°à¤¤", "number": 17}), secrets.token_bytes(8192)))
                            schemas = [r[0] for r in conn.execute("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY 1")]
                            roles = [r[0] for r in conn.execute("SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> 'postgres' ORDER BY 1")]
                            extensions = [r[0] for r in conn.execute("SELECT extname FROM pg_extension ORDER BY 1")]
                            functions = conn.execute("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY(%s) AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3", (schemas,)).fetchall()
                            row = conn.execute("SELECT body::text,encode(payload,'hex') FROM backup_probe.records").fetchone()
                            proofs[scope] = {"functions": hashlib.sha256(json.dumps(functions).encode()).hexdigest(), "row": hashlib.sha256(json.dumps(row).encode()).hexdigest()}
                        c = {"version": 1, "enabled": True, "scope": scope, "schemas": schemas, "roles": roles, "extensions": extensions, "excluded_schemas_reviewed": [],
                             "recipient": recipient, "bucket": "rcs-synthetic-backups", "prefix": "synthetic/" + scope, "private_bucket_confirmed": True,
                             "hosting_compatibility_approved": False, "max_archive_bytes": 64 * 1024**2, "stale_after_hours": 30,
                             "retention_days": None, "production_deletion_approved": False}
                        configs[scope] = c
                        output = b.backup(c, client, url, synthetic=True)
                        outputs.append(output)
                        checks.append(scope + " real snapshot export, age encryption, S3 upload and SHA256 readback")
                        b.verify(c, client)
                        checks.append(scope + " latest complete object integrity/freshness")
                        if scope == "source":
                            pointer_key = c["prefix"] + "/latest.json"
                            prior = client.get_object(Bucket=c["bucket"], Key=pointer_key)["Body"].read()
                            class FailedUpload:
                                def upload_file(self, *args, **kwargs):
                                    raise b.Refused("INJECTED_UPLOAD_FAILURE")
                            try:
                                b.backup(c, FailedUpload(), url, synthetic=True)
                                raise b.Refused("EXPECTED_UPLOAD_FAILURE_MISSING")
                            except b.Refused as error:
                                b.require(str(error) == "INJECTED_UPLOAD_FAILURE", "UNEXPECTED_UPLOAD_FAILURE")
                            b.require(client.get_object(Bucket=c["bucket"], Key=pointer_key)["Body"].read() == prior, "FAILED_UPLOAD_PUBLISHED_SUCCESS")
                            checks.append("actual export with injected upload failure leaves latest successful backup unchanged")
                    child.stdin.write("close\n")
                    child.stdin.flush()
                    child.stdin.close()
                    child.wait(timeout=30)
                    b.require(child.returncode == 0, "FIXTURE_CLEANUP_FAILED")
                    child = None
            # Both original servers are stopped before any restore server starts.
            for scope, c in configs.items():
                with OwnedPostgres(IMAGE) as restored:
                    resources.append(restored.resources)
                    result = b.restore_quarantine(c, client, restored.url, identity)
                    with b.database_connect(restored.url) as conn:
                        functions = conn.execute("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY(%s) AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3", (c["schemas"],)).fetchall()
                        row = conn.execute("SELECT body::text,encode(payload,'hex') FROM backup_probe.records").fetchone()
                        b.require(hashlib.sha256(json.dumps(functions).encode()).hexdigest() == proofs[scope]["functions"], "FUNCTION_DEFINITIONS_DIFFER")
                        b.require(hashlib.sha256(json.dumps(row).encode()).hexdigest() == proofs[scope]["row"], "RESTORED_PAYLOAD_DIFFERS")
                        b.require(conn.execute("SELECT has_function_privilege('shadow9d_worker','shadow9d.set_stop(boolean)','EXECUTE')").fetchone()[0] is False, "RESTRICTED_ACL_DIFFERS") if scope != "custodian" else None
                    outputs.append(result)
                    checks.append(scope + " fresh cluster restored: counts, owners/ACLs/defaults/extensions, exact functions and payload; NOLOGIN roles")
            c = configs["source"]
            pointer_key = c["prefix"] + "/latest.json"
            original = client.get_object(Bucket=c["bucket"], Key=pointer_key)["Body"].read()
            pointer = json.loads(original)
            cipher = client.get_object(Bucket=c["bucket"], Key=pointer["key"])["Body"].read()
            def refusal(action, expected):
                try:
                    action()
                except b.Refused as error:
                    b.require(str(error) == expected, "UNEXPECTED_REFUSAL")
                    return
                raise b.Refused("EXPECTED_REFUSAL_NOT_OBSERVED")
            stale = {**pointer, "completed_at": (dt.datetime.now(b.UTC) - dt.timedelta(hours=31)).isoformat()}
            client.put_object(Bucket=c["bucket"], Key=pointer_key, Body=json.dumps(stale).encode())
            refusal(lambda: b.verify(c, client), "BACKUP_STALE_OR_FUTURE")
            checks.append("stale backup rejected")
            client.put_object(Bucket=c["bucket"], Key=pointer_key, Body=original)
            old_snapshot = {**pointer, "recovery_point_at": (dt.datetime.now(b.UTC) - dt.timedelta(hours=31)).isoformat()}
            client.put_object(Bucket=c["bucket"], Key=pointer_key, Body=json.dumps(old_snapshot).encode())
            refusal(lambda: b.freshness(c, client), "RECOVERY_POINT_STALE_OR_FUTURE")
            client.put_object(Bucket=c["bucket"], Key=pointer_key, Body=original)
            checks.append("new completion timestamp cannot conceal a stale recovery point")
            altered = cipher[:-1] + bytes([cipher[-1] ^ 1])
            client.put_object(Bucket=c["bucket"], Key=pointer["key"], Body=altered, Metadata={"sha256": pointer["sha256"]})
            b.require(b.freshness(c, client)["full_ciphertext_integrity"] == "NOT_MEASURED_BY_THIS_CHECK", "METADATA_OVERCLAIM")
            refusal(lambda: b.verify(c, client), "REMOTE_INTEGRITY_FAILED")
            checks.append("same-length ciphertext corruption rejected by actual download checksum")
            damaged = temp / "damaged.age"
            damaged.write_bytes(altered)
            refusal(lambda: b.run([os.environ["AGE_BIN"], "-d", "-i", str(identity), "-o", str(temp / "bad.tar"), str(damaged)]), "TOOL_FAILED")
            checks.append("age authenticated decryption rejects changed ciphertext")
            wrong_identity = temp / "wrong-identity"
            b.run([age_keygen, "-o", str(wrong_identity)])
            original_cipher = temp / "original.age"
            original_cipher.write_bytes(cipher)
            refusal(lambda: b.run([os.environ["AGE_BIN"], "-d", "-i", str(wrong_identity), "-o", str(temp / "wrong.tar"), str(original_cipher)]), "TOOL_FAILED")
            checks.append("unrelated age private key cannot decrypt the archive")
            client.put_object(Bucket=c["bucket"], Key=pointer["key"], Body=cipher, Metadata={"sha256": pointer["sha256"]})
            b.require(client.get_object(Bucket=c["bucket"], Key=pointer_key)["Body"].read() == original, "LATEST_POINTER_CHANGED")
            checks.append("negative probes retain prior successful pointer")
            plan = b.retention_plan(c, client)
            b.require(plan["production_deletion"] == "DISABLED" and plan["candidate_count"] == 0, "RETENTION_NOT_DISABLED")
            checks.append("unapproved retention remains plan-only; all encrypted objects retained")
            cfg = temp / "config.json"
            cfg.write_text(json.dumps(c), encoding="utf-8")
            refusal(lambda: b.load_config(cfg), "HOSTING_NOT_APPROVED")
            b.load_config(cfg, synthetic=True)
            cfg.write_text(json.dumps({**c, "enabled": False}), encoding="utf-8")
            refusal(lambda: b.load_config(cfg, synthetic=True), "BACKUP_DISABLED")
            checks.append("real hosting gate and disabled configuration refuse execution")
            refusal(lambda: b.connection_env("postgresql://user:pass@localhost:6543/test"), "TRANSACTION_POOLER_REFUSED")
            checks.append("transaction pooling rejected for consistent export")
            refusal(lambda: b.restore_quarantine(c, client, "postgresql://user@remote.example/rcs_restore_test", identity), "RESTORE_LOCAL_QUARANTINE_REQUIRED")
            checks.append("remote restore destination refused before decryption")
            keys = [obj["Key"] for page in client.get_paginator("list_objects_v2").paginate(Bucket=c["bucket"]) for obj in page.get("Contents", [])]
            b.require(len(keys) == 6 and all(k.endswith((".tar.age", "/latest.json")) for k in keys), "PLAINTEXT_OBJECT_FOUND")
            checks.append("object store has three ciphertext archives and three secret-free pointers only")
            import notify
            from unittest.mock import patch, MagicMock
            with patch.dict(os.environ, {"BACKUP_ALERT_WEBHOOK": "https://operator.invalid/synthetic"}), patch("urllib.request.urlopen") as send:
                response = MagicMock()
                response.__enter__.return_value.status = 204
                send.return_value = response
                b.require(notify.main() == 0, "ALERT_NOT_ACCEPTED")
                body = json.loads(send.call_args.args[0].data)
                b.require(set(body) == {"text", "repository", "run_id"}, "ALERT_PAYLOAD_NOT_MINIMAL")
            with patch.dict(os.environ, {"BACKUP_ALERT_WEBHOOK": ""}):
                b.require(notify.main() == 1, "MISSING_ALERT_ROUTE_ACCEPTED")
            checks.append("alert payload and missing-route refusal tested with stub transport, no live destination")
        result = {"status": "PASS", "checks": checks, "check_count": len(checks), "outputs": outputs, "resources": resources,
                  "s3": "MOTO_LOOPBACK_EMULATOR_NOT_LIVE_R2", "database": "PINNED_SYNTHETIC_NOT_SUPABASE",
                  "analyst_calls": 0, "duration_seconds": round(time.monotonic() - started, 3)}
    except Exception as error:
        result = {"status": "FAIL", "checks": checks, "check_count": len(checks), "error_type": type(error).__name__,
                  "code": str(error) if isinstance(error, b.Refused) else "DETAILS_WITHHELD", "resources": resources,
                  "tool_diagnostic": {key: getattr(error, key) for key in ("tool", "diagnostic_codes", "stderr_sha256", "catalog_difference") if hasattr(error, key)}}
    finally:
        if child and child.poll() is None:
            child.terminate()
            child.wait(timeout=15)
        server.stop()
    receipt_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("status", "check_count")}))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
