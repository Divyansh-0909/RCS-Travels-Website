"""GitHub manual restore drill. Never accepts a remote restore destination."""
import json
import os
from pathlib import Path
import tempfile

from backup import load_config, require, restore_quarantine, storage
from owned_postgres import OwnedPostgres


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true", "CI_ONLY")
    require(os.environ.get("BACKUP_RESTORE_ENVIRONMENT_APPROVED") == "true", "RESTORE_IMAGE_NOT_APPROVED")
    with tempfile.TemporaryDirectory(prefix="rcs-restore-job-") as tmp:
        os.chmod(tmp, 0o700)
        config_path = Path(tmp) / "scope.json"
        config_path.write_text(os.environ["BACKUP_CONFIG_JSON"], encoding="utf-8")
        identity = Path(tmp) / "identity"
        identity.write_text(os.environ.pop("AGE_SYNTHETIC_RESTORE_IDENTITY"), encoding="utf-8")
        os.chmod(identity, 0o600)
        config = load_config(config_path)
        require(config.get("synthetic_validation_only") is True, "CI_RESTORE_SYNTHETIC_ONLY_OFFLINE_PRODUCTION_KEY_REFUSED")
        client = storage()
        with OwnedPostgres(os.environ["BACKUP_RESTORE_IMAGE"]) as server:
            result = restore_quarantine(config, client, server.url, identity)
            print(json.dumps({**result, "resources": server.resources}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print('{"status":"FAILED","code":"RESTORE_VALIDATION_FAILED_DETAILS_WITHHELD"}')
        raise SystemExit(1) from None
