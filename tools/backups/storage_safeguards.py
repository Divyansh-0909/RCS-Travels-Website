"""Opt-in cooperative budgets and bounded durable alerts. Never deletes history.

Only enrolled writers are fenced. An admission budget is not a filesystem quota.
SQLite state and managed directories require an operator-owned private directory.
"""
from contextlib import closing, contextmanager
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time
import uuid

KINDS = {"history", "wal", "temp", "logs", "archive", "backups", "artifacts"}
REASONS = {"INVENTORY_UNKNOWN", "MEASUREMENT_STALE", "OVERALL_PRESSURE",
           "BACKUP_STALE", "RESTORE_STALE", "WAL_UNBOUNDED", "TEMP_UNBOUNDED",
           "LOG_UNBOUNDED", "ARCHIVE_FAILED", "SLOT_LAG", "LEDGER_FULL"}
REASONS |= {"LIMIT_" + k.upper() for k in KINDS}
IDENTIFIER = re.compile(r"[A-Za-z0-9_-]{1,120}\Z")


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def integer(value, minimum=0):
    return type(value) is int and minimum <= value < 2**63


def validate_policy(policy):
    require(policy.get("version") == 1 and policy.get("productionDeletion") is False,
            "POLICY_INVALID")
    require(type(policy.get("enabled")) is bool, "POLICY_INVALID")
    require(set(policy.get("budgets", {})) == KINDS, "BUDGET_COVERAGE_INVALID")
    require(all(integer(n, 1) for n in policy["budgets"].values()), "BUDGET_INVALID")
    for field in ("totalBytes", "reserveBytes", "staleSeconds", "backupDeadlineSeconds",
                  "restoreDeadlineSeconds", "maxOperations"):
        require(integer(policy.get(field), 1), "POLICY_INVALID")
    require(policy["reserveBytes"] < policy["totalBytes"] and policy["maxOperations"] <= 10000,
            "POLICY_INVALID")
    return hashlib.sha256(json.dumps(policy, sort_keys=True).encode()).hexdigest()


def evaluate(policy, report, now=None):
    """Complete disjoint domains, including known-empty external stores, are required."""
    now = time.time() if now is None else now
    validate_policy(policy)
    if not policy["enabled"]:
        return {"status": "DISABLED", "reasons": [], "used": {}, "total": 0}
    reasons, used, seen = set(), dict.fromkeys(KINDS, 0), set()
    domains = report.get("domains", [])
    require(type(domains) is list and len(domains) <= 10000, "DOMAIN_COUNT_LIMIT")
    if report.get("inventoryComplete") is not True or not domains:
        reasons.add("INVENTORY_UNKNOWN")
    covered = set()
    for domain in domains:
        require(set(domain) == {"id", "kind", "bytes", "at"}, "DOMAIN_INVALID")
        require(isinstance(domain["id"], str) and domain["id"] not in seen, "DOMAIN_DUPLICATE")
        require(domain["kind"] in KINDS and integer(domain["bytes"]), "DOMAIN_INVALID")
        require(type(domain["at"]) in (int, float) and math.isfinite(domain["at"]), "DOMAIN_INVALID")
        seen.add(domain["id"])
        covered.add(domain["kind"])
        used[domain["kind"]] += domain["bytes"]
        if not -5 <= now - domain["at"] <= policy["staleSeconds"]:
            reasons.add("MEASUREMENT_STALE")
    if covered != KINDS:
        reasons.add("INVENTORY_UNKNOWN")
    for kind, size in used.items():
        if size >= policy["budgets"][kind]:
            reasons.add("LIMIT_" + kind.upper())
    total = sum(used.values())
    if total >= policy["totalBytes"] - policy["reserveBytes"]:
        reasons.add("OVERALL_PRESSURE")
    for field, deadline, reason in [
        ("verifiedBackupAt", "backupDeadlineSeconds", "BACKUP_STALE"),
        ("verifiedRestoreAt", "restoreDeadlineSeconds", "RESTORE_STALE"),
    ]:
        stamp = report.get(field)
        if type(stamp) not in (int, float) or not -5 <= now - stamp <= policy[deadline]:
            reasons.add(reason)
    controls = report.get("controls", {})
    for field, reason in [("finiteSlotRetention", "WAL_UNBOUNDED"),
                          ("finiteTempPerProcess", "TEMP_UNBOUNDED"),
                          ("boundedLogSink", "LOG_UNBOUNDED")]:
        if controls.get(field) is not True:
            reasons.add(reason)
    if controls.get("archiveHealthy") is not True:
        reasons.add("ARCHIVE_FAILED")
    if controls.get("slotsWithinBudget") is not True:
        reasons.add("SLOT_LAG")
    return {"status": "REFUSED" if reasons else "READY", "reasons": sorted(reasons),
            "used": used, "total": total, "hardPhysicalQuotaVerified": False}


