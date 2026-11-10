"""Explicit storage alert transport. No credentials, paths or SQL in messages."""
from email.message import EmailMessage
import json
import smtplib
import ssl
import urllib.request

from alert_routes import AlertRefused, SameHostHTTPSRedirect, configuration


def send_storage_alert(env, *, enabled=False):
    if not enabled:
        raise AlertRefused("STORAGE_ALERT_SENDING_DISABLED")
    config = configuration(dict(env, BACKUP_ALERT_KIND="BACKUP_CHECK_FAILED"))
    body = ("RCS database storage or recovery safeguards require operator review. "
            "Check the private storage ledger. Technical responder: Divyansh Singh. "
            "Escalate legal, irreversible-deletion and business-impact decisions to proprietor Rajuddin. "
            "No automatic deletion is authorized.")
    if config["route"] == "webhook":
        request = urllib.request.Request(config["target"], data=json.dumps({"text": body}).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.build_opener(SameHostHTTPSRedirect()).open(request, timeout=15) as response:
            if not 200 <= response.status < 300:
                raise AlertRefused("STORAGE_ALERT_DELIVERY_FAILED")
    else:
        message = EmailMessage()
        message["From"], message["To"] = config["sender"], config["recipient"]
        message["Subject"] = "RCS storage/recovery: operator review required"
        message.set_content(body)
        context = ssl.create_default_context()
        factory = smtplib.SMTP_SSL if config["port"] == 465 else smtplib.SMTP
        options = {"timeout": 15, **({"context": context} if config["port"] == 465 else {})}
        with factory(config["host"], config["port"], **options) as server:
            if config["port"] == 587:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
            server.login(config["username"], config["password"])
            if server.send_message(message):
                raise AlertRefused("STORAGE_ALERT_DELIVERY_FAILED")
    return "ACCEPTED_BY_TRANSPORT"
