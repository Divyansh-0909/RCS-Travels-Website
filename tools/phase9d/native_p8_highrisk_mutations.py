"""Eight focused high-risk omissions on two fresh sequential unprofiled servers.

All database handles come from NativePostgres. Snapshot rows (including synthetic
bootstrap secrets) stay in memory; witnesses contain public observations/hashes.
"""
import base64
import hashlib
import hmac
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
from native_postgres import NativePostgres
from native_sql_metadata_fixture import FILES, catalog, install
from p8_highrisk_cases import CANDIDATES

OUT = ROOT / "output/phase9d-p8-final-review-2026-10-31/verified"
FROZEN = "e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75"
NAMESPACES = ["shadow9d", "audit9d", "outbox9d", "transport9d", "broker9d", "custody_export", "custody_lineage", "custody"]


def sha(value):
    return hashlib.sha256(value).hexdigest()


def fingerprint(value):
    return sha(json.dumps(value, sort_keys=True, default=str).encode())


def snapshot(c):
    relations = c.execute("SELECT n.nspname,r.relname,r.relkind FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=ANY(%s) AND r.relkind IN('r','S') ORDER BY 1,2", (NAMESPACES,)).fetchall()
    tables, sequences = [], []
    for schema, name, kind in relations:
        identity = sql.Identifier(schema, name)
        if kind == "r":
            rows = c.execute(sql.SQL("SELECT to_jsonb(t) FROM {} t ORDER BY to_jsonb(t)::text").format(identity)).fetchall()
            tables.append({"schema": schema, "name": name, "rows": [r[0] for r in rows]})
        else:
            last, called = c.execute(sql.SQL("SELECT last_value,is_called FROM {}").format(identity)).fetchone()
            sequences.append({"schema": schema, "name": name, "last": last, "called": called})
    return {"tables": tables, "sequences": sequences}


def restore(c, saved):
    # Bootstrap controller only; this is the newly owned database, not a service
    # grant or a global server setting. Restore exact rows with capture disabled.
    with c.transaction():
        c.execute("SET LOCAL session_replication_role='replica'")
        identities = [sql.Identifier(t["schema"], t["name"]) for t in saved["tables"]]
        c.execute(sql.SQL("TRUNCATE {} RESTART IDENTITY").format(sql.SQL(",").join(identities)))
        for table in saved["tables"]:
            identity = sql.Identifier(table["schema"], table["name"])
            for row in table["rows"]:
                c.execute(sql.SQL("INSERT INTO {} OVERRIDING SYSTEM VALUE SELECT (jsonb_populate_record(NULL::{},%s)).*").format(identity, identity), (Jsonb(row),))
        for seq in saved["sequences"]:
            c.execute("SELECT setval(%s::regclass,%s,%s)", (seq["schema"] + "." + seq["name"], seq["last"], seq["called"]))
    if c.execute("SHOW session_replication_role").fetchone()[0] != "origin" or snapshot(c) != saved:
        raise AssertionError("EXACT_SYNTHETIC_ROW_SEQUENCE_RESTORE_FAILED")


def target(c, candidate):
    return next(r for r in catalog(c)["routines"] if r["schema"] == candidate["schema"] and r["name"] == candidate["name"])


def replace(c, original, definition):
    with c.transaction():
        c.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(original["owner"])))
        c.execute(definition, prepare=False)


def invoke(c, statement, args=()):
    try:
        return {"kind": "return", "value": c.execute(statement, args).fetchone()[0]}
    except psycopg.Error as error:
        if error.sqlstate != "23514":
            raise
        return {"kind": "sql_error", "sqlstate": error.sqlstate}


def public_keys():
    code = """const {generateKeyPairSync,createHash}=require('node:crypto');
const keys=Array.from({length:3},()=>{const {publicKey}=generateKeyPairSync('ed25519');
const der=publicKey.export({type:'spki',format:'der'});return {id:createHash('sha256').update(der).digest('hex'),pem:publicKey.export({type:'spki',format:'pem'})};});
process.stdout.write(JSON.stringify({node:process.version,keys}));"""
    return json.loads(subprocess.check_output(["node", "-e", code], text=True, timeout=15))


