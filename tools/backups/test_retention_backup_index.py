"""Closed index shape and quarantine defaults, no real data or database."""
import copy
import unittest

from retention_backup_index import digest, reconcile_restore


def index():
    rows = [{"scope": "synthetic", "epoch": 2, "inventoryHash": "a" * 64, "inventoryDeclared": True, "held": False, "manualReview": False}]
    return {"schema": "retention-backup-index-v1", "scopes": rows, "commitment": digest(rows)}


class BackupIndexTests(unittest.TestCase):
    def test_missing_index_stays_quarantined(self):
        result = reconcile_restore(None, None)
        self.assertEqual(result["reason"], "BACKUP_SCOPE_INDEX_MISSING")
        self.assertFalse(result["trafficReleaseAuthorized"])

    def test_current_authority_required_even_for_valid_old_index(self):
        result = reconcile_restore(None, index())
        self.assertEqual(result["reason"], "CURRENT_AUTHORITY_REQUIRED")
        self.assertFalse(result["authorityChecked"])
        self.assertFalse(result["trafficReleaseAuthorized"])

    def test_malformed_envelope_refused(self):
        for value in [[], "bad", {}, {"schema": "other", "scopes": []}]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "BACKUP_SCOPE_INDEX_INVALID"):
                reconcile_restore(None, value)

    def test_content_commitment_required(self):
        value = index()
        value["scopes"][0]["epoch"] += 1
        with self.assertRaisesRegex(ValueError, "BACKUP_SCOPE_INDEX_INVALID"):
            reconcile_restore(None, value)

    def test_bad_rows_or_epoch_never_reach_authority(self):
        for row in [None, {}, {"scope": "", "epoch": 1}, {"scope": "s", "epoch": True}, {"scope": "s", "epoch": -1}, {"scope": "s", "epoch": 2**63}]:
            value = index()
            value["scopes"] = [row]
            value["commitment"] = digest(value["scopes"])
            with self.subTest(row=row), self.assertRaisesRegex(ValueError, "BACKUP_SCOPE_INDEX_INVALID"):
                reconcile_restore(None, value)

    def test_duplicate_scopes_refused(self):
        value = index()
        value["scopes"] *= 2
        value["commitment"] = digest(value["scopes"])
        with self.assertRaisesRegex(ValueError, "BACKUP_SCOPE_INDEX_DUPLICATE"):
            reconcile_restore(None, value)

    def test_input_is_not_rewritten_to_match_authority(self):
        value = index()
        original = copy.deepcopy(value)
        reconcile_restore(None, value)
        self.assertEqual(value, original)


if __name__ == "__main__":
    unittest.main()
