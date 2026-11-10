"""Bounded native physical backup, archive refusal/drain and named WAL recovery."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid

import psycopg

from native_postgres import NativePostgres
from archive_spool import WAL_NAME

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-engineering-completion-2026-10-21/archive-recovery.json"


def main():
    files = [Path(__file__), ROOT / "tools/backups/archive_spool.py", ROOT / "tools/backups/native_postgres.py"]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"cases": [], "sourceHashes": pins, "syntheticOnly": True, "profiling": False, "docker": False,
               "boundary": "Enforced archive WAL-payload spool budget, not physical volume ENOSPC; native local PG is not hosted Supabase PITR or off-host recovery"}
    server = NativePostgres()
    restored_started = False

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        assert actual == expected, name

    def write_config(path, config):
        temporary = path.with_suffix(".new")
        temporary.write_text(json.dumps(config), encoding="utf-8")
        os.replace(temporary, path)

    def wait_for(predicate, seconds=85):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            result = predicate()
            if result:
                return result
            time.sleep(1)
        raise TimeoutError("BOUNDED_ARCHIVE_WAIT_EXPIRED")

    try:
        with server:
            witness["environment"] = server.identity
            recovery = server.root / "physical-restore"
            config = {"ownerRoot": str(server.root), "owner": server.owner, "restoreRoot": str(recovery), "capacityBytes": 134217728}
            cfg = server.root / "archive-config.json"
            write_config(cfg, config)
            wrappers = {}
            for mode in ["archive", "restore"]:
                wrapper = server.root / (mode + ".cmd")
                wrapper.write_text('@echo off\r\n"' + sys.executable + '" -B "' + str(ROOT / "tools/backups/archive_spool.py") + '" ' + mode + ' "' + str(cfg) + '" "%~1" "%~2"\r\nexit /b %errorlevel%\r\n', encoding="ascii")
                wrappers[mode] = str(wrapper).replace("\\", "/")
            server.command([str(server.binary / "pg_ctl.exe"), "-D", str(server.data), "-m", "fast", "-w", "stop"], "configure-stop")
            with (server.data / "postgresql.conf").open("a", encoding="utf-8") as handle:
                handle.write("\narchive_mode=on\narchive_command='\"" + wrappers["archive"] + "\" \"%p\" \"%f\"'\n")
            with (server.data / "pg_hba.conf").open("a", encoding="utf-8") as handle:
                handle.write("\nhost replication proofloop_owner 127.0.0.1/32 scram-sha-256\n")
            server.command([str(server.binary / "pg_ctl.exe"), "-D", str(server.data), "-l", str(server.root / "server.private.log"), "-w", "start"], "configure-start")
            env = dict(server.env, PGPASSWORD=server.password, PGHOST="127.0.0.1", PGPORT=str(server.port), PGUSER="proofloop_owner", PGSSLMODE="disable", PGCONNECT_TIMEOUT="5")

            def private_command(arguments, label, timeout=100):
                with (server.root / (label + ".private.log")).open("xb") as log:
                    completed = subprocess.run(arguments, env=env, stdout=log, stderr=log, timeout=timeout)
                check(label, completed.returncode, 0)

            with server.connect(autocommit=True) as c:
                check("archive-mode", c.execute("SHOW archive_mode").fetchone()[0], "on")
                c.execute("CREATE SCHEMA recovery_lab; CREATE TABLE recovery_lab.records(id int PRIMARY KEY,payload text); INSERT INTO recovery_lab.records VALUES(1,'synthetic-before-base')", prepare=False)
                initial_lsn = c.execute("SELECT pg_current_wal_lsn()::text").fetchone()[0]
                private_command([str(server.binary / "pg_basebackup.exe"), "--no-password", "--format=plain", "--wal-method=stream", "--checkpoint=fast", "--manifest-checksums=SHA256", "--max-rate=16M", "--pgdata", str(recovery)], "basebackup")
                private_command([str(server.binary / "pg_verifybackup.exe"), "--exit-on-error", str(recovery)], "verifybackup")
                c.execute("INSERT INTO recovery_lab.records VALUES(2,'synthetic-before-target')")
                restore_point = "proofloop_" + uuid.uuid4().hex
                target_lsn = c.execute("SELECT pg_create_restore_point(%s)::text", (restore_point,)).fetchone()[0]
                target_wal = c.execute("SELECT pg_walfile_name(%s::pg_lsn)", (target_lsn,)).fetchone()[0]
                c.execute("SELECT pg_switch_wal()")
                wait_for(lambda: (server.root / "archive" / target_wal).is_file(), 35)
                check("named-target-segment-archived", (server.root / "archive" / target_wal).is_file())
                used = sum(p.stat().st_size for p in (server.root / "archive").iterdir() if WAL_NAME.fullmatch(p.name))
                config["capacityBytes"] = used
                write_config(cfg, config)
                failed_before = c.execute("SELECT failed_count FROM pg_stat_archiver").fetchone()[0]
                c.execute("INSERT INTO recovery_lab.records VALUES(3,'synthetic-after-target')")
                refused_wal = c.execute("SELECT pg_walfile_name(pg_current_wal_lsn())").fetchone()[0]
                c.execute("SELECT pg_switch_wal()")
                wait_for(lambda: c.execute("SELECT failed_count>%s FROM pg_stat_archiver", (failed_before,)).fetchone()[0], 35)
                check("archive-capacity-refused", not (server.root / "archive" / refused_wal).exists())
                check("source-commit-survives-refusal", c.execute("SELECT count(*) FROM recovery_lab.records").fetchone()[0], 3)
                retained_wal_bytes = c.execute("SELECT sum(size) FROM pg_ls_waldir()").fetchone()[0]
                config["capacityBytes"] = min(134217728, used + 33554432)
                write_config(cfg, config)
                c.execute("SELECT pg_switch_wal()")
                wait_for(lambda: (server.root / "archive" / refused_wal).is_file())
                check("archive-refusal-drained", (server.root / "archive" / refused_wal).is_file())
                witness["sourceMetrics"] = {"walBytesDuringRefusal": retained_wal_bytes, "spoolCapacityAtRefusal": used,
                    "walGeneratedBytes": int(c.execute("SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),%s::pg_lsn)", (initial_lsn,)).fetchone()[0]),
                    "archiver": c.execute("SELECT archived_count,failed_count,last_archived_wal,last_failed_wal FROM pg_stat_archiver").fetchone(),
                    "relationBytes": c.execute("SELECT pg_total_relation_size('recovery_lab.records')").fetchone()[0]}
            # Verify the untouched physical backup before adding owned recovery config.
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                restore_port = reservation.getsockname()[1]
            with (recovery / "postgresql.conf").open("a", encoding="utf-8") as handle:
                handle.write("\nport=" + str(restore_port) + "\narchive_mode=off\nrestore_command='\"" + wrappers["restore"] + "\" \"%f\" \"%p\"'\nrecovery_target_name='" + restore_point + "'\nrecovery_target_action='promote'\n")
            (recovery / "recovery.signal").touch(exist_ok=False)
            try:
                server.command([str(server.binary / "pg_ctl.exe"), "-D", str(recovery), "-l", str(server.root / "restore-server.private.log"), "-w", "-t", "45", "start"], "restore-start", 55)
                restored_started = True
                with psycopg.connect(host="127.0.0.1", port=restore_port, dbname="postgres", user="proofloop_owner", password=server.password, connect_timeout=5, autocommit=True) as restored:
                    check("restored-distinct-port", restored.execute("SELECT inet_server_port()").fetchone()[0], restore_port)
                    # pg_ctl readiness permits read-only hot-standby connections.
                    # Named-target recovery/promotion can legitimately finish afterward.
                    wait_for(lambda: not restored.execute("SELECT pg_is_in_recovery()").fetchone()[0], 35)
                    check("target-recovery-promoted", restored.execute("SELECT pg_is_in_recovery()").fetchone()[0], False)
                    check("target-excludes-later-commit", restored.execute("SELECT array_agg(id ORDER BY id) FROM recovery_lab.records").fetchone()[0], [1, 2])
                    restored.execute("INSERT INTO recovery_lab.records VALUES(4,'synthetic-after-recovery')")
                    check("restored-new-write", restored.execute("SELECT count(*) FROM recovery_lab.records").fetchone()[0], 3)
                with server.connect(autocommit=True) as source:
                    check("source-independent-unchanged", source.execute("SELECT array_agg(id ORDER BY id) FROM recovery_lab.records").fetchone()[0], [1, 2, 3])
                witness["status"] = "PASS"
            finally:
                if (recovery / "postmaster.pid").exists():
                    server.command([str(server.binary / "pg_ctl.exe"), "-D", str(recovery), "-m", "fast", "-w", "stop"], "restore-stop")
                restored_started = (recovery / "postmaster.pid").exists()
    finally:
        witness["originalServerStopped"] = server.stopped
        witness["restoredServerStopped"] = not restored_started
        witness["sourceUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        witness["caseCount"] = len(witness["cases"])
        with OUT.open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=str)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serversStopped": server.stopped and not restored_started}))


if __name__ == "__main__":
    main()
