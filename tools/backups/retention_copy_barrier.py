"""Extra-copy barrier for the marked retention laboratory, never production.

Receipts are trusted controller observations, not a new remote signature scheme.
Provider adapters and policy approval are deliberately not supplied by this file.
"""
from retention_row_manifest import guard, minimize

DDL = """
CREATE SCHEMA retention_copy_control;
REVOKE ALL ON SCHEMA retention_copy_control FROM PUBLIC;
CREATE TABLE retention_copy_control.copy_sets(
 operation uuid PRIMARY KEY,scope text NOT NULL,commitment text NOT NULL,
 epoch bigint NOT NULL,policy_version int NOT NULL,
 inventory_complete bool NOT NULL DEFAULT false,expected_count int NOT NULL CHECK(expected_count BETWEEN 1 AND 64));
CREATE TABLE retention_copy_control.copy_observations(
 operation uuid NOT NULL REFERENCES retention_copy_control.copy_sets,copy_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('SQL_ROWS','OBJECT_VERSION','BACKUP_GENERATION','LOG_SEGMENT')),
 scope text NOT NULL,epoch bigint NOT NULL,policy_version int NOT NULL,commitment text NOT NULL,
 state text NOT NULL CHECK(state IN('WAITING','PREPARED','HELD','PURGED')),
 observed_at timestamptz NOT NULL,hold_active bool NOT NULL DEFAULT false,
 PRIMARY KEY(operation,copy_id));
REVOKE ALL ON retention_copy_control.copy_sets,retention_copy_control.copy_observations FROM PUBLIC;
"""


def minimize_with_copy_barrier(c, operation, manifest, epoch, version):
    """Check locked local copy inventory before the existing atomic lab minimizer.

    Locks protect this local controller view only. They cannot prevent an
    unobserved remote hold or certify that a provider inventory is exhaustive.
    """
    with c.transaction():
        guard(c)
        plan = c.execute("SELECT scope,commitment,epoch,policy_version,inventory_complete,expected_count FROM retention_copy_control.copy_sets WHERE operation=%s FOR UPDATE", (operation,)).fetchone()
        if plan is None or plan[:4] != (manifest["scope"], manifest["commitment"], epoch, version):
            raise ValueError("COPY_SET_BINDING_REQUIRED")
        if not plan[4]:
            raise ValueError("COPY_INVENTORY_INCOMPLETE")
        rows = c.execute("SELECT scope,epoch,policy_version,commitment,state,hold_active,observed_at>=clock_timestamp()-interval '60 seconds' FROM retention_copy_control.copy_observations WHERE operation=%s ORDER BY copy_id FOR UPDATE", (operation,)).fetchall()
        if len(rows) != plan[5]:
            raise ValueError("COPY_ACKS_MISSING")
        # A hold wins over prepared states. A partial purge cannot be undone.
        if any(row[5] or row[4] == "HELD" for row in rows):
            if any(row[4] == "PURGED" for row in rows):
                raise ValueError("LATE_HOLD_MANUAL_REVIEW_NO_RECOVERY")
            raise ValueError("COPY_HELD")
        if any(row[:4] != (manifest["scope"], epoch, version, manifest["commitment"]) for row in rows):
            raise ValueError("COPY_ACK_BINDING_MISMATCH")
        if any(not row[6] for row in rows):
            raise ValueError("COPY_OBSERVATION_STALE")
        if any(row[4] != "PREPARED" for row in rows):
            raise ValueError("COPY_NOT_PREPARED")
        return minimize(c, operation, manifest, epoch, version)
