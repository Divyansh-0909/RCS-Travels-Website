"""Calendar-aware review planning only: no SQL writes, provider client or deletion permission."""
import calendar
import re
from datetime import datetime, timedelta


def instant(value):
    if not isinstance(value, str):
        raise TypeError("TIMESTAMP_REQUIRED")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("TIMEZONE_REQUIRED")
    return parsed


def deadline(start, period):
    match = re.fullmatch(r"P([1-9][0-9]{0,3})([DWMY])", period) if isinstance(period, str) else None
    if not match:
        raise ValueError("EXPLICIT_SUPPORTED_CALENDAR_PERIOD_REQUIRED")
    count, unit = int(match[1]), match[2]
    date = instant(start)
    if unit in ["D", "W"]:
        return date + timedelta(days=count * (7 if unit == "W" else 1))
    total = date.year * 12 + date.month - 1 + count * (12 if unit == "Y" else 1)
    year, month0 = divmod(total, 12)
    month = month0 + 1
    return date.replace(year=year, month=month, day=min(date.day, calendar.monthrange(year, month)[1]))


def plan_review(policy, rule_id, *, start, now, active_holds, inventory_complete, terminal, case_closed, legal_classification_complete):
    if not isinstance(policy, dict) or policy.get("productionDeletionEnabled") is not False or policy.get("automaticCleanupEnabled") is not False:
        raise ValueError("DISABLED_REVIEW_POLICY_REQUIRED")
    result = {"schema": "retention-review-plan-v1", "rule": rule_id, "productionDeletion": False, "deletionAuthorized": False}
    rule = next((r for r in policy.get("rules", []) if r.get("id") == rule_id), None)
    if rule is None:
        return {**result, "status": "RULE_REQUIRED"}
    if rule.get("financial") is True:
        return {**result, "status": "CA_REVIEW_PENDING"}
    if rule.get("businessApproved") is not True:
        return {**result, "status": "BUSINESS_DECISION_PENDING"}
    if type(active_holds) is not int or active_holds < 0:
        raise ValueError("EXPLICIT_HOLD_COUNT_REQUIRED")
    if active_holds:
        return {**result, "status": "HELD"}
    if inventory_complete is not True:
        return {**result, "status": "COPY_INVENTORY_REQUIRED"}
    if terminal is not True or case_closed is not True:
        return {**result, "status": "OPEN_MATTER"}
    if legal_classification_complete is not True:
        return {**result, "status": "LEGAL_CLASSIFICATION_REQUIRED"}
    try:
        due = deadline(start, rule.get("period"))
        observed = instant(now)
    except (ValueError, TypeError):
        return {**result, "status": "EXPLICIT_CALENDAR_TRIGGER_REQUIRED"}
    return {**result, "status": "REVIEW_DUE" if observed >= due else "NOT_DUE", "reviewAfter": due.isoformat(),
            "boundary": "Business review planning; financial/legal/dependency/provider approvals and current row authority remain separate"}
