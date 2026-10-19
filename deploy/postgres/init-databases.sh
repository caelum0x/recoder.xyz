#!/usr/bin/env bash
# Postgres init for the Recoder self-host stack.
#
# The pgvector/pgvector:pg17 image (official postgres:17 + the pgvector
# extension pre-built — see docker-compose.selfhost.yml's postgres service)
# runs every executable *.sh / *.sql in
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

# Apply backend/migrations/*.sql into recoder_backend (mounted read-only at
# /docker-entrypoint-initdb.d/backend-migrations by docker-compose.selfhost.yml).
#
# Without this, the backend crashes fatally on every fresh volume the moment
# it queries a table that doesn't exist yet (e.g. "relation core.kv_store does
# not exist" from its skill-publisher bootstrap) — verified 2026-10-19. The
# backend itself only exposes a POST /internal/persistence/migrate route to
# apply its own migrations (backend/src/domains/persistence/migrations/
# migration-runner.ts), but that route requires the backend to already be up,
# which it can never be against an unmigrated database on first boot. So this
# runs the same migrations here instead, replicating the runner's own ledger
# table (`core._recoder_migrations`, filename + sha256 checksum) exactly so
# the backend's runner sees them as already-applied (not drifted, not
# re-applied) the first time anything calls that route later.
#
# Migration files are documented as idempotent (CREATE ... IF NOT EXISTS
# throughout), so this is safe to run even if a future image version changes
# what ships here — new files just get appended to the ledger on next init of
# a FRESH volume; an EXISTING volume already has its ledger and tables, and
# docker-entrypoint-initdb.d only runs on an empty data directory, so this
# whole block is a no-op after the very first boot.
MIGRATIONS_DIR="/docker-entrypoint-initdb.d/backend-migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
  echo "init-databases: applying backend migrations into recoder_backend"
  for file in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$file" ] || continue
    name="$(basename "$file")"
    checksum="$(sha256sum "$file" | cut -d' ' -f1)"
    echo "init-databases: applying migration ${name}"
    psql -v ON_ERROR_STOP=1 --username "$OWNER" --dbname recoder_backend -f "$file"
    # Ledger insert happens AFTER 0000 creates core._recoder_migrations, so
    # it always exists by the time any file (including 0000 itself, which
    # creates it earlier in its own body) finishes applying.
    #
    # NOTE: piped via stdin, NOT `-c`. psql only performs `:'var'` variable
    # interpolation when reading a script (stdin/-f); a `-c "...:'var'..."`
    # string is sent to the server mostly as-is and fails with "syntax error
    # at or near ':'" (verified 2026-10-19) — the colon is never substituted.
    psql -v ON_ERROR_STOP=1 --username "$OWNER" --dbname recoder_backend \
      -v name="$name" -v sum="$checksum" <<'SQL'
insert into core._recoder_migrations (filename, checksum) values (:'name', :'sum') on conflict (filename) do nothing;
SQL
  done
  echo "init-databases: backend migrations applied"
else
  echo "init-databases: WARNING ${MIGRATIONS_DIR} not mounted; backend will boot against an unmigrated database"
fi

echo "init-databases: done"
