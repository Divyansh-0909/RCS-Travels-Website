"""Synthetic-only encrypted handoff; actual second host required for acceptance.

Transfer the packet hash out of band and the synthetic identity separately. A
hash received in the same packet does not authenticate its origin. This does not
install software, open ports, contact production or release restored traffic.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import uuid

import backup as b
from native_postgres import NativePostgres


def host_commitment():
    if os.name == "nt":
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            identity = winreg.QueryValueEx(key, "MachineGuid")[0]
    else:
        identity = Path("/etc/machine-id").read_text().strip()
    return hashlib.sha256((platform.system() + ":" + identity).encode()).hexdigest()


class PacketClient:
    def __init__(self, directory, pointer, bucket):
        self.directory, self.pointer, self.bucket = Path(directory), pointer, bucket

    def download_file(self, bucket, key, destination):
        b.require(bucket == self.bucket and key == self.pointer["key"], "PACKET_SCOPE_INVALID")
        shutil.copyfile(self.directory / "backup.tar.age", destination)

    def head_object(self, *, Bucket, Key):
        b.require(Bucket == self.bucket and Key == self.pointer["key"], "PACKET_SCOPE_INVALID")
        return {"ContentLength": (self.directory / "backup.tar.age").stat().st_size,
                "Metadata": {"sha256": b.digest(self.directory / "backup.tar.age")}}

    def get_object(self, *, Bucket, Key):
        b.require(Bucket == self.bucket and Key.endswith("/latest.json"), "PACKET_SCOPE_INVALID")
        return {"Body": io.BytesIO(json.dumps(self.pointer).encode())}


def prepare(directory, config, client, pointer, expected_payload_hash):
    b.require(config.get("synthetic_validation_only") is True, "SYNTHETIC_PACKET_ONLY")
    directory = Path(directory)
    b.require(not directory.exists(), "NEW_PACKET_DIRECTORY_REQUIRED")
    directory.mkdir()
    client.download_file(config["bucket"], pointer["key"], str(directory / "backup.tar.age"))
    b.require(b.digest(directory / "backup.tar.age") == pointer["sha256"], "PACKET_CIPHER_MISMATCH")
    packet = {"version": 1, "sourceHost": host_commitment(), "syntheticOnly": True,
              "config": config, "pointer": pointer, "expectedPayloadHash": expected_payload_hash,
              "production": "OFF", "p8": "NOT_STARTED"}
    (directory / "packet.json").write_text(json.dumps(packet, indent=2), encoding="utf-8")
    return b.digest(directory / "packet.json")


def verify(directory, identity, expected_packet_hash, *, local_rehearsal=False):
    directory, identity = Path(directory), Path(identity)
    b.require(b.digest(directory / "packet.json") == expected_packet_hash, "PACKET_HASH_MISMATCH")
    packet = json.loads((directory / "packet.json").read_text(encoding="utf-8"))
    b.require(packet["syntheticOnly"] is True and packet["config"].get("synthetic_validation_only") is True,
              "SYNTHETIC_PACKET_ONLY")
    different = packet["sourceHost"] != host_commitment()
    b.require(different or local_rehearsal, "SECOND_HOST_REQUIRED")
    b.require(identity.is_file() and not identity.is_relative_to(directory), "SEPARATE_SYNTHETIC_KEY_REQUIRED")
    server = NativePostgres()
    result = {"offHostAccepted": False, "localRehearsal": local_rehearsal, "trafficReleaseAuthorized": False}
    with server:
        database = "rcs_restore_" + uuid.uuid4().hex
        with server.connect(autocommit=True) as c:
            from psycopg import sql
            c.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
        target = f"postgresql://proofloop_owner:{server.password}@127.0.0.1:{server.port}/{database}"
        os.environ.update(PG_BIN=str(server.binary), RCS_DISPOSABLE_RESTORE="yes")
        client = PacketClient(directory, packet["pointer"], packet["config"]["bucket"])
        restored = b.restore_quarantine(packet["config"], client, target, identity)
        with b.database_connect(target) as c:
            rows = c.execute("SELECT id,payload FROM public.storage_recovery_lab ORDER BY id").fetchall()
            payload_hash = hashlib.sha256(json.dumps(rows).encode()).hexdigest()
        b.require(payload_hash == packet["expectedPayloadHash"], "RESTORED_PAYLOAD_MISMATCH")
        result.update(status="RESTORED_IN_QUARANTINE", offHostAccepted=different and not local_rehearsal,
                      payloadHash=payload_hash, sourceHost=packet["sourceHost"], targetHost=host_commitment(),
                      restore=restored, environment=server.identity)
    result["serverStopped"] = server.stopped
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--packet", required=True)
    parser.add_argument("--packet-sha256", required=True)
    parser.add_argument("--synthetic-identity", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()
    result = verify(args.packet, args.synthetic_identity, args.packet_sha256)
    with Path(args.receipt).open("x", encoding="utf-8") as output:
        json.dump(result, output, indent=2)
    print(json.dumps({"status": result["status"], "offHostAccepted": result["offHostAccepted"],
                      "serverStopped": result["serverStopped"], "trafficReleaseAuthorized": False}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print('{"status":"FAILED","code":"OFFHOST_RESTORE_REFUSED_DETAILS_WITHHELD"}')
        raise SystemExit(1) from None
