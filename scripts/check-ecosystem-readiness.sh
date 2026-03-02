#!/usr/bin/env bash
set -uo pipefail

# Ecosystem Production Readiness Checker
# Validates that all services have consistent and complete configuration.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
WARN=0
UV_CACHE_DIR="${UV_CACHE_DIR:-$REPO_ROOT/.uv-cache}"
CHECK_MODE="${ECOSYSTEM_CHECK_MODE:-production}"
ECOSYSTEM_SCOPE="${ECOSYSTEM_SCOPE:-core}"

if [[ "${1:-}" == "--local-dev" ]]; then
  CHECK_MODE="local-dev"
fi

if [[ "$ECOSYSTEM_SCOPE" != "core" && "$ECOSYSTEM_SCOPE" != "full" ]]; then
  echo "Invalid ECOSYSTEM_SCOPE='$ECOSYSTEM_SCOPE' (expected core|full)" >&2
  exit 1
fi

pass() { echo "  PASS: $1"; ((PASS++)); }
fail() { echo "  FAIL: $1"; ((FAIL++)); }
warn() { echo "  WARN: $1"; ((WARN++)); }

check_file_exists() {
  local file="$1" label="$2"
  if [[ -f "$file" ]]; then
    pass "$label — file exists"
  else
    fail "$label — missing file: $file"
  fi
}

strip_quotes() {
  local v="$1"
  v="${v#\"}" ; v="${v%\"}"
  v="${v#\'}" ; v="${v%\'}"
  echo "$v"
}

