"""Owned synthetic archive spool with an enforced byte budget; never a host disk quota."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import uuid

WAL_NAME = re.compile(r"(?:[0-9A-F]{24}|[0-9A-F]{8}\.history|[0-9A-F]{24}\.[0-9A-F]{8}\.backup)\Z")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def archive(config, source, name):
    if not WAL_NAME.fullmatch(name) or not 1 <= config["capacityBytes"] <= 134217728:
        raise ValueError("ARCHIVE_SCOPE_INVALID")
    root = Path(config["ownerRoot"]).resolve()
    marker = json.loads((root / "ownership.json").read_text())
    if marker["owner"] != config["owner"]:
        raise ValueError("ARCHIVE_OWNER_MISMATCH")
    source = Path(source).resolve()
    if source.parent != Path(marker["data"]).resolve() / "pg_wal" or source.name != name:
        raise ValueError("ARCHIVE_SOURCE_OUTSIDE_OWNED_WAL")
    spool = root / "archive"
    spool.mkdir(exist_ok=True)
    target = spool / name
    expected = digest(source)
    if target.exists():
        if digest(target) != expected:
            raise ValueError("ARCHIVE_EXISTING_CONTENT_CONFLICT")
        sidecar = spool / (name + ".sha256")
        if not sidecar.exists():
            with sidecar.open("x", encoding="ascii") as handle:
                handle.write(expected)
                handle.flush()
                os.fsync(handle.fileno())
        elif sidecar.read_text(encoding="ascii") != expected:
            raise ValueError("ARCHIVE_EXISTING_MANIFEST_CONFLICT")
        return "DUPLICATE"
    lock = spool / "writer.lock"
    lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temporary = spool / (uuid.uuid4().hex + ".partial")
    try:
        used = sum(p.stat().st_size for p in spool.iterdir() if p.is_file() and WAL_NAME.fullmatch(p.name))
        if used + source.stat().st_size > config["capacityBytes"]:
            raise ValueError("ARCHIVE_CAPACITY_REFUSED")
        with source.open("rb") as source_file, temporary.open("xb") as output:
            shutil.copyfileobj(source_file, output, 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        if digest(temporary) != expected:
            raise ValueError("ARCHIVE_COPY_HASH_MISMATCH")
        # Hard link creation is exclusive: an existing archive can never be overwritten.
        os.link(temporary, target)
        (spool / (name + ".sha256")).write_text(expected, encoding="ascii")
        return "ARCHIVED"
    finally:
        os.close(lock_fd)
        lock.unlink(missing_ok=True)
        temporary.unlink(missing_ok=True)


def restore(config, name, destination):
    if not WAL_NAME.fullmatch(name):
        raise ValueError("RESTORE_NAME_INVALID")
    source_root = Path(config["ownerRoot"]).resolve()
    marker = json.loads((source_root / "ownership.json").read_text())
    if marker["owner"] != config["owner"]:
        raise ValueError("RESTORE_OWNER_MISMATCH")
    destination = Path(destination).resolve()
    target_root = Path(config["restoreRoot"]).resolve()
    if destination.parent != target_root / "pg_wal" or destination.name not in (name, "RECOVERYXLOG", "RECOVERYHISTORY"):
        raise ValueError("RESTORE_TARGET_OUTSIDE_OWNED_WAL")
    source = source_root / "archive" / name
    expected = (source_root / "archive" / (name + ".sha256")).read_text(encoding="ascii")
    if digest(source) != expected:
        raise ValueError("RESTORE_ARCHIVE_HASH_MISMATCH")
    with source.open("rb") as input_file, destination.open("wb") as output:
        shutil.copyfileobj(input_file, output, 1024 * 1024)
        output.flush()
        os.fsync(output.fileno())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["archive", "restore"])
    p.add_argument("config")
    p.add_argument("source_or_name")
    p.add_argument("name_or_destination")
    args = p.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    if args.mode == "archive":
        archive(config, args.source_or_name, args.name_or_destination)
    else:
        restore(config, args.source_or_name, args.name_or_destination)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Called by PostgreSQL: no paths, database parameters or exception locals.
        sys.exit(1)
