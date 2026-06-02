#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="${ROOT_ENV:-$REPO_ROOT/.env.production}"
AGENCY_ENV="${AGENCY_ENV:-$REPO_ROOT/recoder-agency/.env.docker}"
PM_ENV="${PM_ENV:-$REPO_ROOT/recoder-pm/.env.docker}"
WRITE_MODE="${WRITE_MODE:-false}"
USE_PROCESS_ENV=false
ROTATE_MINIO=false

root_pairs=()
agency_pairs=()
pm_pairs=()

usage() {
  cat <<'EOF'
Set production env vars for root, Agency, and PM.

Usage:
  bash scripts/set-production-vars.sh [options]

Options:
  --write                  Apply changes (default is dry-run)
  --from-env               Read known keys from current process env and stage them
  --rotate-minio           Generate and set secure MINIO_ROOT_PASSWORD + S3_SECRET_ACCESS_KEY in PM
  --root KEY=VALUE         Stage root .env.production key/value (repeatable)
  --agency KEY=VALUE       Stage Agency key/value (repeatable)
  --pm KEY=VALUE           Stage PM key/value (repeatable)
  -h, --help               Show help

Known Root keys:
  INTERNAL_SERVICE_KEY AUTH_DATABASE_URL MAIN_SITE_INTERNAL_URL
  DAYTONA_API_KEY DAYTONA_JWT_TOKEN DAYTONA_ORGANIZATION_ID DAYTONA_API_URL DAYTONA_SERVER_URL

Known Agency keys:
  POLAR_ACCESS_TOKEN POLAR_PRO_PRODUCT_ID POLAR_WEBHOOK_SECRET POLAR_ORGANIZATION_ID
  RECODER_WEB_API_KEY PRODUCTION_DEPLOY_WEBHOOK_URL ALERT_WEBHOOK_URL

Known PM keys:
  RESEND_API_KEY POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET
  POLAR_PRODUCT_PRO_ID POLAR_PRODUCT_ENTERPRISE_ID POLAR_SERVER
  MINIO_ROOT_PASSWORD S3_SECRET_ACCESS_KEY
EOF
}

contains_key() {
  local key="$1"; shift
  local arr=("$@")
  local x
  for x in "${arr[@]}"; do
    [[ "$x" == "$key" ]] && return 0
  done
  return 1
}

root_known=(
  INTERNAL_SERVICE_KEY AUTH_DATABASE_URL MAIN_SITE_INTERNAL_URL
  DAYTONA_API_KEY DAYTONA_JWT_TOKEN DAYTONA_ORGANIZATION_ID DAYTONA_API_URL DAYTONA_SERVER_URL
)

agency_known=(
  POLAR_ACCESS_TOKEN POLAR_PRO_PRODUCT_ID POLAR_WEBHOOK_SECRET POLAR_ORGANIZATION_ID
  RECODER_WEB_API_KEY PRODUCTION_DEPLOY_WEBHOOK_URL ALERT_WEBHOOK_URL
)

