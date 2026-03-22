#!/usr/bin/env bash
# cleanup-sandboxes.sh — Delete stale Daytona sandboxes and old agent_runs
# Runs via cron every 6 hours on the Hetzner production server.

set -euo pipefail

DAYTONA_API="http://localhost:3900/api/sandbox"
DAYTONA_TOKEN="dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946"
AUTH_HEADER="Authorization: Bearer ${DAYTONA_TOKEN}"

DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_NAME="recoder_backend"
DB_USER="recoder"
DB_PASS="recoder_prod_2026"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "=== Sandbox Cleanup: ${TIMESTAMP} ==="

# ── 1. Clean up Daytona sandboxes ──────────────────────────────────────────────

echo "[1/2] Fetching Daytona sandboxes..."

SANDBOXES=$(curl -sS -H "${AUTH_HEADER}" "${DAYTONA_API}" 2>&1) || {
    echo "ERROR: Failed to reach Daytona API"
    echo "${SANDBOXES}"
    SANDBOXES="[]"
}

# Check if we got valid JSON
if ! echo "${SANDBOXES}" | jq empty 2>/dev/null; then
    echo "ERROR: Daytona API returned invalid JSON:"
    echo "${SANDBOXES}" | head -5
    SANDBOXES="[]"
fi

TOTAL=$(echo "${SANDBOXES}" | jq 'length')
echo "  Total sandboxes: ${TOTAL}"

# Filter sandboxes with state: archived, stopped, or error
STALE_IDS=$(echo "${SANDBOXES}" | jq -r '.[] | select(.state == "archived" or .state == "stopped" or .state == "error") | .id')

DELETED=0
FAILED=0

if [ -z "${STALE_IDS}" ]; then
    echo "  No stale sandboxes found (archived/stopped/error)."
else
    for SANDBOX_ID in ${STALE_IDS}; do
        SANDBOX_STATE=$(echo "${SANDBOXES}" | jq -r --arg id "${SANDBOX_ID}" '.[] | select(.id == $id) | .state')
        echo "  Deleting sandbox ${SANDBOX_ID} (state: ${SANDBOX_STATE})..."

        DELETE_RESP=$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE \
            -H "${AUTH_HEADER}" \
            "${DAYTONA_API}/${SANDBOX_ID}" 2>&1) || true

        if [ "${DELETE_RESP}" = "200" ] || [ "${DELETE_RESP}" = "204" ]; then
            echo "    OK (HTTP ${DELETE_RESP})"
            DELETED=$((DELETED + 1))
        else
            echo "    FAILED (HTTP ${DELETE_RESP})"
            FAILED=$((FAILED + 1))
        fi
    done
fi

echo "  Sandbox cleanup done: ${DELETED} deleted, ${FAILED} failed."

# ── 2. Clean up old agent_runs from DB ─────────────────────────────────────────

echo "[2/2] Cleaning old agent_runs (completed/failed, older than 7 days)..."

DELETE_SQL="DELETE FROM agent_runs WHERE created_at < NOW() - INTERVAL '7 days' AND status IN ('completed', 'failed');"

DB_RESULT=$(PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "${DELETE_SQL}" 2>&1) || {
    echo "  ERROR: DB cleanup failed:"
    echo "  ${DB_RESULT}"
    DB_RESULT="error"
}

if [ "${DB_RESULT}" != "error" ]; then
    # psql DELETE returns "DELETE N" — extract the count
    ROW_COUNT=$(echo "${DB_RESULT}" | tr -d '[:space:]')
    echo "  Deleted rows: ${ROW_COUNT}"
fi

echo "=== Cleanup complete: ${TIMESTAMP} ==="
echo ""
