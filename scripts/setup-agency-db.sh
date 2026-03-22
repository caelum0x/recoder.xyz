#!/usr/bin/env bash
#
# setup-agency-db.sh
#
# Creates the recoder_agency database on self-hosted PostgreSQL 17 and runs
# Drizzle ORM migrations for the Agency app.
#
# Safe to re-run (idempotent): CREATE DATABASE uses IF NOT EXISTS logic,
# and drizzle-kit migrate only applies unapplied migrations.
#
# Usage:
#   bash scripts/setup-agency-db.sh                # from repo root
#   ssh root@77.42.23.19 'cd /root/recoder.xyz && bash scripts/setup-agency-db.sh'
#
# Prerequisites on the server:
#   - PostgreSQL 17 running at 127.0.0.1:5432
#   - psql CLI available
#   - Node.js 22+ and pnpm installed
#   - pgvector extension available (postgresql-17-pgvector package)
#
# Environment override (optional):
#   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, DB_NAME
#

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-recoder}"
PG_PASSWORD="${PG_PASSWORD:-recoder_prod_2026}"
DB_NAME="${DB_NAME:-recoder_agency}"

# Repo paths (relative to this script's location)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENCY_ROOT="$REPO_ROOT/recoder-agency"
AGENCY_APP="$AGENCY_ROOT/apps/agency"

# Connection string for the new database
DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${DB_NAME}?sslmode=disable"

# psql connection to the default 'postgres' database (for CREATE DATABASE)
export PGPASSWORD="$PG_PASSWORD"

echo "============================================="
echo "  Recoder Agency Database Setup"
echo "============================================="
echo ""
echo "  Host:     ${PG_HOST}:${PG_PORT}"
echo "  User:     ${PG_USER}"
echo "  Database: ${DB_NAME}"
echo ""

# ─── Step 1: Verify psql is available ────────────────────────────────────────

if ! command -v psql &>/dev/null; then
    echo "ERROR: psql not found. Install postgresql-client or postgresql-17."
    exit 1
fi

echo "[1/5] Checking PostgreSQL connection..."
if ! psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
    echo "ERROR: Cannot connect to PostgreSQL at ${PG_HOST}:${PG_PORT} as ${PG_USER}."
    echo "       Verify PostgreSQL is running and credentials are correct."
    exit 1
fi
echo "  OK - PostgreSQL is reachable."
echo ""

# ─── Step 2: Create database if it does not exist ────────────────────────────

echo "[2/5] Creating database '${DB_NAME}' (if not exists)..."
DB_EXISTS=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" 2>/dev/null || true)

if [ "$DB_EXISTS" = "1" ]; then
    echo "  OK - Database '${DB_NAME}' already exists. Skipping creation."
else
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c \
        "CREATE DATABASE ${DB_NAME} OWNER ${PG_USER};"
    echo "  OK - Database '${DB_NAME}' created."
fi
echo ""

# ─── Step 3: Enable required extensions ──────────────────────────────────────

echo "[3/5] Enabling required PostgreSQL extensions..."

# pgvector is needed for embedding columns (document_vector_store_documents, etc.)
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -c \
    "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null
echo "  OK - Extension 'vector' (pgvector) enabled."

echo ""

# ─── Step 4: Verify pnpm and project dependencies ───────────────────────────

echo "[4/5] Preparing Drizzle migrations..."

if ! command -v pnpm &>/dev/null; then
    echo "ERROR: pnpm not found. Install via: npm install -g pnpm"
    exit 1
fi

# Ensure dependencies are installed (includes drizzle-kit)
if [ ! -d "$AGENCY_ROOT/node_modules" ]; then
    echo "  Installing monorepo dependencies..."
    (cd "$AGENCY_ROOT" && pnpm install --frozen-lockfile)
fi

# Check that drizzle-kit is available
if [ ! -f "$AGENCY_APP/node_modules/.bin/drizzle-kit" ] && \
   [ ! -f "$AGENCY_ROOT/node_modules/.bin/drizzle-kit" ]; then
    echo "  drizzle-kit not found in node_modules; running pnpm install..."
    (cd "$AGENCY_ROOT" && pnpm install --frozen-lockfile)
fi

echo "  OK - Dependencies verified."
echo ""

# ─── Step 5: Run Drizzle migrations ─────────────────────────────────────────

echo "[5/5] Running Drizzle migrations..."
echo "  Migration directory: apps/agency/db/migrate/"
echo "  Target database: ${DB_NAME}"
echo ""

# drizzle-kit migrate reads drizzle.config.ts which uses DATABASE_URL from env.
# We export it here to ensure it points to the correct database.
export DATABASE_URL="$DATABASE_URL"

MIGRATE_EXIT=0
(
    cd "$AGENCY_APP"
    # drizzle-kit migrate applies all pending migrations from db/migrate/
    npx drizzle-kit migrate 2>&1
) || MIGRATE_EXIT=$?

if [ $MIGRATE_EXIT -ne 0 ]; then
    echo ""
    echo "ERROR: Drizzle migration failed with exit code ${MIGRATE_EXIT}."
    echo "       Check the output above for details."
    exit $MIGRATE_EXIT
fi

echo ""

# ─── Verification ────────────────────────────────────────────────────────────

echo "Verifying table creation..."
TABLE_COUNT=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

echo "  Tables in '${DB_NAME}': ${TABLE_COUNT}"
echo ""

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "============================================="
    echo "  Agency database setup complete!"
    echo "============================================="
    echo ""
    echo "  DATABASE_URL=${DATABASE_URL}"
    echo ""
    echo "  Key tables (sample):"
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB_NAME" -tAc \
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT 15;"
    echo "  ..."
    echo ""
else
    echo "WARNING: No tables found after migration. Check drizzle-kit output above."
    exit 1
fi
