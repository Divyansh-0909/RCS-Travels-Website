"""Actual native storage metrics and TLS loopback alert lifecycle; no real sends."""
import copy
import hashlib
import importlib.metadata
import ipaddress
import json
import os
import ssl
import threading
import urllib.error
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from alert_routes import AlertRefused
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from native_postgres import NativePostgres
from storage_alerts import send_storage_alert
from storage_controller import cycle
from storage_probe import collect
from storage_safeguards import StorageGuard, evaluate

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "output/phase9d-native-sql-storage-2026-10-31"
OUT = BASE / "storage"


def tls_server(root):
    private = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Proofloop synthetic loopback")])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(private.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=1))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False, data_encipherment=False,
                                        key_agreement=False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(private.public_key()), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(private.public_key()), critical=False)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False).sign(private, hashes.SHA256()))
    cert_path, key_path = root / "tls-public.pem", root / "tls-private.pem"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    state = {"mode": "ok", "messages": []}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                self.send_error(413)
                return
            state["messages"].append(json.loads(self.rfile.read(size)))
            if state["mode"] == "redirect":
                self.send_response(302)
                self.send_header("Location", "https://must-not-contact.invalid/")
            else:
                self.send_response(503 if state["mode"] == "fail" else 204)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_path, key_path)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    return server, worker, state, cert_path, key_path


