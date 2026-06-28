#!/usr/bin/env bash
# Postgres init for the Recoder self-host stack.
#
# The official postgres:17 image runs every executable *.sh / *.sql in
# /docker-entrypoint-initdb.d ONCE, on first boot of an empty data directory,
# as the superuser. We use it to create the three databases the Recoder control
# plane expects:
#
#   recoder_main      auth + app    (Better Auth / app data)
#   recoder_backend   API / control plane
#   recoder_pm        PM + pgvector
#
# POSTGRES_DB (set in compose to recoder_main) is already created by the image's
# own entrypoint before this script runs, so we create it idempotently too with
# a guard and never error if it already exists.
#
# Real, runnable: no stubs. Fails fast (set -euo pipefail) so a broken init
# surfaces in `docker compose logs postgres` instead of a half-provisioned DB.
set -euo pipefail

DBS="recoder_main recoder_backend recoder_pm"
OWNER="${POSTGRES_USER:-recoder}"

create_db() {
  local db="$1"
  # Quote the identifier; create only if absent (idempotent re-runs on a wiped volume).
  if psql -v ON_ERROR_STOP=1 --username "$OWNER" --dbname postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1; then
    echo "init-databases: '${db}' already exists, skipping"
  else
    echo "init-databases: creating '${db}'"
    psql -v ON_ERROR_STOP=1 --username "$OWNER" --dbname postgres \
      -c "CREATE DATABASE \"${db}\" OWNER \"${OWNER}\";"
  fi
}

for db in $DBS; do
  create_db "$db"
done

# recoder_pm uses pgvector for embeddings. The extension lives in the pm DB.
# CREATE EXTENSION IF NOT EXISTS is a no-op when the extension is already present,
# and degrades safely (warns, does not fail the whole init) if the pgvector
# shared library is not installed in this Postgres image.
echo "init-databases: ensuring pgvector extension in recoder_pm (best-effort)"
psql -v ON_ERROR_STOP=0 --username "$OWNER" --dbname recoder_pm \
  -c "CREATE EXTENSION IF NOT EXISTS vector;" \
  || echo "init-databases: WARNING pgvector not available in this image; recoder_pm vector features degrade until pgvector is installed"

echo "init-databases: done"
