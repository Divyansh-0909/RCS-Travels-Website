"""No network or database; actual SQLite/filesystem state and bounded races."""
import hashlib
import json
from pathlib import Path
import tempfile
from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch

import offhost_recovery
import storage_alerts
import guarded_backup
from storage_probe import directory_bytes
from storage_controller import cycle
from storage_safeguards import KINDS, StorageGuard, bounded_put, evaluate, validate_policy


def policy():
    return {"version": 1, "enabled": True, "productionDeletion": False,
            "budgets": dict.fromkeys(KINDS, 1000), "totalBytes": 6000, "reserveBytes": 500,
            "staleSeconds": 60, "backupDeadlineSeconds": 100, "restoreDeadlineSeconds": 200,
            "maxOperations": 10}


def report(now=1000):
    return {"inventoryComplete": True, "domains": [
        {"id": k, "kind": k, "bytes": 10, "at": now} for k in sorted(KINDS)],
        "verifiedBackupAt": now, "verifiedRestoreAt": now,
        "controls": dict.fromkeys(["finiteSlotRetention", "finiteTempPerProcess", "boundedLogSink",
                                   "archiveHealthy", "slotsWithinBudget"], True)}


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.policy = policy()
        self.guard = StorageGuard(self.root / "state.sqlite", self.policy)
        self.guard.observe(report(), now=1000)
        (self.root / "ownership.json").write_text(json.dumps({"owner": "synthetic", "purpose": "storage-safeguards"}))

    def test_normal_complete_observation(self):
        self.assertEqual(evaluate(self.policy, report(), 1000)["status"], "READY")

    def test_disabled_policy_never_admits(self):
        self.policy["enabled"] = False
        self.assertEqual(evaluate(self.policy, report(), 1000)["status"], "DISABLED")
        with self.assertRaisesRegex(ValueError, "DISABLED"):
            self.guard.reserve("a", "operator", "history", 1, now=1000)

    def test_no_production_deletion_policy(self):
        self.policy["productionDeletion"] = True
        with self.assertRaises(ValueError):
            validate_policy(self.policy)

    def test_all_seven_kinds_required(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                p = policy()
                del p["budgets"][kind]
                with self.assertRaises(ValueError):
                    validate_policy(p)

    def test_unknown_missing_and_duplicate_inventory(self):
        for field in ["inventoryComplete", "domains"]:
            r = report()
            del r[field]
            self.assertIn("INVENTORY_UNKNOWN", evaluate(self.policy, r, 1000)["reasons"])
        r = report()
        r["domains"].append(r["domains"][0])
        with self.assertRaisesRegex(ValueError, "DOMAIN_DUPLICATE"):
            evaluate(self.policy, r, 1000)

    def test_stale_future_nan_and_negative_metrics(self):
        for stamp in [900, 1006]:
            r = report(stamp)
            self.assertIn("MEASUREMENT_STALE", evaluate(self.policy, r, 1000)["reasons"])
        for field, value in [("at", float("nan")), ("bytes", -1), ("bytes", True)]:
            r = report()
            r["domains"][0][field] = value
            with self.assertRaises(ValueError):
                evaluate(self.policy, r, 1000)

    def test_each_category_refuses_at_limit(self):
        for kind in KINDS:
            r = report()
            next(d for d in r["domains"] if d["kind"] == kind)["bytes"] = 1000
            self.assertIn("LIMIT_" + kind.upper(), evaluate(self.policy, r, 1000)["reasons"])

    def test_overall_and_deadlines(self):
        r = report()
        for d in r["domains"]:
            d["bytes"] = 800
        self.assertIn("OVERALL_PRESSURE", evaluate(self.policy, r, 1000)["reasons"])
        r.update(verifiedBackupAt=800, verifiedRestoreAt=700)
        self.assertTrue({"BACKUP_STALE", "RESTORE_STALE"} <= set(evaluate(self.policy, r, 1000)["reasons"]))

    def test_unbounded_controls_refuse(self):
        r = report()
        r["controls"] = {}
        self.assertTrue({"WAL_UNBOUNDED", "TEMP_UNBOUNDED", "LOG_UNBOUNDED", "ARCHIVE_FAILED", "SLOT_LAG"}
                        <= set(evaluate(self.policy, r, 1000)["reasons"]))

    def test_reserve_reuse_conflict_and_release(self):
        self.assertEqual(self.guard.reserve("one", "operator", "history", 200, now=1000), "RESERVED")
        self.assertEqual(self.guard.reserve("one", "operator", "history", 200, now=1000), "REUSED_NO_NEW_WRITE_AUTHORITY")
        for actor, cost in [("foreign", 200), ("operator", 201)]:
            with self.assertRaisesRegex(ValueError, "CONFLICT"):
                self.guard.reserve("one", actor, "history", cost, now=1000)
        self.assertFalse(self.guard.release("one", "foreign"))
        self.assertTrue(self.guard.release("one", "operator"))
        with self.assertRaisesRegex(ValueError, "CONFLICT"):
            self.guard.reserve("one", "operator", "history", 200, now=1000)

    def test_category_reservation_cannot_overbook(self):
        self.guard.reserve("a", "operator", "history", 600, now=1000)
        with self.assertRaisesRegex(ValueError, "CATEGORY_CAPACITY"):
            self.guard.reserve("b", "operator", "history", 500, now=1000)

    def test_two_independent_connections_compete(self):
        def work(n):
            g = StorageGuard(self.guard.path, self.policy)
            try:
                return g.reserve(n, "operator", "history", 600, now=1000)
            except ValueError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(work, ["first", "second"]))
        self.assertEqual(outcomes.count("RESERVED"), 1)
        self.assertEqual(outcomes.count("CATEGORY_CAPACITY_REFUSED"), 1)

    def test_total_reservations_and_emergency_reserve(self):
        p = policy()
        p.update(totalBytes=1000, reserveBytes=500)
        g = StorageGuard(self.root / "small.sqlite", p)
        g.observe(report(), now=1000)
        with self.assertRaisesRegex(ValueError, "OVERALL_CAPACITY"):
            g.reserve("normal", "operator", "logs", 500, now=1000)
        self.assertEqual(g.reserve("stop-evidence", "operator", "logs", 500, emergency=True, now=1000), "RESERVED")
        with self.assertRaisesRegex(ValueError, "EMERGENCY_CLASS_INVALID"):
            g.reserve("work", "operator", "history", 1, emergency=True, now=1000)

    def test_stale_reservation_and_ledger_limits(self):
        with self.assertRaisesRegex(ValueError, "ADMISSION_REFUSED"):
            self.guard.reserve("late", "operator", "history", 1, now=1100)
        for n in range(10):
            self.guard.reserve(str(n), "operator", "history", 1, now=1000)
        with self.assertRaisesRegex(ValueError, "LEDGER_FULL"):
            self.guard.reserve("overflow", "operator", "history", 1, now=1000)

    def test_policy_change_requires_review(self):
        p = policy()
        p["maxOperations"] = 11
        with self.assertRaisesRegex(ValueError, "POLICY_CHANGE_REVIEW_REQUIRED"):
            StorageGuard(self.guard.path, p)

    def test_bounded_writers_preserve_at_capacity(self):
        for kind in ["logs", "backups", "archive", "artifacts"]:
            self.assertEqual(bounded_put(self.root, "synthetic", kind, "first", b"1234", 4), "STORED")
            self.assertEqual(bounded_put(self.root, "synthetic", kind, "first", b"1234", 4), "DUPLICATE")
            with self.assertRaisesRegex(ValueError, "CAPACITY"):
                bounded_put(self.root, "synthetic", kind, "second", b"x", 4)
            self.assertEqual((self.root / kind / "first").read_bytes(), b"1234")

    def test_write_owner_conflict_count_and_lock(self):
        with self.assertRaisesRegex(ValueError, "OWNER_MISMATCH"):
            bounded_put(self.root, "other", "logs", "a", b"x", 10)
        bounded_put(self.root, "synthetic", "logs", "a", b"x", 10, 1)
        with self.assertRaisesRegex(ValueError, "COUNT"):
            bounded_put(self.root, "synthetic", "logs", "b", b"x", 10, 1)
        with self.assertRaisesRegex(ValueError, "CONFLICT"):
            bounded_put(self.root, "synthetic", "logs", "a", b"z", 10)
        (self.root / "logs/writer.lock").touch()
        with self.assertRaises(FileExistsError):
            bounded_put(self.root, "synthetic", "logs", "b", b"x", 10)

    def test_alert_deduplication_and_bounded_retry(self):
        r = report()
        r["verifiedBackupAt"] = 0
        for _ in range(30):
            self.guard.observe(r, now=1000)
        with self.guard.transaction() as c:
            self.assertEqual(c.execute("SELECT count(*) FROM alerts WHERE active=1").fetchone()[0], 1)
        for attempt in range(3):
            self.assertIsNotNone(self.guard.claim_alert("a" * 64, now=1000 + 31 * attempt))
        self.assertIsNone(self.guard.claim_alert("a" * 64, now=1100))
        with self.guard.transaction() as c:
            self.assertEqual(c.execute("SELECT state FROM alerts WHERE active=1").fetchone()[0], "REVIEW")

    def test_alert_binding_stale_token_and_recurrence(self):
        r = report()
        r["verifiedBackupAt"] = 0
        self.guard.observe(r, now=1000)
        claim = self.guard.claim_alert("a" * 64, now=1000)
        wrong = dict(claim, destination="b" * 64)
        self.assertFalse(self.guard.finish_alert(wrong, "SYNTHETIC_ACCEPTED", now=1001))
        self.guard.observe(report(), now=1000)
        self.guard.observe(r, now=1000)
        self.assertFalse(self.guard.finish_alert(claim, "SYNTHETIC_ACCEPTED", now=1001))
        newer = self.guard.claim_alert("a" * 64, now=1001)
        self.assertEqual(newer["generation"], 2)
        self.assertTrue(self.guard.finish_alert(newer, "SYNTHETIC_ACCEPTED", now=1002))

    def test_operator_cycle_default_sends_nothing(self):
        with patch("storage_controller.send_storage_alert") as send:
            cycle(self.guard, report())
            send.assert_not_called()

    def test_operator_cycle_missing_route_and_transport_failure(self):
        r = report()
        r["verifiedBackupAt"] = 0
        self.assertEqual(cycle(self.guard, r, send=True, env={})["delivery"], "ROUTE_UNCONFIGURED_NOT_SENT")
        with patch("storage_controller.send_storage_alert", side_effect=RuntimeError("private-error")):
            self.assertEqual(cycle(self.guard, r, send=True, env={"BACKUP_ALERT_WEBHOOK": "https://example.test"})["delivery"], "FAILED_RETAINED_FOR_RETRY")

    def test_storage_email_disabled_without_network(self):
        with patch.object(storage_alerts.smtplib, "SMTP") as smtp:
            with self.assertRaisesRegex(storage_alerts.AlertRefused, "DISABLED"):
                storage_alerts.send_storage_alert({})
            smtp.assert_not_called()

    def test_offhost_same_machine_rejected_before_database(self):
        d = self.root / "packet"
        d.mkdir()
        data = {"syntheticOnly": True, "config": {"synthetic_validation_only": True},
                "sourceHost": offhost_recovery.host_commitment()}
        (d / "packet.json").write_text(json.dumps(data))
        checksum = hashlib.sha256((d / "packet.json").read_bytes()).hexdigest()
        with patch.object(offhost_recovery, "NativePostgres") as server:
            with self.assertRaisesRegex(Exception, "SECOND_HOST_REQUIRED"):
                offhost_recovery.verify(d, self.root / "identity", checksum)
            server.assert_not_called()

    def test_offhost_packet_hash_and_synthetic_only(self):
        d = self.root / "packet"
        d.mkdir()
        (d / "packet.json").write_text(json.dumps({"syntheticOnly": False}))
        with self.assertRaisesRegex(Exception, "HASH_MISMATCH"):
            offhost_recovery.verify(d, self.root / "key", "0" * 64)
        checksum = hashlib.sha256((d / "packet.json").read_bytes()).hexdigest()
        with self.assertRaisesRegex(Exception, "SYNTHETIC_PACKET_ONLY"):
            offhost_recovery.verify(d, self.root / "key", checksum)

    def test_durable_state_has_explicit_page_limit(self):
        with self.guard.transaction() as c:
            self.assertEqual(c.execute("PRAGMA max_page_count").fetchone()[0], 4096)
            self.assertEqual(c.execute("PRAGMA page_size").fetchone()[0], 4096)

    def test_bounded_directory_observation(self):
        path = self.root / "observed"
        path.mkdir()
        (path / "one").write_bytes(b"abc")
        self.assertEqual(directory_bytes(path), 3)
        (path / "two").write_bytes(b"d")
        with self.assertRaisesRegex(ValueError, "FILE_LIMIT"):
            directory_bytes(path, max_files=1)

    def test_capped_backup_upload_rejects_oversize_and_plaintext(self):
        from unittest.mock import Mock
        client = Mock()
        capped = guarded_backup.CappedUpload(client, 3)
        f = self.root / "synthetic.age"
        f.write_bytes(b"1234")
        with self.assertRaisesRegex(ValueError, "RESERVATION_EXCEEDED"):
            capped.upload_file(f, "test", "test.tar.age")
        with self.assertRaisesRegex(ValueError, "CIPHERTEXT_ONLY"):
            capped.upload_file(f, "test", "dump.sql")
        client.upload_file.assert_not_called()

    def test_backup_disabled_or_unmeasured_never_contacts_database(self):
        config = {"max_archive_bytes": 100}
        with patch.object(guarded_backup.backup, "backup") as work:
            with self.assertRaisesRegex(ValueError, "ADMISSION_REFUSED"):
                guarded_backup.guarded_backup(config, object(), "not-a-connection", self.guard, "blocked")
            work.assert_not_called()

    def test_email_tls_payload_and_acceptance_are_not_human_ack(self):
        env = {"BACKUP_ALERT_TRANSPORT": "smtp", "BACKUP_EMAIL_ALERTS_ENABLED": "true",
               "BACKUP_SMTP_HOST": "smtp.example.test", "BACKUP_SMTP_PORT": "587",
               "BACKUP_SMTP_USERNAME": "synthetic", "BACKUP_SMTP_PASSWORD": "private-synthetic-password",
               "BACKUP_ALERT_FROM": "sender@example.test", "BACKUP_ALERT_TO": "ops@example.test",
               "DATABASE_URL": "private-synthetic-uri"}
        with patch.object(storage_alerts.smtplib, "SMTP") as factory:
            smtp = factory.return_value.__enter__.return_value
            smtp.send_message.return_value = {}
            self.assertEqual(storage_alerts.send_storage_alert(env, enabled=True), "ACCEPTED_BY_TRANSPORT")
            self.assertEqual([call[0] for call in smtp.method_calls], ["ehlo", "starttls", "ehlo", "login", "send_message"])
            payload = smtp.send_message.call_args.args[0].as_string()
            for value in [env["BACKUP_SMTP_PASSWORD"], env["DATABASE_URL"]]:
                self.assertNotIn(value, payload)

    def test_email_transport_refusal_does_not_become_success(self):
        env = {"BACKUP_ALERT_TRANSPORT": "smtp", "BACKUP_EMAIL_ALERTS_ENABLED": "true",
               "BACKUP_SMTP_HOST": "smtp.example.test", "BACKUP_SMTP_PORT": "465",
               "BACKUP_SMTP_USERNAME": "synthetic", "BACKUP_SMTP_PASSWORD": "synthetic",
               "BACKUP_ALERT_FROM": "sender@example.test", "BACKUP_ALERT_TO": "ops@example.test"}
        with patch.object(storage_alerts.smtplib, "SMTP_SSL") as factory:
            factory.return_value.__enter__.return_value.send_message.return_value = {"ops@example.test": (550, b"refused")}
            with self.assertRaisesRegex(storage_alerts.AlertRefused, "DELIVERY_FAILED"):
                storage_alerts.send_storage_alert(env, enabled=True)


if __name__ == "__main__":
    unittest.main()