def setup(owner, clients, candidate, keys):
    identity = candidate["id"]
    context = {"id": identity, "keys": keys}
    if candidate["installation"] == "custodian":
        owner.execute("INSERT INTO custody.keys VALUES(%s,%s,1,'ACTIVE')", (keys[0]["id"], keys[0]["pem"]))
        source, secret = str(uuid.uuid4()), uuid.uuid4().hex * 2
        owner.execute("INSERT INTO custody.sources(source,verification_secret,service) VALUES(%s,%s,'source-lineage-v2')", (source, secret))
        event = {"schema": "custody-event-v2", "source": source, "service": "source-lineage-v2", "database": "a" * 64,
                 "sequence": "1", "previous": "0" * 64, "localId": "1", "sourceHash": "b" * 64, "identityHash": "c" * 64,
                 "ownerHash": None, "action": "LOCAL_AUDIT", "actor": "application_transaction", "request": None, "attempt": None,
                 "evidenceHash": None, "evidenceVersion": None, "receipt": None, "configuration": None, "generation": None,
                 "frozen": FROZEN, "observed": "2026-10-23T00:00:00.000Z"}

        def frame(value):
            canonical = owner.execute("SELECT custody.serialize(%s)", (Jsonb(value),)).fetchone()[0]
            mac = hmac.new(secret.encode(), ("custody-source-v1\n" + canonical).encode(), hashlib.sha256).hexdigest()
            return {"event": value, "mac": mac}

        context.update(source=source, goodFrame=frame(event))
        if identity == "KEY02-unsigned-retirement":
            body = clients["custody_ingest"].execute("SELECT custody.ingest(%s)", (Jsonb(context["goodFrame"]),)).fetchone()[0]
            context["receipt"] = body["receipt"]
        if identity == "ACCEPT01-enrolled-service":
            changed = dict(event, service="receiver-lineage-v2")
            context["badFrame"] = frame(changed)
        return context
    if identity == "JOURNAL01-rejected-binding":
        owner.execute("UPDATE shadow9d.control SET stopped=false")
        snap = {"caseId": "a" * 64, "bookingId": "b" * 64, "caseType": "DRIVER_CANCELLATION", "evidenceVersion": "responsibility-evidence-v1",
                "scheduledAt": None, "occurredAt": None, "generatedAt": "2026-10-23T00:00:00.000Z", "timeline": [],
                "completeness": {"requiredCategories": [], "complete": False, "missing": [], "unavailable": []}, "contradictions": []}
        digest = owner.execute("SELECT encode(sha256(convert_to(transport9d.serialize(%s),'UTF8')),'hex')", (Jsonb({k: v for k, v in snap.items() if k != "generatedAt"}),)).fetchone()[0]
        payload = {"schema": "shadow-export-v1", "projection": "shadow-minimized-v1", "config": "inactive-isolated-export-v1", "collector": "phase7-committed-journal-v1",
                   "frozenV5": FROZEN, "key": "d" * 64, "lineage": {"caseId": "a" * 64, "bookingId": "b" * 64, "actorId": "c" * 64,
                   "sourceEvent": "d" * 64, "evidenceId": "e" * 64, "sourceWorkId": "f" * 64, "evidenceVersion": "responsibility-evidence-v1"},
                   "snapshot": snap, "evidenceHash": digest, "originalCommitment": "e" * 64}
        accepted = clients["shadow9d_capture"].execute("SELECT transport9d.receive(%s)", (Jsonb(payload),)).fetchone()[0]
        if not accepted:
            raise AssertionError("TRANSPORT_POSITIVE_SETUP_REQUIRED")
        changed = dict(payload, originalCommitment="f" * 64)
        context.update(payload=payload, changedPayload=changed, acceptedReceipt=accepted)
    elif identity == "CLEAN01-delegation-rollback":
        work = owner.execute("INSERT INTO shadow9d.work(logical_key,snapshot,evidence_hash,provenance,created_at) VALUES(%s,%s,%s,%s,'2026-10-23') RETURNING id", ("a" * 64, Jsonb({"synthetic": True}), "b" * 64, "c" * 64)).fetchone()[0]
        request = owner.execute("INSERT INTO broker9d.requests(logical_key,receipt,work_id,payload,binding,evidence_hash,configuration,configuration_hash,generation,status) VALUES(%s,%s,%s,%s,%s,%s,'offline-broker-v1',%s,0,'TERMINAL') RETURNING id", ("a" * 64, uuid.uuid4(), work, Jsonb({"synthetic": True}), "b" * 64, "c" * 64, "d" * 64)).fetchone()[0]
        context.update(request=request, work=work)
        owner.execute("DELETE FROM shadow9d.work WHERE id=%s", (work,))
    else:
        op = clients["broker9d_ops"].execute("SELECT broker9d.operate(%s,NULL,'STOP',0,'OPERATOR_STOP')", (uuid.uuid4(),)).fetchone()[0]
        if op["status"] != "APPLIED":
            raise AssertionError("EXPORT_POSITIVE_CAPTURE_REQUIRED")
        seq, event, digest = owner.execute("SELECT seq,event,hash FROM custody_export.events ORDER BY seq LIMIT 1").fetchone()
        context.update(sequence=seq, event=event, eventHash=digest)
        if identity == "EXPORT01-compromised-key":
            owner.execute("INSERT INTO custody_export.keys VALUES(%s,%s,1,'COMPROMISED')", (keys[0]["id"], keys[0]["pem"]))
            body = {"schema": "custody-receipt-v1", "custodian": "isolated-custody-v1", "source": event["source"], "sequence": str(seq), "hash": digest,
                    "custodySequence": "1", "receipt": str(uuid.uuid4()), "keyId": keys[0]["id"], "outcome": "COMMITTED"}
            context["receipt"] = {"body": body, "signature": "A" * 86 + "=="}
        else:
            for _ in range(3):
                if not clients["custody_sender"].execute("SELECT custody_export.next()").fetchone()[0]:
                    raise AssertionError("REVIEW_SETUP_REQUIRED")
    return context


