"""Read-only byte verification after restoring approved Proofloop evidence.

Default: the six historical baseline files. No tests, provider calls or writes.
Use --classification to verify an explicitly restored transfer category.
"""
import argparse
import gzip
import hashlib
import json
import pathlib


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path,
                        default=pathlib.Path(__file__).resolve().parents[2])
    parser.add_argument("--classification", choices=[
        "SAFE_GIT", "PRIVATE_ARTIFACT", "LARGE_ARTIFACT"])
    args = parser.parse_args()
    root = args.root.resolve()
    summary = json.loads((root / "docs/proofloop/inventory-summary.json").read_text("utf-8"))
    wanted = {row["path"] for row in summary["six_baselines"]}
    failures = []
    checked = 0
    index = root / "docs/proofloop/evidence-index.jsonl.gz"
    with gzip.open(index, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if args.classification:
                selected = row["classification"] == args.classification
            else:
                selected = row["path"] in wanted
            if not selected:
                continue
            checked += 1
            path = (root / row["path"]).resolve()
            if not path.is_relative_to(root):
                failures.append({"path": row["path"], "reason": "outside root"})
                continue
            try:
                digest = hashlib.sha256()
                with path.open("rb") as payload:
                    for chunk in iter(lambda: payload.read(1024 * 1024), b""):
                        digest.update(chunk)
                if path.stat().st_size != row["size"] or digest.hexdigest() != row["sha256"]:
                    failures.append({"path": row["path"], "reason": "byte mismatch"})
            except OSError:
                failures.append({"path": row["path"], "reason": "unavailable"})
    if not args.classification and checked != 6:
        failures.append({"reason": "index must contain all six historical baselines"})
    print(json.dumps({"checked": checked, "failures": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