def main():
    if (OUT / "witness.json").exists():
        raise RuntimeError("FRESH_WITNESS_REQUIRED")
    inputs = [Path(__file__)] + [ROOT / "tools/backups" / n for n in ["native_postgres.py", "storage_probe.py", "storage_safeguards.py", "storage_controller.py", "storage_alerts.py", "alert_routes.py", "storage-policy.example.json"]]
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    w = {"status": "FAIL", "startedUtc": datetime.now(timezone.utc).isoformat(), "checks": [], "sourceHashes": pins,
         "tlsRuntime": {"cryptography": importlib.metadata.version("cryptography"), "openssl": ssl.OPENSSL_VERSION},
         "boundary": "Synthetic native database and HTTPS loopback only; no Google, R2, SMTP, production schedule or human acknowledgement."}

    def check(name, actual, expected=True):
        w["checks"].append({"name": name, "actual": actual, "expected": expected, "pass": actual == expected})
        if actual != expected:
            raise AssertionError(name)

    pg = NativePostgres()
    ledger_path = BASE / "owned-servers.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else []
    ledger.append({"owner": pg.owner, "data": str(pg.data)})
    ledger_path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")
    w["fixtureOwner"] = pg.owner
    https, worker, tls_key = None, None, None
    old_env = {key: os.environ.get(key) for key in ["SSL_CERT_FILE", "NO_PROXY"]}
    try:
        with pg:
            roots = {kind: pg.root / ("observed-" + kind) for kind in ["logs", "archive", "backups", "artifacts"]}
            for directory in roots.values():
                directory.mkdir()
            pg.command([str(pg.binary / "pg_ctl.exe"), "-D", str(pg.data), "-m", "fast", "-w", "stop"], "profile-stop")
            log_dir = str(roots["logs"]).replace("\\", "/").replace("'", "''")
            with (pg.data / "postgresql.conf").open("a", encoding="utf-8") as config:
                config.write("\ntemp_file_limit='1MB'\nmax_slot_wal_keep_size='32MB'\nlogging_collector=on\nlog_directory='" + log_dir + "'\nlog_rotation_size='1MB'\nlog_rotation_age='1h'\nidle_in_transaction_session_timeout='15s'\n")
            pg.command([str(pg.binary / "pg_ctl.exe"), "-D", str(pg.data), "-l", str(pg.root / "server.private.log"), "-w", "start"], "profile-start")
            w["environment"] = pg.identity
            with pg.connect(autocommit=True) as owner:
                settings = dict(owner.execute("SELECT name,setting FROM pg_settings WHERE name=ANY(%s)", (["temp_file_limit", "max_slot_wal_keep_size", "max_wal_size", "logging_collector", "log_rotation_size", "log_rotation_age", "idle_in_transaction_session_timeout"],)).fetchall())
                w["actualSettings"] = settings
                check("config:temp-per-process", settings["temp_file_limit"], "1024")
                check("config:slot-retention", settings["max_slot_wal_keep_size"], "32")
                check("config:logging-enabled", settings["logging_collector"], "on")
                check("config:rotation-size", settings["log_rotation_size"], "1024")
                check("config:idle-transaction-timeout", settings["idle_in_transaction_session_timeout"], "15000")
                check("config:owned-log-location", Path(owner.execute("SHOW log_directory").fetchone()[0]).resolve(), roots["logs"].resolve())
                check("config:profiler-absent", owner.execute("SELECT current_setting('shared_preload_libraries'),EXISTS(SELECT FROM pg_extension WHERE extname='plpgsql_check')").fetchone(), ("", False))
                owner.execute("CREATE SCHEMA storage_test; CREATE TABLE storage_test.history(id int PRIMARY KEY,payload text NOT NULL)", prepare=False)
                before = owner.execute("SELECT pg_current_wal_insert_lsn()").fetchone()[0]
                with owner.transaction():
                    for i in range(32):
                        owner.execute("INSERT INTO storage_test.history VALUES(%s,%s)", (i, hashlib.shake_256(str(i).encode()).hexdigest(8192)))
                owner.execute("CHECKPOINT")
                wal = owner.execute("SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),%s)", (before,)).fetchone()[0]
                sizes = owner.execute("SELECT pg_relation_size(c.oid),pg_indexes_size(c.oid),pg_table_size(c.oid),pg_total_relation_size(c.oid),pg_relation_size(c.reltoastrelid) FROM pg_class c WHERE c.oid='storage_test.history'::regclass").fetchone()
                check("measurement:wal-generated", wal > 0)
                check("measurement:table-plus-index-total", sizes[2] + sizes[1], sizes[3])
                check("measurement:toast-present", sizes[4] > 0)
                check("measurement:history-retained", owner.execute("SELECT count(*) FROM storage_test.history").fetchone()[0], 32)
                w["storageMeasurements"] = {"heapBytes": sizes[0], "indexBytes": sizes[1], "tableBytesIncludingToast": sizes[2], "totalBytes": sizes[3], "toastHeapBytesAlreadyIncluded": sizes[4], "walGeneratedBytes": int(wal)}
            with pg.connect() as observer:
                report = collect(observer, roots)
            w["actualObservation"] = report
            check("observer:inventory-not-invented", report["inventoryComplete"], False)
            check("observer:wal-counted-once", sum(d["kind"] == "wal" for d in report["domains"]), 1)
            check("observer:log-rotation-not-aggregate-cap", report["controls"]["boundedLogSink"], False)
            policy = json.loads((ROOT / "tools/backups/storage-policy.example.json").read_text(encoding="utf-8"))
            check("configuration:production-profile-disabled", policy["enabled"], False)
            check("configuration:deletion-disabled", policy["productionDeletion"], False)
            # Enabled only for this isolated controller/alert test; no application
            # admission, scheduler or deployed policy is enabled.
            synthetic = copy.deepcopy(policy)
            synthetic["enabled"] = True
            guard = StorageGuard(pg.root / "storage-state.sqlite", synthetic)
            refused = evaluate(synthetic, report)
            check("admission:unknown-control-refusal", refused["status"], "REFUSED")
            check("admission:unknown-inventory-reason", "INVENTORY_UNKNOWN" in refused["reasons"])
            check("alerts:default-no-send", cycle(guard, report)["delivery"], "NOT_REQUESTED")
            check("alerts:missing-route-no-send", cycle(guard, report, send=True, env={})["delivery"], "ROUTE_UNCONFIGURED_NOT_SENT")
            https, worker, state, ca, tls_key = tls_server(pg.root)
            env = {"BACKUP_ALERT_TRANSPORT": "webhook", "BACKUP_ALERT_WEBHOOK": "https://localhost:" + str(https.server_port) + "/synthetic-storage", "BACKUP_SMTP_PASSWORD": "MUST_NOT_APPEAR_IN_ALERT"}
            os.environ.pop("SSL_CERT_FILE", None)
            os.environ["NO_PROXY"] = "localhost,127.0.0.1"
            untrusted = False
            try:
                send_storage_alert(env, enabled=True)
            except urllib.error.URLError as error:
                untrusted = isinstance(error.reason, ssl.SSLCertVerificationError)
            check("alerts:untrusted-tls-refused", untrusted)
            check("alerts:no-http-before-trust", len(state["messages"]), 0)
            os.environ["SSL_CERT_FILE"] = str(ca)
            state["mode"] = "fail"
            check("alerts:503-retained", cycle(guard, report, send=True, env=env)["delivery"], "FAILED_RETAINED_FOR_RETRY")
            with guard.transaction() as c:
                row = c.execute("SELECT state,attempts,receipt FROM alerts WHERE state='IN_FLIGHT'").fetchone()
                check("alerts:failure-not-acknowledged", row, ("IN_FLIGHT", 1, None))
                # Deterministic expired-lease fixture; no host clock change/wait.
                c.execute("UPDATE alerts SET lease=0 WHERE state='IN_FLIGHT'")
            guard = StorageGuard(pg.root / "storage-state.sqlite", synthetic)
            state["mode"] = "ok"
            result = cycle(guard, report, send=True, env=env)
            check("alerts:actual-trusted-tls-accepted", result["delivery"], "ACCEPTED_BY_TRANSPORT")
            check("alerts:not-human-ack", result["humanAcknowledgementVerified"], False)
            with guard.transaction() as c:
                row = c.execute("SELECT attempts,receipt FROM alerts WHERE state='ACCEPTED_BY_TRANSPORT'").fetchone()
                check("alerts:durable-retry-accepted", row, (2, "ACCEPTED_BY_TRANSPORT"))
            check("alerts:message-no-secret", "MUST_NOT_APPEAR_IN_ALERT" not in json.dumps(state["messages"]))
            check("alerts:message-closed-payload", all(set(m) == {"text"} for m in state["messages"]))
            state["mode"] = "redirect"
            rejected = False
            try:
                send_storage_alert(env, enabled=True)
            except AlertRefused:
                rejected = True
            check("alerts:cross-host-redirect-refused", rejected)
            w["tlsLoopback"] = {"httpRequests": len(state["messages"]), "trustedCertificateSha256": hashlib.sha256(ca.read_bytes()).hexdigest(), "remoteMessages": 0, "tlsVerificationDisabled": False, "externalEmailConfigured": False}
            w["status"] = "PASS"
    finally:
        if https:
            https.shutdown()
            https.server_close()
        if worker:
            worker.join(timeout=5)
        if tls_key:
            tls_key.unlink(missing_ok=True)
        for name, value in old_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        w.update(serverStopped=pg.stopped, tlsServerStopped=not worker or not worker.is_alive(), finishedUtc=datetime.now(timezone.utc).isoformat())
        w["counts"] = {"assertions": len(w["checks"]), "passed": sum(c["pass"] for c in w["checks"])}
        w["sourcesUnchanged"] = all(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == h for name, h in pins.items())
        (OUT / "witness.json").write_text(json.dumps(w, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"status": w["status"], "counts": w["counts"], "serverStopped": pg.stopped}))


if __name__ == "__main__":
    main()
