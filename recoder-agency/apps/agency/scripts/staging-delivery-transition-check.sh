#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${AGENCY_STAGING_DATABASE_URL:-}" ]]; then
	echo "Missing AGENCY_STAGING_DATABASE_URL"
	exit 1
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_SQL="$ROOT_DIR/db/scripts/seed_test_delivery_transitions.sql"
CLEANUP_SQL="$ROOT_DIR/db/scripts/cleanup_e2e_delivery_transitions.sql"

cleanup() {
	psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$CLEANUP_SQL"
}

trap cleanup EXIT

psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED_SQL"
