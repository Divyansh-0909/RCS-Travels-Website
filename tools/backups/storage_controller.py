"""Local ledger monitor. No dotenv discovery, SQL mutation, deletion or scheduling."""
import argparse
import hashlib
import json
import os
from pathlib import Path

from storage_alerts import send_storage_alert
from storage_safeguards import StorageGuard


def cycle(guard, report, *, send=False, env=None):
    result = guard.observe(report)
    delivery = "NOT_REQUESTED"
    if send:
        env = dict(os.environ) if env is None else env
        # This is a binding to the configured destination, not a public email or
        # webhook token. No raw destination is persisted to the private ledger.
        target = env.get("BACKUP_ALERT_TO") if env.get("BACKUP_ALERT_TRANSPORT") == "smtp" else env.get("BACKUP_ALERT_WEBHOOK")
        if not target:
            return {**result, "delivery": "ROUTE_UNCONFIGURED_NOT_SENT"}
        claim = guard.claim_alert(hashlib.sha256(target.encode()).hexdigest())
        if claim:
            try:
                receipt = send_storage_alert(env, enabled=True)
                delivery = receipt if guard.finish_alert(claim, receipt) else "STALE_CLAIM_REVIEW"
            except Exception:
                # Expired claims retry up to three times; never convert an error
                # into an acknowledgement or write error details/credentials.
                delivery = "FAILED_RETAINED_FOR_RETRY"
        else:
            delivery = "NO_ELIGIBLE_ALERT"
    return {**result, "delivery": delivery, "humanAcknowledgementVerified": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--send-alert", action="store_true")
    args = parser.parse_args()
    policy = json.loads(Path(args.policy).read_text(encoding="utf-8"))
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    guard = StorageGuard(args.state, policy)
    result = cycle(guard, report, send=args.send_alert)
    print(json.dumps(result))
    return 0 if result["status"] == "READY" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print('{"status":"REFUSED","reason":"STORAGE_CONTROL_FAILED_DETAILS_WITHHELD"}')
        raise SystemExit(1) from None
