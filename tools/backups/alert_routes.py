"""Minimal backup alerts; configuration checks never contact a mail/webhook host."""
import json
import re
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from urllib.parse import urlsplit


class AlertRefused(Exception):
    pass


KINDS = {"BACKUP_FAILED", "STALE_BACKUP", "RESTORE_FAILED", "BACKUP_CHECK_FAILED"}
ADDRESS = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}\Z")


def configuration(env):
    route = env.get("BACKUP_ALERT_TRANSPORT") or "webhook"
    kind = env.get("BACKUP_ALERT_KIND") or "BACKUP_CHECK_FAILED"
    if kind not in KINDS:
        raise AlertRefused("ALERT_KIND_INVALID")
    if route == "webhook":
        target = env.get("BACKUP_ALERT_WEBHOOK", "")
        try:
            parsed = urlsplit(target)
            valid = parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password and not parsed.fragment
        except ValueError:
            valid = False
        if not valid:
            raise AlertRefused("ALERT_ROUTING_UNCONFIGURED")
        return {"route": route, "kind": kind, "target": target}
    if route != "smtp":
        raise AlertRefused("ALERT_TRANSPORT_UNCONFIGURED")
    if env.get("BACKUP_EMAIL_ALERTS_ENABLED") != "true":
        raise AlertRefused("ALERT_EMAIL_DISABLED")
    names = ["BACKUP_SMTP_HOST", "BACKUP_SMTP_PORT", "BACKUP_SMTP_USERNAME", "BACKUP_SMTP_PASSWORD", "BACKUP_ALERT_FROM", "BACKUP_ALERT_TO"]
    if any(not env.get(name) for name in names):
        raise AlertRefused("ALERT_EMAIL_SETTINGS_INCOMPLETE")
    sender, recipient = env["BACKUP_ALERT_FROM"], env["BACKUP_ALERT_TO"]
    if any(not ADDRESS.fullmatch(value) or "\r" in value or "\n" in value for value in (sender, recipient)):
        raise AlertRefused("ALERT_EMAIL_ADDRESS_INVALID")
    host = env["BACKUP_SMTP_HOST"]
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", host):
        raise AlertRefused("ALERT_SMTP_SETTINGS_INVALID")
    try:
        port = int(env["BACKUP_SMTP_PORT"])
    except ValueError as error:
        raise AlertRefused("ALERT_SMTP_SETTINGS_INVALID") from error
    if port not in (465, 587):
        raise AlertRefused("ALERT_SMTP_SETTINGS_INVALID")
    return {"route": route, "kind": kind, "host": host, "port": port,
            "username": env["BACKUP_SMTP_USERNAME"], "password": env["BACKUP_SMTP_PASSWORD"],
            "sender": sender, "recipient": recipient}


def message(config):
    result = EmailMessage()
    result["From"] = config["sender"]
    result["To"] = config["recipient"]
    result["Subject"] = "RCS backup operations: " + config["kind"]
    result.set_content("A database backup, integrity/freshness check or isolated restore needs operator review.\n"
                       "Review the private job logs. Escalate legal, irreversible-deletion or business-impact decisions to the proprietor.\n"
                       "This message contains no database contents, credentials or private signing material.\n")
    return result


class SameHostHTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        old, new = urlsplit(request.full_url), urlsplit(newurl)
        if new.scheme != "https" or new.netloc != old.netloc:
            raise AlertRefused("ALERT_DELIVERY_FAILED")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def deliver(config, env):
    if config["route"] == "webhook":
        # Keep the existing closed, generic webhook payload for current receivers.
        payload = {"text": "RCS database backup/verification job failed or is stale. Operator review required.",
                   "repository": env.get("GITHUB_REPOSITORY", ""), "run_id": env.get("GITHUB_RUN_ID", "")}
        request = urllib.request.Request(config["target"], data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
        opener = urllib.request.build_opener(SameHostHTTPSRedirect())
        with opener.open(request, timeout=15) as response:
            if not 200 <= response.status < 300:
                raise AlertRefused("ALERT_DELIVERY_FAILED")
        return "ALERT_ACCEPTED_BY_WEBHOOK"
    context = ssl.create_default_context()
    factory = smtplib.SMTP_SSL if config["port"] == 465 else smtplib.SMTP
    kwargs = {"timeout": 15}
    if config["port"] == 465:
        kwargs["context"] = context
    with factory(config["host"], config["port"], **kwargs) as server:
        if config["port"] == 587:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
        server.login(config["username"], config["password"])
        refused = server.send_message(message(config))
        if refused:
            raise AlertRefused("ALERT_DELIVERY_FAILED")
    # SMTP acceptance is not proof of inbox delivery or operator acknowledgement.
    return "ALERT_ACCEPTED_BY_SMTP"
