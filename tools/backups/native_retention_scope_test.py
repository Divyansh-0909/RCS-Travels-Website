"""Exercise all current catalog paths on minimal synthetic text projections."""
import hashlib
import json
from pathlib import Path
import sys

from psycopg import sql

from native_postgres import NativePostgres
from retention_scope_manifest import collect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/phase9d-retention-integration-2026-10-22"
CATALOG = ROOT / "output/phase9d-open-gates-2026-10-22/provider-scope-final.json"


def main():
    inputs = [Path(__file__), ROOT / "tools/backups/native_postgres.py", ROOT / "tools/backups/retention_scope_manifest.py", CATALOG, ROOT / "backend/prisma/schema.prisma"]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    catalog = json.loads(CATALOG.read_text())["applicationCatalog"]
    witness = {"status": "FAIL", "cases": [], "sourceHashes": pins, "boundary": "51-table/71-FK catalog as read-only query graph; projected text columns without product constraints/extensions, synthetic rows only; not a full schema or production selector approval"}
    server = NativePostgres()

    def check(name, actual, expected=True):
        witness["cases"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    try:
        with server:
            witness["environment"] = server.identity
            with server.connect(autocommit=True) as c:
                c.execute("CREATE SCHEMA scope_projection")
                for table in catalog["tables"]:
                    columns = sql.SQL(",").join(sql.SQL("{} text{}").format(sql.Identifier(col), sql.SQL(" PRIMARY KEY" if col == "id" else "")) for col in table["columns"])
                    c.execute(sql.SQL("CREATE TABLE scope_projection.{}({})").format(sql.Identifier(table["name"]), columns))

                def seed(table, **row):
                    c.execute(sql.SQL("INSERT INTO scope_projection.{}({}) VALUES({})").format(sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, row)), sql.SQL(",").join(sql.Placeholder() for _ in row)), list(row.values()))

                seed("users", id="u1")
                seed("users", id="u2")
                seed("drivers", id="d1", profile_picture_url="d1/profile/picture.jpg")
                seed("drivers", id="d2")
                seed("driver_locations", driver_id="d1", latitude="synthetic-latitude")
                seed("vehicles", id="v1", driver_id="d1")
                seed("bookings", id="b1", user_id="u1", driver_id="d1")
                seed("bookings", id="b2", user_id="u2", driver_id="d2")
                seed("notification_deliveries", id="n1", booking_id="b1")
                seed("notification_deliveries", id="n2", booking_id="b2")
                seed("responsibility_cases", id="c1", booking_id="b1")
                seed("responsibility_cases", id="c2", booking_id="b2")
                seed("responsibility_evidence_versions", id="e1", case_id="c1")
                seed("responsibility_adjudication_work", id="w1", case_id="c1", evidence_version_id="e1")
                seed("responsibility_analyses", id="analysis", case_id="c1")
                seed("responsibility_provisional_decisions", id="provisional", case_id="c1")
                seed("ride_offers", id="offer-logical", booking_id="b2", pool_host_booking_id="b1", driver_id="d2")
                seed("responsibility_appeals", id="a1", case_id="c1", driver_id="d1")
                seed("responsibility_final_decisions", id="f1", case_id="c1", appeal_id="a1")
                # Owner-controlled inconsistent projection tests the AND join;
                # this is not claimed reachable under the actual product FK.
                seed("responsibility_final_decisions", id="foreign-final", case_id="c2", appeal_id="a1")
                seed("driver_document_archive", id="archived", driver_id="d1", vehicle_id="v1", file_url="d1/v1/rc/archive.jpg")
                seed("driver_documents", id="current", driver_id="d1", vehicle_id="v1", owner_id="v1", file_url="d1/v1/rc/current.jpg")
                seed("driver_documents", id="personal", driver_id="d1", owner_id="d1", file_url="d1/licence/personal.jpg")
                seed("cancellation_location_evidence", id="driver-logical", booking_id="b2", driver_id="d1")

                def manifest(root, identity, limit=256):
                    with c.transaction():
                        c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                        return collect(c, catalog, root, [identity], schema="scope_projection", limit=limit)

                def ids(result, table):
                    return {r["id"] for r in result["records"] if r["table"] == table}

                booking = manifest("bookings", "b1")
                check("booking:logical-case", ids(booking, "responsibility_cases"), {"c1"})
                check("booking:logical-notification", ids(booking, "notification_deliveries"), {"n1"})
                check("booking:alternate-pool-host", ids(booking, "ride_offers"), {"offer-logical"})
                check("booking:no-parent-driver-sweep", ids(booking, "drivers"), set())
                check("booking:no-parent-foreign-booking", ids(booking, "bookings"), {"b1"})
                check("booking:unconstrained-analysis", ids(booking, "responsibility_analyses"), {"analysis"})
                check("booking:unconstrained-provisional", ids(booking, "responsibility_provisional_decisions"), {"provisional"})
                # The actual case_id FK also reaches this record from c1 only
                # when its case matches; the composite appeal edge must not.
                appeal = manifest("responsibility_appeals", "a1")
                check("appeal:composite-join-excludes-mismatched-case", ids(appeal, "responsibility_final_decisions"), {"f1"})
                driver = manifest("drivers", "d1")
                check("driver:both-current-owner-kinds", ids(driver, "driver_documents"), {"current", "personal"})
                check("driver:non-id-primary-key-location", ids(driver, "driver_locations"), {"d1"})
                check("driver:archived-document-retained", ids(driver, "driver_document_archive"), {"archived"})
                check("driver:logical-location-without-fk", ids(driver, "cancellation_location_evidence"), {"driver-logical"})
                check("driver:related-objects-current-archive-avatar", len(driver["objectReferences"]), 4)
                check("driver:foreign-parent-booking-not-swept", ids(driver, "bookings"), {"b1"})
                vehicle = manifest("vehicles", "v1")
                check("vehicle:archive-non-fk-relation", ids(vehicle, "driver_document_archive"), {"archived"})
                check("vehicle:no-driver-parent-sweep", ids(vehicle, "drivers"), set())
                check("vehicle:no-driver-owned-licence", ids(vehicle, "driver_documents"), {"current"})
                check("manifest:stable-same-snapshot-content", manifest("bookings", "b1")["commitment"], booking["commitment"])
                check("manifest:no-production-delete", booking["productionDeletion"], False)
                check("manifest:provider-completeness-not-inferred", booking["completeProviderInventory"], False)
                for label, callback, reason in [
                    ("limit", lambda: manifest("drivers", "d1", 2), "SCOPE_ROW_LIMIT"),
                    ("missing-root", lambda: manifest("bookings", "missing"), "ROOT_NOT_FOUND"),
                    ("unsafe-snapshot", lambda: collect(c, catalog, "bookings", ["b1"], schema="scope_projection"), "READ_ONLY_SNAPSHOT_REQUIRED")]:
                    try:
                        callback()
                    except ValueError as error:
                        actual = str(error)
                    else:
                        actual = "UNEXPECTED_SUCCESS"
                    check(label + ":fails-closed", actual, reason)
                witness["summaries"] = {root: {"rows": len(m["records"]), "objectReferences": len(m["objectReferences"]), "commitment": m["commitment"]} for root, m in [("booking", booking), ("driver", driver), ("vehicle", vehicle), ("appeal", appeal)]}
                witness["catalogTables"] = len(catalog["tables"])
                witness["catalogForeignKeys"] = len(catalog["foreign_keys"])
                witness["status"] = "PASS"
    finally:
        witness["serverStopped"] = server.stopped
        witness["caseCount"] = len(witness["cases"])
        witness["sourcesUnchanged"] = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h for p, h in pins.items())
        with (OUT / "scope-manifest-final.json").open("x", encoding="utf-8") as handle:
            json.dump(witness, handle, indent=2, default=lambda v: sorted(v) if isinstance(v, set) else str(v))
    print(json.dumps({"status": witness["status"], "checks": witness["caseCount"], "serverStopped": server.stopped}))


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    main()
