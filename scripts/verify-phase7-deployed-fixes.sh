#!/usr/bin/env bash
set -euo pipefail

# Phase 7 production verification script
# Tests all 8 Recoder services, API endpoints, content checks, and JSON responses.
# Exit code = number of failures (0 = all passed).

# ---------------------------------------------------------------------------
# Service URLs (overridable via env)
# ---------------------------------------------------------------------------
RECODER_URL="${RECODER_URL:-https://recoder.xyz}"
AGENTS_URL="${AGENTS_URL:-https://agents.recoder.xyz}"
WEB_URL="${WEB_URL:-https://web.recoder.xyz}"
PM_URL="${PM_URL:-https://pm.recoder.xyz}"
AGENCY_URL="${AGENCY_URL:-https://agency.recoder.xyz}"
OPENCLAW_URL="${OPENCLAW_URL:-https://openclaw.recoder.xyz}"
API_URL="${API_URL:-https://api.recoder.xyz}"
DOCKER_URL="${DOCKER_URL:-https://docker.recoder.xyz}"

CURL_TIMEOUT=10

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
SKIP=0

pass() {
  printf "${GREEN}  ✅ PASS${RESET}: %s\n" "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf "${RED}  ❌ FAIL${RESET}: %s\n" "$1" >&2
  FAIL=$((FAIL + 1))
}

skip() {
  printf "${YELLOW}  ⏭  SKIP${RESET}: %s\n" "$1"
  SKIP=$((SKIP + 1))
}

section() {
  printf "\n${BOLD}${CYAN}── %s ──${RESET}\n" "$1"
}

# ---------------------------------------------------------------------------
# Prerequisite
# ---------------------------------------------------------------------------
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

require_cmd curl
require_cmd jq