def trial(owner, clients, candidate, ctx, positive=False):
    identity = candidate["id"]
    if identity.startswith("KEY"):
        if positive and identity == "KEY02-unsigned-retirement":
            # SQL persistence/shape control only. This does not establish Ed25519
            # validity; the accepted genuine P6 signing tests remain separate.
            clients["custody_signer"].execute("SELECT custody.store_signature(%s,%s)", (ctx["receipt"], "A" * 86 + "=="))
        next_key = ctx["keys"][1]
        identifier = ctx["keys"][2]["id"] if identity == "KEY01-public-material-binding" and not positive else next_key["id"]
        epoch = 99 if identity == "KEY03-expected-epoch" and not positive else 1
        reply = invoke(owner, "SELECT custody.rotate(%s,%s,%s)", (identifier, next_key["pem"], epoch))
        key = owner.execute("SELECT key_id,epoch,status,public_key FROM custody.keys ORDER BY epoch DESC LIMIT 1").fetchone()
        return {"reply": reply, "latestKeyId": key[0], "epoch": key[1], "latestStatus": key[2],
                "materialBound": key[0] == hashlib.sha256(base64.b64decode(key[3].replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', ''))).hexdigest(),
                "unsigned": owner.execute("SELECT count(*) FROM custody.events e LEFT JOIN custody.signatures s ON s.receipt=e.receipt WHERE s.receipt IS NULL").fetchone()[0],
                "operations": owner.execute("SELECT count(*) FROM custody.key_operations").fetchone()[0]}
    if identity == "ACCEPT01-enrolled-service":
        frame = ctx["goodFrame"] if positive else ctx["badFrame"]
        reply = invoke(clients["custody_ingest"], "SELECT custody.ingest(%s)", (Jsonb(frame),))
        stored = owner.execute("SELECT event->>'service' FROM custody.events WHERE source=%s", (ctx["source"],)).fetchone()
        return {"reply": reply, "storedService": stored[0] if stored else None, "sourceSequence": owner.execute("SELECT seq FROM custody.sources WHERE source=%s", (ctx["source"],)).fetchone()[0]}
    if identity == "EXPORT01-compromised-key":
        if positive:
            owner.execute("UPDATE custody_export.keys SET status='RETIRED'")
        reply = invoke(clients["custody_verifier"], "SELECT custody_export.ack(%s,%s,%s)", (ctx["sequence"], ctx["eventHash"], Jsonb(ctx["receipt"])))
        row = owner.execute("SELECT status,receipt FROM custody_export.events WHERE seq=%s", (ctx["sequence"],)).fetchone()
        return {"reply": reply, "status": row[0], "receipt": row[1], "keyStatus": owner.execute("SELECT status FROM custody_export.keys").fetchone()[0]}
    if identity == "RETRY01-attempt-cas":
        operation = uuid.uuid4()
        reply = invoke(clients["custody_operator"], "SELECT custody_export.retry(%s,%s,%s)", (operation, ctx["sequence"], 3 if positive else 2))
        row = owner.execute("SELECT status,attempts,recoveries FROM custody_export.events WHERE seq=%s", (ctx["sequence"],)).fetchone()
        history = owner.execute("SELECT expected FROM custody_export.retries WHERE id=%s", (operation,)).fetchone()
        return {"reply": reply, "status": row[0], "attempts": row[1], "recoveries": row[2], "historyExpected": history[0] if history else None}
    if identity == "CLEAN01-delegation-rollback":
        if positive:
            owner.execute("INSERT INTO shadow9d.work(id,logical_key,snapshot,evidence_hash,provenance,created_at) OVERRIDING SYSTEM VALUE VALUES(%s,%s,%s,%s,%s,'2026-10-23')", (ctx["work"], "a" * 64, Jsonb({"synthetic": True}), "b" * 64, "c" * 64))
        reply = invoke(clients["broker9d_ops"], "SELECT broker9d.operate(%s,%s,'CLEAN',0,'RETENTION_MINIMIZATION')", (uuid.uuid4(), ctx["request"]))
        row = owner.execute("SELECT cleaned,payload,revision FROM broker9d.requests WHERE id=%s", (ctx["request"],)).fetchone()
        return {"reply": reply, "cleaned": row[0], "payloadRetained": row[1] is not None, "revision": row[2], "operations": owner.execute("SELECT count(*) FROM broker9d.operations").fetchone()[0]}
    before = owner.execute("SELECT count(*) FROM audit9d.events WHERE action='TRANSPORT_BINDING_REJECTED'").fetchone()[0]
    payload = ctx["payload"] if positive else ctx["changedPayload"]
    reply = invoke(clients["shadow9d_capture"], "SELECT transport9d.receive(%s)", (Jsonb(payload),))
    after = owner.execute("SELECT count(*) FROM audit9d.events WHERE action='TRANSPORT_BINDING_REJECTED'").fetchone()[0]
    row = owner.execute("SELECT payload_binding,receipt FROM transport9d.receipts WHERE logical_key=%s", (ctx["payload"]["key"],)).fetchone()
    return {"reply": reply, "journalDelta": after - before, "originalReceiptRetained": str(row[1]) == ctx["acceptedReceipt"]["body"]["receipt"],
            "originalBindingRetained": row[0] == ctx["acceptedReceipt"]["body"]["payloadBinding"]}


def expected_original(candidate, ctx):
    identity = candidate["id"]
    false = {"kind": "return", "value": False}
    if identity.startswith("KEY"):
        return {"reply": false, "latestKeyId": ctx["keys"][0]["id"], "epoch": 1, "latestStatus": "ACTIVE", "materialBound": True,
                "unsigned": int(identity == "KEY02-unsigned-retirement"), "operations": 0}
    if identity == "ACCEPT01-enrolled-service":
        return {"reply": {"kind": "sql_error", "sqlstate": "23514"}, "storedService": None, "sourceSequence": 0}
    if identity == "EXPORT01-compromised-key":
        return {"reply": false, "status": "PENDING", "receipt": None, "keyStatus": "COMPROMISED"}
    if identity == "RETRY01-attempt-cas":
        return {"reply": false, "status": "REVIEW", "attempts": 3, "recoveries": 0, "historyExpected": None}
    if identity == "CLEAN01-delegation-rollback":
        return {"reply": {"kind": "sql_error", "sqlstate": "23514"}, "cleaned": False, "payloadRetained": True, "revision": 0, "operations": 0}
    return {"reply": {"kind": "return", "value": None}, "journalDelta": 1, "originalReceiptRetained": True, "originalBindingRetained": True}


def main():
    if (OUT / "witness.json").exists():
        raise RuntimeError("FRESH_WITNESS_REQUIRED")
    inputs = [Path(__file__), ROOT / "tools/phase9d/p8_highrisk_cases.py", ROOT / "tools/phase9d/native_sql_metadata_fixture.py", ROOT / "tools/backups/native_postgres.py"] + [ROOT / "tools/phase9d" / n for n in FILES]
    pins = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in inputs}
    witness = {"status": "FAIL", "startedUtc": datetime.now(timezone.utc).isoformat(), "sourceHashes": pins, "checks": [], "compositions": [], "profiling": False, "docker": False}

    def check(name, actual, expected=True):
        passed = actual == expected
        witness["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": passed})
        if not passed:
            raise AssertionError(name)

    generated = public_keys()
    witness["publicKeyGeneration"] = generated
    try:
        for installation in ["custodian", "receiver"]:
            server = NativePostgres()
            record = {"installation": installation, "fixtureOwner": server.owner, "mutants": [], "stopped": False}
            witness["compositions"].append(record)
            ledger = [{"owner": c["fixtureOwner"], "data": str(server.root.parent / c["fixtureOwner"] / "data")} for c in witness["compositions"]]
            (OUT / "owned-servers.json").write_text(json.dumps(ledger, indent=2), encoding="utf-8")
            try:
                with server:
                    record["environment"] = server.identity
                    with server.connect(autocommit=True) as owner:
                        passwords = install(owner, installation)
                        before = catalog(owner)
                        record["catalogBefore"] = before
                        settings = owner.execute("SELECT current_setting('shared_preload_libraries'),current_setting('session_preload_libraries'),current_setting('local_preload_libraries'),EXISTS(SELECT FROM pg_extension WHERE extname='plpgsql_check'),(SELECT count(*) FROM pg_settings WHERE name LIKE 'plpgsql_check.%')").fetchone()
                        record["profilerAbsence"] = settings
                        check(installation + ":profiler-absent", settings, ("", "", "", False, 0))
                        clients = {}
                        try:
                            for role in {c["role"] for c in CANDIDATES if c["installation"] == installation and c["role"] != "fixture_owner"} | ({"custody_ingest", "custody_signer"} if installation == "custodian" else {"custody_sender", "broker9d_ops"}):
                                clients[role] = server.connect(user=role, password=passwords[role], autocommit=True)
                                flags = clients[role].execute("SELECT session_user,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname=session_user").fetchone()
                                check(role + ":restricted-login", flags, (role, False, False, False, False, False))
                                table = "custody.events" if installation == "custodian" else "custody_export.events"
                                table_oid = owner.execute("SELECT %s::regclass::oid", (table,)).fetchone()[0]
                                check(role + ":no-direct-event-update", clients[role].execute("SELECT has_table_privilege(current_user,%s::oid,'UPDATE')", (table_oid,)).fetchone()[0], False)
                                clients[role].close()
                            clients.clear()
                            empty = snapshot(owner)
                            for candidate in [c for c in CANDIDATES if c["installation"] == installation]:
                                for client in clients.values():
                                    client.close()
                                clients.clear()
                                required = {
                                    "KEY01-public-material-binding": [], "KEY02-unsigned-retirement": ["custody_ingest", "custody_signer"],
                                    "KEY03-expected-epoch": [], "ACCEPT01-enrolled-service": ["custody_ingest"],
                                    "EXPORT01-compromised-key": ["broker9d_ops", "custody_verifier"],
                                    "CLEAN01-delegation-rollback": ["broker9d_ops"], "JOURNAL01-rejected-binding": ["shadow9d_capture"],
                                    "RETRY01-attempt-cas": ["broker9d_ops", "custody_sender", "custody_operator"],
                                }[candidate["id"]]
                                for role in required:
                                    clients[role] = server.connect(user=role, password=passwords[role], autocommit=True)
                                    check(candidate["id"] + ":actual-caller:" + role, clients[role].execute("SELECT session_user,current_user").fetchone(), (role, role))
                                restore(owner, empty)
                                ctx = setup(owner, clients, candidate, generated["keys"])
                                saved = snapshot(owner)
                                original = target(owner, candidate)
                                definition = original["definition"]
                                prefix = candidate["id"]
                                m = {**candidate, "classification": "NOT_RUN", "originalDefinitionSha256": original["definitionSha256"], "baselineStateHash": fingerprint(saved), "original": original}
                                record["mutants"].append(m)
                                positive = trial(owner, clients, candidate, ctx, positive=True)
                                m["positive"] = positive
                                reply = positive["reply"]
                                check(prefix + ":positive", reply["kind"] == "return" and (reply["value"] is True or isinstance(reply["value"], dict)))
                                if prefix.startswith("KEY"):
                                    check(prefix + ":positive-persisted", (reply["value"], positive["epoch"], positive["latestKeyId"], positive["materialBound"], positive["operations"], positive["unsigned"]), (True, 2, generated["keys"][1]["id"], True, 1, 0))
                                elif prefix == "ACCEPT01-enrolled-service":
                                    check(prefix + ":positive-persisted", (reply["value"]["outcome"], positive["storedService"], positive["sourceSequence"]), ("COMMITTED", "source-lineage-v2", 1))
                                elif prefix == "EXPORT01-compromised-key":
                                    check(prefix + ":positive-persisted", (reply["value"], positive["status"], positive["receipt"], positive["keyStatus"]), (True, "ACKED", ctx["receipt"], "RETIRED"))
                                elif prefix == "RETRY01-attempt-cas":
                                    check(prefix + ":positive-persisted", positive, {"reply": {"kind": "return", "value": True}, "status": "PENDING", "attempts": 0, "recoveries": 1, "historyExpected": 3})
                                elif prefix == "CLEAN01-delegation-rollback":
                                    check(prefix + ":positive-persisted", (reply["value"]["status"], positive["cleaned"], positive["payloadRetained"], positive["revision"], positive["operations"]), ("APPLIED", True, False, 1, 1))
                                else:
                                    check(prefix + ":positive-persisted", positive, {"reply": {"kind": "return", "value": ctx["acceptedReceipt"]}, "journalDelta": 0, "originalReceiptRetained": True, "originalBindingRetained": True})
                                restore(owner, saved)
                                baseline = trial(owner, clients, candidate, ctx)
                                m["baseline"] = baseline
                                expected = expected_original(candidate, ctx)
                                check(prefix + ":original-contract", baseline, expected)
                                if prefix != "JOURNAL01-rejected-binding":
                                    check(prefix + ":original-no-write", fingerprint(snapshot(owner)), fingerprint(saved))
                                restore(owner, saved)
                                check(prefix + ":unique-guard", definition.count(candidate["guard"]), 1)
                                mutated = definition.replace(candidate["guard"], candidate["replacement"], 1)
                                path = OUT / (prefix + ".sql")
                                path.write_text(mutated, encoding="utf-8", newline="\n")
                                m.update(mutantFile=path.name, mutantDefinitionSha256=sha(mutated.encode()))
                                try:
                                    replace(owner, original, mutated)
                                    installed = target(owner, candidate)
                                    check(prefix + ":mutant-installed", installed["definitionSha256"], m["mutantDefinitionSha256"])
                                    check(prefix + ":metadata-preserved", {k: v for k, v in installed.items() if k not in ["definition", "definitionSha256"]}, {k: v for k, v in original.items() if k not in ["definition", "definitionSha256"]})
                                    observation = trial(owner, clients, candidate, ctx)
                                    m.update(mutantObservation=observation, mutantStateHash=fingerprint(snapshot(owner)), classification="KILLED" if observation != expected else "SURVIVED")
                                    m["contractDivergence"] = observation != expected
                                    m["equivalentClaim"] = False
                                finally:
                                    replace(owner, original, definition)
                                    restore(owner, saved)
                                    m["restored"] = target(owner, candidate) == original
                                    check(prefix + ":exact-definition-restored", target(owner, candidate), original)
                                    check(prefix + ":exact-data-restored", fingerprint(snapshot(owner)), fingerprint(saved))
                                m["restoredObservation"] = trial(owner, clients, candidate, ctx)
                                check(prefix + ":restored-contract", m["restoredObservation"], expected)
                                restore(owner, saved)
                            restore(owner, empty)
                            record["catalogAfter"] = catalog(owner)
                            check(installation + ":catalog-restored", record["catalogAfter"], before)
                            check(installation + ":fixture-data-restored", fingerprint(snapshot(owner)), fingerprint(empty))
                        finally:
                            for client in clients.values():
                                client.close()
            finally:
                record.update(stopped=server.stopped, pidFileExists=(server.data / "postmaster.pid").exists())
            check(installation + ":owned-server-stopped", record["stopped"] and not record["pidFileExists"])
        witness["status"] = "PASS"
    except Exception as error:
        witness["error"] = {"class": type(error).__name__, "sqlstate": getattr(error, "sqlstate", None), "message": str(error)[:160] if isinstance(error, AssertionError) else "PRIVATE_SYNTHETIC_DETAILS_WITHHELD"}
        raise
    finally:
        mutants = [m for c in witness["compositions"] for m in c["mutants"]]
        witness["counts"] = {"assertions": len(witness["checks"]), "passed": sum(c["pass"] for c in witness["checks"]), "mutantInstances": len(mutants), "killed": sum(m["classification"] == "KILLED" for m in mutants), "survived": sum(m["classification"] == "SURVIVED" for m in mutants)}
        witness["sourcesUnchanged"] = all(sha((ROOT / n).read_bytes()) == h for n, h in pins.items())
        witness["finishedUtc"] = datetime.now(timezone.utc).isoformat()
        (OUT / "witness.json").write_text(json.dumps(witness, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"status": witness["status"], "counts": witness["counts"], "sourcesUnchanged": witness["sourcesUnchanged"]}))


if __name__ == "__main__":
    main()
