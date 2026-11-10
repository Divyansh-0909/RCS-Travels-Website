"""Tiny private synthetic files only; no database or host-volume exhaustion."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from archive_spool import WAL_NAME, archive, restore


class ArchiveSpoolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        (self.root / "data/pg_wal").mkdir(parents=True)
        (self.root / "restored/pg_wal").mkdir(parents=True)
        (self.root / "ownership.json").write_text(json.dumps({"owner": "test", "data": str(self.root / "data")}))
        self.name = "000000010000000000000001"
        self.source = self.root / "data/pg_wal" / self.name
        self.source.write_bytes(b"synthetic")
        self.config = {"ownerRoot": str(self.root), "owner": "test", "restoreRoot": str(self.root / "restored"), "capacityBytes": 64}

    def test_standard_wal_and_history_names(self):
        for name in [self.name, "00000001.history", self.name + ".00000028.backup"]:
            self.assertIsNotNone(WAL_NAME.fullmatch(name))
        for name in ["../outside", "lowercase", self.name + ".exe"]:
            self.assertIsNone(WAL_NAME.fullmatch(name))

    def test_duplicate_preserves_original(self):
        self.assertEqual(archive(self.config, self.source, self.name), "ARCHIVED")
        self.assertEqual(archive(self.config, self.source, self.name), "DUPLICATE")
        self.assertEqual((self.root / "archive" / self.name).read_bytes(), b"synthetic")

    def test_conflicting_duplicate_refused(self):
        archive(self.config, self.source, self.name)
        self.source.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "ARCHIVE_EXISTING_CONTENT_CONFLICT"):
            archive(self.config, self.source, self.name)

    def test_missing_sidecar_after_interruption_repaired(self):
        archive(self.config, self.source, self.name)
        (self.root / "archive" / (self.name + ".sha256")).unlink()
        self.assertEqual(archive(self.config, self.source, self.name), "DUPLICATE")
        restore(self.config, self.name, self.root / "restored/pg_wal/RECOVERYXLOG")

    def test_conflicting_sidecar_refused(self):
        archive(self.config, self.source, self.name)
        (self.root / "archive" / (self.name + ".sha256")).write_text("0" * 64)
        with self.assertRaisesRegex(ValueError, "ARCHIVE_EXISTING_MANIFEST_CONFLICT"):
            archive(self.config, self.source, self.name)

    def test_capacity_refusal_then_drain(self):
        config = copy.deepcopy(self.config)
        config["capacityBytes"] = 1
        with self.assertRaisesRegex(ValueError, "ARCHIVE_CAPACITY_REFUSED"):
            archive(config, self.source, self.name)
        self.assertFalse((self.root / "archive" / self.name).exists())
        self.assertFalse((self.root / "archive/writer.lock").exists())
        self.assertEqual(archive(self.config, self.source, self.name), "ARCHIVED")

    def test_outside_source_refused(self):
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SOURCE_OUTSIDE_OWNED_WAL"):
            archive(self.config, self.root / self.name, self.name)

    def test_owner_mismatch_refused(self):
        self.config["owner"] = "other"
        with self.assertRaisesRegex(ValueError, "ARCHIVE_OWNER_MISMATCH"):
            archive(self.config, self.source, self.name)

    def test_restore_hash_and_target(self):
        archive(self.config, self.source, self.name)
        target = self.root / "restored/pg_wal/RECOVERYXLOG"
        restore(self.config, self.name, target)
        self.assertEqual(target.read_bytes(), self.source.read_bytes())
        with self.assertRaisesRegex(ValueError, "RESTORE_TARGET_OUTSIDE_OWNED_WAL"):
            restore(self.config, self.name, self.root / "outside")

    def test_tampered_archive_refuses_restore(self):
        archive(self.config, self.source, self.name)
        (self.root / "archive" / self.name).write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "RESTORE_ARCHIVE_HASH_MISMATCH"):
            restore(self.config, self.name, self.root / "restored/pg_wal/RECOVERYXLOG")


if __name__ == "__main__":
    unittest.main()