class StorageGuard:
    def __init__(self, path, policy):
        self.path, self.policy = Path(path), policy
        self.policy_hash = validate_policy(policy)
        require(self.path.parent.is_dir() and not self.path.is_symlink(), "PRIVATE_STATE_REQUIRED")
        with self.transaction() as c:
            schema = """CREATE TABLE IF NOT EXISTS configuration(hash TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS observations(singleton INTEGER PRIMARY KEY CHECK(singleton=1),report TEXT);
CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,actor TEXT,kind TEXT,bytes INTEGER,class TEXT,state TEXT);
CREATE TABLE IF NOT EXISTS alerts(reason TEXT PRIMARY KEY,active INTEGER,generation INTEGER,state TEXT,
 attempts INTEGER,token TEXT,lease REAL,destination TEXT,receipt TEXT);"""
            for statement in schema.split(";"):
                if statement.strip():
                    c.execute(statement)
            old = c.execute("SELECT hash FROM configuration").fetchone()
            require(old is None or old[0] == self.policy_hash, "POLICY_CHANGE_REVIEW_REQUIRED")
            c.execute("INSERT OR IGNORE INTO configuration VALUES(?)", (self.policy_hash,))

    @contextmanager
    def transaction(self):
        with closing(sqlite3.connect(self.path, timeout=5, isolation_level=None)) as c:
            c.execute("PRAGMA page_size=4096")
            require(c.execute("PRAGMA page_size").fetchone()[0] == 4096, "STATE_PAGE_SIZE_INVALID")
            require(c.execute("PRAGMA max_page_count=4096").fetchone()[0] == 4096, "STATE_CAPACITY_INVALID")
            c.execute("PRAGMA journal_mode=DELETE")
            c.execute("PRAGMA synchronous=FULL")
            c.execute("BEGIN IMMEDIATE")
            try:
                yield c
                c.commit()
            except BaseException:
                c.rollback()
                raise

    def observe(self, report, now=None):
        require(len(json.dumps(report).encode()) <= 1024**2, "REPORT_SIZE_LIMIT")
        result = evaluate(self.policy, report, now)
        with self.transaction() as c:
            c.execute("INSERT OR REPLACE INTO observations VALUES(1,?)", (json.dumps(report),))
            active = set(result["reasons"])
            for reason in sorted(REASONS):
                old = c.execute("SELECT active,generation FROM alerts WHERE reason=?", (reason,)).fetchone()
                if reason in active and (old is None or not old[0]):
                    c.execute("INSERT OR REPLACE INTO alerts VALUES(?,1,?,'PENDING',0,NULL,0,NULL,NULL)",
                              (reason, 1 if old is None else old[1] + 1))
                elif reason not in active and old is not None:
                    c.execute("UPDATE alerts SET active=0 WHERE reason=?", (reason,))
        return result

    def reserve(self, operation, actor, kind, amount, emergency=False, now=None):
        require(IDENTIFIER.fullmatch(operation or "") and IDENTIFIER.fullmatch(actor or ""), "IDENTITY_INVALID")
        require(kind in KINDS and integer(amount, 1), "RESERVATION_INVALID")
        require(type(emergency) is bool, "EMERGENCY_CLASS_INVALID")
        require(not emergency or kind in {"logs", "artifacts"}, "EMERGENCY_CLASS_INVALID")
        require(self.policy["enabled"], "DISABLED")
        with self.transaction() as c:
            old = c.execute("SELECT actor,kind,bytes,class,state FROM reservations WHERE id=?", (operation,)).fetchone()
            expected = (actor, kind, amount, "EMERGENCY" if emergency else "NORMAL", "RESERVED")
            if old:
                require(old == expected, "OPERATION_CONFLICT")
                return "REUSED_NO_NEW_WRITE_AUTHORITY"
            require(c.execute("SELECT count(*) FROM reservations").fetchone()[0] < self.policy["maxOperations"],
                    "LEDGER_FULL")
            row = c.execute("SELECT report FROM observations").fetchone()
            require(row is not None, "MEASUREMENT_REQUIRED")
            observed = evaluate(self.policy, json.loads(row[0]), now)
            blocking = set(observed["reasons"])
            if emergency:
                # This never invokes/vetoes application STOP; it only budgets a
                # small operator evidence write, including during backup outages.
                blocking -= {"OVERALL_PRESSURE", "BACKUP_STALE", "RESTORE_STALE", "ARCHIVE_FAILED", "SLOT_LAG"}
            require(not blocking, "STORAGE_ADMISSION_REFUSED")
            reserved = c.execute("SELECT COALESCE(sum(bytes),0) FROM reservations WHERE state='RESERVED'").fetchone()[0]
            category = c.execute("SELECT COALESCE(sum(bytes),0) FROM reservations WHERE state='RESERVED' AND kind=?", (kind,)).fetchone()[0]
            require(observed["used"][kind] + category + amount <= self.policy["budgets"][kind], "CATEGORY_CAPACITY_REFUSED")
            maximum = self.policy["totalBytes"] - (0 if emergency else self.policy["reserveBytes"])
            require(observed["total"] + reserved + amount <= maximum, "OVERALL_CAPACITY_REFUSED")
            c.execute("INSERT INTO reservations VALUES(?,?,?,?,?,'RESERVED')", (operation, *expected[:4]))
            return "RESERVED"

    def release(self, operation, actor):
        with self.transaction() as c:
            return c.execute("UPDATE reservations SET state='RELEASED' WHERE id=? AND actor=? AND state='RESERVED'",
                             (operation, actor)).rowcount == 1

    def claim_alert(self, destination, now=None):
        require(re.fullmatch(r"[a-f0-9]{64}", destination or ""), "DESTINATION_COMMITMENT_REQUIRED")
        now = time.time() if now is None else now
        with self.transaction() as c:
            c.execute("UPDATE alerts SET state='REVIEW' WHERE state='IN_FLIGHT' AND lease<? AND attempts>=3", (now,))
            row = c.execute("SELECT reason,generation FROM alerts WHERE active=1 AND attempts<3 AND "
                            "(state='PENDING' OR (state='IN_FLIGHT' AND lease<?)) ORDER BY reason LIMIT 1", (now,)).fetchone()
            if row is None:
                return None
            token = uuid.uuid4().hex
            c.execute("UPDATE alerts SET state='IN_FLIGHT',attempts=attempts+1,token=?,lease=?,destination=? WHERE reason=?",
                      (token, now + 30, destination, row[0]))
            return {"reason": row[0], "generation": row[1], "token": token, "destination": destination}

    def finish_alert(self, claim, receipt, now=None):
        require(receipt in {"ACCEPTED_BY_TRANSPORT", "SYNTHETIC_ACCEPTED"}, "RECEIPT_INVALID")
        now = time.time() if now is None else now
        with self.transaction() as c:
            return c.execute("UPDATE alerts SET state='ACCEPTED_BY_TRANSPORT',receipt=? WHERE reason=? AND generation=? "
                             "AND token=? AND destination=? AND state='IN_FLIGHT' AND lease>=?",
                             (receipt, claim["reason"], claim["generation"], claim["token"], claim["destination"], now)).rowcount == 1


