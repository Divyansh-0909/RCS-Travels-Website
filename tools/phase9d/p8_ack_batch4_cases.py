"""ACK row bindings: correlated argument/receipt seeds and remaining-guard controls."""
from copy import deepcopy

CANDIDATES = [
    {"id": "ACK19-stored-sequence", "line": 99, "guard": "WHERE seq=n AND", "replacement": "WHERE true AND",
     "rationale": "Omit only the retained-row sequence fence, keeping the receipt-to-argument sequence check.",
     "overlap": "A wrong argument alone is masked by body.sequence=n. Paired wrong values distinguish the row fence."},
    {"id": "ACK20-stored-hash", "line": 99, "guard": "AND hash=h AND", "replacement": "AND true AND",
     "rationale": "Omit only the retained-row hash fence, keeping the receipt-to-argument hash check.",
     "overlap": "A wrong argument alone is masked by body.hash=h. Paired wrong values distinguish the row fence."},
]


def cases(candidate, receipt, sentinel_sequence):
    sequence = int(receipt["body"]["sequence"])
    original_hash = receipt["body"]["hash"]
    result = []

    def add(name, accepted, *, call_sequence=sequence, call_hash=original_hash, body_key=None, body_value=None):
        value = deepcopy(receipt)
        if body_key is not None:
            value["body"][body_key] = body_value
        result.append({"name": name, "value": value, "callSequence": call_sequence, "callHash": call_hash,
                       "expectedMutantAccept": accepted})

    if candidate["id"] == "ACK19-stored-sequence":
        for name, number in [("nonexistent", sequence + 1000000), ("other-retained-event", sentinel_sequence),
                             ("zero", 0), ("negative", -1), ("bigint-maximum", 9223372036854775807)]:
            add("paired-" + name, True, call_sequence=number, body_key="sequence", body_value=str(number))
        add("SQL-null-sequence-argument", False, call_sequence=None)
        add("wrong-sequence-argument-only", False, call_sequence=sequence + 1000000)
        add("wrong-body-sequence-only", False, body_key="sequence", body_value=str(sequence + 1000000))
    else:
        wrong_hash = "0" * 64 if original_hash != "0" * 64 else "1" * 64
        for name, value in [("different-64-character", wrong_hash), ("empty", ""), ("noncanonical", "not-event-hash")]:
            add("paired-" + name, True, call_hash=value, body_key="hash", body_value=value)
        add("SQL-null-hash-argument", False, call_hash=None)
        add("wrong-hash-argument-only", False, call_hash=wrong_hash)
        add("wrong-body-hash-only", False, body_key="hash", body_value=wrong_hash)
        add("JSON-null-body-hash", False, body_key="hash", body_value=None)
    return result


def positive_cases(candidate, receipt):
    return [deepcopy(receipt)]
