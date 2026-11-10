"""Business-review planning boundaries; synthetic dates never activate deletion."""
import unittest

from retention_policy import deadline, plan_review


class RetentionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = {"productionDeletionEnabled": False, "automaticCleanupEnabled": False,
                       "rules": [{"id": "history", "businessApproved": True, "period": "P1Y"},
                                 {"id": "rejected-upload", "businessApproved": False, "period": None},
                                 {"id": "financial", "financial": True, "businessApproved": False}]}
        self.context = {"start": "2024-02-29T10:00:00Z", "now": "2025-02-28T10:00:00Z", "active_holds": 0,
                        "inventory_complete": True, "terminal": True, "case_closed": True, "legal_classification_complete": True}

    def result(self, **changes):
        return plan_review(self.policy, "history", **{**self.context, **changes})

    def test_calendar_year_not_fixed_seconds(self):
        self.assertEqual(deadline("2024-02-29T10:00:00Z", "P1Y").isoformat(), "2025-02-28T10:00:00+00:00")

    def test_calendar_month_clamps_end(self):
        self.assertEqual(deadline("2026-01-31T10:00:00Z", "P1M").day, 28)

    def test_day_and_week_windows(self):
        self.assertEqual(deadline("2026-01-01T00:00:00Z", "P7D"), deadline("2026-01-01T00:00:00Z", "P1W"))

    def test_due_is_review_not_delete_permission(self):
        result = self.result()
        self.assertEqual(result["status"], "REVIEW_DUE")
        self.assertFalse(result["deletionAuthorized"] or result["productionDeletion"])

    def test_not_due(self):
        self.assertEqual(self.result(now="2025-02-28T09:59:59Z")["status"], "NOT_DUE")

    def test_overlapping_holds(self):
        for count in [1, 2]:
            self.assertEqual(self.result(active_holds=count)["status"], "HELD")

    def test_incomplete_inventory(self):
        self.assertEqual(self.result(inventory_complete=False)["status"], "COPY_INVENTORY_REQUIRED")

    def test_open_cases(self):
        self.assertEqual(self.result(case_closed=False)["status"], "OPEN_MATTER")

    def test_legal_classification_stays_required(self):
        self.assertEqual(self.result(legal_classification_complete=False)["status"], "LEGAL_CLASSIFICATION_REQUIRED")

    def test_unknown_trigger_and_timezone(self):
        for date in [None, "2024-02-29T10:00:00"]:
            self.assertEqual(self.result(start=date)["status"], "EXPLICIT_CALENDAR_TRIGGER_REQUIRED")

    def test_unapproved_target_not_invented(self):
        self.assertEqual(plan_review(self.policy, "rejected-upload", **self.context)["status"], "BUSINESS_DECISION_PENDING")

    def test_financial_always_ca_pending(self):
        self.assertEqual(plan_review(self.policy, "financial", **self.context)["status"], "CA_REVIEW_PENDING")

    def test_enabled_policy_and_implicit_hold_count_refused(self):
        with self.assertRaisesRegex(ValueError, "DISABLED"):
            plan_review(dict(self.policy, automaticCleanupEnabled=True), "history", **self.context)
        with self.assertRaisesRegex(ValueError, "HOLD_COUNT"):
            self.result(active_holds=False)


if __name__ == "__main__":
    unittest.main()
