"""One real ENOSPC/recovery probe on an approved new 384 MiB virtual disk only."""
import ctypes
from contextlib import ExitStack
import errno
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time

from native_postgres import NativePostgres

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-open-gates-2026-10-22"


def main():
    summary = json.loads((OUT / "isolated-volume-plan.json").read_text(encoding="utf-8-sig"))
    plan = json.loads(Path(summary["config"]).read_text(encoding="utf-8-sig"))
    owned = Path(plan["root"])
    created = json.loads((owned / "created.json").read_text(encoding="utf-8-sig"))
    if created["owner"] != plan["owner"] or created["maximumMB"] != 384 or created["label"] != plan["label"]:
        raise ValueError("APPROVED_NEW_VOLUME_REQUIRED")
    mount = Path(created["mount"])
    path_buffer = ctypes.create_unicode_buffer(1024)
    if not ctypes.windll.kernel32.GetVolumePathNameW(str(mount / "fixture"), path_buffer, 1024):
        raise OSError("OWNED_VOLUME_PATH_UNAVAILABLE")
    label = ctypes.create_unicode_buffer(1024)
    if not ctypes.windll.kernel32.GetVolumeInformationW(path_buffer.value, label, 1024, None, None, None, None, 0):
        raise OSError("OWNED_VOLUME_LABEL_UNAVAILABLE")
    volume = shutil.disk_usage(mount)
    if path_buffer.value.rstrip("\\").lower() != str(mount).rstrip("\\").lower() or label.value != plan["label"] or not 128 * 1048576 < volume.total <= 384 * 1048576:
        raise ValueError("ACTUAL_SMALL_OWNED_VOLUME_BINDING_REQUIRED")
    witness = {"owner": plan["owner"], "volumeBytes": volume.total, "label": label.value, "cases": [], "status": "FAIL",
               "scope": "ONE_BOUNDED_SYNTHETIC_NTFS_VOLUME_ENOSPC", "profiling": False, "production": "OFF",
               "sourceHashes": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__), ROOT / "tools/backups/isolated_volume.ps1", ROOT / "tools/backups/native_postgres.py"]}}
    server = NativePostgres()
    server.root = Path(created["fixture"]) / server.owner
    server.data = server.root / "data"
    reserve = mount / "fixture" / "emergency-reserve.bin"
    filler = mount / "fixture" / "owned-filler.bin"
    started = time.monotonic()

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    def reclaim():
        # Registered after server entry: reclaim before PostgreSQL shutdown,
        # even when the one write probe raises an unexpected error.
        reserve.unlink(missing_ok=True)
        filler.unlink(missing_ok=True)

    try:
        with ExitStack() as cleanup:
            cleanup.enter_context(server)
            cleanup.callback(reclaim)
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as c:
                c.execute("CREATE SCHEMA quota_lab; CREATE TABLE quota_lab.original(id int PRIMARY KEY,payload text); INSERT INTO quota_lab.original VALUES(1,'synthetic-durable-before-full'); CHECKPOINT", prepare=False)
                before = c.execute("SELECT id,payload FROM quota_lab.original ORDER BY id").fetchall()
                check("baseline:durable-row", before, [(1, "synthetic-durable-before-full")])
                with reserve.open("xb", buffering=0) as out:
                    block = b"r" * 262144
                    for _ in range(64):
                        out.write(block)
                    os.fsync(out.fileno())
                written = 0
                os_error = None
                with filler.open("xb", buffering=0) as out:
                    block = b"f" * 262144
                    try:
                        while written < 384 * 1048576 and time.monotonic() - started < 120:
                            result = out.write(block)
                            written += result
                            os.fsync(out.fileno())
                    except OSError as error:
                        os_error = {"errno": error.errno, "winerror": getattr(error, "winerror", None)}
                    if os_error is None:
                        raise RuntimeError("BOUNDED_VOLUME_DID_NOT_REFUSE_FILL")
                check("os:real-enospc", os_error["errno"] == errno.ENOSPC or os_error["winerror"] == 112)
                witness["fillerBytes"] = written
                witness["osError"] = os_error
                witness["minimumVolumeFreeBytes"] = shutil.disk_usage(mount).free
                # At most one SQL write probe. A fresh relation must allocate
                # space inside this full volume; no host-level disk is filled.
                try:
                    c.execute("CREATE TABLE quota_lab.exhaustion_probe AS SELECT repeat('synthetic',1000) AS payload")
                except Exception as error:
                    witness["databaseRefusal"] = {"type": type(error).__name__, "sqlstate": getattr(error, "sqlstate", None)}
                else:
                    raise AssertionError("DATABASE_WRITE_WAS_NOT_REFUSED")
                check("database:disk-full-sqlstate", witness["databaseRefusal"]["sqlstate"], "53100")
                # Reclaim only this test's known files, while the VHD remains attached.
                reclaim()
                check("reserve:reclaimed", shutil.disk_usage(mount).free > 16 * 1048576)
                check("original:unchanged-after-refusal", c.execute("SELECT id,payload FROM quota_lab.original ORDER BY id").fetchall(), before)
                c.execute("CHECKPOINT")
            server.command([str(server.binary / "pg_ctl.exe"), "-D", str(server.data), "-m", "fast", "-w", "stop"], "quota-restart-stop")
            server.command([str(server.binary / "pg_ctl.exe"), "-D", str(server.data), "-l", str(server.root / "server.private.log"), "-w", "start"], "quota-restart-start")
            with server.connect(autocommit=True) as c:
                check("restart:original-preserved", c.execute("SELECT id,payload FROM quota_lab.original ORDER BY id").fetchall(), before)
                check("restart:not-recovery", c.execute("SELECT pg_is_in_recovery()").fetchone()[0], False)
                c.execute("INSERT INTO quota_lab.original VALUES(2,'synthetic-write-after-recovery')")
                check("restart:new-write", c.execute("SELECT count(*) FROM quota_lab.original").fetchone()[0], 2)
            witness["status"] = "PASS"
    finally:
        # This runs on failure too. Files are exact known names on the verified
        # owned mount, never a recursively computed host deletion target.
        reclaim()
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["elapsedSeconds"] = round(time.monotonic() - started, 3)
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in witness["sourceHashes"].items())
        if hasattr(server, "root") and (server.root / "server.private.log").exists():
            log = (server.root / "server.private.log").read_text(errors="replace")
            witness["serverLogSha256"] = hashlib.sha256(log.encode()).hexdigest()
            witness["sanitizedDiagnostics"] = [line.replace(str(server.root), "[OWNED_FIXTURE]") for line in log.splitlines() if any(word in line.lower() for word in ["no space", "disk full", "panic", "database system is ready", "shut down"])]
        with (OUT / "volume-enospc.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2)
        (owned / "test-finished.json").write_text(json.dumps({"owner": plan["owner"], "serverStopped": server.stopped}), encoding="utf-8")
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
