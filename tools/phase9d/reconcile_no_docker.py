"""Additive review of existing evidence and current catalog; never connects to a service."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from retention_copy_plan import prepare  # noqa: E402


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    current = "output/phase9d-no-docker-closure-2026-10-21/"
    prior = "output/phase9d-offline-closure-2026-10-20/"
    native = read(current + "native-contract-selected/witness.json")
    if native["status"] != "PASS" or not native["server_stopped"] or not native["sources_unchanged"]:
        raise RuntimeError("NATIVE_EVIDENCE_NOT_ACCEPTED")
    if any(sha(ROOT / name) != value for name, value in native["source_hashes"].items()):
        raise RuntimeError("NATIVE_SOURCE_EPOCH_CHANGED")
    catalog = read(current + "hosted-readonly-catalog.json")
    inputs = [current + "native-contract-selected/witness.json", current + "hosted-readonly-catalog.json",
              current + "selected-offline-unit-receipt.json", prior + "condition-family-map.json",
              prior + "audit-action-reconciliation.json", prior + "owner-decision-worksheet.json",
              "output/phase9d-pre-p8-review-2026-10-20/checklist-mapping.json",
              "output/phase9d-supabase-dev-backup-migrate-2026-10-21/accepted-result.json"]

    def write(name, value):
        with (output / name).open("x", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")

    families = copy.deepcopy(read(prior + "condition-family-map.json"))
    for row in families["families"]:
        row["current_review"] = {"static_mapping": "RETAINED_AND_SOURCE_BOUND", "whole_family_condition_adequacy": "PARTIAL"}
        row["current_source_pins"] = {key: sha(ROOT / row[key]) for key in ("source", "test") if isinstance(row.get(key), str) and (ROOT / row[key]).is_file()}
        if row["id"] in {"S01", "S09"}:
            prefixes = ("valid_categories:", "valid_instant:") if row["id"] == "S01" else ("retry:",)
            selected = [case for case in native["cases"] if case["name"].startswith(prefixes)]
            row["current_review"]["selected_new_assertions"] = len(selected)
            row["current_review"]["evidence"] = current + "native-contract-selected/witness.json"
            row["current_review"]["runtime"] = "Native Windows PostgreSQL 18.4; no native profiling; no substitution for the historical pinned PostgreSQL 17.5 metric"
            row["current_review"]["boundary"] = "Selected expression truth cases" if row["id"] == "S01" else native["fixture_boundary"]
    families["status"] = "STATIC_MAP_COMPLETE_SELECTED_NEW_CASES_VERIFIED_WHOLE_CONDITION_SCOPE_PARTIAL"
    write("condition-family-map-current.json", families)

    audits = copy.deepcopy(read(prior + "audit-action-reconciliation.json"))
    for row in audits["rows"]:
        row["current_review"] = {"source_epoch": "Historical rows and original boundaries retained", "universal_audit": "PARTIAL",
                                 "new_independent_audit_delivery_in_this_run": False}
        if row["ordinal"] in (18, 20):
            row["current_review"]["additional_limited_evidence"] = "Native operator NULL/history invariants or restricted worker 42501 assertions; not independent denial custody"
    if [x["ordinal"] for x in audits["rows"]] != list(range(1, 21)):
        raise RuntimeError("AUDIT_ORDER_CHANGED")
    write("audit-action-reconciliation-current.json", audits)

    readiness = copy.deepcopy(read("output/phase9d-pre-p8-review-2026-10-20/checklist-mapping.json"))
    if len(readiness["criteria"]) != 78 or len(readiness["audit_rows"]) != 20:
        raise RuntimeError("READINESS_INVENTORY_CHANGED")
    readiness["current_no_docker_assessment"] = {
        "original_id_and_row_order_preserved": True, "original_statuses_not_promoted": True,
        "dev_migrations": "83/83 complete", "local_encrypted_backup": "Verified",
        "restores": "Application schema content verified in a separate access-restricted database; exact managed ownership/configuration remains blocked",
        "selected_contract_assertions": native["case_count"], "independent_administration": "UNVERIFIED",
        "live_alert_delivery": "NOT_CONFIGURED_OR_TESTED", "offline_key_handoff": "OWNER_PARTICIPATION_REQUIRED",
        "production_retention_approval": "NOT_APPROVED", "whole_sql": "PARTIAL", "p8": "NOT_STARTED", "production": "OFF"}
    write("readiness-current.json", readiness)

    worksheet = copy.deepcopy(read(prior + "owner-decision-worksheet.json"))
    worksheet.update(custodian_individual="Rajjudin", offline_key_owner="Divyansh Singh", technical_operator="Divyansh Singh",
                     alert_destination="rcstravels.business@gmail.com", r2_location="Asia-Pacific hint approved for synthetic tests only; no bucket provisioned",
                     routing_verified=False, offline_key_handoff_verified=False, production_enabled=False,
                     scope="POLICY_NEUTRAL_SELECTOR_PREPARATION_NOT_PRODUCTION_APPROVAL")
    category_tables = {
        1: ["public.bookings", "public.users", "public.drivers", "public.saved_places", "public.coupons", "public.otp_verifications"],
        2: ["public.drivers", "public.vehicles", "public.driver_documents", "public.driver_document_archive"],
        3: ["public.driver_locations", "public.route_observations", "public.cancellation_location_evidence", "public.safe_route_verdicts"],
        4: ["public.driver_cancellations", "public.responsibility_cases", "public.reliability_strikes", "public.reliability_blocks"],
        5: ["public.ride_complaints", "public.driver_reviews", "public.responsibility_admin_reviews", "public.responsibility_appeals", "public.responsibility_appeal_reviews", "public.whatsapp_inbound_messages", "public.whatsapp_sessions"],
        6: ["public.responsibility_evidence_versions", "public.responsibility_analyses", "public.responsibility_shadow_results", "shadow9d.work"],
        7: ["outbox9d.deliveries", "outbox9d.remote_receipts"], 8: ["transport9d.receipts", "shadow9d.work"],
        9: ["broker9d.requests", "broker9d.attempts", "broker9d.results"],
        10: ["broker9d.usage_receipts", "broker9d.usage_authority", "public.payments", "public.wallet_entries", "public.driver_payouts", "public.driver_payout_batches", "public.razorpay_webhook_events", "public.responsibility_liabilities", "public.responsibility_liability_entries", "public.responsibility_compensations", "public.responsibility_compensation_allocations"],
        11: ["broker9d.operations", "broker9d.events"], 12: ["custody_export.events", "custody_export.retries", "custody_export.control"],
        13: ["custody_lineage.events", "custody_lineage.control"],
        14: ["custody.events", "custody.signatures", "custody.sources"],
        15: ["custody.keys", "custody.key_operations", "custody_export.keys"],
        16: ["custody.events", "audit9d.events"], 17: [], 18: [], 19: [], 20: []}
    hosted = {"public." + row["name"] for row in catalog["catalog"]["tables"]}
    for row in worksheet["categories"]:
        row["source_grounded_copy_candidates"] = [{"table": name, "observed_in_dev_public_catalog": name in hosted,
                                                   "selector_status": "REQUIRES_IDENTITY_SCOPE_VERSION_AND_COPY_REVIEW"} for name in category_tables[row["id"]]]
        row["candidate_boundary"] = "Navigation only: category overlap is intentional; no category-wide sweep, TTL, data access, hold approval or deletion is authorized. Absent custom schemas remain topology work."
        row["external_or_physical_review_required"] = True
    write("retention-category-preparation.json", worksheet)
    for root in ("bookings", "drivers", "users", "responsibility_cases"):
        write("selector-plan-" + root + ".json", prepare(catalog["catalog"], root))

    sources = {
        "GCS objects": ["backend/lib/storage.js"], "Clerk": ["backend/package.json"],
        "Razorpay and payouts": ["backend/package.json"], "WhatsApp": ["backend/services/notification.js"],
        "Firebase push": ["backend/package.json"], "Maps/Routes": ["backend/package.json"],
        "Model provider": ["backend/package.json"], "Cloud Run deployment configuration": [".github/workflows/deploy-cloud-run.yml"],
        "Backup/CI configuration": [".github/workflows/database-backup.yml", ".github/workflows/database-restore-validation.yml"]}
    external = {"confirmed_live_observations": {"supabase_dev": "83 completed migrations and selected catalog/role observations", "supabase_storage": catalog["storage"]},
                "provider_material": [{"provider": name, "source_pins": {p: sha(ROOT / p) for p in paths if (ROOT / p).is_file()},
                                       "actual_deployment_account_region_versions": "UNVERIFIED",
                                       "required": ["named controller and least-privilege export access", "actual region/versions/hold and restore controls", "separate secret/configuration recovery"],
                                       "bytes_exported": False} for name, paths in sources.items()],
                "r2": "UNCONFIGURED_OWNER_DEFERRED_NO_RESOURCE_CREATED", "signing_key_recovery": "NOT_VERIFIED; database public keys do not recover external private signers",
                "production_deletion": False}
    write("external-recovery-inventory.json", external)
    write("review-inputs.json", {"inputs": {name: sha(ROOT / name) for name in inputs}, "reviewer": "Source/evidence reconciliation, not independent certification", "tool_sha256": sha(Path(__file__)),
                                "counts": {"readiness": 78, "audit": 20, "categories": 20, "condition_families": len(families["families"])}})
    print(json.dumps({"output": str(output), "readiness": 78, "audit": 20, "categories": 20, "selected_native_checks": native["case_count"], "production": "OFF", "p8": "NOT_STARTED"}))


if __name__ == "__main__":
    main()