def bounded_put(root, owner, kind, name, content, limit, max_files=1000):
    """Exclusive serialized writes; cap counts ALL existing files, no pruning.

    No shared production paths. Uncooperative writers/root can bypass this guard.
    """
    root = Path(root).absolute()
    require(root.is_dir() and not root.is_symlink(), "OWNED_DIRECTORY_REQUIRED")
    marker = json.loads((root / "ownership.json").read_text(encoding="utf-8"))
    require(marker == {"owner": owner, "purpose": "storage-safeguards"}, "OWNER_MISMATCH")
    require(kind in {"logs", "archive", "backups", "artifacts"}, "KIND_INVALID")
    require(IDENTIFIER.fullmatch(name or "") and type(content) is bytes, "CONTENT_INVALID")
    require(integer(limit, 1) and integer(max_files, 1), "LIMIT_INVALID")
    directory = root / kind
    directory.mkdir(exist_ok=True)
    require(not directory.is_symlink(), "LINK_REFUSED")
    lock = directory / "writer.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        entries = list(directory.iterdir())
        require(all(p.is_file() and not p.is_symlink() for p in entries), "UNEXPECTED_ENTRY")
        target = directory / name
        if target.exists():
            require(target.read_bytes() == content, "FILE_IDENTITY_CONFLICT")
            return "DUPLICATE"
        require(len(entries) - 1 < max_files, "FILE_COUNT_REFUSED")
        used = sum(p.stat().st_size for p in entries)
        require(used + len(content) <= limit, "FILE_CAPACITY_REFUSED")
        with target.open("xb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        return "STORED"
    finally:
        os.close(descriptor)
        lock.unlink()
