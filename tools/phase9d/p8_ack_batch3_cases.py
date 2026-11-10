"""Four remaining envelope/protocol guard omissions, without changing policy."""
from copy import deepcopy

CANDIDATES = [
    {"id": "ACK15-root-object", "line": 89, "guard": "jsonb_typeof(r) IS DISTINCT FROM 'object'",
     "rationale": "New root-object omission; distinguish SQL NULL, JSON scalar errors and remaining array/object rejection.",
     "overlap": "Body type and closed-envelope predicates remain. A scalar subtraction can expose an exception before later checks."},
    {"id": "ACK16-schema-constant", "line": 95, "guard": "b->>'schema' IS DISTINCT FROM 'custody-receipt-v1'",
     "rationale": "New schema constant omission; well-typed wrong values versus missing/NULL/non-string masks.",
     "overlap": "Required-field and all-string body predicates remain; event/source/hash predicates remain intact."},
    {"id": "ACK17-custodian-constant", "line": 95, "guard": "b->>'custodian' IS DISTINCT FROM 'isolated-custody-v1'",
     "rationale": "New custodian protocol constant omission; not a change to custody administration or key trust.",
     "overlap": "Required-field and all-string body predicates remain; this is the local verifier contract only."},
    {"id": "ACK18-outcome-constant", "line": 96, "guard": "b->>'outcome' IS DISTINCT FROM 'COMMITTED'",
     "rationale": "New COMMITTED outcome constant omission; no new operational or financial authority.",
     "overlap": "Required-field and all-string body predicates remain; no independent remote outcome is inferred."},
]


def probe(name, value, blocker=None, sql_null=False):
    return {"name": name, "value": value, "blocker": blocker, "sqlNull": sql_null}


def cases(candidate, receipt):
    identity = candidate["id"]
    if identity == "ACK15-root-object":
        body_type = "jsonb_typeof(r->'body') IS DISTINCT FROM 'object'"
        closed = "r-ARRAY['body','signature']<>'{}'::jsonb"
        return [probe("SQL-null-root", None, body_type, sql_null=True), probe("JSON-null-root", None),
                probe("numeric-root", 7), probe("boolean-root", False), probe("string-root", "synthetic"),
                probe("empty-array-root", [], closed), probe("array-root", [{}], closed), probe("empty-object-root", {}, body_type)]
    key, expected = {
        "ACK16-schema-constant": ("schema", "custody-receipt-v1"),
        "ACK17-custodian-constant": ("custodian", "isolated-custody-v1"),
        "ACK18-outcome-constant": ("outcome", "COMMITTED"),
    }[identity]
    result = []
    for i, value in enumerate(["", "unsupported-" + key, expected.swapcase()]):
        changed = deepcopy(receipt)
        changed["body"][key] = value
        result.append(probe("wrong-string-" + str(i), changed))
    missing = deepcopy(receipt)
    del missing["body"][key]
    required = "NOT (b ?& ARRAY['schema','custodian','source','sequence','hash','custodySequence','receipt','keyId','outcome'])"
    result.append(probe("missing-" + key, missing, required))
    for i, value in enumerate([None, 7, {}]):
        changed = deepcopy(receipt)
        changed["body"][key] = value
        result.append(probe("non-string-" + str(i), changed, "EXISTS(SELECT 1 FROM jsonb_each(b) WHERE jsonb_typeof(value) IS DISTINCT FROM 'string')"))
    return result


def positive_cases(candidate, receipt):
    return [deepcopy(receipt)]
