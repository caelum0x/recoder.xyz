#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-db.sh — dump every Recoder database to a timestamped archive.
#
# Run this on the CURRENT box (the $30/mo CPX42) BEFORE migrating, to capture the
# host Postgres. It also works against the new in-compose Postgres (point the
# PG* vars at it). Produces one plain-SQL .sql.gz per database plus a combined
# tarball you copy to the new box for `redeploy.sh --restore`.
#
# Safe + idempotent: read-only (pg_dump only), never drops or writes anything.
#
# Usage:
#   PGPASSWORD=... ./deploy/backup-db.sh
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=recoder PGPASSWORD=... ./deploy/backup-db.sh
#   OUT_DIR=/mnt/backups ./deploy/backup-db.sh
#
# Env (all optional except the password):
#   PGHOST      default 127.0.0.1
#   PGPORT      default 5432
#   PGUSER      default recoder
#   PGPASSWORD  REQUIRED (or a working ~/.pgpass)
#   DATABASES   default "recoder_main recoder_backend recoder_pm"
#   OUT_DIR     default ./backups
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-recoder}"
DATABASES="${DATABASES:-recoder_main recoder_backend recoder_pm}"
OUT_DIR="${OUT_DIR:-./backups}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install postgresql-client (e.g. apt-get install -y postgresql-client)." >&2
  exit 1
fi

if [ -z "${PGPASSWORD:-}" ] && [ ! -f "${HOME}/.pgpass" ]; then
  echo "ERROR: set PGPASSWORD (or provide ~/.pgpass) so pg_dump can authenticate." >&2
  exit 1
fi
export PGPASSWORD="${PGPASSWORD:-}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="${OUT_DIR}/recoder-db-${TS}"
mkdir -p "${STAGE}"

echo "backup-db: host=${PGHOST}:${PGPORT} user=${PGUSER} -> ${STAGE}"

for db in ${DATABASES}; do
  # Skip a database that does not exist rather than failing the whole run.
  if ! psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname='${db}'" 2>/dev/null | grep -q 1; then
    echo "backup-db: WARNING '${db}' not present on this server, skipping"
    continue
  fi
  echo "backup-db: dumping '${db}'..."
  pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" \
    --no-owner --no-privileges --clean --if-exists "${db}" \
    | gzip -9 > "${STAGE}/${db}.sql.gz"
  echo "backup-db:   -> ${STAGE}/${db}.sql.gz ($(du -h "${STAGE}/${db}.sql.gz" | cut -f1))"
done

TARBALL="${OUT_DIR}/recoder-db-${TS}.tar.gz"
tar -czf "${TARBALL}" -C "${OUT_DIR}" "recoder-db-${TS}"
rm -rf "${STAGE}"
echo "backup-db: DONE -> ${TARBALL} ($(du -h "${TARBALL}" | cut -f1))"

# ── OPTIONAL: offsite upload to Cloudflare R2 / S3 (uncomment + configure) ───
# Requires the `aws` CLI. R2 uses an S3-compatible endpoint.
#   export AWS_ACCESS_KEY_ID=...        AWS_SECRET_ACCESS_KEY=...
#   export R2_BUCKET=recoder-backups    R2_ENDPOINT=https://<acct>.r2.cloudflarestorage.com
# aws s3 cp "${TARBALL}" "s3://${R2_BUCKET}/db/" --endpoint-url "${R2_ENDPOINT}"
# echo "backup-db: uploaded to s3://${R2_BUCKET}/db/$(basename "${TARBALL}")"

echo
echo "Copy to the new box and restore with:"
echo "  scp ${TARBALL} user@NEW_IP:/opt/recoder/"
echo "  ./deploy/redeploy.sh --restore /opt/recoder/$(basename "${TARBALL}")"
