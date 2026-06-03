#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_ENV="${APP_ENV:-$REPO_ROOT/app/.env.production}"
WEB_ENV="${WEB_ENV:-$REPO_ROOT/recoder-web/.env.local}"
DOCKER_ENV="${DOCKER_ENV:-$REPO_ROOT/docker-backend/.env}"
INTERNAL_SERVICE_KEY_VALUE="${INTERNAL_SERVICE_KEY:-}"

usage() {
  cat <<'EOF'
Sync INTERNAL_SERVICE_KEY across app/recoder-web/docker-backend env files.

Defaults:
  APP_ENV=app/.env.production
  WEB_ENV=recoder-web/.env.local   # optional retired surface; skipped when absent
  DOCKER_ENV=docker-backend/.env

Provide key via env:
  INTERNAL_SERVICE_KEY=<64-char-hex> bash scripts/sync-internal-service-key.sh

If not provided, script generates a new 64-char hex key.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$INTERNAL_SERVICE_KEY_VALUE" ]]; then
  INTERNAL_SERVICE_KEY_VALUE="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  echo "generated new INTERNAL_SERVICE_KEY"
fi

if [[ ${#INTERNAL_SERVICE_KEY_VALUE} -lt 32 ]]; then
  echo "INTERNAL_SERVICE_KEY must be at least 32 characters" >&2
  exit 1
fi

upsert_key() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "$file" ]]; then
    touch "$file"
  fi

  if grep -Eq "^[[:space:]]*${key}=" "$file"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ "^[[:space:]]*" k "=" && done==0 { print k "=" v; done=1; next }
      { print }
      END { if (done==0) print k "=" v }
    ' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    {
      cat "$file"
      echo "$key=$value"
    } > "$file.tmp"
    mv "$file.tmp" "$file"
  fi
}

upsert_key "$APP_ENV" "INTERNAL_SERVICE_KEY" "$INTERNAL_SERVICE_KEY_VALUE"
upsert_key "$DOCKER_ENV" "INTERNAL_SERVICE_KEY" "$INTERNAL_SERVICE_KEY_VALUE"
if [[ -e "$(dirname "$WEB_ENV")" || -f "$WEB_ENV" ]]; then
  upsert_key "$WEB_ENV" "INTERNAL_SERVICE_KEY" "$INTERNAL_SERVICE_KEY_VALUE"
fi

echo "updated:"
echo "- $APP_ENV"
if [[ -e "$(dirname "$WEB_ENV")" || -f "$WEB_ENV" ]]; then
  echo "- $WEB_ENV"
else
  echo "- $WEB_ENV (skipped; retired surface absent)"
fi
echo "- $DOCKER_ENV"
echo "key length: ${#INTERNAL_SERVICE_KEY_VALUE}"
