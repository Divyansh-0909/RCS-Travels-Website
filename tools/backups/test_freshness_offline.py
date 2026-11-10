"""Actual backup freshness/integrity routines with a memory-only object client."""
import copy
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import unittest

import backup


class MemoryClient:
    def __init__(self, pointer, contents=b"synthetic-ciphertext"):
        self.pointer = pointer
        self.contents = contents
        self.downloads = 0
        self.size = pointer["bytes"]
        self.hash = pointer["sha256"]

    def get_object(self, **_):
        return {"Body": io.BytesIO(json.dumps(self.pointer).encode())}

    def head_object(self, **_):
        return {"ContentLength": self.size, "Metadata": {"sha256": self.hash}}

    def download_file(self, bucket, key, path):
        self.downloads += 1
        Path(path).write_bytes(self.contents)


class FreshnessTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.now(dt.timezone.utc)
        self.config = {"scope": "source", "prefix": "synthetic/source", "bucket": "synthetic", "stale_after_hours": 25, "max_archive_bytes": 1024}
        self.pointer = {"scope": "source", "version": 1, "key": "synthetic/source/one.tar.age", "sha256": hashlib.sha256(b"synthetic-ciphertext").hexdigest(),
                        "bytes": len(b"synthetic-ciphertext"), "completed_at": self.now.isoformat(), "recovery_point_at": (self.now - dt.timedelta(minutes=1)).isoformat()}

    def refuses(self, code, **changes):
        value = copy.deepcopy(self.pointer)
        value.update(changes)
        with self.assertRaisesRegex(backup.Refused, code):
            backup.freshness(self.config, MemoryClient(value))

    def test_freshness_is_metadata_only(self):
        client = MemoryClient(self.pointer)
        result = backup.freshness(self.config, client)
        self.assertEqual(result["status"], "FRESH_METADATA_ONLY")
        self.assertEqual(result["full_ciphertext_integrity"], "NOT_MEASURED_BY_THIS_CHECK")
        self.assertEqual(client.downloads, 0)

    def test_stale_completion(self):
        self.refuses("BACKUP_STALE_OR_FUTURE", completed_at=(self.now - dt.timedelta(hours=26)).isoformat())

    def test_future_completion(self):
        self.refuses("BACKUP_STALE_OR_FUTURE", completed_at=(self.now + dt.timedelta(hours=1)).isoformat())

    def test_fresh_upload_cannot_hide_old_recovery_point(self):
        self.refuses("RECOVERY_POINT_STALE_OR_FUTURE", recovery_point_at=(self.now - dt.timedelta(hours=26)).isoformat())

    def test_recovery_point_after_completion(self):
        self.refuses("RECOVERY_POINT_STALE_OR_FUTURE", recovery_point_at=(self.now + dt.timedelta(minutes=1)).isoformat())

    def test_wrong_scope(self):
        self.refuses("POINTER_SCOPE_INVALID", scope="custodian")

    def test_boolean_or_float_version_is_not_integer_version(self):
        for value in [True, 1.0, "1", 2]:
            with self.subTest(value=value):
                self.refuses("POINTER_SCOPE_INVALID", version=value)

    def test_wrong_object_key(self):
        for key in ["other/source/one.tar.age", "synthetic/source/one.sql", None]:
            with self.subTest(key=key):
                self.refuses("POINTER_KEY_INVALID", key=key)

    def test_bad_hash(self):
        self.refuses("POINTER_HASH_INVALID", sha256="not-a-hash")

    def test_boolean_size_is_not_integer_size(self):
        self.refuses("CIPHERTEXT_SIZE_INVALID", bytes=True)

    def test_invalid_sizes(self):
        for value in [0, -1, "20", 2 ** 40]:
            with self.subTest(value=value):
                self.refuses("CIPHERTEXT_SIZE_INVALID", bytes=value)

    def test_remote_size_mismatch(self):
        client = MemoryClient(self.pointer)
        client.size += 1
        with self.assertRaisesRegex(backup.Refused, "REMOTE_METADATA_MISMATCH"):
            backup.freshness(self.config, client)

    def test_remote_hash_metadata_mismatch(self):
        client = MemoryClient(self.pointer)
        client.hash = "b" * 64
        with self.assertRaisesRegex(backup.Refused, "REMOTE_METADATA_MISMATCH"):
            backup.freshness(self.config, client)

    def test_full_verification_reads_ciphertext(self):
        client = MemoryClient(self.pointer)
        self.assertEqual(backup.verify(self.config, client)["status"], "FRESH_INTEGRITY_VERIFIED")
        self.assertEqual(client.downloads, 1)

    def test_same_length_corruption_escapes_metadata_but_not_verify(self):
        client = MemoryClient(self.pointer, contents=b"X" * self.pointer["bytes"])
        self.assertEqual(backup.freshness(self.config, client)["status"], "FRESH_METADATA_ONLY")
        with self.assertRaisesRegex(backup.Refused, "REMOTE_INTEGRITY_FAILED"):
            backup.verify(self.config, client)

    def test_missing_object_is_a_failure(self):
        client = MemoryClient(self.pointer)
        def missing(**_):
            raise RuntimeError("synthetic missing object")
        client.get_object = missing
        with self.assertRaises(RuntimeError):
            backup.freshness(self.config, client)


if __name__ == "__main__":
    unittest.main()
