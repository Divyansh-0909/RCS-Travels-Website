"""Read-only selector preparation from an inspected FK catalog; no DB/delete API or TTL."""
import re


NAME = re.compile(r"[a-z_][a-z0-9_]{0,62}\Z")


def prepare(catalog, root_table, limit=64):
    if type(limit) is not int or not 1 <= limit <= 256:
        raise ValueError("COPY_PLAN_LIMIT_INVALID")
    tables = {row["name"]: row for row in catalog["tables"]}
    if len(tables) != len(catalog["tables"]) or any(not NAME.fullmatch(name) for name in tables):
        raise ValueError("COPY_CATALOG_INVALID")
    if root_table not in tables:
        raise ValueError("COPY_ROOT_UNKNOWN")
    edges = catalog["foreign_keys"]
    for edge in edges:
        child, parent = edge["table"], edge["parent"]
        if child not in tables or parent not in tables or not edge["columns"] or len(edge["columns"]) != len(edge["parent_columns"]):
            raise ValueError("COPY_RELATION_INVALID")
        if not set(edge["columns"]).issubset(tables[child]["columns"]) or not set(edge["parent_columns"]).issubset(tables[parent]["columns"]):
            raise ValueError("COPY_RELATION_INVALID")
    paths = {root_table: []}
    queue = [root_table]
    alternatives = []
    while queue:
        parent = queue.pop(0)
        for edge in edges:
            if edge["parent"] != parent:
                continue
            child = edge["table"]
            step = {"child": child, "parent": parent, "constraint": edge["constraint"],
                    "column_pairs": list(zip(edge["columns"], edge["parent_columns"]))}
            if child in paths:
                alternatives.append(step)
                continue
            if len(paths) >= limit:
                raise ValueError("COPY_PLAN_LIMIT_EXCEEDED")
            paths[child] = paths[parent] + [step]
            queue.append(child)
    hints = {"bookings": {"booking_id", "earning_booking_id", "pool_host_booking_id"},
             "drivers": {"driver_id", "owner_id"}, "users": {"user_id"},
             "responsibility_cases": {"case_id", "responsibility_case_id"}}
    logical = []
    for table in tables.values():
        for column in sorted(set(table["columns"]) & hints.get(root_table, set())):
            enforced = any(edge["table"] == table["name"] and edge["parent"] == root_table and column in edge["columns"] for edge in edges)
            if not enforced:
                logical.append({"table": table["name"], "column": column,
                                "status": "NAME_HINT_ONLY_REQUIRES_SEMANTIC_REVIEW_NOT_AN_APPROVED_SELECTOR"})
    return {"kind": "READ_ONLY_SELECTOR_PREPARATION_NOT_A_ROW_MANIFEST", "root_table": root_table,
            "production_enabled": False, "deletion_enabled": False, "retention_duration": None,
            "policy_approval": None, "row_values_fetched": False,
            "tables": [{"table": name, "join_path": steps, "row_selection": "NOT_EXECUTED_REQUIRES_BOUND_AUTHORIZED_ROOT_ID"} for name, steps in paths.items()],
            "alternative_or_cyclic_relations_requiring_review": alternatives,
            "logical_reference_candidates_without_matching_fk": logical,
            "not_followed": "Parent records are not swept in automatically; a driver/user scope needs its own explicit root.",
            "unresolved": ["logical references without foreign keys", "external object versions and signing/configuration material",
                           "source/receiver/custodian copies and histories", "current authenticated hold/policy/tombstone authority",
                           "approved category eligibility, minimization and deletion ordering", "backup/restore reconciliation"],
            "copies_inventory_complete": False}
