"""Opt-in admission around the existing encrypted backup; no retention deletion.

Reserve worst-case scratch and ciphertext before work. Reservations remain held
on success/error until an operator reconciles fresh measurements, so an upload
with lost acknowledgement cannot become free space. Other writers can bypass
this cooperative gate; use a verified worker/volume quota for hard enforcement.
"""
from pathlib import Path
import shutil
import tempfile

import backup
from storage_safeguards import require


class CappedUpload:
    def __init__(self, client, maximum):
        self.client, self.maximum = client, maximum

    def __getattr__(self, name):
        return getattr(self.client, name)

    def upload_file(self, source, bucket, key, **kwargs):
        require(key.endswith(".tar.age"), "CIPHERTEXT_ONLY_UPLOAD")
        require(Path(source).stat().st_size <= self.maximum, "CIPHERTEXT_RESERVATION_EXCEEDED")
        return self.client.upload_file(source, bucket, key, **kwargs)


def guarded_backup(config, client, url, guard, operation, *, synthetic=False):
    require(type(config.get("max_archive_bytes")) is int and 0 < config["max_archive_bytes"] <= 4 * 1024**3,
            "ARCHIVE_BOUND_REQUIRED")
    # Dump + bundle + encrypted copy + readback + conservative overhead.
    scratch, ciphertext = config["max_archive_bytes"] * 5, config["max_archive_bytes"] * 2
    require(shutil.disk_usage(tempfile.gettempdir()).free >= scratch + guard.policy["reserveBytes"],
            "BACKUP_SCRATCH_HEADROOM_REQUIRED")
    first = guard.reserve(operation + "-backup", "backup-worker", "backups", ciphertext)
    require(first == "RESERVED", "BACKUP_OPERATION_ALREADY_RESERVED_RECONCILE_REQUIRED")
    second = guard.reserve(operation + "-scratch", "backup-worker", "temp", scratch)
    require(second == "RESERVED", "BACKUP_OPERATION_ALREADY_RESERVED_RECONCILE_REQUIRED")
    result = backup.backup(config, CappedUpload(client, ciphertext), url, synthetic=synthetic)
    return {**result, "storageAdmission": "RESERVED_RECONCILIATION_REQUIRED",
            "ciphertextReservationBytes": ciphertext, "scratchReservationBytes": scratch,
            "hardWorkerQuotaVerified": False}
