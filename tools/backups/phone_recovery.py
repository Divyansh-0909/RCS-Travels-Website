"""Copy only encrypted recovery artifacts to one authorized USB Android device."""

import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import uuid


ROOT = Path(__file__).resolve().parents[2]
LOCAL = Path(os.environ["LOCALAPPDATA"]) / "RCSProofloop"
ADB = Path(r"C:\Android\platform-tools\adb.exe")
AGE = Path(r"C:\Users\singh\Documents\Codex\2026-10-15\continue\backup-tools\age-1.3.2\age")
ORIGINAL = LOCAL / "local-backups/dev-20261020T202309Z-90796caf/backup-receipt.private.json"
EXPECTED_ARCHIVE = "89987a14dbea3fa85c21048f1a736e15b8d101c8db7f0957ce9c26f3d8b9e2d3"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(arguments, timeout=45):
    result = subprocess.run([str(arg) for arg in arguments], capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError("RECOVERY_COMMAND_FAILED_DETAILS_WITHHELD")
    return result.stdout


def write(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, indent=2)
        handle.write("\n")


def private_folder(path):
    path.mkdir(parents=True, exist_ok=False)
    code = r"""
$ErrorActionPreference='Stop'
$d=New-Object IO.DirectoryInfo($env:RCS_PHONE_PRIVATE)
if (($d.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'LINK_REFUSED' }
$a=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$a.SetAccessRuleProtection($true,$false)
foreach($r in @($a.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))) { [void]$a.RemoveAccessRuleSpecific($r) }
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($id in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
 $r=New-Object Security.AccessControl.FileSystemAccessRule($id,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
 $a.AddAccessRule($r)
}
$d.SetAccessControl($a)
$v=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$rules=@($v.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
if (-not $v.AreAccessRulesProtected -or $rules.Count -ne 2 -or @($rules | Where-Object {$_.IdentityReference.Value -notin @($sid.Value,'S-1-5-18') -or $_.AccessControlType -ne 'Allow'}).Count -ne 0) { throw 'ACL_REFUSED' }
"""
    run(["powershell", "-NoProfile", "-Command", code.replace("$env:RCS_PHONE_PRIVATE", "'" + str(path).replace("'", "''") + "'")])


def device(expected=None):
    rows = [line.split() for line in run([ADB, "devices"]).decode().splitlines()[1:] if line.strip()]
    if len(rows) != 1 or len(rows[0]) != 2 or rows[0][1] != "device":
        raise RuntimeError("ONE_AUTHORIZED_USB_DEVICE_REQUIRED")
    serial = rows[0][0]
    if expected and hashlib.sha256(serial.encode()).hexdigest() != expected:
        raise RuntimeError("PHONE_IDENTITY_CHANGED")
    return serial


def phone(serial, *arguments):
    return run([ADB, "-s", serial, *arguments])


def transfer(serial, source, remote, local_copy):
    # Names are fixed constants beneath a UUID-owned directory; no arbitrary shell text.
    phone(serial, "push", str(source), remote)
    expected = sha(source)
    observed = phone(serial, "shell", "sha256sum", remote).decode().split()[0]
    if observed != expected:
        raise RuntimeError("PHONE_HASH_MISMATCH")
    if local_copy.exists():
        raise RuntimeError("READBACK_DESTINATION_EXISTS")
    phone(serial, "pull", remote, str(local_copy))
    if sha(local_copy) != expected:
        raise RuntimeError("PHONE_READBACK_MISMATCH")
    return expected


def content_check(ciphertext, identity, original):
    if sha(ciphertext) != EXPECTED_ARCHIVE:
        raise RuntimeError("ORIGINAL_ARCHIVE_IDENTITY_MISMATCH")
    plaintext = run([AGE / "age.exe", "--decrypt", "--identity", identity, ciphertext])
    # Decrypted SQL stays in process memory, never in logs, evidence or a phone file.
    with tarfile.open(fileobj=io.BytesIO(plaintext), mode="r:") as archive:
        dumps = [member for member in archive.getmembers() if member.isfile() and member.name.endswith(".dump")]
        if len(dumps) != 1:
            raise RuntimeError("EXPECTED_ONE_SQL_DUMP")
        with archive.extractfile(dumps[0]) as dump:
            dump_digest = hashlib.file_digest(dump, "sha256").hexdigest()
        if dump_digest != original["dump_sha256"]:
            raise RuntimeError("RECOVERED_DUMP_IDENTITY_MISMATCH")
    return "DECRYPTED_IN_MEMORY_DUMP_HASH_MATCH"


def load_config(path):
    path = Path(path).resolve()
    base = (LOCAL / "phone-recovery").resolve()
    if path.name != "config.private.json" or path.parent.parent != base:
        raise RuntimeError("OWNED_RECOVERY_CONFIG_REQUIRED")
    config = json.loads(path.read_text(encoding="utf-8"))
    if config["owner"] != path.parent.name or len(config["owner"]) != 32:
        raise RuntimeError("OWNERSHIP_MISMATCH")
    if config["remote"] != "/sdcard/Documents/RCSProofloopRecovery/" + config["owner"]:
        raise RuntimeError("OWNED_PHONE_PATH_REQUIRED")
    for name, expected in config["sourceHashes"].items():
        if sha(ROOT / name) != expected:
            raise RuntimeError("RECOVERY_SOURCE_CHANGED")
    return config, path.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["stage", "upload-key", "verify"])
    parser.add_argument("--output")
    parser.add_argument("--config")
    args = parser.parse_args()
    original = json.loads(ORIGINAL.read_text(encoding="utf-8"))
    if original["ciphertext_sha256"] != EXPECTED_ARCHIVE:
        raise RuntimeError("ORIGINAL_RECEIPT_MISMATCH")
    if args.action == "stage":
        output = Path(args.output).resolve()
        output.mkdir(parents=True, exist_ok=False)
        owner = uuid.uuid4().hex
        private = LOCAL / "phone-recovery" / owner
        private_folder(private)
        serial = device()
        remote = "/sdcard/Documents/RCSProofloopRecovery/" + owner
        props = {key: phone(serial, "shell", "getprop", key).decode().strip() for key in [
            "ro.product.model", "ro.build.version.release", "ro.build.version.security_patch", "ro.crypto.state", "ro.crypto.type",
        ]}
        if props["ro.crypto.state"] != "encrypted":
            raise RuntimeError("PHONE_ENCRYPTION_NOT_CONFIRMED")
        source_files = [Path(__file__), ROOT / "tools/backups/wrap_phone_recovery_key.ps1"]
        config = {"owner": owner, "remote": remote, "deviceHash": hashlib.sha256(serial.encode()).hexdigest(),
                  "sourceHashes": {str(p.relative_to(ROOT)): sha(p) for p in source_files}, "output": str(output),
                  "ageDirectory": str(AGE), "python": str(Path(os.sys.executable)), "tool": str(Path(__file__))}
        write(private / "config.private.json", config)
        probe = subprocess.run([str(ADB), "-s", serial, "shell", "test", "-e", remote], capture_output=True, timeout=15)
        if probe.returncode != 1:
            raise RuntimeError("NEW_PHONE_DIRECTORY_REQUIRED")
        phone(serial, "shell", "mkdir", "-p", remote)
        readback = private / "backup-readback.age"
        archive_hash = transfer(serial, Path(original["ciphertext_file"]), remote + "/backup.tar.age", readback)
        verified = content_check(readback, original["private_identity_file"], original)
        readback.unlink()
        note = private / "RECOVERY.txt"
        note.write_text(
            "RCS Travels Dev encrypted recovery copy. Never share this folder.\n"
            "backup.tar.age is encrypted; key-passphrase.age requires your separately held passphrase.\n"
            "Until key-passphrase.age is present and tested, this is an archive copy only.\n"
            "Keep this phone disconnected from networks and unplug USB after verification.\n"
            "A future reconnection changes its offline custody status. Do not store the passphrase here.\n"
            "Original laptop materials have not been deleted. No production data restore is authorized.\n",
            encoding="utf-8",
        )
        transfer(serial, note, remote + "/RECOVERY.txt", private / "note-readback.txt")
        witness = {"status": "ARCHIVE_COPY_VERIFIED_KEY_HANDOFF_PENDING", "createdUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   "deviceHash": config["deviceHash"], "phoneProperties": props, "phoneDirectory": remote,
                   "ciphertextBytes": Path(original["ciphertext_file"]).stat().st_size, "ciphertextSha256": archive_hash,
                   "roundtrip": verified, "keyCopied": False, "ownerNetworkStatement": "Internet disconnected; USB connected for driver testing",
                   "networkStateIndependentlyVerified": False, "usbDisconnected": False, "sourceHashes": config["sourceHashes"],
                   "applicationRecordsModified": False, "originalMaterialsPreserved": True}
        write(output / "phone-archive-stage.json", witness)
        write(output / "private-config-location.json", {"configPath": str(private / "config.private.json")})
        print(json.dumps({"status": witness["status"], "phoneDirectory": remote, "configPath": str(private / "config.private.json")}))
        return
    config, private = load_config(args.config)
    serial = device(config["deviceHash"])
    if args.action == "upload-key":
        encrypted = private / "key-passphrase.age"
        if not encrypted.is_file() or encrypted.stat().st_size < 100:
            raise RuntimeError("ENCRYPTED_KEY_REQUIRED")
        prefix = encrypted.read_bytes()[:40]
        if not prefix.startswith(b"age-encryption.org/v1\n-> scrypt "):
            raise RuntimeError("PASSPHRASE_AGE_FORMAT_REQUIRED")
        transfer(serial, encrypted, config["remote"] + "/key-passphrase.age", private / "key-readback.age")
        print("ENCRYPTED_KEY_PHONE_ROUNDTRIP_MATCH")
        return
    recovered = private / "recovered-identity.private.txt"
    try:
        if not recovered.is_file() or sha(recovered) != sha(Path(original["private_identity_file"])):
            raise RuntimeError("RECOVERED_KEY_IDENTITY_MISMATCH")
        public = run([AGE / "age-keygen.exe", "-y", recovered]).decode().strip()
        if public != original["public_recipient"]:
            raise RuntimeError("PUBLIC_RECIPIENT_MISMATCH")
        archive = private / "final-archive-readback.age"
        if archive.exists():
            raise RuntimeError("FINAL_READBACK_ALREADY_EXISTS")
        phone(serial, "pull", config["remote"] + "/backup.tar.age", str(archive))
        verified = content_check(archive, recovered, original)
        archive.unlink()
        witness = {"status": "PHONE_KEY_AND_ARCHIVE_RECOVERY_VERIFIED_PENDING_USB_DISCONNECT",
                   "verifiedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "phoneDirectory": config["remote"],
                   "deviceHash": config["deviceHash"], "encryptedKeySha256": sha(private / "key-readback.age"),
                   "archiveSha256": EXPECTED_ARCHIVE, "publicRecipientMatched": True, "recovery": verified,
                   "usbDisconnected": False, "originalMaterialsPreserved": True, "sourceHashes": config["sourceHashes"]}
        write(Path(config["output"]) / "phone-key-recovery.json", witness)
        print(witness["status"])
    finally:
        # Exact newly owned plaintext scratch only; ordinary unlink is not secure erasure.
        if recovered.parent == private and recovered.name == "recovered-identity.private.txt":
            recovered.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "FAILED", "errorType": type(error).__name__, "detailsWithheld": True}))
        raise SystemExit(1)
