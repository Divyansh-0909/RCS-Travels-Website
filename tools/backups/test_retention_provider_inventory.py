"""Provider request contracts only: no Google/R2 account or credentials."""
import copy
import unittest
from urllib.parse import parse_qs, urlsplit

from retention_provider_inventory import gcs_inventory, r2_inventory


class GoogleFixture:
    def __init__(self):
        self.calls = []
        self.config = {"softDeletePolicy": {"retentionDurationSeconds": "604800"}, "hierarchicalNamespace": {"enabled": False}}
        self.pages = {"versions": [{"items": [{"name": "driver/live.jpg", "generation": "2", "metageneration": "3", "size": "20", "temporaryHold": True}], "nextPageToken": "second"},
                                   {"items": [{"name": "driver/live.jpg", "generation": "1", "metageneration": "1", "size": "10"}]}],
                      "softDeleted": [{"items": [{"name": "driver/old.jpg", "generation": "4", "metageneration": "1", "size": "15", "softDeleteTime": "2026-10-22T00:00:00Z"}]}]}

    def __call__(self, url):
        self.calls.append(url)
        parsed = urlsplit(url)
        if not parsed.path.endswith("/o"):
            return copy.deepcopy(self.config)
        args = parse_qs(parsed.query)
        mode = "softDeleted" if "softDeleted" in args else "versions"
        index = 1 if "pageToken" in args else 0
        return copy.deepcopy(self.pages[mode][index])


class S3Fixture:
    def __init__(self):
        self.calls = []
        self.pages = [{"Contents": [{"Key": "backups/one.tar.age"}, {"Key": "backups/latest.json"}], "IsTruncated": True, "NextContinuationToken": "next"},
                      {"Contents": [{"Key": "backups/two.tar.age"}], "IsTruncated": False}]
        self.metadata = {"Metadata": {"sha256": "a" * 64}, "ContentLength": 23, "ETag": '"synthetic"'}

    def list_objects_v2(self, **kwargs):
        self.calls.append(("LIST", kwargs))
        return copy.deepcopy(self.pages[1 if "ContinuationToken" in kwargs else 0])

    def head_object(self, **kwargs):
        self.calls.append(("HEAD", kwargs))
        return copy.deepcopy(self.metadata)


