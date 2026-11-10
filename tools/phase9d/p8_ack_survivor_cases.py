"""Executable partitions supporting review of two existing ACK survivors."""
from copy import deepcopy

REQUIRED = ["schema", "custodian", "source", "sequence", "hash", "custodySequence", "receipt", "keyId", "outcome"]
CANDIDATES = [
    {"id": "ACK09-required-body", "guard": "NOT (b ?& ARRAY['schema','custodian','source','sequence','hash','custodySequence','receipt','keyId','outcome'])",
     "priorRuntimeClassification": "SURVIVED", "proof": "Every missing key has an independent total rejection or UNKNOWN row comparison."},
    {"id": "ACK13-signature-type", "guard": "jsonb_typeof(r->'signature') IS DISTINCT FROM 'string'",
     "priorRuntimeClassification": "SURVIVED", "proof": "Non-string JSONB text projections cannot end with == as required by the retained anchored format."},
]

BLOCKERS = {
    "schema": "b->>'schema' IS DISTINCT FROM 'custody-receipt-v1'",
    "custodian": "b->>'custodian' IS DISTINCT FROM 'isolated-custody-v1'",
    "outcome": "b->>'outcome' IS DISTINCT FROM 'COMMITTED'",
    "custodySequence": "COALESCE(b->>'custodySequence','')!~'^[1-9][0-9]{0,14}$'",
    "receipt": "COALESCE(b->>'receipt','')!~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'",
    "keyId": "COALESCE(b->>'keyId','')!~'^[a-f0-9]{64}$'",
    "source": "b->>'source'=expected_source", "sequence": "b->>'sequence'=expected_sequence", "hash": "b->>'hash'=expected_hash",
}
SIGNATURE_FORMAT = "COALESCE(r->>'signature','')!~'^[A-Za-z0-9+/]{86}==$'"


def cases(candidate, receipt):
    result = []
    if candidate["id"] == "ACK09-required-body":
        for mask in range(1, 1 << len(REQUIRED)):
            missing = [key for i, key in enumerate(REQUIRED) if mask & (1 << i)]
            changed = deepcopy(receipt)
            for key in missing:
                del changed["body"][key]
            blocker_key = next(key for key in BLOCKERS if key in missing)
            result.append({"name": "missing-mask-" + str(mask), "value": changed, "sqlNull": False,
                           "missing": missing, "blockerKey": blocker_key, "blocker": BLOCKERS[blocker_key]})
        assert len(result) == 511 and len({tuple(p["missing"]) for p in result}) == 511
    else:
        missing = deepcopy(receipt)
        del missing["signature"]
        result.append({"name": "absent-signature", "value": missing, "sqlNull": False, "blocker": SIGNATURE_FORMAT})
        valid = receipt["signature"]
        values = [None, False, True, 0, -1, 10**87, 0.5, 1e100, [], [valid], [None], {},
                  {"signature": valid}, {"nested": {"x": valid}}, "", "A" * 85 + "==", "A" * 86 + "=", "!" * 86 + "==", "signature-\u7b7e\u540d"]
        for i, value in enumerate(values):
            changed = deepcopy(receipt)
            changed["signature"] = value
            result.append({"name": "signature-projection-" + str(i), "value": changed, "sqlNull": False, "blocker": SIGNATURE_FORMAT})
    return result


def positive_cases(candidate, receipt):
    result = [deepcopy(receipt)]
    if candidate["id"] == "ACK13-signature-type":
        other = deepcopy(receipt)
        other["signature"] = "/" * 86 + "=="
        result.append(other)
    return result
