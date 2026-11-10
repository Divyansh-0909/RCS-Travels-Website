#!/usr/bin/env bash
set -euo pipefail
# GitHub-hosted Ubuntu runner only. Never run this to reconfigure the owner's host.
test "${GITHUB_ACTIONS:-}" = true
test "$(uname -m)" = x86_64
sudo install -d /usr/share/postgresql-common/pgdg
curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc |
  sudo tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends postgresql-client-17
curl --fail --silent --show-error -L https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-amd64.tar.gz -o "$RUNNER_TEMP/age.tar.gz"
echo "cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10  $RUNNER_TEMP/age.tar.gz" | sha256sum --check --status
tar -xzf "$RUNNER_TEMP/age.tar.gz" -C "$RUNNER_TEMP"
echo "AGE_BIN=$RUNNER_TEMP/age/age" >> "$GITHUB_ENV"
echo 'PG_BIN=/usr/lib/postgresql/17/bin' >> "$GITHUB_ENV"
python -m pip install -r tools/backups/requirements.txt --quiet
