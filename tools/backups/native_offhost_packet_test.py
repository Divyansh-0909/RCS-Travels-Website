"""Local rehearsal of a synthetic encrypted handoff, never off-host acceptance."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

import backup as b
from native_postgres import NativePostgres
import offhost_recovery as offhost
from guarded_backup import guarded_backup
from storage_safeguards import KINDS, StorageGuard

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-storage-safeguards-2026-10-22"


class LocalCipherStore:
    """Fixture-only local protocol store. It is not R2 or off-host storage."""
    def __init__(self, root):
        self.root = root
        self.objects = {}

    def upload_file(self, source, bucket, key, **kwargs):
        target = self.root / "uploaded-cipher.age"
        shutil.copyfile(source, target)
        self.objects[(bucket, key)] = target

    def download_file(self, bucket, key, target):
        shutil.copyfile(self.objects[(bucket, key)], target)

    def put_object(self, **kwargs):
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]


def main():
    files = [Path(__file__)] + [ROOT / "tools/backups" / n for n in [
        "offhost_recovery.py", "backup.py", "retention_backup_index.py",
        "retention_provider_inventory.py", "native_postgres.py", "guarded_backup.py", "storage_safeguards.py"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins,
               "boundary": "Local Windows PG18 + age + file-store rehearsal. No second host, R2, Google or production key."}
    source = NativePostgres()

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        assert actual == expected, name

    try:
        with source:
            witness["sourceEnvironment"] = source.identity
            os.environ.update(PG_BIN=str(source.binary), AGE_BIN=r"C:\Users\singh\Documents\Codex\2026-10-15\continue\backup-tools\age-1.3.2\age\age.exe")
            identity = source.root / "synthetic-age-identity.private"
            b.run([str(Path(os.environ["AGE_BIN"]).with_name("age-keygen.exe")), "-o", str(identity)])
            recipient = b.run([str(Path(os.environ["AGE_BIN"]).with_name("age-keygen.exe")), "-y", str(identity)]).decode().strip()
            with source.connect(autocommit=True) as c:
                c.execute("CREATE ROLE storage_lab_owner NOLOGIN; GRANT CREATE ON SCHEMA public TO storage_lab_owner; "
                          "SET ROLE storage_lab_owner; CREATE TABLE public.storage_recovery_lab(id int PRIMARY KEY,payload text); "
                          "INSERT INTO public.storage_recovery_lab VALUES(1,'synthetic-recovery-evidence'); RESET ROLE", prepare=False)
                payload = c.execute("SELECT id,payload FROM public.storage_recovery_lab ORDER BY id").fetchall()
            expected = hashlib.sha256(json.dumps(payload).encode()).hexdigest()
            config = {"version": 1, "enabled": True, "scope": "source", "schemas": ["public"],
                      "roles": ["storage_lab_owner"], "extensions": ["plpgsql"], "excluded_schemas_reviewed": [],
                      "recipient": recipient, "bucket": "synthetic-local-only", "prefix": "synthetic/recovery",
                      "private_bucket_confirmed": True, "hosting_compatibility_approved": False,
                      "synthetic_validation_only": True, "max_archive_bytes": 64 * 1024**2, "stale_after_hours": 168}
            store = LocalCipherStore(source.root)
            url = f"postgresql://proofloop_owner:{source.password}@127.0.0.1:{source.port}/postgres"
            now = time.time()
            limits = {"version": 1, "enabled": True, "productionDeletion": False,
                      "budgets": dict.fromkeys(KINDS, 512 * 1024**2), "totalBytes": 2 * 1024**3,
                      "reserveBytes": 16 * 1024**2, "staleSeconds": 60, "backupDeadlineSeconds": 100,
                      "restoreDeadlineSeconds": 200, "maxOperations": 10}
            guard = StorageGuard(source.root / "backup-storage.sqlite", limits)
            # Trusted synthetic empty backup/scratch stores only, not an attestation
            # of real provider completeness or log/archive capacity.
            guard.observe({"inventoryComplete": True, "domains": [
                {"id": k, "kind": k, "bytes": 0, "at": now} for k in KINDS],
                "verifiedBackupAt": now, "verifiedRestoreAt": now,
                "controls": dict.fromkeys(["finiteSlotRetention", "finiteTempPerProcess", "boundedLogSink",
                                            "archiveHealthy", "slotsWithinBudget"], True)})
            pointer = guarded_backup(config, store, url, guard, "handoff", synthetic=True)
            check("backup:admission-reservations-retained", pointer["storageAdmission"], "RESERVED_RECONCILIATION_REQUIRED")
            with guard.transaction() as c:
                check("backup:two-durable-reservations", c.execute("SELECT count(*) FROM reservations WHERE state='RESERVED'").fetchone()[0], 2)
            check("backup:ciphertext-within-reservation", pointer["bytes"] <= pointer["ciphertextReservationBytes"])
            with guard.transaction() as c:
                check("backup:scratch-reservation", c.execute("SELECT bytes FROM reservations WHERE kind='temp'").fetchone()[0], config["max_archive_bytes"] * 5)
            packet = source.root / "offhost-packet"
            packet_hash = offhost.prepare(packet, config, store, pointer, expected)
            check("packet:only-encrypted-data-and-public-manifest", sorted(p.name for p in packet.iterdir()), ["backup.tar.age", "packet.json"])
            check("packet:cipher-sha256", b.digest(packet / "backup.tar.age"), pointer["sha256"])
            check("packet:no-private-key-inside", identity.is_relative_to(packet), False)
            metadata = json.loads((packet / "packet.json").read_text(encoding="utf-8"))
            check("packet:no-database-password", source.password in json.dumps(metadata), False)
            check("packet:source-machine-bound", metadata["sourceHost"], offhost.host_commitment())
            refused = None
            try:
                offhost.verify(packet, identity, packet_hash)
            except Exception as caught:
                refused = str(caught)
            check("offhost:same-machine-refused", refused, "SECOND_HOST_REQUIRED")
            started = time.monotonic()
            result = offhost.verify(packet, identity, packet_hash, local_rehearsal=True)
            check("rehearsal:restored", result["status"], "RESTORED_IN_QUARANTINE")
            check("rehearsal:payload-commitment", result["payloadHash"], expected)
            check("rehearsal:not-offhost", result["offHostAccepted"], False)
            check("rehearsal:traffic-blocked", result["trafficReleaseAuthorized"], False)
            check("rehearsal:custom-roles-nologin", result["restore"]["credentials"], "ALL_CUSTOM_ROLES_NOLOGIN_RESET_REQUIRED")
            check("rehearsal:restore-server-stopped", result["serverStopped"])
            check("rehearsal:current-authority-still-required", result["restore"]["retention"]["authorityChecked"], False)
            witness.update(localRehearsal=result, restoreWallSeconds=round(time.monotonic() - started, 3),
                           backupRecoveryPoint=pointer["recovery_point_at"], offHostAccepted=False,
                           actualOffHostStatus="NOT_RUN_OWNER_DEFERRED_SECOND_HOST", status="PASS")
            witness["privatePacketForFutureTransfer"] = str(packet)
            witness["packetSha256OutOfBandRequired"] = packet_hash
    finally:
        witness["sourceStopped"] = source.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "offhost-local-rehearsal-final.json").open("x", encoding="utf-8") as output:
            json.dump(witness, output, indent=2)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "offHostAccepted": False,
                      "sourceStopped": source.stopped}))


if __name__ == "__main__":
    main()
