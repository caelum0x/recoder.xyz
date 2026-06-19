#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENCY_ENV="$REPO_ROOT/recoder-agency/.env.docker"
PM_ENV="$REPO_ROOT/recoder-pm/.env.docker"
ROOT_ENV="$REPO_ROOT/.env.production"

ROOT_KEYS=(
  "INTERNAL_SERVICE_KEY"
  "AUTH_DATABASE_URL"
  "MAIN_SITE_INTERNAL_URL"
  "NATS_URL"
  "DAYTONA_API_URL"
  "DAYTONA_SERVER_URL"
  "RECODER_PREVIEW_ACCESS_SECRET"
  "RECODER_EDGE_PREVIEW_BASE_DOMAIN"
  "RECODER_EDGE_PREVIEW_PROTECTION_MODE"
  "RECODER_EDGE_PREVIEW_RATE_LIMIT_PER_MINUTE"
)

AGENCY_KEYS=(
  "POLAR_ACCESS_TOKEN"
  "POLAR_PRO_PRODUCT_ID"
  "POLAR_WEBHOOK_SECRET"
  "POLAR_ORGANIZATION_ID"
  "RECODER_WEB_API_KEY"
)

PM_KEYS=(
  "POLAR_ACCESS_TOKEN"
  "POLAR_WEBHOOK_SECRET"
)

read_env_value() {
  local file="$1"
  local key="$2"

  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#export }"
  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  [[ -n "$value" ]] || return 1
  return 0
}

get_env_value() {
  local file="$1"
  local key="$2"

  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#export }"
  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  [[ -n "$value" ]] || return 1
  printf '%s\n' "$value"
}

collect_missing() {
  local file="$1"
  shift
  local key
  for key in "$@"; do
    if ! read_env_value "$file" "$key"; then
      printf '%s\n' "$key"
    fi
  done
}

MISSING_AGENCY=()
MISSING_PM=()
MISSING_ROOT=()

while IFS= read -r key; do
  [[ -n "$key" ]] && MISSING_ROOT+=("$key")
done < <(collect_missing "$ROOT_ENV" "${ROOT_KEYS[@]}")

ROOT_DAYTONA_API_KEY="$(get_env_value "$ROOT_ENV" "DAYTONA_API_KEY" || true)"
ROOT_DAYTONA_JWT_TOKEN="$(get_env_value "$ROOT_ENV" "DAYTONA_JWT_TOKEN" || true)"
ROOT_DAYTONA_ORG_ID="$(get_env_value "$ROOT_ENV" "DAYTONA_ORGANIZATION_ID" || true)"
if [[ -z "$ROOT_DAYTONA_API_KEY" && ( -z "$ROOT_DAYTONA_JWT_TOKEN" || -z "$ROOT_DAYTONA_ORG_ID" ) ]]; then
  MISSING_ROOT+=("DAYTONA_API_KEY or DAYTONA_JWT_TOKEN+DAYTONA_ORGANIZATION_ID")
fi

ROOT_AGENT_OS_OUTBOX_DRAIN_ENABLED="$(get_env_value "$ROOT_ENV" "AGENT_OS_OUTBOX_DRAIN_ENABLED" || true)"
ROOT_AGENT_OS_OUTBOX_DRAIN_INTERVAL="$(get_env_value "$ROOT_ENV" "AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS" || true)"
if [[ "$ROOT_AGENT_OS_OUTBOX_DRAIN_ENABLED" != "true" && ! "$ROOT_AGENT_OS_OUTBOX_DRAIN_INTERVAL" =~ ^[0-9]+$ ]]; then
  MISSING_ROOT+=("AGENT_OS_OUTBOX_DRAIN_ENABLED=true or AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS=<ms>")
fi

ROOT_PREVIEW_ACCESS_SECRET="$(get_env_value "$ROOT_ENV" "RECODER_PREVIEW_ACCESS_SECRET" || true)"
ROOT_EDGE_PREVIEW_BASE_DOMAIN="$(get_env_value "$ROOT_ENV" "RECODER_EDGE_PREVIEW_BASE_DOMAIN" || true)"
ROOT_EDGE_PREVIEW_PROTECTION_MODE="$(get_env_value "$ROOT_ENV" "RECODER_EDGE_PREVIEW_PROTECTION_MODE" || true)"
ROOT_EDGE_PREVIEW_RATE_LIMIT="$(get_env_value "$ROOT_ENV" "RECODER_EDGE_PREVIEW_RATE_LIMIT_PER_MINUTE" || true)"
ROOT_EDGE_CROWDSEC_ENABLED="$(get_env_value "$ROOT_ENV" "RECODER_EDGE_CROWDSEC_ENABLED" || true)"
ROOT_EDGE_OPENAPPSEC_ENABLED="$(get_env_value "$ROOT_ENV" "RECODER_EDGE_OPENAPPSEC_ENABLED" || true)"