pm_known=(
  RESEND_API_KEY POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET
  POLAR_PRODUCT_PRO_ID POLAR_PRODUCT_ENTERPRISE_ID POLAR_SERVER
  MINIO_ROOT_PASSWORD S3_SECRET_ACCESS_KEY
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write) WRITE_MODE=true ;;
    --from-env) USE_PROCESS_ENV=true ;;
    --rotate-minio) ROTATE_MINIO=true ;;
    --root)
      shift
      [[ $# -gt 0 ]] || { echo "--root requires KEY=VALUE" >&2; exit 1; }
      root_pairs+=("$1")
      ;;
    --agency)
      shift
      [[ $# -gt 0 ]] || { echo "--agency requires KEY=VALUE" >&2; exit 1; }
      agency_pairs+=("$1")
      ;;
    --pm)
      shift
      [[ $# -gt 0 ]] || { echo "--pm requires KEY=VALUE" >&2; exit 1; }
      pm_pairs+=("$1")
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

ensure_file() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  [[ -f "$file" ]] || touch "$file"
}

upsert_key() {
  local file="$1" key="$2" value="$3"
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

stage_from_env() {
  local key val
  for key in "${root_known[@]}"; do
    val="${!key:-}"
    [[ -n "$val" ]] && root_pairs+=("$key=$val")
  done
  for key in "${agency_known[@]}"; do
    val="${!key:-}"
    [[ -n "$val" ]] && agency_pairs+=("$key=$val")
  done
  for key in "${pm_known[@]}"; do
    val="${!key:-}"
    [[ -n "$val" ]] && pm_pairs+=("$key=$val")
  done
}

validate_pair() {
  local pair="$1" scope="$2"
  local key value
  key="${pair%%=*}"
  value="${pair#*=}"
  if [[ -z "$key" || "$key" == "$value" ]]; then
    echo "Invalid $scope pair (expected KEY=VALUE): $pair" >&2
    exit 1
  fi
  if [[ "$scope" == "root" ]]; then
    contains_key "$key" "${root_known[@]}" || { echo "Unknown root key: $key" >&2; exit 1; }
  elif [[ "$scope" == "agency" ]]; then
    contains_key "$key" "${agency_known[@]}" || { echo "Unknown agency key: $key" >&2; exit 1; }
  else
    contains_key "$key" "${pm_known[@]}" || { echo "Unknown pm key: $key" >&2; exit 1; }
  fi
}

if [[ "$USE_PROCESS_ENV" == true ]]; then
  stage_from_env
fi

if [[ "$ROTATE_MINIO" == true ]]; then
  if command -v openssl >/dev/null 2>&1; then
    minio_pw="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
  else
    minio_pw="$(date +%s)-minio-rotated"
  fi
  pm_pairs+=("MINIO_ROOT_PASSWORD=$minio_pw")
  pm_pairs+=("S3_SECRET_ACCESS_KEY=$minio_pw")
fi

if [[ "${#root_pairs[@]}" -gt 0 ]]; then
  for p in "${root_pairs[@]}"; do validate_pair "$p" "root"; done
fi
if [[ "${#agency_pairs[@]}" -gt 0 ]]; then
  for p in "${agency_pairs[@]}"; do validate_pair "$p" "agency"; done
fi
if [[ "${#pm_pairs[@]}" -gt 0 ]]; then
  for p in "${pm_pairs[@]}"; do validate_pair "$p" "pm"; done
fi

echo "mode: $([[ "$WRITE_MODE" == true ]] && echo write || echo dry-run)"
echo "root env: $ROOT_ENV"
echo "agency env: $AGENCY_ENV"
echo "pm env: $PM_ENV"
echo ""

apply_pairs() {
  local file="$1" scope="$2"; shift 2
  local pair key value
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    if [[ "$WRITE_MODE" == true ]]; then
      ensure_file "$file"
      upsert_key "$file" "$key" "$value"
      echo "applied: [$scope] $key"
    else
      echo "dry-run: [$scope] $key"
    fi
  done
}

if [[ "${#root_pairs[@]}" -gt 0 ]]; then
  apply_pairs "$ROOT_ENV" "root" "${root_pairs[@]}"
fi
if [[ "${#agency_pairs[@]}" -gt 0 ]]; then
  apply_pairs "$AGENCY_ENV" "agency" "${agency_pairs[@]}"
fi
if [[ "${#pm_pairs[@]}" -gt 0 ]]; then
  apply_pairs "$PM_ENV" "pm" "${pm_pairs[@]}"
fi

if [[ "$WRITE_MODE" == true ]]; then
  echo ""
  echo "Running production env gate after write..."
  bash "$REPO_ROOT/scripts/check-production-env-gate.sh" || true
fi

echo ""
echo "Done."
