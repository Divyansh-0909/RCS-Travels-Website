"""Policy-neutral FK manifests and actual minimization in guarded synthetic tables only.

No production switch, TTL decision, provider client or application-table mutation API.
The caller is the existing trusted management controller, not an independent signer.
"""
import hashlib
import json
import uuid

from psycopg import sql
from psycopg.types.json import Jsonb

from retention_copy_plan import prepare

TABLES = ("bookings", "responsibility_cases", "responsibility_events")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def guard(c):
    database = c.execute("SELECT current_database()").fetchone()[0]
    if not database.startswith("retention_copy_lab_"):
        raise ValueError("SYNTHETIC_DATABASE_REQUIRED")
    row = c.execute("SELECT synthetic_only,production_execution,frozen FROM retention_lab.configuration FOR UPDATE").fetchone()
    if row is None or row[0] is not True or row[1] is not False or row[2]:
        raise ValueError("SYNTHETIC_RETENTION_FROZEN")


def catalog(c):
    tables = []
    for table in TABLES:
        columns = [r[0] for r in c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='retention_lab' AND table_name=%s ORDER BY ordinal_position", (table,))]
        if not columns or "id" not in columns or "payload" not in columns:
            raise ValueError("REVIEWED_SYNTHETIC_TABLE_REQUIRED")
        tables.append({"name": table, "columns": columns})
    edges = []
    rows = c.execute("""SELECT child.relname,parent.relname,x.conname,
          ARRAY(SELECT a.attname FROM unnest(x.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=child.oid AND a.attnum=k.num ORDER BY k.ord),
          ARRAY(SELECT a.attname FROM unnest(x.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=parent.oid AND a.attnum=k.num ORDER BY k.ord)
        FROM pg_constraint x JOIN pg_class child ON child.oid=x.conrelid JOIN pg_class parent ON parent.oid=x.confrelid
        JOIN pg_namespace n ON n.oid=child.relnamespace WHERE n.nspname='retention_lab' AND x.contype='f' ORDER BY child.relname,x.conname"""
    ).fetchall()
    for child, parent, name, columns, parent_columns in rows:
        if child not in TABLES or parent not in TABLES or len(columns) != 1 or parent_columns != ["id"]:
            raise ValueError("UNREVIEWED_FOREIGN_KEY_COPY")
        edges.append({"table": child, "parent": parent, "constraint": name, "columns": columns, "parent_columns": parent_columns})
    return {"tables": tables, "foreign_keys": edges}


def materialize(c, scope, limit=64, lock=False):
    """Caller owns the transaction/snapshot. Values are bound, identifiers quoted."""
    if type(limit) is not int or not 1 <= limit <= 256:
        raise ValueError("MANIFEST_LIMIT_INVALID")
    scope = uuid.UUID(str(scope))
    graph = catalog(c)
    navigation = prepare(graph, "bookings")
    if navigation["alternative_or_cyclic_relations_requiring_review"] or navigation["logical_reference_candidates_without_matching_fk"]:
        raise ValueError("COPY_GRAPH_REVIEW_REQUIRED")
    selected = {}
    records = []
    for item in navigation["tables"]:
        table = item["table"]
        if item["join_path"]:
            edge = item["join_path"][-1]
            parents = selected[edge["parent"]]
            column = edge["column_pairs"][0][0]
        else:
            parents, column = [scope], "id"
        rows = c.execute(sql.SQL("SELECT to_jsonb(t) FROM retention_lab.{} t WHERE {}=ANY(%s) ORDER BY id{}").format(
            sql.Identifier(table), sql.Identifier(column), sql.SQL(" FOR UPDATE" if lock else "")), (parents,)).fetchall() if parents else []
        selected[table] = [uuid.UUID(row[0]["id"]) for row in rows]
        for (row,) in rows:
            records.append({"table": table, "id": row["id"], "rowHash": digest(row)})
        if len(records) > limit:
            raise ValueError("ROW_MANIFEST_LIMIT_EXCEEDED")
    if not selected.get("bookings"):
        raise ValueError("ROOT_NOT_FOUND")
    manifest = {"scope": str(scope), "catalogHash": digest(graph), "rows": records, "schema": "retention_lab",
                "externalCopies": "NOT_INCLUDED: provider objects/backups require independent manifests"}
    manifest["commitment"] = digest(manifest)
    return manifest


def minimize(c, operation, manifest, epoch, version):
    """Atomically join local coordinator commit and synthetic payload minimization."""
    operation = uuid.UUID(str(operation))
    with c.transaction():
        guard(c)
        prior = c.execute("SELECT scope,commitment,receipt FROM retention_lab.applied WHERE operation=%s", (operation,)).fetchone()
        if prior:
            if prior[:2] != (manifest["scope"], manifest["commitment"]):
                raise ValueError("MINIMIZATION_OPERATION_CONFLICT")
            return prior[2]
        resource = c.execute("SELECT commitment,held,tombstone FROM retention9d.resources WHERE scope=%s FOR UPDATE", (manifest["scope"],)).fetchone()
        if resource is None or resource[0] != manifest["commitment"] or resource[1] or resource[2]:
            raise ValueError("RESOURCE_HELD_STALE_OR_TOMBSTONED")
        current = materialize(c, manifest["scope"], lock=True)
        if current != manifest:
            raise ValueError("ROW_MANIFEST_CHANGED")
        receipt = c.execute("SELECT retention9d.local_commit(%s,%s,%s,%s,false)", (operation, manifest["scope"], epoch, version)).fetchone()[0]
        if receipt["status"] != "SIMULATED_PAYLOAD_PURGE":
            raise ValueError("COORDINATOR_COMMIT_REFUSED")
        for row in manifest["rows"]:
            c.execute(sql.SQL("UPDATE retention_lab.{} SET payload=NULL WHERE id=%s").format(sql.Identifier(row["table"])), (uuid.UUID(row["id"]),))
            c.execute("INSERT INTO retention_lab.tombstones(operation,table_name,row_id,original_hash) VALUES(%s,%s,%s,%s)", (operation, row["table"], row["id"], row["rowHash"]))
        c.execute("UPDATE retention9d.resources SET payload_present=false WHERE scope=%s", (manifest["scope"],))
        c.execute("INSERT INTO retention_lab.applied VALUES(%s,%s,%s,%s,session_user)", (operation, manifest["scope"], manifest["commitment"], Jsonb(receipt)))
        return receipt


def propagate_hold(nodes, scope, approval):
    """Late/partial hold preserves remaining copies and durably requests manual review."""
    responses = {}
    for node, c in nodes.items():
        if c is None:
            responses[node] = {"status": "PENDING"}
            continue
        with c.transaction():
            responses[node] = c.execute("SELECT retention9d.hold(%s,false,%s)", (str(scope), approval)).fetchone()[0]
    manual = any(r["status"] != "HELD" for r in responses.values())
    if manual:
        for c in nodes.values():
            if c is None:
                continue
            with c.transaction():
                c.execute("UPDATE retention_lab.configuration SET frozen=true")
                c.execute("INSERT INTO retention_lab.incidents(scope,approval,response,actor) VALUES(%s,%s,%s,session_user) ON CONFLICT(scope,approval) DO NOTHING", (str(scope), approval, Jsonb(responses)))
    return {"status": "MANUAL_REVIEW" if manual else "HELD", "nodes": responses, "alreadyPurgedCopyRecovered": False}
