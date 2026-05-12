#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENCY_ENV="${AGENCY_ENV:-$REPO_ROOT/recoder-agency/.env.docker}"
PM_ENV="${PM_ENV:-$REPO_ROOT/recoder-pm/.env.docker}"
ROOT_ENV="${ROOT_ENV:-$REPO_ROOT/.env.production}"
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

check_daytona_auth() {
  local file="$1"
  local api_key jwt_token org_id api_url server_url
  api_key="$(get_env_value "$file" "DAYTONA_API_KEY")"
  jwt_token="$(get_env_value "$file" "DAYTONA_JWT_TOKEN")"
  org_id="$(get_env_value "$file" "DAYTONA_ORGANIZATION_ID")"
  api_url="$(get_env_value "$file" "DAYTONA_API_URL")"
  server_url="$(get_env_value "$file" "DAYTONA_SERVER_URL")"

  if [[ -z "$api_url" && -z "$server_url" ]]; then
    fail "Core daytona — DAYTONA_API_URL or DAYTONA_SERVER_URL missing in $file"
  else
    pass "Core daytona — API URL configured"
  fi

  if [[ -n "$api_key" ]]; then
    if echo "$api_key" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx'; then
      fail "Core daytona — DAYTONA_API_KEY placeholder-like value in $file"
    else
      pass "Core daytona — API key auth configured"
    fi
    return
  fi

  if [[ -n "$jwt_token" && -n "$org_id" ]]; then
    if echo "$jwt_token" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx'; then
      fail "Core daytona — DAYTONA_JWT_TOKEN placeholder-like value in $file"
      return
    fi
    if echo "$org_id" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx'; then
      fail "Core daytona — DAYTONA_ORGANIZATION_ID placeholder-like value in $file"
      return
    fi
    pass "Core daytona — JWT auth configured"
    return
  fi

  fail "Core daytona — set DAYTONA_API_KEY or both DAYTONA_JWT_TOKEN and DAYTONA_ORGANIZATION_ID in $file"
}

echo "== Production Env Gate =="
echo "repo: $REPO_ROOT"
echo "scope: $PRODUCTION_SCOPE"

echo ""
echo "Root gate: $ROOT_ENV"
if [[ ! -f "$ROOT_ENV" ]]; then
  fail "Root env file not found: $ROOT_ENV"
else
  check_required_var "$ROOT_ENV" "INTERNAL_SERVICE_KEY" "Core auth"
  check_required_var "$ROOT_ENV" "AUTH_DATABASE_URL" "Core auth"
  check_required_var "$ROOT_ENV" "MAIN_SITE_INTERNAL_URL" "Core routing"
  check_daytona_auth "$ROOT_ENV"

  RESEND_API_KEY_VALUE="$(get_env_value "$ROOT_ENV" "RESEND_API_KEY")"
  SMTP_HOST_VALUE="$(get_env_value "$ROOT_ENV" "SMTP_HOST")"
  SMTP_SMARTHOST_VALUE="$(get_env_value "$ROOT_ENV" "SMTP_SMARTHOST")"
  SMTP_AUTH_PASSWORD_VALUE="$(get_env_value "$ROOT_ENV" "SMTP_AUTH_PASSWORD")"
  SMTP_PASSWORD_VALUE="$(get_env_value "$ROOT_ENV" "SMTP_PASSWORD")"

  if [[ -n "$RESEND_API_KEY_VALUE" ]]; then
    pass "Core email — RESEND_API_KEY set"
  elif [[ -n "$SMTP_HOST_VALUE" || -n "$SMTP_SMARTHOST_VALUE" ]]; then
    if [[ -n "$SMTP_PASSWORD_VALUE" || -n "$SMTP_AUTH_PASSWORD_VALUE" ]]; then
      pass "Core email — SMTP fallback configured"
    else
      fail "Core email — SMTP host configured without SMTP password"
    fi
  else
    fail "Core email — neither RESEND_API_KEY nor SMTP fallback configured"
  fi
fi

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
  check_required_var "$PM_ENV" "POLAR_ACCESS_TOKEN" "PM billing"
  check_required_var "$PM_ENV" "POLAR_WEBHOOK_SECRET" "PM billing"
  check_required_var "$PM_ENV" "MINIO_ROOT_PASSWORD" "PM storage"

  PM_RESEND_API_KEY="$(get_env_value "$PM_ENV" "RESEND_API_KEY")"
  PM_RESEND_TOKEN="$(get_env_value "$PM_ENV" "RESEND_TOKEN")"
  PM_SMTP_HOST="$(get_env_value "$PM_ENV" "SMTP_HOST")"
  PM_SMTP_SMARTHOST="$(get_env_value "$PM_ENV" "SMTP_SMARTHOST")"
  PM_SMTP_PASSWORD="$(get_env_value "$PM_ENV" "SMTP_PASSWORD")"
  PM_SMTP_PASS="$(get_env_value "$PM_ENV" "SMTP_PASS")"
  PM_SMTP_AUTH_PASSWORD="$(get_env_value "$PM_ENV" "SMTP_AUTH_PASSWORD")"

  if [[ -n "$PM_RESEND_API_KEY" || -n "$PM_RESEND_TOKEN" ]]; then
    pass "PM email — Resend configured"
  elif [[ -n "$PM_SMTP_HOST" || -n "$PM_SMTP_SMARTHOST" ]]; then
    if [[ -n "$PM_SMTP_PASSWORD" || -n "$PM_SMTP_PASS" || -n "$PM_SMTP_AUTH_PASSWORD" ]]; then
      pass "PM email — SMTP fallback configured"
    else
      fail "PM email — SMTP host configured without SMTP password"
    fi
  else
    fail "PM email — neither Resend nor SMTP fallback configured"
  fi

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