check_env_var() {
  local file="$1" var="$2" label="$3"
  if [[ ! -f "$file" ]]; then
    fail "$label — file not found: $file"
    return
  fi
  local raw val
  raw=$(grep -E "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-)
  val=$(strip_quotes "$raw")
  if [[ -z "$val" ]]; then
    fail "$label — $var not set in $file"
  elif echo "$val" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx'; then
    warn "$label — $var looks like a placeholder in $file"
  else
    pass "$label — $var is set"
  fi
}

check_env_var_optional_in_local() {
  local file="$1" var="$2" label="$3"

  if [[ "$CHECK_MODE" == "local-dev" ]]; then
    if [[ ! -f "$file" ]]; then
      warn "$label — file not found in local-dev mode: $file"
      return
    fi
    local raw val
    raw=$(grep -E "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-)
    val=$(strip_quotes "$raw")
    if [[ -z "$val" ]]; then
      warn "$label — $var not set in $file (allowed in local-dev mode)"
    elif echo "$val" | grep -qiE 'placeholder|change.?this|your.?|example|todo|xxx'; then
      warn "$label — $var looks like a placeholder in $file"
    else
      pass "$label — $var is set"
    fi
    return
  fi

  check_env_var "$file" "$var" "$label"
}

check_env_match() {
  local var="$1" label="$2"
  shift 2
  local files=("$@")
  local vals=()
  local missing=0

  for f in "${files[@]}"; do
    if [[ ! -f "$f" ]]; then
      fail "$label — file not found: $f"
      ((missing++))
      continue
    fi
    local v raw
    raw=$(grep -E "^${var}=" "$f" 2>/dev/null | head -1 | cut -d= -f2-)
    v=$(strip_quotes "$raw")
    if [[ -z "$v" ]]; then
      fail "$label — $var not set in $f"
      ((missing++))
    else
      vals+=("$v")
    fi
  done

  if [[ "$missing" -gt 0 ]]; then
    return
  fi

  local first="${vals[0]}"
  for v in "${vals[@]:1}"; do
    if [[ "$v" != "$first" ]]; then
      fail "$label — $var MISMATCH across files"
      return
    fi
  done
  pass "$label — $var consistent across ${#files[@]} files"
}

run_backend_guard() {
  local script_path="$1"
  local pass_label="$2"
  local fail_label="$3"

  if [[ ! -f "$REPO_ROOT/backend/$script_path" ]]; then
    warn "Backend — missing guard script: $script_path"
    return
  fi

  if ! command -v uv &>/dev/null; then
    warn "Backend — uv not available, skipping $script_path"
    return
  fi

  mkdir -p "$UV_CACHE_DIR"
  if (cd "$REPO_ROOT/backend" && UV_CACHE_DIR="$UV_CACHE_DIR" uv run --python 3.13 python "$script_path") &>/dev/null 2>&1; then
    pass "$pass_label"
    return
  fi

  # Fallback path for environments where uv sandbox/cache fails.
  if command -v python3 &>/dev/null && (cd "$REPO_ROOT/backend" && python3 "$script_path") &>/dev/null 2>&1; then
    pass "$pass_label (python3 fallback)"
    return
  fi

  fail "$fail_label"
}

# --------------------------------------------------
echo ""
echo "Ecosystem check mode: $CHECK_MODE"
echo "Ecosystem scope: $ECOSYSTEM_SCOPE"
echo ""
echo "=== Track 1: Shared Auth ==="
echo ""

APP_ENV="$REPO_ROOT/app/.env.production"
APP_ENV_ALT="$REPO_ROOT/app/.env.local"
AGENCY_ENV="$REPO_ROOT/recoder-agency/.env.docker"
AGENCY_ENV_ALT="$REPO_ROOT/recoder-agency/apps/agency/.env.local"
PM_ENV="$REPO_ROOT/recoder-pm/.env.docker"

# Find app env file
if [[ -f "$APP_ENV" ]]; then
  APP_ACTIVE="$APP_ENV"
elif [[ -f "$APP_ENV_ALT" ]]; then
  APP_ACTIVE="$APP_ENV_ALT"
else
  APP_ACTIVE=""
  fail "Auth — No app env file found ($APP_ENV or $APP_ENV_ALT)"
fi

# Find agency env file
if [[ -f "$AGENCY_ENV" ]]; then
  AGENCY_ACTIVE="$AGENCY_ENV"
elif [[ -f "$AGENCY_ENV_ALT" ]]; then
  AGENCY_ACTIVE="$AGENCY_ENV_ALT"
else
  AGENCY_ACTIVE=""
  if [[ "$ECOSYSTEM_SCOPE" == "full" ]]; then
    fail "Auth — No agency env file found ($AGENCY_ENV or $AGENCY_ENV_ALT)"
  else
    warn "Auth — No agency env file found in core scope ($AGENCY_ENV or $AGENCY_ENV_ALT)"
  fi
fi

if [[ -n "$APP_ACTIVE" ]]; then
  check_env_var "$APP_ACTIVE" "BETTER_AUTH_SECRET" "Auth"
fi

if [[ "$ECOSYSTEM_SCOPE" == "full" && -n "$AGENCY_ACTIVE" ]]; then
  check_env_var "$AGENCY_ACTIVE" "BETTER_AUTH_SECRET" "Auth (agency)"
  check_env_var "$AGENCY_ACTIVE" "AUTH_DATABASE_URL" "Auth (agency)"
fi

if [[ -f "$PM_ENV" && "$ECOSYSTEM_SCOPE" == "full" ]]; then
  check_env_var "$PM_ENV" "BETTER_AUTH_SECRET" "Auth (PM)"
  check_env_var "$PM_ENV" "AUTH_DATABASE_URL" "Auth (PM)"
elif [[ "$ECOSYSTEM_SCOPE" == "full" ]]; then
  fail "Auth — PM env file not found: $PM_ENV"
fi

# Check BETTER_AUTH_SECRET consistency
AUTH_FILES=()
[[ -n "$APP_ACTIVE" ]] && AUTH_FILES+=("$APP_ACTIVE")
if [[ "$ECOSYSTEM_SCOPE" == "full" ]]; then
  [[ -n "$AGENCY_ACTIVE" ]] && AUTH_FILES+=("$AGENCY_ACTIVE")
  [[ -f "$PM_ENV" ]] && AUTH_FILES+=("$PM_ENV")
fi
if [[ "${#AUTH_FILES[@]}" -ge 2 ]]; then
  check_env_match "BETTER_AUTH_SECRET" "Auth consistency" "${AUTH_FILES[@]}"
fi

# --------------------------------------------------
echo ""
echo "=== Track 2: Main Branch (app + recoder-web + docker-backend) ==="
echo ""

WEB_ENV="$REPO_ROOT/recoder-web/.env.local"
WEB_ENV_ALT="$REPO_ROOT/recoder-web/.env"
DOCKER_ENV="$REPO_ROOT/docker-backend/.env"

if [[ -f "$WEB_ENV" ]]; then
  WEB_ACTIVE="$WEB_ENV"
elif [[ -f "$WEB_ENV_ALT" ]]; then
  WEB_ACTIVE="$WEB_ENV_ALT"
else
  WEB_ACTIVE=""
  fail "Main branch — No recoder-web env file found"
fi

ISK_FILES=()
[[ -n "$APP_ACTIVE" ]] && ISK_FILES+=("$APP_ACTIVE")
[[ -n "$WEB_ACTIVE" ]] && ISK_FILES+=("$WEB_ACTIVE")
[[ -f "$DOCKER_ENV" ]] && ISK_FILES+=("$DOCKER_ENV")
if [[ "${#ISK_FILES[@]}" -ge 2 ]]; then
  check_env_match "INTERNAL_SERVICE_KEY" "Service auth" "${ISK_FILES[@]}"
fi

if [[ -f "$DOCKER_ENV" ]]; then
  check_env_var "$DOCKER_ENV" "REDIS_URL" "Docker backend"
  check_env_var "$DOCKER_ENV" "PUBLIC_PROMPT_TASK_QUEUE_BACKEND" "Docker backend"
  check_env_var "$DOCKER_ENV" "VAULT_MASTER_KEY" "Docker backend"
  check_env_var "$DOCKER_ENV" "VAULT_SALT" "Docker backend"
  check_env_var "$DOCKER_ENV" "API_KEY_HASH_SALT" "Docker backend"
  check_env_var "$DOCKER_ENV" "IDENTITY_TOKEN_SECRET" "Docker backend"
else
  warn "Docker backend — env file not found: $DOCKER_ENV"
fi

# --------------------------------------------------
echo ""
echo "=== Track 3: Agency Go-Live ==="
echo ""

if [[ "$ECOSYSTEM_SCOPE" != "full" ]]; then
  warn "Agency Go-Live checks skipped in core scope."
elif [[ -n "$AGENCY_ACTIVE" ]]; then
  check_env_var_optional_in_local "$AGENCY_ACTIVE" "POLAR_ACCESS_TOKEN" "Agency billing"
  check_env_var_optional_in_local "$AGENCY_ACTIVE" "POLAR_PRO_PRODUCT_ID" "Agency billing"
  check_env_var_optional_in_local "$AGENCY_ACTIVE" "POLAR_WEBHOOK_SECRET" "Agency billing"
  check_env_var_optional_in_local "$AGENCY_ACTIVE" "POLAR_ORGANIZATION_ID" "Agency billing"
  check_env_var "$AGENCY_ACTIVE" "RECODER_WEB_URL" "Agency integration"
  check_env_var_optional_in_local "$AGENCY_ACTIVE" "RECODER_WEB_API_KEY" "Agency integration"
  check_env_var "$AGENCY_ACTIVE" "COOKIE_SECRET" "Agency security"
  check_env_var "$AGENCY_ACTIVE" "TOKEN_ENCRYPTION_KEY" "Agency security"
fi

# --------------------------------------------------
echo ""
echo "=== Track 4: PM Go-Live ==="
echo ""

if [[ "$ECOSYSTEM_SCOPE" != "full" ]]; then
  warn "PM Go-Live checks skipped in core scope."
elif [[ -f "$PM_ENV" ]]; then
  check_env_var "$PM_ENV" "DATABASE_URL" "PM database"
  check_env_var "$PM_ENV" "RESEND_API_KEY" "PM email"
  check_env_var_optional_in_local "$PM_ENV" "POLAR_ACCESS_TOKEN" "PM billing"
  check_env_var_optional_in_local "$PM_ENV" "POLAR_WEBHOOK_SECRET" "PM billing"
  check_env_var "$PM_ENV" "MINIO_ROOT_PASSWORD" "PM storage"

  # Check MinIO password is not default
  MINIO_PW_RAW=$(grep -E "^MINIO_ROOT_PASSWORD=" "$PM_ENV" 2>/dev/null | head -1 | cut -d= -f2-)
  MINIO_PW=$(strip_quotes "$MINIO_PW_RAW")
  if [[ "$MINIO_PW" == "minioadmin" || "$MINIO_PW" == "change-me-in-production" ]]; then
    fail "PM storage — MINIO_ROOT_PASSWORD is still default/insecure"
  fi
fi

# --------------------------------------------------
echo ""
echo "=== Track 5: Code Guardrails ==="
echo ""

# Backend Supabase import guard
run_backend_guard \
  "core/utils/scripts/check_no_supabase_imports.py" \
  "Backend — no Supabase imports" \
  "Backend — Supabase import guard failed"

# Backend DBConnection guard
run_backend_guard \
  "core/utils/scripts/check_no_dbconnection_usage.py" \
  "Backend — no DBConnection usage" \
  "Backend — DBConnection guard failed"

# Phase 1 env consistency
if [[ -x "$REPO_ROOT/scripts/check-phase1-env-consistency.sh" ]]; then
  if bash "$REPO_ROOT/scripts/check-phase1-env-consistency.sh" &>/dev/null 2>&1; then
    pass "Phase 1 — env consistency check"
  else
    warn "Phase 1 — env consistency check failed (may need env files)"
  fi
fi

# --------------------------------------------------
echo ""
echo "=== Track 6: OpenClaw Ecosystem Integration ==="
echo ""

OPENCLAW_ROOT="$REPO_ROOT/openclaw"
OPENCLAW_ENV="$OPENCLAW_ROOT/.env"
OPENCLAW_ENV_ALT="$OPENCLAW_ROOT/.env.local"

check_file_exists "$OPENCLAW_ROOT/extensions/recoder-plugin/index.ts" "OpenClaw plugin"
check_file_exists "$OPENCLAW_ROOT/extensions/recoder-plugin/src/tools/recoder-tool.ts" "OpenClaw plugin"
check_file_exists "$OPENCLAW_ROOT/extensions/recoder-plugin/src/services/api-key-manager.ts" "OpenClaw plugin"
check_file_exists "$REPO_ROOT/docker-backend/src/public-api/routes/openclaw-keys.ts" "Recoder API"

if [[ -f "$OPENCLAW_ENV" ]]; then
  OPENCLAW_ACTIVE_ENV="$OPENCLAW_ENV"
elif [[ -f "$OPENCLAW_ENV_ALT" ]]; then
  OPENCLAW_ACTIVE_ENV="$OPENCLAW_ENV_ALT"
else
  OPENCLAW_ACTIVE_ENV=""
  warn "OpenClaw env — no env file found ($OPENCLAW_ENV or $OPENCLAW_ENV_ALT)"
fi

if [[ -n "$OPENCLAW_ACTIVE_ENV" ]]; then
  check_env_var_optional_in_local "$OPENCLAW_ACTIVE_ENV" "RECODER_WEB_URL" "OpenClaw Recoder"
  check_env_var_optional_in_local "$OPENCLAW_ACTIVE_ENV" "RECODER_DOCKER_URL" "OpenClaw Recoder"
  check_env_var_optional_in_local "$OPENCLAW_ACTIVE_ENV" "RECODER_API_URL" "OpenClaw Recoder"
fi

# --------------------------------------------------
echo ""
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL  |  WARN: $WARN"
echo "========================================="
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "Production readiness: NOT READY ($FAIL failures)"
  echo "Run: bash scripts/generate-ecosystem-secrets.sh secrets.env"
  echo "Then distribute secrets to each service's env file."
  exit 1
else
  echo "Production readiness: READY (with $WARN warnings)"
  exit 0
fi
