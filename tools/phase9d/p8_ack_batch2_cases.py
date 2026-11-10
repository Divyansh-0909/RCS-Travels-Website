"""Bounded Batch 2 candidate definitions and synthetic receipt probes."""
from copy import deepcopy

REQUIRED = ["schema", "custodian", "source", "sequence", "hash", "custodySequence", "receipt", "keyId", "outcome"]
CANDIDATES = [
    {"id": "ACK09-required-body", "line": 93,
     "guard": "NOT (b ?& ARRAY['schema','custodian','source','sequence','hash','custodySequence','receipt','keyId','outcome'])",
     "rationale": "New single-guard omission; all nine missing fields and a binding-only combination distinguish overlapping checks.",
     "overlap": "Constants, type/format checks and atomic source/sequence/hash comparisons remain intact; absence yields SQL NULL for ->>."},
    {"id": "ACK10-custody-sequence-format", "line": 96,
     "guard": "COALESCE(b->>'custodySequence','')!~'^[1-9][0-9]{0,14}$'",
     "rationale": "New format omission and canonical/boundary values, not a fabricated custody/local-sequence equality rule.",
     "overlap": "Required-body and all-string guards reject missing/NULL/numeric inputs; malformed strings can distinguish this guard."},
    {"id": "ACK11-receipt-format", "line": 97,
     "guard": "COALESCE(b->>'receipt','')!~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'",
     "rationale": "New canonical lowercase UUID-shape omission, preserving the existing syntax rather than adding UUID version/non-nil policy.",
     "overlap": "Required-body and all-string guards reject missing/NULL/numeric inputs."},
    {"id": "ACK12-signature-format", "line": 98,
     "guard": "COALESCE(r->>'signature','')!~'^[A-Za-z0-9+/]{86}==$'",
     "rationale": "New signature-shape omission; only local string syntax, never cryptographic validity.",
     "overlap": "Signature-type guard rejects missing/NULL/numeric values; malformed strings exercise the format predicate."},
    {"id": "ACK13-signature-type", "line": 90,
     "guard": "jsonb_typeof(r->'signature') IS DISTINCT FROM 'string'",
     "rationale": "New envelope signature presence/type omission, explicitly testing masking by remaining signature syntax.",
     "overlap": "COALESCE(text extraction,'') signature format rejects the selected missing/NULL/non-string representations."},
    {"id": "ACK14-body-object", "line": 90,
     "guard": "jsonb_typeof(r->'body') IS DISTINCT FROM 'object'",
     "rationale": "New envelope body presence/type omission; distinguish preserved rejection from changed exception behavior.",
     "overlap": "Missing body is caught by later constants; array/empty-object inputs retain other guards; scalar JSON operations may error."},
]


def probe(name, value, blocker=None):
    return {"name": name, "value": value, "blocker": blocker}


def field_value(receipt, key, value):
    result = deepcopy(receipt)
    result["body"][key] = value
    return result


def omit(receipt, key, root=False):
    result = deepcopy(receipt)
    if root:
        del result[key]
    else:
        del result["body"][key]
    return result


def cases(candidate, receipt):
    identity = candidate["id"]
    if identity == "ACK09-required-body":
        blockers = {
            "schema": "b->>'schema' IS DISTINCT FROM 'custody-receipt-v1'",
            "custodian": "b->>'custodian' IS DISTINCT FROM 'isolated-custody-v1'",
            "outcome": "b->>'outcome' IS DISTINCT FROM 'COMMITTED'",
            "source": "b->>'source'=expected_source", "sequence": "b->>'sequence'=expected_sequence", "hash": "b->>'hash'=expected_hash",
            "custodySequence": "COALESCE(b->>'custodySequence','')!~'^[1-9][0-9]{0,14}$'",
            "receipt": "COALESCE(b->>'receipt','')!~'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'",
            "keyId": "COALESCE(b->>'keyId','')!~'^[a-f0-9]{64}$'",
        }
        result = [probe("missing-" + key, omit(receipt, key), blockers[key]) for key in REQUIRED]
        empty = deepcopy(receipt)
        empty["body"] = {}
        result.append(probe("all-body-fields-missing", empty, blockers["schema"]))
        binding = deepcopy(receipt)
        for key in ["source", "sequence", "hash"]:
            del binding["body"][key]
        result.append(probe("all-three-event-bindings-missing", binding, blockers["source"]))
        return result
    if identity == "ACK10-custody-sequence-format":
        bad = ["", "0", "01", "-1", "+1", "1.0", "1e1", " 1", "1 ", "1" * 16]
        return [probe("string-" + str(i), field_value(receipt, "custodySequence", v)) for i, v in enumerate(bad)] + [
            probe("null", field_value(receipt, "custodySequence", None)), probe("missing", omit(receipt, "custodySequence")),
            probe("numeric", field_value(receipt, "custodySequence", 1))]
    if identity == "ACK11-receipt-format":
        bad = ["not-a-uuid", "", "ABCDEFAB-1234-1234-1234-ABCDEFABCDEF", "{abcdefab-1234-1234-1234-abcdefabcdef}", "a" * 32]
        return [probe("string-" + str(i), field_value(receipt, "receipt", v)) for i, v in enumerate(bad)] + [
            probe("null", field_value(receipt, "receipt", None)), probe("missing", omit(receipt, "receipt")),
            probe("numeric", field_value(receipt, "receipt", 7))]
    if identity == "ACK12-signature-format":
        bad = ["", "A" * 85 + "==", "A" * 87 + "==", "A" * 86 + "=", "!" * 86 + "==", None, 7]
        result = []
        for i, value in enumerate(bad):
            changed = deepcopy(receipt)
            changed["signature"] = value
            result.append(probe("value-" + str(i), changed))
        result.append(probe("missing-signature", omit(receipt, "signature", root=True)))
        return result
    if identity == "ACK13-signature-type":
        blocker = "COALESCE(r->>'signature','')!~'^[A-Za-z0-9+/]{86}==$'"
        result = [probe("missing-signature", omit(receipt, "signature", root=True), blocker)]
        for i, value in enumerate([None, 7, False, [], {}]):
            changed = deepcopy(receipt)
            changed["signature"] = value
            result.append(probe("non-string-" + str(i), changed, blocker))
        return result
    if identity == "ACK14-body-object":
        result = [probe("missing-body", omit(receipt, "body", root=True))]
        for i, value in enumerate([None, 7, False, "synthetic", [], {}]):
            changed = deepcopy(receipt)
            changed["body"] = value
            result.append(probe("body-type-" + str(i), changed))
        return result
    raise ValueError("KNOWN_CANDIDATE_REQUIRED")


def positive_cases(candidate, receipt):
    result = [deepcopy(receipt)]
    if candidate["id"] == "ACK10-custody-sequence-format":
        result.extend(field_value(receipt, "custodySequence", v) for v in ["17", "999999999999999"])
    elif candidate["id"] == "ACK11-receipt-format":
        result.append(field_value(receipt, "receipt", "00000000-0000-0000-0000-000000000000"))
    return result
