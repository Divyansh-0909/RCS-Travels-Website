"""Encrypted backup inventory hook and current-authority restore quarantine."""
import hashlib
import json

from retention_provider_inventory import screen_restore


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def snapshot_index(c, limit=2048):
    if type(limit) is not int or not 1 <= limit <= 2048:
        raise ValueError("RETENTION_BACKUP_INDEX_LIMIT")
    if c.execute("SELECT current_setting('transaction_read_only'),current_setting('transaction_isolation')").fetchone() not in [("on", "repeatable read"), ("on", "serializable")]:
        raise ValueError("RETENTION_INDEX_READ_ONLY_SNAPSHOT_REQUIRED")
    if c.execute("SELECT to_regnamespace('retention_registry') IS NOT NULL").fetchone()[0] is False:
        return None
    rows = c.execute("SELECT scope,epoch,inventory_hash,inventory_complete,manual_review,EXISTS(SELECT FROM retention_registry.holds h WHERE h.scope=s.scope AND release IS NULL) FROM retention_registry.scopes s ORDER BY scope LIMIT %s", (limit + 1,)).fetchall()
    if len(rows) > limit:
        raise ValueError("RETENTION_BACKUP_INDEX_LIMIT")
    scopes = [{"scope": n, "epoch": e, "inventoryHash": h, "inventoryDeclared": complete, "manualReview": manual, "held": held} for n, e, h, complete, manual, held in rows]
    return {"schema": "retention-backup-index-v1", "scopes": scopes, "commitment": digest(scopes),
            "coverage": "REGISTERED_SCOPES_ONLY_APPLICATION_COVERAGE_REQUIRES_REVIEW"}


def reconcile_restore(authority, archived_index):
    """A restored ledger is never its own current hold authority."""
    result = {"status": "QUARANTINE", "trafficReleaseAuthorized": False, "productionDeletion": False,
              "authorityChecked": False, "reason": "CURRENT_AUTHORITY_REQUIRED"}
    if archived_index is None:
        return {**result, "reason": "BACKUP_SCOPE_INDEX_MISSING"}
    if not isinstance(archived_index, dict) or archived_index.get("schema") != "retention-backup-index-v1" or not isinstance(archived_index.get("scopes"), list):
        raise ValueError("BACKUP_SCOPE_INDEX_INVALID")
    rows = archived_index["scopes"]
    if len(rows) > 2048 or archived_index.get("commitment") != digest(rows) or any(not isinstance(r, dict) or not isinstance(r.get("scope"), str) or not 1 <= len(r["scope"]) <= 200 or type(r.get("epoch")) is not int or not 0 <= r["epoch"] <= 9223372036854775807 for r in rows):
        raise ValueError("BACKUP_SCOPE_INDEX_INVALID")
    if len({r["scope"] for r in rows}) != len(rows):
        raise ValueError("BACKUP_SCOPE_INDEX_DUPLICATE")
    if authority is None:
        return result
    # Call before any application routing, on an independently selected
    # authoritative connection. Connection failure leaves quarantine intact.
    with authority.transaction():
        authority.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        current = snapshot_index(authority)
        if current is None:
            return {**result, "reason": "CURRENT_REGISTRY_MISSING"}
        expected = {r["scope"]: r["epoch"] for r in rows}
        current_scopes = {r["scope"] for r in current["scopes"]}
        decision = screen_restore(authority, expected) if expected else {"scopes": [], "status": "QUARANTINE", "trafficReleaseAuthorized": False}
        projected = {"scopeCount": len(decision["scopes"]), "heldCount": sum(r["held"] for r in decision["scopes"]),
                     "staleEpochCount": sum(r["snapshotStale"] for r in decision["scopes"]),
                     "missingAuthorityCount": sum(not r["authorityAvailable"] for r in decision["scopes"]),
                     "manualReviewCount": sum(r["manualReview"] for r in decision["scopes"])}
        return {**result, "authorityChecked": True, "reason": "MANUAL_REVIEW_REQUIRED", "decisions": projected,
                "newCurrentScopeCount": len(current_scopes - set(expected)), "archivedScopesAbsentFromAuthorityCount": len(set(expected) - current_scopes),
                "currentIndexCommitment": current["commitment"], "archivedIndexCommitment": archived_index["commitment"],
                "registeredScopeCoverageOnly": True}
