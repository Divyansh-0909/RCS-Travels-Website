"""Run the unchanged selected condition regression in new owned evidence paths."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/backups"))
import native_sql_condition_followup as original
from native_postgres import NativePostgres

BASE = ROOT / "output/phase9d-native-sql-storage-2026-10-31"


class TrackedNativePostgres(NativePostgres):
    def __init__(self):
        super().__init__()
        path = BASE / "owned-servers.json"
        ledger = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        ledger.append({"owner": self.owner, "data": str(self.data)})
        path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")


if __name__ == "__main__":
    original.OUT = BASE / "conditions-final"
    original.NativePostgres = TrackedNativePostgres
    original.main()
    receipt = {"adapterSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "originalTestSha256": hashlib.sha256(Path(original.__file__).read_bytes()).hexdigest(),
               "boundary": "Unchanged actual PostgreSQL cases; only new output path and owned-server ledger adapter."}
    (original.OUT / "adapter.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
