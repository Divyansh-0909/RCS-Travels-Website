"""Batch 4: two retained-row ACK guard omissions, two sequential unprofiled installations."""
import hashlib
import json
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres
from native_sql_metadata_fixture import FILES, catalog, install
from p8_ack_batch4_cases import CANDIDATES, cases, positive_cases

OUT = ROOT / "output/phase9d-p8-batch4-2026-10-31"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def state(c, sequence):
    return c.execute("SELECT seq,event,hash,status,attempts,receipt FROM custody_lineage.events WHERE seq=%s", (sequence,)).fetchone()


def queue(c):
    return c.execute("SELECT seq,event,hash,status,attempts,receipt FROM custody_lineage.events ORDER BY seq").fetchall()


def state_hash(row):
    return sha(json.dumps(row, sort_keys=True, default=str).encode())


def target(c):
    return next(r for r in catalog(c)["routines"] if r["schema"] == "custody_lineage" and r["name"] == "ack")


def replace(c, definition):
    with c.transaction():
        c.execute("SET LOCAL ROLE shadow9d_owner")
        c.execute(definition, prepare=False)


def main():
    if (OUT / "witness.json").exists():
        raise RuntimeError("FRESH_WITNESS_REQUIRED")
    inputs = [Path(__file__), ROOT / "tools/phase9d/p8_ack_batch4_cases.py", ROOT / "tools/phase9d/native_sql_metadata_fixture.py", ROOT / "tools/backups/native_postgres.py"]
    inputs += [ROOT / "tools/phase9d" / name for name in FILES]
    pins = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in inputs}
    witness = {"status": "FAIL", "startedUtc": datetime.now(timezone.utc).isoformat(), "sourceHashes": pins,
               "profiling": False, "docker": False, "p8": "STARTED_PARTIAL", "compositions": [], "checks": [],
               "boundary": "Synthetic local verifier contract; no signature, remote-custody, native-counter or whole-SQL claim"}

    def check(name, actual, expected=True):
        passed = actual == expected
        witness["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": passed})
        if not passed:
            raise AssertionError(name)

    try:
        for kind in ["source", "receiver"]:
            server = NativePostgres()
            record = {"installation": kind, "fixtureOwner": server.owner, "mutants": [], "stopped": False}
            witness["compositions"].append(record)
            ledger = [{"owner": c["fixtureOwner"], "data": str(server.root.parent / c["fixtureOwner"] / "data")} for c in witness["compositions"]]
            (OUT / "owned-servers.json").write_text(json.dumps(ledger, indent=2), encoding="utf-8")
            try:
                with server:
                    record["environment"] = server.identity
                    with server.connect(autocommit=True) as owner:
                        passwords = install(owner, kind)
                        before = catalog(owner)
                        original = target(owner)
                        definition = original["definition"]
                        record.update(catalogBefore=before, targetBefore=original)
                        check(kind + ":accepted-definition", original["definitionSha256"], "f2fa584c01c16ce4ac1e15c8c4f77ffcd85c3f98f08f4076ba522f8a7ecf25c9")
                        profiling = owner.execute("SELECT current_setting('shared_preload_libraries'),current_setting('session_preload_libraries'),current_setting('local_preload_libraries'),"
                                                  "EXISTS(SELECT FROM pg_extension WHERE extname='plpgsql_check'),(SELECT count(*) FROM pg_settings WHERE name LIKE 'plpgsql_check.%')").fetchone()
                        record["profilerAbsence"] = profiling
                        check(kind + ":profiler-absent", profiling, ("", "", "", False, 0))
                        with server.connect(user="custody_lineage_verifier", password=passwords["custody_lineage_verifier"], autocommit=True) as verifier:
                            role = verifier.execute("SELECT session_user,current_user,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=session_user").fetchone()
                            record["verifierIdentity"] = role
                            check(kind + ":restricted-verifier", role, ("custody_lineage_verifier", "custody_lineage_verifier", False, False, False, False, False))
                            check(kind + ":no-direct-update", verifier.execute("SELECT has_table_privilege(current_user,'custody_lineage.events','UPDATE')").fetchone()[0], False)
                            for candidate in CANDIDATES:
                                identity = candidate["id"]
                                prefix = kind + ":" + identity
                                result = {**candidate, "classification": "NOT_RUN", "probes": [], "positiveControls": []}
                                record["mutants"].append(result)
                                with owner.transaction():
                                    owner.execute("SET LOCAL ROLE shadow9d_owner")
                                    sequence = owner.execute("SELECT custody_lineage.emit('LOCAL_AUDIT',%s,NULL,%s,'trusted_p8_batch4_fixture')",
                                                             (prefix, Jsonb({"id": str(uuid.uuid4()), "action": "SYNTHETIC_P8_BATCH4"}))).fetchone()[0]
                                    sentinel_sequence = owner.execute("SELECT custody_lineage.emit('LOCAL_AUDIT',%s,NULL,%s,'trusted_p8_batch4_fixture')",
                                                                      (prefix + ":sentinel", Jsonb({"id": str(uuid.uuid4()), "action": "SYNTHETIC_UNTOUCHED_SENTINEL"}))).fetchone()[0]
                                pending = state(owner, sequence)
                                original_queue = queue(owner)
                                receipt = {"body": {"schema": "custody-receipt-v1", "custodian": "isolated-custody-v1", "source": pending[1]["source"],
                                                    "sequence": str(sequence), "hash": pending[2], "custodySequence": "1", "receipt": str(uuid.uuid4()),
                                                    "keyId": "a" * 64, "outcome": "COMMITTED"}, "signature": "A" * 86 + "=="}
                                probes = cases(candidate, receipt, sentinel_sequence)
                                result.update(sequence=sequence, event=pending[1], positiveReceipt=receipt, originalStateHash=state_hash(pending), sentinelSequence=sentinel_sequence, originalQueueHash=state_hash(original_queue))

                                def acknowledge(value, n=sequence, h=pending[2]):
                                    try:
                                        reply = verifier.execute("SELECT custody_lineage.ack(%s,%s,%s)", (n, h, Jsonb(value))).fetchone()[0]
                                        return {"kind": "return", "value": reply}
                                    except psycopg.Error as error:
                                        # SQL input errors are observations. Timeout, termination and
                                        # connection failures stop this job and are never killed mutants.
                                        if error.sqlstate != "22023":
                                            raise
                                        return {"kind": "sql_error", "sqlstate": error.sqlstate}

                                def reset_row(n=sequence, row=pending):
                                    owner.execute("UPDATE custody_lineage.events SET status=%s,receipt=%s WHERE seq=%s", (row[3], None, n))

                                for i, positive in enumerate(positive_cases(candidate, receipt)):
                                    check(prefix + ":positive:" + str(i), acknowledge(positive), {"kind": "return", "value": True})
                                    accepted = state(owner, sequence)
                                    check(prefix + ":positive-persisted:" + str(i), (accepted[3], accepted[5]), ("ACKED", positive))
                                    check(prefix + ":duplicate:" + str(i), acknowledge(deepcopy(positive)), {"kind": "return", "value": True})
                                    check(prefix + ":duplicate-stable:" + str(i), state(owner, sequence), accepted)
                                    expected_queue = [accepted if row[0] == sequence else row for row in original_queue]
                                    check(prefix + ":positive-only-target:" + str(i), queue(owner), expected_queue)
                                    result["positiveControls"].append({"receipt": positive, "persistedStateHash": state_hash(accepted)})
                                    reset_row()
                                    check(prefix + ":positive-fixture-reset:" + str(i), state_hash(state(owner, sequence)), state_hash(pending))
                                for probe in probes:
                                    observation = {**probe, "baseline": acknowledge(probe["value"], n=probe["callSequence"], h=probe["callHash"])}
                                    check(prefix + ":baseline:" + probe["name"], observation["baseline"], {"kind": "return", "value": False})
                                    check(prefix + ":baseline-no-write:" + probe["name"], state_hash(queue(owner)), state_hash(original_queue))
                                    truths = owner.execute("""SELECT jsonb_build_object(
                                        'rowSequenceEqualsArgument',seq=%s::bigint,'rowHashEqualsArgument',hash=%s::text,
                                        'bodySequenceEqualsArgument',%s::jsonb->'body'->>'sequence'=%s::bigint::text,
                                        'bodyHashEqualsArgument',%s::jsonb->'body'->>'hash'=%s::text,
                                        'bodySourceEqualsEvent',%s::jsonb->'body'->>'source'=event->>'source')
                                        FROM custody_lineage.events WHERE seq=%s""",
                                        (probe["callSequence"], probe["callHash"], Jsonb(probe["value"]), probe["callSequence"],
                                         Jsonb(probe["value"]), probe["callHash"], Jsonb(probe["value"]), sequence)).fetchone()[0]
                                    observation["predicateTruths"] = truths
                                    if probe["expectedMutantAccept"]:
                                        dropped = "rowSequenceEqualsArgument" if identity == "ACK19-stored-sequence" else "rowHashEqualsArgument"
                                        check(prefix + ":discriminating-row-fence:" + probe["name"], truths[dropped], False)
                                        check(prefix + ":other-bindings-match:" + probe["name"], all(value is True for key, value in truths.items() if key != dropped))
                                    result["probes"].append(observation)
                                check(prefix + ":one-guard", definition.count(candidate["guard"]), 1)
                                mutated = definition.replace(candidate["guard"], candidate["replacement"], 1)
                                path = OUT / (kind + "-" + identity + ".sql")
                                path.write_text(mutated, encoding="utf-8", newline="\n")
                                result.update(mutantFile=path.name, originalDefinitionSha256=sha(definition.encode()), mutantDefinitionSha256=sha(mutated.encode()))
                                try:
                                    replace(owner, mutated)
                                    installed = target(owner)
                                    check(prefix + ":installed-mutant", installed["definitionSha256"], result["mutantDefinitionSha256"])
                                    check(prefix + ":metadata-preserved", {k: v for k, v in installed.items() if k not in ["definition", "definitionSha256"]},
                                          {k: v for k, v in original.items() if k not in ["definition", "definitionSha256"]})
                                    for observation in result["probes"]:
                                        reply = acknowledge(observation["value"], n=observation["callSequence"], h=observation["callHash"])
                                        check(prefix + ":expected-mutant-reply:" + observation["name"], reply, {"kind": "return", "value": observation["expectedMutantAccept"]})
                                        persisted = state(owner, sequence)
                                        observation.update(mutantReply=reply, observedStateHash=state_hash(persisted), observedStatus=persisted[3], observedReceipt=persisted[5], observedQueueHash=state_hash(queue(owner)))
                                        violation = reply != {"kind": "return", "value": False}
                                        observation["contractViolation"] = violation
                                        if reply == {"kind": "return", "value": True}:
                                            check(prefix + ":mutant-persisted:" + observation["name"], (persisted[3], persisted[5]), ("ACKED", observation["value"]))
                                            expected_queue = [persisted if row[0] == sequence else row for row in original_queue]
                                            check(prefix + ":mutant-only-target:" + observation["name"], queue(owner), expected_queue)
                                        else:
                                            check(prefix + ":mutant-no-write:" + observation["name"], state_hash(queue(owner)), state_hash(original_queue))
                                        reset_row()
                                        check(prefix + ":mutant-fixture-reset:" + observation["name"], state_hash(queue(owner)), state_hash(original_queue))
                                    killed = any(p["contractViolation"] for p in result["probes"])
                                    result["classification"] = "KILLED" if killed else "SURVIVED"
                                    result["analysis"] = "REDUNDANT/MASKED_ON_TESTED_INPUTS" if not killed and all("blockerSqlTruth" in p for p in result["probes"]) else "OBSERVED_CONTRACT_DIVERGENCE" if killed else "UNRESOLVED"
                                    result["equivalentClaim"] = False
                                finally:
                                    replace(owner, definition)
                                    result["restored"] = target(owner) == original
                                    check(prefix + ":exact-restoration", target(owner), original)
                                for observation in result["probes"]:
                                    restored_reply = acknowledge(observation["value"], n=observation["callSequence"], h=observation["callHash"])
                                    observation["restoredReply"] = restored_reply
                                    check(prefix + ":restored-rejects:" + observation["name"], restored_reply, {"kind": "return", "value": False})
                                    check(prefix + ":restored-row:" + observation["name"], state_hash(queue(owner)), state_hash(original_queue))
                        record["catalogAfter"] = catalog(owner)
                        check(kind + ":full-catalog-restored", record["catalogAfter"], before)
            finally:
                record.update(stopped=server.stopped, pidFileExists=(server.data / "postmaster.pid").exists())
            check(kind + ":owned-server-stopped", record["stopped"] and not record["pidFileExists"])
        witness["status"] = "PASS"
    except Exception as error:
        witness["error"] = {"class": type(error).__name__, "sqlstate": getattr(error, "sqlstate", None),
                            "message": str(error)[:240] if isinstance(error, AssertionError) else "DETAILS_WITHHELD_PRIVATE_SYNTHETIC_LOGS"}
        raise
    finally:
        mutants = [m for c in witness["compositions"] for m in c["mutants"]]
        witness["counts"] = {"assertions": len(witness["checks"]), "passed": sum(c["pass"] for c in witness["checks"]),
                              "mutantInstances": len(mutants), "killed": sum(m["classification"] == "KILLED" for m in mutants),
                              "survived": sum(m["classification"] == "SURVIVED" for m in mutants),
                              "maskedOnTestedInputs": sum(m.get("analysis") == "REDUNDANT/MASKED_ON_TESTED_INPUTS" for m in mutants),
                              "probeInstances": sum(len(m["probes"]) for m in mutants),
                              "mutantSqlInputErrors": sum(p.get("mutantReply", {}).get("kind") == "sql_error" for m in mutants for p in m["probes"])}
        witness["sourcesUnchanged"] = all(sha((ROOT / n).read_bytes()) == h for n, h in pins.items())
        witness["finishedUtc"] = datetime.now(timezone.utc).isoformat()
        (OUT / "witness.json").write_text(json.dumps(witness, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"status": witness["status"], "counts": witness["counts"], "sourcesUnchanged": witness["sourcesUnchanged"]}))


if __name__ == "__main__":
    main()
