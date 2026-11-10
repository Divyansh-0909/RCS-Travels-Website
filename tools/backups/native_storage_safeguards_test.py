"""Small real PostgreSQL storage observations, temp refusal and history admission."""
import copy
import hashlib
import json
from pathlib import Path
import time

import psycopg

from native_postgres import NativePostgres
from storage_probe import collect
from storage_safeguards import KINDS, StorageGuard, bounded_put, evaluate

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-storage-safeguards-2026-10-22"


def main():
    files = [Path(__file__)] + [ROOT / p for p in ["tools/backups/native_postgres.py",
             "tools/backups/storage_probe.py", "tools/backups/storage_safeguards.py",
             "tools/phase9d/management-capacity.sql"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins,
               "boundary": "Synthetic local PG only; cooperative history admission and per-process temp "
                           "limit, not a universal physical disk/WAL cap or hosted configuration proof"}
    server = NativePostgres()

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        assert actual == expected, name

    try:
        with server:
            witness["environment"] = server.identity
            # Restart only this freshly owned instance, before any test records.
            server.command([str(server.binary / "pg_ctl.exe"), "-D", str(server.data), "-m", "fast", "-w", "stop"], "settings-stop")
            with (server.data / "postgresql.conf").open("a", encoding="utf-8") as config:
                config.write("\ntemp_file_limit='1MB'\nmax_slot_wal_keep_size='32MB'\n")
            server.command([str(server.binary / "pg_ctl.exe"), "-D", str(server.data), "-l", str(server.root / "server.private.log"), "-w", "start"], "settings-start")
            roots = {k: server.root / ("observed-" + k) for k in ["logs", "archive", "backups", "artifacts"]}
            for path in roots.values():
                path.mkdir()
            with server.connect() as c:
                observed = collect(c, roots)
            check("observer:readonly-report", observed["inventoryComplete"], False)
            check("observer:all-domain-kinds", sorted({d["kind"] for d in observed["domains"]}), sorted(KINDS))
            check("observer:cluster-wal-counted-once", sum(d["kind"] == "wal" for d in observed["domains"]), 1)
            check("observer:database-catalogs-included", sum(d["kind"] == "history" for d in observed["domains"]) >= 3)
            check("settings:finite-slot-retention", observed["details"]["settings"]["max_slot_wal_keep_size"], "32")
            check("settings:temp-limit", observed["details"]["settings"]["temp_file_limit"], "1024")
            with server.connect(autocommit=True) as c:
                c.execute("CREATE TABLE public.synthetic_history(id bigint PRIMARY KEY,payload text); "
                          "INSERT INTO public.synthetic_history VALUES(1,'original-retained')", prepare=False)
                c.execute("SET work_mem='64kB'")
                error = None
                try:
                    c.execute("SELECT sum(length(v)) FROM (SELECT repeat(md5(i::text),16) v "
                              "FROM generate_series(1,15000) i ORDER BY v) sorted")
                except psycopg.Error as caught:
                    error = caught.sqlstate
                check("temp:actual-spill-refused", error, "53400")
                check("temp:original-row-survives", c.execute("SELECT payload FROM public.synthetic_history WHERE id=1").fetchone()[0], "original-retained")
                check("temp:subsequent-query-works", c.execute("SELECT 1").fetchone()[0], 1)
                c.execute("CREATE SCHEMA outbox9d; CREATE TABLE outbox9d.deliveries(status text)", prepare=False)
                c.execute((ROOT / "tools/phase9d/management-capacity.sql").read_text(encoding="utf-8"), prepare=False)
                c.execute("""INSERT INTO capacity9d.configuration(singleton,enabled,node,cluster_owner,
budget,emergency_reserve,admission_bytes,max_operations,stale_seconds,require_quota,quota_verified,
physical_location,max_pending,external_complete,max_wal_growth)
VALUES(true,true,'source',true,1073741824,65536,4096,10,60,false,false,'synthetic-owned-local',100,true,67108864);
CREATE TRIGGER synthetic_history_admission BEFORE INSERT ON public.synthetic_history
FOR EACH ROW EXECUTE FUNCTION capacity9d.admit();""", prepare=False)
                c.execute("SELECT capacity9d.observe()")
                c.execute("INSERT INTO public.synthetic_history VALUES(2,'accepted-before-pressure')")
                check("history:initial-reservation-persisted", c.execute("SELECT count(*) FROM capacity9d.reservations").fetchone()[0], 1)
                # Narrow controller-owned boundary, independent of page allocation.
                c.execute("UPDATE capacity9d.configuration SET budget=(SELECT measured_bytes+65536+4096 FROM capacity9d.measurement)")
                error = None
                try:
                    c.execute("INSERT INTO public.synthetic_history VALUES(3,'must-not-commit')")
                except psycopg.Error as caught:
                    error = caught.sqlstate
                check("history:admission-refusal", error, "54000")
                check("history:refused-row-absent", c.execute("SELECT array_agg(id ORDER BY id) FROM public.synthetic_history").fetchone()[0], [1, 2])
                check("history:rollback-does-not-add-reservation", c.execute("SELECT count(*) FROM capacity9d.reservations").fetchone()[0], 1)
                stop = c.execute("SELECT capacity9d.reserve('synthetic-stop',4096,'STOP')").fetchone()[0]
                check("history:stop-reserve-available", stop["status"], "RESERVED")
                check("history:no-deletion", c.execute("SELECT count(*) FROM public.synthetic_history").fetchone()[0], 2)
                c.execute("UPDATE capacity9d.configuration SET require_quota=true")
                refused = c.execute("SELECT capacity9d.reserve('unverified-quota',1,'NORMAL')").fetchone()[0]
                check("history:unverified-quota-is-not-assumed", refused["status"], "INFRASTRUCTURE_UNVERIFIED")
                witness["historyCatalog"] = c.execute("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='synthetic_history_admission'").fetchone()[0]
            policy = {"version": 1, "enabled": True, "productionDeletion": False,
                      "budgets": dict.fromkeys(KINDS, 256 * 1024**2), "totalBytes": 1024**3,
                      "reserveBytes": 16 * 1024**2, "staleSeconds": 60,
                      "backupDeadlineSeconds": 100, "restoreDeadlineSeconds": 200, "maxOperations": 30}
            guard = StorageGuard(server.root / "storage-state.sqlite", policy)
            current = time.time()
            refusal = guard.observe(observed)
            check("controller:unknown-coverage-refused", "INVENTORY_UNKNOWN" in refusal["reasons"])
            check("controller:unbounded-log-sink-refused", "LOG_UNBOUNDED" in refusal["reasons"])
            # An explicitly labelled trusted synthetic complete view exercises the
            # gate; it does not relabel unknown real logs/archives as measured.
            synthetic = copy.deepcopy(observed)
            synthetic.update(inventoryComplete=True, verifiedBackupAt=current, verifiedRestoreAt=current)
            synthetic["controls"] = dict.fromkeys(synthetic["controls"], True)
            check("controller:synthetic-complete-attestation", guard.observe(synthetic)["status"], "READY")
            check("controller:history-reservation", guard.reserve("history-one", "synthetic", "history", 1024), "RESERVED")
            stale = copy.deepcopy(synthetic)
            stale["verifiedBackupAt"] = current - 101
            check("controller:stale-backup-refused", "BACKUP_STALE" in evaluate(policy, stale)["reasons"])
            check("controller:retains-history-reservation", guard.release("history-one", "foreign"), False)
            bounded_root = server.root / "bounded-writers"
            bounded_root.mkdir()
            (bounded_root / "ownership.json").write_text(json.dumps({"owner": server.owner, "purpose": "storage-safeguards"}))
            for kind in ["logs", "archive", "backups", "artifacts"]:
                check(kind + ":bounded-write", bounded_put(bounded_root, server.owner, kind, "evidence", b"synthetic", 9), "STORED")
                error = None
                try:
                    bounded_put(bounded_root, server.owner, kind, "overflow", b"x", 9)
                except ValueError as caught:
                    error = str(caught)
                check(kind + ":refusal-preserves-original", error, "FILE_CAPACITY_REFUSED")
            witness["observation"] = observed
            witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "native-storage-final.json").open("x", encoding="utf-8") as output:
            json.dump(witness, output, indent=2)
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "stopped": server.stopped}))


if __name__ == "__main__":
    main()