class ProviderTests(unittest.TestCase):
    def test_remote_default_refuses_before_contact(self):
        google, s3 = GoogleFixture(), S3Fixture()
        for callback in [lambda: gcs_inventory(google, "synthetic-bucket", "driver/"), lambda: r2_inventory(s3, "synthetic-bucket", "backups/")]:
            with self.assertRaisesRegex(ValueError, "REMOTE_INVENTORY_DISABLED"):
                callback()
        self.assertEqual(google.calls, [])
        self.assertEqual(s3.calls, [])

    def test_google_versions_soft_delete_pagination_and_hold_are_distinct(self):
        fixture = GoogleFixture()
        result = gcs_inventory(fixture, "synthetic-bucket", "driver/", enabled=True)
        self.assertEqual(len(result["copies"]), 3)
        self.assertTrue(result["copies"][0]["providerHoldObserved"])
        self.assertFalse(result["restorableBytesVerified"])
        self.assertFalse(result["snapshotAtomic"])
        self.assertFalse(result["providerDeletionEnabled"])
        for call in fixture.calls:
            args = parse_qs(urlsplit(call).query)
            self.assertFalse("versions" in args and "softDeleted" in args)

    def test_google_unknown_soft_delete_state_fails_closed(self):
        fixture = GoogleFixture()
        fixture.config = {}
        with self.assertRaisesRegex(ValueError, "SOFT_DELETE_CONFIGURATION_UNVERIFIED"):
            gcs_inventory(fixture, "synthetic-bucket", "driver/", enabled=True)

    def test_hold_metadata_revision_does_not_change_generation_identity(self):
        fixture = GoogleFixture()
        first = gcs_inventory(fixture, "synthetic-bucket", "driver/", enabled=True)["copies"][0]
        fixture.pages["versions"][0]["items"][0].update(metageneration="4", temporaryHold=False)
        second = gcs_inventory(fixture, "synthetic-bucket", "driver/", enabled=True)["copies"][0]
        self.assertEqual(first["binding"], second["binding"])
        self.assertNotEqual(first["observationBinding"], second["observationBinding"])

    def test_google_generation_and_scope_required(self):
        for changes in [{"generation": None}, {"metageneration": None}, {"name": "other/x"}]:
            fixture = GoogleFixture()
            fixture.pages["versions"][0]["items"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, "GENERATION_BINDING_REQUIRED"):
                gcs_inventory(fixture, "synthetic-bucket", "driver/", enabled=True)

    def test_google_object_or_page_limit_never_silently_truncates(self):
        for kwargs, message in [({"limit": 1}, "INVENTORY_OBJECT_LIMIT"), ({"max_pages": 1}, "INVENTORY_PAGE_LIMIT")]:
            with self.subTest(kwargs=kwargs), self.assertRaisesRegex(ValueError, message):
                gcs_inventory(GoogleFixture(), "synthetic-bucket", "driver/", enabled=True, **kwargs)

    def test_google_duplicate_generation_rejected(self):
        fixture = GoogleFixture()
        fixture.pages["versions"][1]["items"][0]["generation"] = "2"
        with self.assertRaisesRegex(ValueError, "DUPLICATE_GENERATION"):
            gcs_inventory(fixture, "synthetic-bucket", "driver/", enabled=True)

    def test_r2_list_head_is_not_versioning_lock_or_integrity_proof(self):
        fixture = S3Fixture()
        result = r2_inventory(fixture, "synthetic-bucket", "backups/", enabled=True)
        self.assertEqual(len(result["copies"]), 2)
        self.assertEqual(result["s3Versioning"], "UNSUPPORTED")
        self.assertFalse(result["providerDeletionEnabled"])
        self.assertEqual({kind for kind, _ in fixture.calls}, {"LIST", "HEAD"})
        self.assertTrue(all(r["bucketLock"] == "NOT_VERIFIED_BY_S3_METADATA" for r in result["copies"]))

    def test_r2_missing_ciphertext_checksum_rejected(self):
        fixture = S3Fixture()
        fixture.metadata["Metadata"] = {}
        with self.assertRaisesRegex(ValueError, "ENCRYPTED_BACKUP_METADATA_REQUIRED"):
            r2_inventory(fixture, "synthetic-bucket", "backups/", enabled=True)

    def test_r2_scope_and_limits_refuse(self):
        fixture = S3Fixture()
        fixture.pages[0]["Contents"][0]["Key"] = "foreign/x.tar.age"
        with self.assertRaisesRegex(ValueError, "BACKUP_KEY_BINDING_REQUIRED"):
            r2_inventory(fixture, "synthetic-bucket", "backups/", enabled=True)
        with self.assertRaisesRegex(ValueError, "INVENTORY_OBJECT_LIMIT"):
            r2_inventory(S3Fixture(), "synthetic-bucket", "backups/", enabled=True, limit=1)

    def test_r2_pagination_loop_refused(self):
        fixture = S3Fixture()
        fixture.pages[1] = {"Contents": [], "IsTruncated": True, "NextContinuationToken": "next"}
        with self.assertRaisesRegex(ValueError, "PROVIDER_PAGINATION_LOOP"):
            r2_inventory(fixture, "synthetic-bucket", "backups/", enabled=True)

    def test_prefix_and_boolean_bounds_refuse(self):
        for prefix in ["", "../", "/driver/", "a//", "https://host/"]:
            with self.subTest(prefix=prefix), self.assertRaises(ValueError):
                gcs_inventory(GoogleFixture(), "synthetic-bucket", prefix, enabled=True)
        with self.assertRaisesRegex(ValueError, "INVENTORY_BOUNDS_REQUIRED"):
            gcs_inventory(GoogleFixture(), "synthetic-bucket", "driver/", enabled=True, max_pages=True)


if __name__ == "__main__":
    unittest.main()