# ---------------------------------------------------------------------------
# Helper: check HTTP status code
#   check <label> <url> <expected_code> [extra_curl_args...]
# ---------------------------------------------------------------------------
check() {
  local label="$1" url="$2" expected="$3"
  shift 3
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" "$@" "$url" 2>/dev/null || echo "000")"

  if [[ "$code" == "$expected" ]]; then
    pass "${label} -> ${code}"
  else
    fail "${label} -> ${code} (expected ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# Helper: check HTTP status + body contains string
#   check_contains <label> <url> <expected_code> <needle>
# ---------------------------------------------------------------------------
check_contains() {
  local label="$1" url="$2" expected_code="$3" needle="$4"
  local tmpfile code body

  tmpfile="$(mktemp)"
  code="$(curl -s -o "$tmpfile" -w "%{http_code}" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || echo "000")"
  body="$(cat "$tmpfile" 2>/dev/null || true)"
  rm -f "$tmpfile"

  if [[ "$code" != "$expected_code" ]]; then
    fail "${label} -> ${code} (expected ${expected_code})"
    return
  fi

  if printf '%s' "$body" | grep -qi "$needle"; then
    pass "${label} -> ${code}, contains \"${needle}\""
  else
    fail "${label} -> ${code}, missing \"${needle}\" in response body"
  fi
}

# ---------------------------------------------------------------------------
# Helper: check JSON response field
#   check_json <label> <url> <expected_code> <jq_expression> <expected_value>
#   Use "__nonempty__" as expected_value to just assert non-empty.
#   Use "__gte:N__" as expected_value to assert numeric >= N.
# ---------------------------------------------------------------------------
check_json() {
  local label="$1" url="$2" expected_code="$3" jq_expr="$4" expected_val="$5"
  local tmpfile code body actual

  tmpfile="$(mktemp)"
  code="$(curl -s -o "$tmpfile" -w "%{http_code}" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || echo "000")"
  body="$(cat "$tmpfile" 2>/dev/null || true)"
  rm -f "$tmpfile"

  if [[ "$code" != "$expected_code" ]]; then
    fail "${label} -> ${code} (expected ${expected_code})"
    return
  fi

  actual="$(printf '%s' "$body" | jq -r "${jq_expr}" 2>/dev/null || echo "__jq_error__")"

  if [[ "$actual" == "__jq_error__" || "$actual" == "null" ]]; then
    fail "${label} -> jq expression '${jq_expr}' returned null or failed to parse"
    return
  fi

  if [[ "$expected_val" == "__nonempty__" ]]; then
    if [[ -n "$actual" ]]; then
      pass "${label} -> ${jq_expr} = \"${actual}\" (non-empty)"
    else
      fail "${label} -> ${jq_expr} is empty"
    fi
    return
  fi

  # Numeric >= comparison: __gte:N__
  if [[ "$expected_val" == __gte:*__ ]]; then
    local threshold="${expected_val#__gte:}"
    threshold="${threshold%__}"
    if [[ "$actual" =~ ^[0-9]+$ ]] && (( actual >= threshold )); then
      pass "${label} -> ${jq_expr} = ${actual} (>= ${threshold})"
    else
      fail "${label} -> ${jq_expr} = ${actual} (expected >= ${threshold})"
    fi
    return
  fi

  if [[ "$actual" == "$expected_val" ]]; then
    pass "${label} -> ${jq_expr} = \"${actual}\""
  else
    fail "${label} -> ${jq_expr} = \"${actual}\" (expected \"${expected_val}\")"
  fi
}

# ===========================================================================
# TESTS
# ===========================================================================

printf "${BOLD}Phase 7 Production Verification${RESET}\n"
printf "Started: %s\n" "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# ------- 1. Service liveness -----------------------------------------------

section "Service Liveness (frontends)"

check "recoder.xyz root"            "$RECODER_URL"    200
check "agents.recoder.xyz root"     "$AGENTS_URL"     200
check "web.recoder.xyz root"        "$WEB_URL"        302
check "openclaw.recoder.xyz root"   "$OPENCLAW_URL"   200

# PM and Agency typically redirect (307 to login)
check "pm.recoder.xyz root"         "$PM_URL"         307
check "agency.recoder.xyz root"     "$AGENCY_URL"     307

section "Service Liveness (backends)"

check "api.recoder.xyz root"        "$API_URL/v1/health"        200
check "docker.recoder.xyz root"     "$DOCKER_URL/health"     200

# ------- 2. Health endpoints ------------------------------------------------

section "Health Endpoints"

check "api /health"       "${API_URL}/v1/health"    200
check "docker /health"    "${DOCKER_URL}/health" 200

# ------- 3. API model registry ---------------------------------------------

section "API Model Registry (/v1/models)"

check_json "models endpoint status"         "${API_URL}/v1/models" 200 '.free_default // empty'     "__nonempty__"
check_json "models count >= 10"             "${API_URL}/v1/models" 200 '.models | length'        "__gte:10__"

# Check free and paid models exist
check_json "has free models"  "${API_URL}/v1/models" 200 \
  '[.models[] | select(.tier == "free")] | length' "__gte:1__"

check_json "has paid models"  "${API_URL}/v1/models" 200 \
  '[.models[] | select(.tier == "paid")] | length' "__gte:1__"

# ------- 4. Docker backend API endpoints -----------------------------------

section "Docker Backend API Endpoints"

check "docker /api/web-search?q=test"   "${DOCKER_URL}/api/web-search?q=test"   200
check "docker /api/a2a/dashboard"       "${DOCKER_URL}/api/a2a/dashboard"       200
check "docker /api/a2a/workflows"       "${DOCKER_URL}/api/a2a/workflows"       200
check "docker /api/health/daytona"      "${DOCKER_URL}/api/health/daytona"      200

# ------- 5. Content checks -------------------------------------------------

section "Content Verification"

check_contains "agents branding (Recoder, not Kortix)" "$AGENTS_URL" 200 "Recoder"

# Verify no Kortix branding leak
agents_body="$(curl -s --max-time "$CURL_TIMEOUT" "$AGENTS_URL" 2>/dev/null || true)"
if printf '%s' "$agents_body" | grep -qi "Kortix"; then
  fail "agents.recoder.xyz still contains 'Kortix' branding"
else
  pass "agents.recoder.xyz has no 'Kortix' branding leaks"
fi

# ------- 6. PM & Agency redirect validation ---------------------------------

section "PM & Agency Redirect Targets"

pm_location="$(curl -s -o /dev/null -w "%{redirect_url}" --max-time "$CURL_TIMEOUT" "$PM_URL" 2>/dev/null || true)"
if [[ -n "$pm_location" ]]; then
  pass "pm.recoder.xyz redirects to: ${pm_location}"
else
  skip "pm.recoder.xyz did not include redirect URL in response"
fi

agency_location="$(curl -s -o /dev/null -w "%{redirect_url}" --max-time "$CURL_TIMEOUT" "$AGENCY_URL" 2>/dev/null || true)"
if [[ -n "$agency_location" ]]; then
  pass "agency.recoder.xyz redirects to: ${agency_location}"
else
  skip "agency.recoder.xyz did not include redirect URL in response"
fi

# ===========================================================================
# SUMMARY
# ===========================================================================

printf "\n${BOLD}────────────────────────────────${RESET}\n"
printf "${BOLD}Summary${RESET}: "
printf "${GREEN}%d passed${RESET}, " "$PASS"
printf "${RED}%d failed${RESET}, " "$FAIL"
printf "${YELLOW}%d skipped${RESET}\n" "$SKIP"
printf "Finished: %s\n" "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"

if [[ "$FAIL" -gt 0 ]]; then
  printf "\n${RED}${BOLD}Phase 7 verification FAILED with %d failure(s).${RESET}\n" "$FAIL"
  exit "$FAIL"
else
  printf "\n${GREEN}${BOLD}Phase 7 verification PASSED.${RESET}\n"
  exit 0
fi
