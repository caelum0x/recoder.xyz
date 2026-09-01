#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# redeploy.sh — one-command bring-up of the LEAN stack on a fresh (ARM) box.
#
# Idempotent + safe: re-running it just rebuilds/updates. The only destructive
# action is --restore (it overwrites database contents) and it PROMPTS first.
#
# What it does:
#   1. Verifies Docker + compose are present and the daemon is up.
#   2. Ensures build prerequisites:
#        - backend/dist/server.js  (builds it if missing + pnpm available)
#        - pi-mono-dist/ stub       (creates the minimal stub if missing)
#   3. Ensures .env.cheap exists and GENERATES the [auto] secrets if empty.
#      Fails fast if POSTGRES_PASSWORD is unset (never invents your data cred).
#   4. docker compose build + up -d.
#   5. Optionally restores a DB tarball produced by deploy/backup-db.sh.
#
# Usage:
#   ./deploy/redeploy.sh                         # build + up
#   ./deploy/redeploy.sh --restore backup.tar.gz # build + up + restore DBs
#   ./deploy/redeploy.sh --no-build              # up only (images already built)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Resolve repo root (this script lives in <root>/deploy).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

COMPOSE_FILE="docker-compose.cheap.yml"
ENV_FILE=".env.cheap"
RESTORE_TARBALL=""
DO_BUILD=1

while [ $# -gt 0 ]; do
  case "$1" in
    --restore)   RESTORE_TARBALL="${2:?--restore needs a tarball path}"; shift 2 ;;
    --no-build)  DO_BUILD=0; shift ;;
    -h|--help)   grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ── Compose command detection (v2 plugin vs legacy) ─────────────────────────
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon not reachable. Start Docker and retry." >&2
  exit 1
fi

gen_secret() { openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# ── 1. Build prerequisites ──────────────────────────────────────────────────
if [ ! -f backend/dist/server.js ]; then
  echo "redeploy: backend/dist/server.js missing."
  if command -v pnpm >/dev/null 2>&1; then
    echo "redeploy: building backend dist (pnpm)..."
    ( cd backend && pnpm install && pnpm build )
  else
    echo "ERROR: backend/dist/server.js is required and pnpm is not installed." >&2
    echo "       Build it on a machine with pnpm: (cd backend && pnpm install && pnpm build)" >&2
    exit 1
  fi
fi

if [ ! -e pi-mono-dist/coding-agent/package.json ]; then
  echo "redeploy: creating minimal pi-mono-dist stub..."
  mkdir -p pi-mono-dist/coding-agent/dist
  printf '{"name":"@recoder/pi-coding-agent","version":"0.0.0","private":true}\n' \
    > pi-mono-dist/coding-agent/package.json
fi

# recoder-frontend build-prereq check (non-fatal warning).
if [ ! -f recoder-agents/Dockerfile ]; then
  echo "redeploy: WARNING recoder-agents/Dockerfile absent — the recoder-frontend"
  echo "          service (agents.recoder.xyz) cannot build. Either stage the"
  echo "          recoder-agents/ tree, or comment out that service in"
  echo "          ${COMPOSE_FILE} and its block in deploy/caddy/Caddyfile."
fi

# ── 2. Env file + secrets ───────────────────────────────────────────────────
if [ ! -f "${ENV_FILE}" ]; then
  echo "redeploy: ${ENV_FILE} missing — creating from .env.cheap.example."
  cp .env.cheap.example "${ENV_FILE}"
fi

# shellcheck disable=SC1090
set -a; . "./${ENV_FILE}"; set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERROR: POSTGRES_PASSWORD is empty in ${ENV_FILE}. Set a strong password" >&2
  echo "       (it owns your data; it is never auto-generated) and re-run." >&2
  exit 1
fi

ensure_secret() {
  local key="$1" cur="${!1:-}"
  if [ -z "${cur}" ]; then
    local val; val="$(gen_secret)"
    if grep -qE "^${key}=" "${ENV_FILE}"; then
      # portable in-place edit (Linux + macOS)
      tmp="$(mktemp)"; sed "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}" > "${tmp}" && mv "${tmp}" "${ENV_FILE}"
    else
      printf '%s=%s\n' "${key}" "${val}" >> "${ENV_FILE}"
    fi
    echo "redeploy: generated ${key}"
  fi
}
ensure_secret INTERNAL_SERVICE_KEY
ensure_secret RECODER_GOVERNANCE_SIGNING_KEY
ensure_secret BETTER_AUTH_SECRET

# ── 3. Build + up ───────────────────────────────────────────────────────────
echo "redeploy: validating compose config..."
"${DC[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config -q

if [ "${DO_BUILD}" -eq 1 ]; then
  echo "redeploy: building images (this can take a while on first run)..."
  "${DC[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build
fi

echo "redeploy: starting stack..."
"${DC[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d

# ── 4. Optional DB restore ──────────────────────────────────────────────────
if [ -n "${RESTORE_TARBALL}" ]; then
  if [ ! -f "${RESTORE_TARBALL}" ]; then
    echo "ERROR: restore tarball not found: ${RESTORE_TARBALL}" >&2
    exit 1
  fi
  echo
  echo "!! RESTORE will OVERWRITE the databases in the running Postgres with the"
  echo "!! contents of: ${RESTORE_TARBALL}"
  printf "Type 'restore' to proceed: "
  read -r confirm
  if [ "${confirm}" != "restore" ]; then
    echo "redeploy: restore aborted by user. Stack is up; databases untouched."
    exit 0
  fi

  echo "redeploy: waiting for postgres to be healthy..."
  for _ in $(seq 1 30); do
    if "${DC[@]}" -f "${COMPOSE_FILE}" exec -T postgres pg_isready -U "${POSTGRES_USER}" -d recoder_main >/dev/null 2>&1; then
      break
    fi
    sleep 3
  done

  WORK="$(mktemp -d)"
  tar -xzf "${RESTORE_TARBALL}" -C "${WORK}"
  DUMP_DIR="$(find "${WORK}" -maxdepth 1 -type d -name 'recoder-db-*' | head -1)"
  [ -n "${DUMP_DIR}" ] || DUMP_DIR="${WORK}"

  for f in "${DUMP_DIR}"/*.sql.gz; do
    [ -e "${f}" ] || continue
    db="$(basename "${f}" .sql.gz)"
    echo "redeploy: restoring '${db}' <- $(basename "${f}")"
    gunzip -c "${f}" | "${DC[@]}" -f "${COMPOSE_FILE}" exec -T postgres \
      psql -v ON_ERROR_STOP=0 -U "${POSTGRES_USER}" -d "${db}"
  done
  rm -rf "${WORK}"
  echo "redeploy: restore complete. Restarting app services to pick up data..."
  "${DC[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" restart backend recoder-app || true
fi

echo
echo "redeploy: DONE. Status:"
"${DC[@]}" -f "${COMPOSE_FILE}" ps
echo
echo "Health:  ${DC[*]} -f ${COMPOSE_FILE} exec backend curl -sf http://localhost:3100/health"
echo "Logs:    ${DC[*]} -f ${COMPOSE_FILE} logs -f caddy"
