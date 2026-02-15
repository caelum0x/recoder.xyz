#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENCY_ENV="$REPO_ROOT/recoder-agency/.env.docker"
PM_ENV="$REPO_ROOT/recoder-pm/.env.docker"

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

while IFS= read -r key; do
  [[ -n "$key" ]] && MISSING_AGENCY+=("$key")
done < <(collect_missing "$AGENCY_ENV" "${AGENCY_KEYS[@]}")

while IFS= read -r key; do
  [[ -n "$key" ]] && MISSING_PM+=("$key")
done < <(collect_missing "$PM_ENV" "${PM_KEYS[@]}")

echo "== Production Env Missing Vars =="
echo "agency env: $AGENCY_ENV"
echo "pm env:     $PM_ENV"
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
if [[ ${#MISSING_AGENCY[@]} -eq 0 && ${#MISSING_PM[@]} -eq 0 ]]; then
  echo "All required production vars are present."
  exit 0
fi

echo "Template command:"
printf 'pnpm run set:prod-vars -- '
for key in "${MISSING_AGENCY[@]}"; do
  printf -- '--agency %s=%s ' "$key" "<value>"
done
for key in "${MISSING_PM[@]}"; do
  printf -- '--pm %s=%s ' "$key" "<value>"
done
printf -- '--write\n'