if [[ -n "$ROOT_PREVIEW_ACCESS_SECRET" ]] && echo "$ROOT_PREVIEW_ACCESS_SECRET" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx|dev-secret'; then
  MISSING_ROOT+=("RECODER_PREVIEW_ACCESS_SECRET=<non-placeholder secret>")
fi
if [[ -n "$ROOT_EDGE_PREVIEW_BASE_DOMAIN" && ( "$ROOT_EDGE_PREVIEW_BASE_DOMAIN" == "localhost"* || "$ROOT_EDGE_PREVIEW_BASE_DOMAIN" == "127.0.0.1"* ) ]]; then
  MISSING_ROOT+=("RECODER_EDGE_PREVIEW_BASE_DOMAIN=<production preview domain>")
fi
if [[ -n "$ROOT_EDGE_PREVIEW_PROTECTION_MODE" && "$ROOT_EDGE_PREVIEW_PROTECTION_MODE" != "signed" && "$ROOT_EDGE_PREVIEW_PROTECTION_MODE" != "private" ]]; then
  MISSING_ROOT+=("RECODER_EDGE_PREVIEW_PROTECTION_MODE=signed or private")
fi
if [[ -n "$ROOT_EDGE_PREVIEW_RATE_LIMIT" && ( ! "$ROOT_EDGE_PREVIEW_RATE_LIMIT" =~ ^[0-9]+$ || "$ROOT_EDGE_PREVIEW_RATE_LIMIT" -lt 10 ) ]]; then
  MISSING_ROOT+=("RECODER_EDGE_PREVIEW_RATE_LIMIT_PER_MINUTE=<integer >= 10>")
fi
if [[ "$ROOT_EDGE_CROWDSEC_ENABLED" != "true" && "$ROOT_EDGE_OPENAPPSEC_ENABLED" != "true" ]]; then
  MISSING_ROOT+=("RECODER_EDGE_CROWDSEC_ENABLED=true or RECODER_EDGE_OPENAPPSEC_ENABLED=true")
fi

while IFS= read -r key; do
  [[ -n "$key" ]] && MISSING_AGENCY+=("$key")
done < <(collect_missing "$AGENCY_ENV" "${AGENCY_KEYS[@]}")

while IFS= read -r key; do
  [[ -n "$key" ]] && MISSING_PM+=("$key")
done < <(collect_missing "$PM_ENV" "${PM_KEYS[@]}")

echo "== Production Env Missing Vars =="
echo "root env:   $ROOT_ENV"
echo "agency env: $AGENCY_ENV"
echo "pm env:     $PM_ENV"
echo

if [[ ${#MISSING_ROOT[@]} -eq 0 ]]; then
  echo "Root: none missing"
else
  echo "Root missing (${#MISSING_ROOT[@]}):"
  for key in "${MISSING_ROOT[@]}"; do
    echo "  - $key"
  done
fi

echo

if [[ ${#MISSING_AGENCY[@]} -eq 0 ]]; then
  echo "Agency: none missing"
else
  echo "Agency missing (${#MISSING_AGENCY[@]}):"
  for key in "${MISSING_AGENCY[@]}"; do
    echo "  - $key"
  done
fi

echo

if [[ ${#MISSING_PM[@]} -eq 0 ]]; then
  echo "PM: none missing"
else
  echo "PM missing (${#MISSING_PM[@]}):"
  for key in "${MISSING_PM[@]}"; do
    echo "  - $key"
  done
fi

echo
if [[ ${#MISSING_ROOT[@]} -eq 0 && ${#MISSING_AGENCY[@]} -eq 0 && ${#MISSING_PM[@]} -eq 0 ]]; then
  echo "All required production vars are present."
  exit 0
fi

echo "Template command:"
printf 'pnpm run set:prod-vars -- '
for key in "${MISSING_ROOT[@]}"; do
  printf -- '--root %s=%s ' "$key" "<value>"
done
for key in "${MISSING_AGENCY[@]}"; do
  printf -- '--agency %s=%s ' "$key" "<value>"
done
for key in "${MISSING_PM[@]}"; do
  printf -- '--pm %s=%s ' "$key" "<value>"
done
printf -- '--write\n'
