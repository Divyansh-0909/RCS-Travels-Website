"""Explicit logical restore scope. Provider internals are a prerequisite, not replay SQL."""
import re

IDENTIFIER = re.compile(r"[a-z_][a-z0-9_]{0,62}\Z")
MANAGED = frozenset({"auth", "storage", "realtime", "extensions", "vault", "graphql", "graphql_public",
                     "supabase_functions", "supabase_migrations", "pgbouncer", "net", "cron"})
PRIVILEGES = frozenset({"SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER",
                        "USAGE", "CREATE", "EXECUTE", "MAINTAIN"})


def plan(schemas, owners, available_roles, owner_mapping=None):
    """Fail closed; callers must compare effective catalogs and data after restoration."""
    mapping = dict(owner_mapping or {})
    if not schemas or len(set(schemas)) != len(schemas):
        raise ValueError("EXPLICIT_UNIQUE_SCHEMAS_REQUIRED")
    for name in schemas:
        if not IDENTIFIER.fullmatch(name) or name in MANAGED or name.startswith("pg_"):
            raise ValueError("PROVIDER_SCHEMA_REPLAY_REFUSED")
    if any(not IDENTIFIER.fullmatch(name) for name in set(owners) | set(mapping) | set(mapping.values())):
        raise ValueError("ROLE_IDENTIFIER_INVALID")
    mapped = {owner: mapping.get(owner, owner) for owner in owners}
    if any(role not in available_roles for role in mapped.values()):
        raise ValueError("TARGET_OWNER_ROLE_MISSING")
    if "supabase_admin" in mapped.values() or any(role.startswith("pg_") for role in mapped.values()):
        raise ValueError("RESERVED_OWNER_REASSIGNMENT_REFUSED")
    return {"schemas": sorted(schemas), "ownerMapping": mapped, "restoreOwnerAndAcl": "REAPPLY_AND_COMPARE_EXPLICITLY",
            "providerBaseline": "REQUIRED: managed schemas, supported extensions/roles and project configuration",
            "fullManagedProjectClone": False, "productionExecution": False,
            "externalObjects": "SEPARATE_BACKUP_AND_RECOVERY_REQUIRED"}


def acl_rows(rows, available_roles):
    """Validate catalog-expanded grants before using them in generated SQL."""
    for grantee, privilege, grantable in rows:
        if grantee != "PUBLIC" and grantee not in available_roles:
            raise ValueError("TARGET_GRANTEE_MISSING")
        if privilege not in PRIVILEGES or type(grantable) is not bool:
            raise ValueError("ACL_ENTRY_UNSUPPORTED")
    return sorted([list(row) for row in rows])
