#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENCY_ENV="${AGENCY_ENV:-$REPO_ROOT/recoder-agency/.env.docker}"
PM_ENV="${PM_ENV:-$REPO_ROOT/recoder-pm/.env.docker}"
PRODUCTION_SCOPE="${PRODUCTION_SCOPE:-core}"

PASS=0
FAIL=0
WARN=0

pass() { echo "  PASS: $1"; ((PASS+=1)); }
fail() { echo "  FAIL: $1"; ((FAIL+=1)); }
warn() { echo "  WARN: $1"; ((WARN+=1)); }

strip_quotes() {
  local v="$1"
  v="${v#\"}" ; v="${v%\"}"
  v="${v#\'}" ; v="${v%\'}"
  echo "$v"
}

get_env_value() {
  local file="$1" key="$2" raw
  raw="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  strip_quotes "$raw"
}

check_required_var() {
  local file="$1" key="$2" label="$3"
  local v
  v="$(get_env_value "$file" "$key")"
  if [[ -z "$v" ]]; then
    fail "$label — $key missing in $file"
    return
  fi
  if echo "$v" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx'; then
    fail "$label — $key placeholder-like value in $file"
    return
  fi
  pass "$label — $key set"
}

echo "== Production Env Gate =="
echo "repo: $REPO_ROOT"
echo "scope: $PRODUCTION_SCOPE"

if [[ "$PRODUCTION_SCOPE" != "core" && "$PRODUCTION_SCOPE" != "full" ]]; then
  echo "Invalid PRODUCTION_SCOPE='$PRODUCTION_SCOPE' (expected core|full)" >&2
  exit 1
fi

echo ""
echo "Agency gate: $AGENCY_ENV"
if [[ "$PRODUCTION_SCOPE" == "core" ]]; then
  warn "Agency gate skipped in core scope (deferred surface)"
elif [[ ! -f "$AGENCY_ENV" ]]; then
  fail "Agency env file not found: $AGENCY_ENV"
else
  check_required_var "$AGENCY_ENV" "BETTER_AUTH_SECRET" "Agency auth"
  check_required_var "$AGENCY_ENV" "AUTH_DATABASE_URL" "Agency auth"
  check_required_var "$AGENCY_ENV" "COOKIE_SECRET" "Agency security"
  check_required_var "$AGENCY_ENV" "TOKEN_ENCRYPTION_KEY" "Agency security"
  check_required_var "$AGENCY_ENV" "POLAR_ACCESS_TOKEN" "Agency billing"
  check_required_var "$AGENCY_ENV" "POLAR_PRO_PRODUCT_ID" "Agency billing"
  check_required_var "$AGENCY_ENV" "POLAR_WEBHOOK_SECRET" "Agency billing"
  check_required_var "$AGENCY_ENV" "POLAR_ORGANIZATION_ID" "Agency billing"
  check_required_var "$AGENCY_ENV" "RECODER_WEB_URL" "Agency integration"
  check_required_var "$AGENCY_ENV" "RECODER_WEB_API_KEY" "Agency integration"
fi

echo ""
echo "PM gate: $PM_ENV"
if [[ "$PRODUCTION_SCOPE" == "core" ]]; then
  warn "PM gate skipped in core scope (deferred surface)"
elif [[ ! -f "$PM_ENV" ]]; then
  fail "PM env file not found: $PM_ENV"
else
  check_required_var "$PM_ENV" "BETTER_AUTH_SECRET" "PM auth"
  check_required_var "$PM_ENV" "AUTH_DATABASE_URL" "PM auth"
  check_required_var "$PM_ENV" "DATABASE_URL" "PM database"
  check_required_var "$PM_ENV" "RESEND_API_KEY" "PM email"
  check_required_var "$PM_ENV" "POLAR_ACCESS_TOKEN" "PM billing"
  check_required_var "$PM_ENV" "POLAR_WEBHOOK_SECRET" "PM billing"
  check_required_var "$PM_ENV" "MINIO_ROOT_PASSWORD" "PM storage"

  MINIO_PW="$(get_env_value "$PM_ENV" "MINIO_ROOT_PASSWORD")"
  if [[ "$MINIO_PW" == "minioadmin" || "$MINIO_PW" == "change-me-in-production" ]]; then
    fail "PM storage — MINIO_ROOT_PASSWORD still default/insecure"
  fi
fi

echo ""
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL  |  WARN: $WARN"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "production env gate: FAIL ($FAIL issue(s))"
  exit 1
fi

echo ""
echo "production env gate: PASS"
