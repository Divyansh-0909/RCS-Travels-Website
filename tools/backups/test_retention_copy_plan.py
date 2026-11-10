"""Synthetic catalog only; no real rows, provider or database is contacted."""
import copy
import unittest

from retention_copy_plan import prepare


def catalog():
    return {"tables": [{"name": "bookings", "columns": ["id", "driver_id"]}, {"name": "drivers", "columns": ["id"]},
                       {"name": "cases", "columns": ["id", "booking_id"]}, {"name": "appeals", "columns": ["id", "case_id"]}],
            "foreign_keys": [{"table": "bookings", "parent": "drivers", "constraint": "booking_driver", "columns": ["driver_id"], "parent_columns": ["id"]},
                             {"table": "cases", "parent": "bookings", "constraint": "case_booking", "columns": ["booking_id"], "parent_columns": ["id"]},
                             {"table": "appeals", "parent": "cases", "constraint": "appeal_case", "columns": ["case_id"], "parent_columns": ["id"]}]}


class CopyPlanTests(unittest.TestCase):
    def test_booking_scope_follows_children_not_unrelated_driver_records(self):
        result = prepare(catalog(), "bookings")
        self.assertEqual([x["table"] for x in result["tables"]], ["bookings", "cases", "appeals"])
        self.assertEqual(len(result["tables"][-1]["join_path"]), 2)

    def test_separate_driver_scope_is_explicit(self):
        result = prepare(catalog(), "drivers")
        self.assertEqual([x["table"] for x in result["tables"]], ["drivers", "bookings", "cases", "appeals"])

    def test_unconstrained_logical_reference_is_not_silently_omitted_or_authorized(self):
        value = catalog()
        value["tables"].append({"name": "notifications", "columns": ["id", "booking_id"]})
        result = prepare(value, "bookings")
        self.assertEqual(result["logical_reference_candidates_without_matching_fk"][0]["table"], "notifications")
        self.assertNotIn("notifications", [row["table"] for row in result["tables"]])
        self.assertFalse(result["copies_inventory_complete"])

    def test_unknown_root_refused(self):
        with self.assertRaisesRegex(ValueError, "COPY_ROOT_UNKNOWN"):
            prepare(catalog(), "unknown")

    def test_size_limit_fails_instead_of_silent_truncation(self):
        with self.assertRaisesRegex(ValueError, "COPY_PLAN_LIMIT_EXCEEDED"):
            prepare(catalog(), "drivers", limit=2)
        with self.assertRaisesRegex(ValueError, "COPY_PLAN_LIMIT_INVALID"):
            prepare(catalog(), "drivers", limit=True)

    def test_missing_or_mismatched_foreign_key_columns_refused(self):
        for columns in [[], ["id", "unknown"], ["unknown"]]:
            value = catalog()
            value["foreign_keys"][0]["columns"] = columns
            with self.subTest(columns=columns), self.assertRaisesRegex(ValueError, "COPY_RELATION_INVALID"):
                prepare(value, "drivers")

    def test_cycles_and_multiple_paths_remain_explicit(self):
        value = catalog()
        value["foreign_keys"].append({"table": "bookings", "parent": "appeals", "constraint": "synthetic_cycle", "columns": ["id"], "parent_columns": ["id"]})
        result = prepare(value, "bookings")
        self.assertEqual(len(result["tables"]), 3)
        self.assertTrue(result["alternative_or_cyclic_relations_requiring_review"])

    def test_no_policy_or_production_approval_is_invented(self):
        value = catalog()
        original = copy.deepcopy(value)
        result = prepare(value, "bookings")
        self.assertFalse(result["production_enabled"])
        self.assertFalse(result["deletion_enabled"])
        self.assertFalse(result["row_values_fetched"])
        self.assertFalse(result["copies_inventory_complete"])
        self.assertIsNone(result["retention_duration"])
        self.assertIsNone(result["policy_approval"])
        self.assertEqual(value, original)

    def test_invalid_catalog_names_or_duplicates_refused(self):
        for extra in [{"name": "bookings", "columns": ["id"]}, {"name": "x;delete", "columns": ["id"]}]:
            value = catalog()
            value["tables"].append(extra)
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, "COPY_CATALOG_INVALID"):
                prepare(value, "bookings")

    def test_postgres_leading_underscore_metadata_is_valid_but_not_selected(self):
        value = catalog()
        value["tables"].append({"name": "_prisma_migrations", "columns": ["id"]})
        result = prepare(value, "bookings")
        self.assertNotIn("_prisma_migrations", [row["table"] for row in result["tables"]])


if __name__ == "__main__":
    unittest.main()
