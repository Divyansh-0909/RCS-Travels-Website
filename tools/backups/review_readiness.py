"""Offline completeness review for blind labels, never production authorization.

Input must contain pseudonymous bindings and categorical labels only. No model
call, source evidence, reviewer identity attestation or legal approval is supplied.
"""
import re
from datetime import datetime, timezone

HASH = re.compile(r"[a-f0-9]{64}\Z")


def timestamp(value):
    if not isinstance(value, str):
        raise TypeError("TIMESTAMP_REQUIRED")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("TIMEZONE_REQUIRED")
    return parsed.astimezone(timezone.utc)


def inspect_human_review(protocol, cases):
    """Report every supplied case; invalid/missing labels stay in denominators.

    Syntactic chronology is not proof a reviewer was blind or independent.
    Training/assignment, authenticated access and case provenance need review.
    """
    if not isinstance(protocol, dict) or not isinstance(cases, list) or len(cases) > 2048:
        raise ValueError("BOUNDED_REVIEW_PACKET_REQUIRED")
    reviewers = protocol.get("reviewers")
    reviewers_valid = isinstance(reviewers, list) and len(reviewers) == 2 and all(isinstance(r, str) and r.strip() for r in reviewers) and len(set(reviewers)) == 2
    adjudicator = protocol.get("adjudicator")
    issues = []
    if not reviewers_valid:
        issues.append("REVIEWER_ASSIGNMENTS_PENDING_OR_NOT_DISTINCT")
    if adjudicator is not None and (not isinstance(adjudicator, str) or not adjudicator.strip() or adjudicator in (reviewers or [])):
        issues.append("ADJUDICATOR_MUST_BE_DISTINCT_IF_ASSIGNED")
    for key in ["projectionApproved", "collectionApproved", "acceptanceCriteriaApproved"]:
        if protocol.get(key) is not True:
            issues.append(key.upper() + "_PENDING")
    if not isinstance(protocol.get("projectionVersion"), str) or not protocol["projectionVersion"]:
        issues.append("PROJECTION_VERSION_REQUIRED")
    seen = set()
    rows = []
    for index, case in enumerate(cases):
        errors = []
        synthetic = isinstance(case, dict) and case.get("synthetic") is True
        if not isinstance(case, dict):
            rows.append({"index": index, "synthetic": False, "errors": ["CASE_OBJECT_REQUIRED"]})
            continue
        identity = case.get("casePseudonym")
        if not isinstance(identity, str) or not HASH.fullmatch(identity):
            errors.append("PSEUDONYM_REQUIRED")
        elif identity in seen:
            errors.append("DUPLICATE_CASE")
        else:
            seen.add(identity)
        if type(case.get("synthetic")) is not bool:
            errors.append("PROVENANCE_CLASSIFICATION_REQUIRED")
        for key in ["evidenceSha256", "sourceEpochSha256", "instructionSha256"]:
            if not isinstance(case.get(key), str) or not HASH.fullmatch(case[key]):
                errors.append(key.upper() + "_REQUIRED")
        if case.get("projectionVersion") != protocol.get("projectionVersion"):
            errors.append("PROJECTION_VERSION_MISMATCH")
        labels = case.get("labels")
        if not isinstance(labels, list) or len(labels) != 2 or not all(isinstance(label, dict) for label in labels):
            errors.append("TWO_LOCKED_LABELS_REQUIRED")
        else:
            if not reviewers_valid or not all(isinstance(label.get("reviewer"), str) for label in labels) or {label.get("reviewer") for label in labels} != set(reviewers):
                errors.append("ASSIGNED_REVIEWERS_REQUIRED")
            times = []
            for label in labels:
                if label.get("modelVisible") is not False:
                    errors.append("BLIND_LABEL_REQUIRED")
                if label.get("evidenceSha256") != case.get("evidenceSha256"):
                    errors.append("LABEL_EVIDENCE_BINDING_MISMATCH")
                if label.get("factsSupported") not in [True, False] or type(label.get("factsSupported")) is not bool or type(label.get("reviewRequired")) is not bool or label.get("disposition") not in ["REVIEW_REQUIRED", "DRIVER", "RIDER", "PLATFORM", "UNDETERMINED"]:
                    errors.append("CATEGORICAL_LABEL_REQUIRED")
                try:
                    times.append(timestamp(label.get("lockedAt")))
                except (ValueError, TypeError):
                    errors.append("LABEL_LOCK_TIME_REQUIRED")
            try:
                reveal = timestamp(case.get("modelRevealedAt"))
                if len(times) == 2 and max(times) >= reveal:
                    errors.append("LABELS_MUST_PRECEDE_MODEL_REVEAL")
                fields = ["factsSupported", "reviewRequired", "disposition"]
                if any(labels[0].get(k) != labels[1].get(k) for k in fields):
                    decision = case.get("adjudication")
                    if not isinstance(adjudicator, str) or not adjudicator.strip() or not isinstance(decision, dict) or decision.get("reviewer") != adjudicator or adjudicator in (reviewers or []):
                        errors.append("INDEPENDENT_ADJUDICATION_REQUIRED")
                    elif not isinstance(decision.get("reasonReference"), str) or not decision["reasonReference"].strip():
                        errors.append("ADJUDICATION_REASON_REQUIRED")
                    elif len(times) != 2 or not max(times) <= timestamp(decision.get("lockedAt")) < reveal:
                        errors.append("ADJUDICATION_MUST_PRECEDE_REVEAL")
            except (ValueError, TypeError):
                errors.append("REVEAL_OR_ADJUDICATION_TIME_REQUIRED")
        rows.append({"index": index, "synthetic": synthetic, "errors": sorted(set(errors))})
    real = [r for r in rows if not r["synthetic"]]
    return {"status": "PROCESS_EVIDENCE_COMPLETE_ONLY" if cases and not issues and not any(r["errors"] for r in rows) else "INCOMPLETE",
            "packetIssues": issues, "suppliedCaseCount": len(cases), "syntheticCaseCount": sum(r["synthetic"] for r in rows),
            "realCaseCount": len(real), "realCasesWithCompleteProcessEvidence": sum(not r["errors"] for r in real),
            "cases": rows, "realAccuracyCertified": False, "independenceAttested": False,
            "productionAuthorized": False, "productionDeletion": False}
