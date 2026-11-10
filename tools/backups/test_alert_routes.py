"""Network-free regression tests: every outbound transport is replaced by a fake."""
import contextlib
import io
import json
import ssl
import unittest
from unittest.mock import patch

import alert_routes as routes
import notify


def smtp_env(**changes):
    result = {"BACKUP_ALERT_TRANSPORT": "smtp", "BACKUP_EMAIL_ALERTS_ENABLED": "true",
              "BACKUP_SMTP_HOST": "mail.example.test", "BACKUP_SMTP_PORT": "587",
              "BACKUP_SMTP_USERNAME": "synthetic-login", "BACKUP_SMTP_PASSWORD": "synthetic-only-password",
              "BACKUP_ALERT_FROM": "backup@example.test", "BACKUP_ALERT_TO": "operator@example.test"}
    result.update(changes)
    return result


class AlertTests(unittest.TestCase):
    def test_no_configuration_refuses_without_network(self):
        with patch.dict(notify.os.environ, {}, clear=True), patch.object(notify, "deliver") as send, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(notify.main([]), 1)
            send.assert_not_called()

    def test_email_is_explicitly_disabled_by_default(self):
        with self.assertRaisesRegex(routes.AlertRefused, "ALERT_EMAIL_DISABLED"):
            routes.configuration(smtp_env(BACKUP_EMAIL_ALERTS_ENABLED=""))

    def test_every_required_setting_is_required(self):
        for key in ["BACKUP_SMTP_HOST", "BACKUP_SMTP_PORT", "BACKUP_SMTP_USERNAME", "BACKUP_SMTP_PASSWORD", "BACKUP_ALERT_FROM", "BACKUP_ALERT_TO"]:
            with self.subTest(key=key), self.assertRaises(routes.AlertRefused):
                routes.configuration(smtp_env(**{key: ""}))

    def test_header_injection_and_multiple_recipients_refused(self):
        for address in ["operator@example.test\nBcc: other@example.test", "one@example.test,two@example.test", "Operator <one@example.test>", "not-an-address"]:
            with self.subTest(address=address), self.assertRaises(routes.AlertRefused):
                routes.configuration(smtp_env(BACKUP_ALERT_TO=address))

    def test_plaintext_or_invalid_smtp_port_refused(self):
        for port in ["25", "abc", "0", "65536"]:
            with self.subTest(port=port), self.assertRaises(routes.AlertRefused):
                routes.configuration(smtp_env(BACKUP_SMTP_PORT=port))

    def test_host_and_unknown_kind_refused(self):
        for extra in [{"BACKUP_SMTP_HOST": "https://mail.example.test"}, {"BACKUP_ALERT_KIND": "CUSTOMER_RECORD_CONTENTS"}, {"BACKUP_ALERT_TRANSPORT": "unknown"}]:
            with self.subTest(extra=extra), self.assertRaises(routes.AlertRefused):
                routes.configuration(smtp_env(**extra))

    def test_preflight_never_sends(self):
        with patch.dict(notify.os.environ, smtp_env(), clear=True), patch.object(notify, "deliver") as send, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(notify.main(["--check"]), 0)
            send.assert_not_called()
            self.assertIn("NOT_DELIVERY_VERIFIED", output.getvalue())

    def test_starttls_before_authentication_with_verified_context(self):
        config = routes.configuration(smtp_env())
        with patch.object(routes.smtplib, "SMTP") as factory:
            server = factory.return_value.__enter__.return_value
            server.send_message.return_value = {}
            self.assertEqual(routes.deliver(config, {}), "ALERT_ACCEPTED_BY_SMTP")
            context = server.starttls.call_args.kwargs["context"]
            self.assertTrue(context.check_hostname)
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
            self.assertEqual([x[0] for x in server.method_calls], ["ehlo", "starttls", "ehlo", "login", "send_message"])
            self.assertEqual(factory.call_args.kwargs["timeout"], 15)

    def test_implicit_tls_with_verified_context(self):
        config = routes.configuration(smtp_env(BACKUP_SMTP_PORT="465"))
        with patch.object(routes.smtplib, "SMTP_SSL") as factory:
            server = factory.return_value.__enter__.return_value
            server.send_message.return_value = {}
            routes.deliver(config, {})
            self.assertTrue(factory.call_args.kwargs["context"].check_hostname)
            server.starttls.assert_not_called()

    def test_recipient_refusal_is_failure(self):
        config = routes.configuration(smtp_env())
        with patch.object(routes.smtplib, "SMTP") as factory:
            factory.return_value.__enter__.return_value.send_message.return_value = {"operator@example.test": (550, b"refused")}
            with self.assertRaisesRegex(routes.AlertRefused, "ALERT_DELIVERY_FAILED"):
                routes.deliver(config, {})

    def test_tls_failure_does_not_login_or_leak_details(self):
        env = smtp_env()
        with patch.dict(notify.os.environ, env, clear=True), patch.object(routes.smtplib, "SMTP") as factory, contextlib.redirect_stdout(io.StringIO()) as output:
            server = factory.return_value.__enter__.return_value
            server.starttls.side_effect = RuntimeError("sensitive synthetic error")
            self.assertEqual(notify.main([]), 1)
            server.login.assert_not_called()
            self.assertEqual(output.getvalue().strip(), "ALERT_DELIVERY_FAILED")

    def test_email_payload_excludes_credentials_and_arbitrary_environment(self):
        env = smtp_env(DATABASE_URL="synthetic-private-url", CUSTOMER_DATA="synthetic-private-record")
        text = routes.message(routes.configuration(env)).as_string()
        for value in [env["BACKUP_SMTP_PASSWORD"], env["DATABASE_URL"], env["CUSTOMER_DATA"]]:
            self.assertNotIn(value, text)

    def test_webhook_compatibility_and_payload(self):
        env = {"BACKUP_ALERT_WEBHOOK": "https://alerts.example.test/private", "GITHUB_REPOSITORY": "synthetic/repo", "GITHUB_RUN_ID": "123"}
        with patch.object(routes.urllib.request, "build_opener") as factory:
            response = factory.return_value.open.return_value.__enter__.return_value
            response.status = 204
            self.assertEqual(routes.deliver(routes.configuration(env), env), "ALERT_ACCEPTED_BY_WEBHOOK")
            request = factory.return_value.open.call_args.args[0]
            self.assertEqual(set(json.loads(request.data)), {"text", "repository", "run_id"})

    def test_http_and_credential_bearing_webhooks_refused(self):
        for url in ["http://alerts.example.test", "https://user:password@alerts.example.test", "https://alerts.example.test/#fragment"]:
            with self.subTest(url=url), self.assertRaises(routes.AlertRefused):
                routes.configuration({"BACKUP_ALERT_WEBHOOK": url})

    def test_webhook_redirect_cannot_downgrade_or_change_host(self):
        request = routes.urllib.request.Request("https://alerts.example.test/private", data=b"{}")
        handler = routes.SameHostHTTPSRedirect()
        for target in ["http://alerts.example.test/private", "https://other.example.test/private"]:
            with self.subTest(target=target), self.assertRaises(routes.AlertRefused):
                handler.redirect_request(request, None, 307, "redirect", {}, target)


if __name__ == "__main__":
    unittest.main()
