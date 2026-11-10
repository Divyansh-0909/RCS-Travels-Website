"""Real encrypted backup/restore plus current hold check, local S3 protocol only."""
import hashlib
import json
import logging
import os
from pathlib import Path
import sys
import uuid

from moto.server import ThreadedMotoServer
from psycopg import sql

import backup as b
from native_postgres import NativePostgres
from retention_provider_inventory import r2_inventory

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-retention-integration-2026-10-22"


def main():
    files = [Path(__file__)] + [ROOT / "tools/backups" / p for p in ["backup.py", "retention_registry.sql", "retention_backup_index.py", "retention_provider_inventory.py", "native_postgres.py"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins, "boundary": "Synthetic native PostgreSQL + real age/pg_dump/pg_restore + loopback Moto S3. No actual R2/Google account, production data, external lock or approved retention schedule."}
    primary, restored = NativePostgres(), NativePostgres()
    emulator = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    logging.getLogger("werkzeug").disabled = True
    started = False

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    def url(server, database="postgres"):
        return f"postgresql://proofloop_owner:{server.password}@127.0.0.1:{server.port}/{database}"

    try:
        emulator.start()
        started = True
        host, port = emulator.get_host_and_port()
        os.environ.update(R2_ENDPOINT=f"http://{host}:{port}", R2_ACCESS_KEY_ID="synthetic", R2_SECRET_ACCESS_KEY="synthetic",
                          RCS_DISPOSABLE_RESTORE="yes", PG_BIN=str(primary.binary),
                          AGE_BIN=r"C:\Users\singh\Documents\Codex\2026-10-15\continue\backup-tools\age-1.3.2\age\age.exe")
        client = b.storage(synthetic=True)
        client.create_bucket(Bucket="retention-synthetic-backups")
        with primary:
            witness["sourceEnvironment"] = primary.identity
            identity = primary.root / "synthetic-age-identity.private"
            b.run([str(Path(os.environ["AGE_BIN"]).with_name("age-keygen.exe")), "-o", str(identity)])
            recipient = b.run([str(Path(os.environ["AGE_BIN"]).with_name("age-keygen.exe")), "-y", str(identity)]).decode().strip()
            passwords = {r: uuid.uuid4().hex for r in ["rb_proprietor", "rb_operator"]}
            with primary.connect(autocommit=True) as c:
                c.execute("CREATE ROLE rb_owner NOLOGIN; GRANT CREATE ON DATABASE postgres TO rb_owner; GRANT CREATE ON SCHEMA public TO rb_owner", prepare=False)
                for role, password in passwords.items():
                    c.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
                c.execute("SET ROLE rb_owner")
                c.execute((ROOT / "tools/backups/retention_registry.sql").read_text(), prepare=False)
                c.execute("""INSERT INTO retention_registry.configuration VALUES(true,'rb_proprietor','rb_operator',false);
CREATE TABLE public.synthetic_payload(id int PRIMARY KEY,payload text); INSERT INTO public.synthetic_payload VALUES(1,'synthetic-original');
GRANT USAGE ON SCHEMA retention_registry TO rb_operator,rb_proprietor;
GRANT EXECUTE ON FUNCTION retention_registry.register_copy(text,text,text,text,text,bigint),retention_registry.seal_inventory(text,bigint,text[]) TO rb_operator;
GRANT EXECUTE ON FUNCTION retention_registry.decide_hold(uuid,text,uuid,boolean,bigint,text,text) TO rb_proprietor; RESET ROLE;""", prepare=False)
                scope = "synthetic-backup-scope-" + uuid.uuid4().hex
                with primary.connect(user="rb_operator", password=passwords["rb_operator"], autocommit=True) as op:
                    record = op.execute("SELECT retention_registry.register_copy(%s,'sql','SQL_ROWS',%s,'PRESENT',0)", (scope, "a" * 64)).fetchone()[0]
                    op.execute("SELECT retention_registry.seal_inventory(%s,%s,ARRAY['sql'])", (scope, record["epoch"]))
                config = {"version": 1, "enabled": True, "scope": "source", "schemas": ["public", "retention_registry"],
                          "roles": ["rb_owner", "rb_proprietor", "rb_operator"], "extensions": ["plpgsql"], "excluded_schemas_reviewed": [],
                          "recipient": recipient, "bucket": "retention-synthetic-backups", "prefix": "synthetic/source",
                          "private_bucket_confirmed": True, "hosting_compatibility_approved": False, "max_archive_bytes": 64 * 1024**2,
                          "stale_after_hours": 30, "retention_days": None, "production_deletion_approved": False}
                pointer = b.backup(config, client, url(primary), synthetic=True)
                check("backup:real-age-ciphertext-published", pointer["sha256"] is not None)
                check("backup:integrity-readback", b.verify(config, client)["status"], "FRESH_INTEGRITY_VERIFIED")
                remote = r2_inventory(client, config["bucket"], config["prefix"] + "/", enabled=True)
                check("backup:protocol-inventory-one-encrypted-copy", len(remote["copies"]), 1)
                check("backup:inventory-metadata-hash", remote["copies"][0]["declaredSha256"], pointer["sha256"])
                keys = [r["Key"] for r in client.list_objects_v2(Bucket=config["bucket"])["Contents"]]
                check("backup:no-plaintext-object-upload", all(k.endswith((".tar.age", "/latest.json")) for k in keys))
                with primary.connect(user="rb_proprietor", password=passwords["rb_proprietor"], autocommit=True) as proprietor:
                    hold = proprietor.execute("SELECT retention_registry.decide_hold(%s,%s,%s,false,%s,'synthetic-owner-hold',%s)", (uuid.uuid4(), scope, uuid.uuid4(), record["epoch"], "d" * 64)).fetchone()[0]
                    check("authority:new-hold-after-backup", hold["status"], "HELD")
                with restored:
                    witness["restoreEnvironment"] = restored.identity
                    destination = "rcs_restore_" + uuid.uuid4().hex
                    with restored.connect(autocommit=True) as admin:
                        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(destination)))
                    result = b.restore_quarantine(config, client, url(restored, destination), identity, retention_authority=c)
                    check("restore:real-sql-in-quarantine", result["status"], "RESTORED_IN_QUARANTINE")
                    check("restore:current-authority-contacted", result["retention"]["authorityChecked"])
                    check("restore:post-backup-hold-fences-stale-copy", result["retention"]["decisions"]["heldCount"], 1)
                    check("restore:stale-epoch-identified", result["retention"]["decisions"]["staleEpochCount"], 1)
                    check("restore:no-traffic-grant", result["retention"]["trafficReleaseAuthorized"], False)
                    check("restore:no-raw-scope-in-public-result", scope not in json.dumps(result))
                    with b.database_connect(url(restored, destination)) as target:
                        check("restore:original-payload-present", target.execute("SELECT payload FROM public.synthetic_payload WHERE id=1").fetchone()[0], "synthetic-original")
                        check("restore:backup-ledger-is-old-not-current-authority", target.execute("SELECT count(*) FROM retention_registry.holds").fetchone()[0], 0)
                        check("restore:all-custom-logins-disabled", all(not r[0] for r in target.execute("SELECT rolcanlogin FROM pg_roles WHERE rolname=ANY(%s)", (config["roles"],))))
                    witness["backup"] = {"ciphertextSha256": pointer["sha256"], "bytes": pointer["bytes"], "recoveryPoint": pointer["recovery_point_at"], "scopeIndexEncrypted": True}
                    witness["retentionRestoreProjection"] = result["retention"]
                    witness["status"] = "PASS"
    except Exception as error:
        witness["failure"] = {"type": type(error).__name__, "code": str(error) if isinstance(error, (b.Refused, AssertionError)) else "DETAILS_WITHHELD", "sqlstate": getattr(error, "sqlstate", None), "diagnosticCodes": getattr(error, "diagnostic_codes", [])}
        raise
    finally:
        if started:
            emulator.stop()
        witness["sourceStopped"], witness["restoreStopped"] = primary.stopped, restored.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "encrypted-backup-final.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "sourceStopped": primary.stopped, "restoreStopped": restored.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
