"""Read-only physical observations. Metrics exclude contents and SQL text."""
import hashlib
import argparse
import json
import os
from pathlib import Path
import time

import psycopg

from storage_safeguards import require


def directory_bytes(path, max_files=10000):
    root = Path(path).resolve()
    require(root.is_dir(), "OBSERVATION_DIRECTORY_MISSING")
    pending, size, files = [root], 0, 0
    while pending:
        current = pending.pop()
        with os.scandir(current) as entries:
            for entry in entries:
                require(not entry.is_symlink() and not Path(entry.path).is_junction(), "OBSERVATION_LINK_REFUSED")
                files += 1
                require(files <= max_files, "OBSERVATION_FILE_LIMIT")
                if entry.is_dir(follow_symlinks=False):
                    pending.append(Path(entry.path))
                elif entry.is_file(follow_symlinks=False):
                    size += entry.stat(follow_symlinks=False).st_size
                else:
                    raise ValueError("OBSERVATION_ENTRY_INVALID")
    return size


def collect(conn, external_roots):
    """Cluster-level privileged observer; unsupported permission errors propagate.

    One invocation owns cluster WAL/temp accounting. Never add database index or
    TOAST bytes again: pg_database_size already includes them. This is not an
    atomic filesystem snapshot, root inventory attestation or quota verification.
    """
    require(conn.info.transaction_status == psycopg.pq.TransactionStatus.IDLE, "FRESH_CONNECTION_REQUIRED")
    conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
    conn.read_only = True
    at = time.time()
    with conn.transaction():
        conn.execute("SET LOCAL statement_timeout='10s'")
        actual = conn.execute("SELECT current_setting('transaction_isolation'),current_setting('transaction_read_only')").fetchone()
        require(actual == ("repeatable read", "on"), "READ_ONLY_SNAPSHOT_REQUIRED")
        cluster = conn.execute("SELECT system_identifier::text FROM pg_control_system()").fetchone()[0]
        identity = hashlib.sha256(cluster.encode()).hexdigest()[:24]
        data = Path(conn.execute("SHOW data_directory").fetchone()[0]).resolve()
        settings = dict(conn.execute("SELECT name,setting FROM pg_settings WHERE name=ANY(%s)", ([
            "max_wal_size", "max_slot_wal_keep_size", "wal_keep_size", "temp_file_limit",
            "max_connections", "max_parallel_workers", "logging_collector", "log_rotation_age",
            "log_rotation_size", "log_truncate_on_rotation", "archive_mode",
        ],)).fetchall())
        databases = conn.execute("SELECT oid,pg_database_size(oid) FROM pg_database ORDER BY oid").fetchall()
        wal = conn.execute("SELECT COALESCE(sum(size),0)::bigint FROM pg_ls_waldir()").fetchone()[0]
        # Include temporary files in every tablespace, not only pg_default.
        temporary = conn.execute("SELECT COALESCE(sum(f.size),0)::bigint FROM pg_tablespace t "
                                 "CROSS JOIN LATERAL pg_ls_tmpdir(t.oid) f").fetchone()[0]
        slots = conn.execute("SELECT count(*),COALESCE(max(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)),0)::bigint "
                             "FROM pg_replication_slots").fetchone()
        archiver = conn.execute("SELECT archived_count,failed_count FROM pg_stat_archiver").fetchone()
        oldest = conn.execute("SELECT COALESCE(max(extract(epoch FROM clock_timestamp()-xact_start)),0)::float8 "
                              "FROM pg_stat_activity WHERE pid<>pg_backend_pid()").fetchone()[0]
    domains = [{"id": identity + ":db:" + str(oid), "kind": "history", "bytes": size, "at": at}
               for oid, size in databases]
    domains += [{"id": identity + ":" + kind, "kind": kind, "bytes": size, "at": at}
                for kind, size in [("wal", wal), ("temp", temporary)]]
    require(set(external_roots) == {"logs", "archive", "backups", "artifacts"}, "EXTERNAL_COVERAGE_REQUIRED")
    roots = [Path(path).resolve() for path in external_roots.values()]
    require(all(not a.is_relative_to(b) and not b.is_relative_to(a) for i, a in enumerate(roots)
                for b in roots[i + 1:]), "OBSERVATION_ROOT_OVERLAP")
    require(all(not p.is_relative_to(data) and not data.is_relative_to(p) for p in roots),
            "EXTERNAL_DATA_OVERLAP")
    domains += [{"id": identity + ":" + kind, "kind": kind, "bytes": directory_bytes(path), "at": at}
                for kind, path in external_roots.items()]
    return {"domains": domains, "inventoryComplete": False, "verifiedBackupAt": None,
            "verifiedRestoreAt": None, "controls": {
                "finiteSlotRetention": int(settings["max_slot_wal_keep_size"]) >= 0,
                "finiteTempPerProcess": int(settings["temp_file_limit"]) >= 0,
                "boundedLogSink": False, "archiveHealthy": False, "slotsWithinBudget": False,
            }, "details": {"settings": settings, "slotCount": slots[0], "slotRetainedBytes": slots[1],
                           "archivedCount": archiver[0], "archiveFailureCount": archiver[1],
                           "oldestOtherTransactionSeconds": oldest},
            "boundary": "Catalog/filesystem observations are not atomic; index/TOAST already in database bytes. "
                        "External completeness, log sink, archive health, slot budget and backup/restore proofs "
                        "require separate current evidence. max_wal_size is not a hard cap."}


def main():
    from backup import connection_env, database_connect
    parser = argparse.ArgumentParser()
    parser.add_argument("--roots", required=True, help="Private JSON of logs/archive/backups/artifacts directories")
    parser.add_argument("--output", required=True, help="New private observation file")
    args = parser.parse_args()
    # Explicit secret environment only; no dotenv, CLI URI or credential discovery.
    url = os.environ["STORAGE_OBSERVER_URL"]
    connection_env(url)  # Validate TLS for hosted endpoints and refuse transaction poolers.
    roots = json.loads(Path(args.roots).read_text(encoding="utf-8"))
    with database_connect(url) as c:
        result = collect(c, roots)
    with Path(args.output).open("x", encoding="utf-8") as output:
        json.dump(result, output, indent=2)
    print('{"status":"OBSERVED_INCOMPLETE_INVENTORY_NO_ADMISSION"}')


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print('{"status":"REFUSED","reason":"STORAGE_OBSERVATION_FAILED_DETAILS_WITHHELD"}')
        raise SystemExit(1) from None
