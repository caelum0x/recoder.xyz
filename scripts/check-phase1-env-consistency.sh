#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_ENV_FILES=(
  "$REPO_ROOT/app/.env.local"
  "$REPO_ROOT/app/.env.production"
  "$REPO_ROOT/app/.env"
  "$REPO_ROOT/.env.local"
  "$REPO_ROOT/.env.production"
  "$REPO_ROOT/.env"
  "$REPO_ROOT/app/.env.example"
)

WEB_ENV_FILES=(
  "$REPO_ROOT/recoder-web/.env.local"
  "$REPO_ROOT/recoder-web/.env.production"
  "$REPO_ROOT/recoder-web/.env"
)

DOCKER_ENV_FILES=(
  "$REPO_ROOT/docker-backend/.env"
  "$REPO_ROOT/docker-backend/.env.production"
  "$REPO_ROOT/docker-backend/.env.example"
)

first_existing_file() {
  local f
  for f in "$@"; do
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

first_file_with_key() {
  local key="$1"
  shift
  local f
  for f in "$@"; do
    if [[ -f "$f" ]] && grep -Eq "^[[:space:]]*${key}=" "$f"; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  echo "$line"
}

require_nonempty() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "missing: $label" >&2
    exit 1
  fi
}

fingerprint() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "empty"
    return 0
  fi
  printf "%s" "$value" | shasum -a 256 | awk '{print substr($1,1,10)}'
}

echo "== Phase 1 Env Consistency Check =="

APP_ENV="$(first_file_with_key "INTERNAL_SERVICE_KEY" "${APP_ENV_FILES[@]}" || true)"
WEB_ENV="$(first_file_with_key "INTERNAL_SERVICE_KEY" "${WEB_ENV_FILES[@]}" || true)"
DOCKER_ENV="$(first_file_with_key "INTERNAL_SERVICE_KEY" "${DOCKER_ENV_FILES[@]}" || true)"

if [[ -z "$APP_ENV" || -z "$WEB_ENV" || -z "$DOCKER_ENV" ]]; then
  echo "could not find required env files for app/recoder-web/docker-backend" >&2
  echo "app file: ${APP_ENV:-missing}" >&2
  echo "web file: ${WEB_ENV:-missing}" >&2
  echo "docker file: ${DOCKER_ENV:-missing}" >&2
  exit 1
fi

APP_INTERNAL_SERVICE_KEY="$(read_env_value "$APP_ENV" "INTERNAL_SERVICE_KEY")"
WEB_INTERNAL_SERVICE_KEY="$(read_env_value "$WEB_ENV" "INTERNAL_SERVICE_KEY")"
DOCKER_INTERNAL_SERVICE_KEY="$(read_env_value "$DOCKER_ENV" "INTERNAL_SERVICE_KEY")"

require_nonempty "app INTERNAL_SERVICE_KEY ($APP_ENV)" "$APP_INTERNAL_SERVICE_KEY"
require_nonempty "recoder-web INTERNAL_SERVICE_KEY ($WEB_ENV)" "$WEB_INTERNAL_SERVICE_KEY"
require_nonempty "docker-backend INTERNAL_SERVICE_KEY ($DOCKER_ENV)" "$DOCKER_INTERNAL_SERVICE_KEY"

if [[ "$APP_INTERNAL_SERVICE_KEY" != "$WEB_INTERNAL_SERVICE_KEY" || "$APP_INTERNAL_SERVICE_KEY" != "$DOCKER_INTERNAL_SERVICE_KEY" ]]; then
  echo "INTERNAL_SERVICE_KEY mismatch across services" >&2
  echo "app:    $APP_ENV" >&2
  echo "web:    $WEB_ENV" >&2
  echo "docker: $DOCKER_ENV" >&2
  echo "app key:    len=${#APP_INTERNAL_SERVICE_KEY} fp=$(fingerprint "$APP_INTERNAL_SERVICE_KEY")" >&2
  echo "web key:    len=${#WEB_INTERNAL_SERVICE_KEY} fp=$(fingerprint "$WEB_INTERNAL_SERVICE_KEY")" >&2
  echo "docker key: len=${#DOCKER_INTERNAL_SERVICE_KEY} fp=$(fingerprint "$DOCKER_INTERNAL_SERVICE_KEY")" >&2
  exit 1
fi

if [[ ${#APP_INTERNAL_SERVICE_KEY} -lt 32 ]]; then
  echo "INTERNAL_SERVICE_KEY must be >= 32 chars" >&2
  exit 1
fi

if [[ "$APP_INTERNAL_SERVICE_KEY" == "dev-internal-key" || "$APP_INTERNAL_SERVICE_KEY" == *"your-"* ]]; then
  echo "INTERNAL_SERVICE_KEY appears to be placeholder/dev value" >&2
  exit 1
fi

QUEUE_BACKEND="$(read_env_value "$DOCKER_ENV" "PUBLIC_PROMPT_TASK_QUEUE_BACKEND")"
if [[ -z "$QUEUE_BACKEND" ]]; then
  QUEUE_BACKEND="auto"
fi
QUEUE_BACKEND="$(echo "$QUEUE_BACKEND" | tr '[:upper:]' '[:lower:]')"

REDIS_URL_VALUE="$(read_env_value "$DOCKER_ENV" "REDIS_URL")"
if [[ "$QUEUE_BACKEND" == "redis" ]]; then
  require_nonempty "docker-backend REDIS_URL ($DOCKER_ENV)" "$REDIS_URL_VALUE"
fi

BILLING_MODE_RAW="${BILLING_ACTIONS_ENABLED:-}"
if [[ -n "$BILLING_MODE_RAW" ]]; then
  BILLING_MODE="$(echo "$BILLING_MODE_RAW" | tr '[:upper:]' '[:lower:]')"
  if [[ "$BILLING_MODE" != "true" && "$BILLING_MODE" != "false" ]]; then
    echo "BILLING_ACTIONS_ENABLED must be true|false when provided" >&2
    exit 1
  fi
fi

echo "app env:    $APP_ENV"
echo "web env:    $WEB_ENV"
echo "docker env: $DOCKER_ENV"
echo "queue backend: $QUEUE_BACKEND"
echo "redis url configured: $( [[ -n "$REDIS_URL_VALUE" ]] && echo true || echo false )"
echo "INTERNAL_SERVICE_KEY consistency: ok"
echo "Env consistency check passed."
