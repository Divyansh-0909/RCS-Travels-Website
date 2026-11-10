"""P8: targeted ICR-1 omissions on disposable, profiler-free installations.

Only PostgreSQL's disposable catalog changes. Product SQL/migrations are inputs.
Synthetic receipts test the existing trusted-verifier SQL contract, not crypto.
"""
import argparse
import hashlib
import json
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres
from native_sql_metadata_fixture import FILES, catalog, install

MUTANTS = [
    ("ACK01-root-closed", "r-ARRAY['body','signature']<>'{}'::jsonb", "false", "root-extra"),
    ("ACK02-body-closed", "b-ARRAY['schema','custodian','source','sequence','hash','custodySequence','receipt','keyId','outcome']<>'{}'::jsonb", "false", "body-extra"),
    ("ACK03-body-string-types", "EXISTS(SELECT 1 FROM jsonb_each(b) WHERE jsonb_typeof(value) IS DISTINCT FROM 'string')", "false", "numeric-sequence"),
    ("ACK04-event-hash", "b->>'hash'=h", "true", "wrong-hash"),
    ("ACK05-event-sequence", "b->>'sequence'=n::text", "true", "wrong-sequence"),
    ("ACK06-event-source", "b->>'source'=event->>'source'", "true", "wrong-source"),
    ("ACK07-key-id-syntax", "COALESCE(b->>'keyId','')!~'^[a-f0-9]{64}$'", "false", "invalid-key-id"),
    ("ACK08-receipt-immutable", "(receipt IS NULL OR receipt=r)", "true", "conflicting-receipt"),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="output/phase9d-p8-lineage-2026-10-23")
    args = parser.parse_args()
    out = (ROOT / args.output).resolve()
    if not out.is_relative_to(ROOT / "output"):
        raise ValueError("OWNED_OUTPUT_REQUIRED")
    out.mkdir(exist_ok=True)
    if (out / "witness.json").exists():
        raise ValueError("FRESH_WITNESS_REQUIRED")
    inputs = [Path(__file__), ROOT / "tools/phase9d/native_sql_metadata_fixture.py", ROOT / "tools/backups/native_postgres.py"]
    inputs += [ROOT / "tools/phase9d" / name for name in FILES]
    pins = {str(path.relative_to(ROOT)): digest(path.read_bytes()) for path in inputs}
    witness = {"schema": "phase9d-p8-lineage-omissions-v1", "status": "FAIL", "startedUtc": datetime.now(timezone.utc).isoformat(),
               "sourceHashes": pins, "p8": "STARTED", "profiling": False, "docker": False,
               "routineReplacementMutations": True, "compositions": [], "checks": [],
               "trustBoundary": "Synthetic well-shaped receipts from the actual authorized verifier; no cryptographic or independent-custody claim"}

    def check(name, actual, expected=True):
        accepted = actual == expected
        witness["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": accepted})
        if not accepted:
            raise AssertionError(name)

    def target_catalog(c):
        return next(row for row in catalog(c)["routines"] if row["schema"] == "custody_lineage" and row["name"] == "ack")

    def row_state(c, sequence):
        return c.execute("SELECT seq,event,hash,status,attempts,receipt FROM custody_lineage.events WHERE seq=%s", (sequence,)).fetchone()

    def body_for(event, sequence, event_hash):
        return {"body": {"schema": "custody-receipt-v1", "custodian": "isolated-custody-v1", "source": event["source"],
                         "sequence": str(sequence), "hash": event_hash, "custodySequence": "1", "receipt": str(uuid.uuid4()),
                         "keyId": "a" * 64, "outcome": "COMMITTED"}, "signature": "A" * 86 + "=="}

    def seed_for(label, receipt, sequence):
        seed = deepcopy(receipt)
        if label == "root-extra":
            seed["unexpected"] = "synthetic"
        elif label == "body-extra":
            seed["body"]["unexpected"] = "synthetic"
        elif label == "numeric-sequence":
            seed["body"]["sequence"] = sequence
        elif label == "wrong-hash":
            seed["body"]["hash"] = "0" * 64
        elif label == "wrong-sequence":
            seed["body"]["sequence"] = str(sequence + 1000)
        elif label == "wrong-source":
            seed["body"]["source"] = str(uuid.uuid4())
        elif label == "invalid-key-id":
            seed["body"]["keyId"] = "not-a-key-id"
        elif label == "conflicting-receipt":
            seed["body"]["receipt"] = str(uuid.uuid4())
        else:
            raise ValueError("KNOWN_SEED_REQUIRED")
        return seed

    def replace(c, definition):
        with c.transaction():
            c.execute("SET LOCAL ROLE shadow9d_owner")
            c.execute(definition, prepare=False)

    try:
        for kind in ["source", "receiver"]:
            server = NativePostgres()
            record = {"installation": kind, "mutants": [], "stopped": False}
            witness["compositions"].append(record)
            try:
                with server:
                    record["environment"] = server.identity
                    with server.connect(autocommit=True) as owner:
                        passwords = install(owner, kind)
                        original_catalog = catalog(owner)
                        original = target_catalog(owner)
                        definition = original["definition"]
                        record["catalogBefore"] = original_catalog
                        record["targetBefore"] = original
                        profiler = owner.execute("SELECT current_setting('shared_preload_libraries'),current_setting('session_preload_libraries'),"
                                                 "current_setting('local_preload_libraries'),EXISTS(SELECT FROM pg_extension WHERE extname='plpgsql_check'),"
                                                 "(SELECT count(*) FROM pg_settings WHERE name LIKE 'plpgsql_check.%')").fetchone()
                        record["profilerAbsence"] = profiler
                        check(kind + ":profiler-not-loaded", profiler, ("", "", "", False, 0))
                        with server.connect(user="custody_lineage_verifier", password=passwords["custody_lineage_verifier"], autocommit=True) as verifier:
                            role = verifier.execute("SELECT session_user,current_user,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=session_user").fetchone()
                            record["verifierIdentity"] = role
                            check(kind + ":real-restricted-verifier", role, ("custody_lineage_verifier", "custody_lineage_verifier", False, False, False, False, False))
                            check(kind + ":no-direct-table-update", verifier.execute("SELECT has_table_privilege(current_user,'custody_lineage.events','UPDATE')").fetchone()[0], False)
                            for identity, needle, replacement, label in MUTANTS:
                                case = {"id": identity, "seedKind": label, "classification": "NOT_RUN"}
                                record["mutants"].append(case)
                                with owner.transaction():
                                    owner.execute("SET LOCAL ROLE shadow9d_owner")
                                    sequence = owner.execute("SELECT custody_lineage.emit('LOCAL_AUDIT',%s,NULL,%s,'trusted_p8_fixture')",
                                                             (kind + ":" + identity, Jsonb({"id": str(uuid.uuid4()), "action": "SYNTHETIC_P8"}))).fetchone()[0]
                                state = row_state(owner, sequence)
                                receipt = body_for(state[1], sequence, state[2])
                                seed = seed_for(label, receipt, sequence)
                                case.update(sequence=sequence, event=state[1], eventHash=state[2], positiveReceipt=receipt, invalidSeed=seed)

                                def acknowledge(value, n=sequence, h=state[2]):
                                    return verifier.execute("SELECT custody_lineage.ack(%s,%s,%s)", (n, h, Jsonb(value))).fetchone()[0]

                                # Positive control and duplicate checks are rolled back; no seed can
                                # be called a killed mutant because the original rejects all input.
                                with verifier.transaction(force_rollback=True):
                                    check(kind + ":" + identity + ":positive", acknowledge(receipt))
                                    accepted = row_state(owner, sequence)  # owner's connection sees committed pending state
                                    check(kind + ":" + identity + ":other-session-no-uncommitted-ack", accepted, state)
                                    check(kind + ":" + identity + ":duplicate", acknowledge(deepcopy(receipt)))
                                    check(kind + ":" + identity + ":conflict", acknowledge(seed_for("conflicting-receipt", receipt, sequence)), False)
                                check(kind + ":" + identity + ":positive-rollback", row_state(owner, sequence), state)
                                if label == "conflicting-receipt":
                                    check(kind + ":" + identity + ":setup-accepted-history", acknowledge(receipt))
                                    state = row_state(owner, sequence)
                                check(kind + ":" + identity + ":baseline-rejects-seed", acknowledge(seed), False)
                                check(kind + ":" + identity + ":baseline-no-write", row_state(owner, sequence), state)
                                case["baselineRejected"] = True
                                check(kind + ":" + identity + ":one-guard-identity", definition.count(needle), 1)
                                mutated = definition.replace(needle, replacement, 1)
                                filename = kind + "-" + identity + ".sql"
                                (out / filename).write_text(mutated, encoding="utf-8", newline="\n")
                                case.update(originalDefinitionSha256=digest(definition.encode()), mutantDefinitionSha256=digest(mutated.encode()),
                                            mutantFile=filename, removedGuard=needle, replacement=replacement)
                                try:
                                    replace(owner, mutated)
                                    installed = target_catalog(owner)
                                    check(kind + ":" + identity + ":installed-mutant", installed["definitionSha256"], case["mutantDefinitionSha256"])
                                    check(kind + ":" + identity + ":mutant-metadata", {k: v for k, v in installed.items() if k not in ["definition", "definitionSha256"]},
                                          {k: v for k, v in original.items() if k not in ["definition", "definitionSha256"]})
                                    # The verifier has no SELECT grant. Commit its ACK, then
                                    # observe actual persisted values through the fixture owner.
                                    actual = acknowledge(seed)
                                    observed = row_state(owner, sequence)
                                    case.update(mutantReply=actual, observedStatus=observed[3], observedReceipt=observed[5])
                                    case["classification"] = "KILLED" if actual is True and observed[3] == "ACKED" and observed[5] == seed else "SURVIVED_OR_ERROR"
                                    check(kind + ":" + identity + ":contract-observes-mutant", case["classification"], "KILLED")
                                finally:
                                    replace(owner, definition)
                                    restored = target_catalog(owner)
                                    case["restored"] = restored == original
                                    check(kind + ":" + identity + ":exact-definition-and-metadata-restored", restored, original)
                                # The mutated synthetic row is discarded only in this fresh fixture;
                                # restore its exact pre-probe values to retest the original rejection.
                                owner.execute("UPDATE custody_lineage.events SET status=%s,receipt=%s WHERE seq=%s", (state[3], Jsonb(state[5]) if state[5] is not None else None, sequence))
                                check(kind + ":" + identity + ":original-rejects-after-restore", acknowledge(seed), False)
                                check(kind + ":" + identity + ":exact-row-restored", row_state(owner, sequence), state)
                        record["catalogAfter"] = catalog(owner)
                        check(kind + ":full-catalog-restored", record["catalogAfter"], original_catalog)
            finally:
                record["stopped"] = server.stopped
                record["pidFileExists"] = (server.data / "postmaster.pid").exists()
            check(kind + ":owned-server-stopped", record["stopped"] and not record["pidFileExists"])
        witness["status"] = "PASS"
    except Exception as error:
        witness["error"] = {"class": type(error).__name__, "sqlstate": getattr(error, "sqlstate", None),
                            "message": str(error)[:250] if isinstance(error, AssertionError) else "DETAILS_IN_PRIVATE_SYNTHETIC_LOGS"}
        raise
    finally:
        witness["sourcesUnchanged"] = all(digest((ROOT / name).read_bytes()) == value for name, value in pins.items())
        witness["finishedUtc"] = datetime.now(timezone.utc).isoformat()
        witness["counts"] = {"assertions": len(witness["checks"]), "passed": sum(c["pass"] for c in witness["checks"]),
                              "mutants": sum(len(c["mutants"]) for c in witness["compositions"]),
                              "killed": sum(m["classification"] == "KILLED" for c in witness["compositions"] for m in c["mutants"])}
        (out / "witness.json").write_text(json.dumps(witness, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"status": witness["status"], "counts": witness["counts"], "sourcesUnchanged": witness["sourcesUnchanged"]}))


if __name__ == "__main__":
    main()
