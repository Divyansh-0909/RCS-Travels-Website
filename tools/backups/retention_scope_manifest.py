"""Read-only application copy discovery. No deletion or automatic policy approval."""
import hashlib
import json
import re

from psycopg import sql

NAME = re.compile(r"[a-z_][a-z0-9_]{0,62}\Z")
# These are explicit semantic references from schema.prisma, not column-name
# guesses. owner_id is intentionally excluded: it means vehicle_id ?? driver_id.
LOGICAL = [
    ("notification_deliveries", "bookings", ["booking_id"], ["id"], "NotificationDelivery.bookingId"),
    ("responsibility_cases", "bookings", ["booking_id"], ["id"], "ResponsibilityCase.bookingId"),
    ("ride_offers", "bookings", ["pool_host_booking_id"], ["id"], "RideOffer.poolHostBookingId"),
    ("cancellation_location_evidence", "drivers", ["driver_id"], ["id"], "CancellationLocationEvidence.driverId"),
    ("responsibility_appeals", "drivers", ["driver_id"], ["id"], "ResponsibilityAppeal.driverId"),
    ("responsibility_analyses", "responsibility_cases", ["case_id"], ["id"], "ResponsibilityAnalysis.caseId"),
    ("responsibility_provisional_decisions", "responsibility_cases", ["case_id"], ["id"], "ResponsibilityProvisionalDecision.caseId"),
    ("driver_document_archive", "vehicles", ["vehicle_id"], ["id"], "DriverDocumentArchive.vehicleId: deliberately retained without FK"),
]
OBJECT_FIELDS = {"driver_documents": "file_url", "driver_document_archive": "file_url", "drivers": "profile_picture_url"}
ROW_KEYS = {"driver_locations": "driver_id"}  # DriverLocation.driverId is @id.


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def graph(catalog):
    tables = {t["name"]: set(t["columns"]) for t in catalog["tables"]}
    if len(tables) != len(catalog["tables"]) or any(not NAME.fullmatch(t) for t in tables):
        raise ValueError("INVALID_CATALOG")
    edges = list(catalog["foreign_keys"])
    for child, parent, columns, parent_columns, source in LOGICAL:
        if child in tables and parent in tables:
            edges.append({"table": child, "parent": parent, "columns": columns, "parent_columns": parent_columns, "constraint": source, "logical": True})
    for edge in edges:
        child, parent = edge["table"], edge["parent"]
        if child not in tables or parent not in tables or ROW_KEYS.get(child, "id") not in tables[child] or ROW_KEYS.get(parent, "id") not in tables[parent]:
            raise ValueError("REVIEW_REQUIRED_FOR_NON_ID_RELATION")
        if not edge["columns"] or len(edge["columns"]) != len(edge["parent_columns"]) or not set(edge["columns"]) <= tables[child] or not set(edge["parent_columns"]) <= tables[parent]:
            raise ValueError("INVALID_RELATION")
    return tables, edges


def collect(c, catalog, root, ids, *, schema="public", limit=256):
    """Caller owns a read-only repeatable snapshot; identifiers are quoted.

    Follow every child edge, including alternative paths and composite joins,
    to a bounded fixed point. Do not pull in other users/drivers via parents.
    IDs/object paths are sensitive metadata: keep returned manifests private.
    """
    if c.execute("SELECT current_setting('transaction_read_only'),current_setting('transaction_isolation')").fetchone() not in [("on", "repeatable read"), ("on", "serializable")]:
        raise ValueError("READ_ONLY_SNAPSHOT_REQUIRED")
    if not NAME.fullmatch(schema) or type(limit) is not int or not 1 <= limit <= 2048:
        raise ValueError("SCOPE_LIMIT_OR_SCHEMA_INVALID")
    tables, edges = graph(catalog)
    if root not in tables or ROW_KEYS.get(root, "id") not in tables[root] or not ids or len(ids) > limit or any(not isinstance(i, str) or not i or len(i) > 200 for i in ids):
        raise ValueError("EXPLICIT_ROOT_IDS_REQUIRED")
    selected = {root: set()}
    key = sql.Identifier(ROW_KEYS.get(root, "id"))
    query = sql.SQL("SELECT {}::text FROM {}.{} WHERE {}::text=ANY(%s)").format(key, sql.Identifier(schema), sql.Identifier(root), key)
    selected[root].update(row[0] for row in c.execute(query, (list(ids),)))
    if selected[root] != set(ids):
        raise ValueError("ROOT_NOT_FOUND")
    queue = [root]
    traversed = 0
    while queue:
        parent = queue.pop(0)
        for edge in edges:
            if edge["parent"] != parent:
                continue
            traversed += 1
            if traversed > 8192:
                raise ValueError("GRAPH_WORK_LIMIT")
            child = edge["table"]
            join = sql.SQL(" AND ").join(sql.SQL("ch.{}=pa.{}").format(sql.Identifier(a), sql.Identifier(b)) for a, b in zip(edge["columns"], edge["parent_columns"]))
            query = sql.SQL("SELECT ch.{}::text FROM {}.{} ch JOIN {}.{} pa ON {} WHERE pa.{}::text=ANY(%s) LIMIT %s").format(sql.Identifier(ROW_KEYS.get(child, "id")), sql.Identifier(schema), sql.Identifier(child), sql.Identifier(schema), sql.Identifier(parent), join, sql.Identifier(ROW_KEYS.get(parent, "id")))
            found = {r[0] for r in c.execute(query, (sorted(selected[parent]), limit + 1))}
            before = selected.setdefault(child, set())
            changed = found - before
            before.update(found)
            if sum(map(len, selected.values())) > limit:
                raise ValueError("SCOPE_ROW_LIMIT")
            if changed and child not in queue:
                queue.append(child)
    records, objects = [], []
    for table, chosen in sorted(selected.items()):
        if not chosen:
            continue
        key = sql.Identifier(ROW_KEYS.get(table, "id"))
        query = sql.SQL("SELECT {}::text,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM {}.{} t WHERE {}::text=ANY(%s) ORDER BY {}::text").format(key, sql.Identifier(schema), sql.Identifier(table), key, key)
        records += [{"table": table, "id": identity, "rowHash": h} for identity, h in c.execute(query, (sorted(chosen),))]
        field = OBJECT_FIELDS.get(table)
        if field and field in tables[table]:
            query = sql.SQL("SELECT id::text,{} FROM {}.{} WHERE id::text=ANY(%s) AND {} IS NOT NULL").format(sql.Identifier(field), sql.Identifier(schema), sql.Identifier(table), sql.Identifier(field))
            objects += [{"table": table, "id": identity, "field": field, "objectPath": path, "generationInventory": "REQUIRED"} for identity, path in c.execute(query, (sorted(chosen),))]
    result = {"root": root, "rootIds": sorted(set(ids)), "schema": schema, "catalogHash": digest(catalog),
              "records": records, "objectReferences": objects, "direction": "CHILD_UNION_ALL_REVIEWED_PATHS_NOT_PARENT_SWEEP",
              "productionDeletion": False, "completeProviderInventory": False,
              "unresolved": ["JSON/free-text embedded references and non-FK identifiers beyond explicit reviewed rules", "all GCS generations and soft-deleted copies", "pipeline pseudonym/receipt-bound cross-service manifests", "provider logs/backups and external recipient retention"]}
    result["commitment"] = digest(result)
    return result
