#!/usr/bin/env bash
set -euo pipefail

# Phase 14 runtime verifier:
# - delegated auth social start endpoints
# - agents CSP (Stripe + recoder auth/connect)
# - main app health + email provider config
# - forgot-password response contract
# - docker backend health
# - optional analytics queue-status probe

RECODER_BASE_URL="${RECODER_BASE_URL:-https://recoder.xyz}"
AGENTS_URL="${AGENTS_URL:-https://agents.recoder.xyz}"
DOCKER_URL="${DOCKER_URL:-https://docker.recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://api.recoder.xyz}"
WEB_URL="${WEB_URL:-https://web.recoder.xyz}"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1" >&2
  FAIL=$((FAIL + 1))
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

require_cmd curl
require_cmd jq

strip_control_chars() {
  tr -d '\000-\037'
}

check_social() {
  local provider="$1"
  local code
  code="$(curl -sS -o /tmp/phase14_social_"$provider".json -w "%{http_code}" \
    -X POST "${RECODER_BASE_URL}/api/auth/sign-in/social" \
    -H "content-type: application/json" \
    --data "{\"provider\":\"${provider}\",\"callbackURL\":\"${AGENTS_URL}/auth/callback\"}" || true)"
  [[ -n "$code" ]] || code="000"

  if [[ "$code" == "200" ]]; then
    pass "social sign-in start (${provider}) returned 200"
  elif [[ "$code" == "503" ]]; then
    pass "social sign-in start (${provider}) returned explicit 503 (degraded auth)"
  else
    fail "social sign-in start (${provider}) returned ${code}"
  fi
}

check_agents_csp() {
  local headers csp_lines
  headers="$(curl -I -sS "${AGENTS_URL}")"
  csp_lines="$(printf "%s\n" "$headers" | grep -i '^content-security-policy:' || true)"

  if [[ -z "$csp_lines" ]]; then
    fail "agents response has no CSP header"
    return
  fi

  if printf "%s\n" "$csp_lines" | grep -qi "js.stripe.com"; then
    pass "agents CSP includes js.stripe.com"
  else
    fail "agents CSP missing js.stripe.com"
  fi

  if printf "%s\n" "$csp_lines" | grep -qi "connect-src.*recoder.xyz"; then
    pass "agents CSP connect-src includes recoder.xyz"
  else
    fail "agents CSP connect-src missing recoder.xyz"
  fi
}

check_main_health() {
  local payload status email_configured billing_configured paddle_configured dodo_configured
  payload="$(curl -sS "${RECODER_BASE_URL}/api/health" 2>/dev/null | strip_control_chars || true)"
  if [[ -z "$payload" ]]; then
    fail "main /api/health unreachable"
    fail "main /api/health email configuration unknown (endpoint unreachable)"
    fail "main /api/health billing configuration unknown (endpoint unreachable)"
    return
  fi
  status="$(printf "%s" "$payload" | jq -r '.status // empty' 2>/dev/null || true)"
  email_configured="$(printf "%s" "$payload" | jq -r '.email.configured // false' 2>/dev/null || echo false)"
  billing_configured="$(printf "%s" "$payload" | jq -r '.billing.configured // false' 2>/dev/null || echo false)"
  paddle_configured="$(printf "%s" "$payload" | jq -r '.billing.paddle.configured // false' 2>/dev/null || echo false)"
  dodo_configured="$(printf "%s" "$payload" | jq -r '.billing.dodo.configured // false' 2>/dev/null || echo false)"
  if [[ -z "$status" ]]; then
    fail "main /api/health returned non-JSON or invalid payload"
    fail "main /api/health email configuration unknown (invalid payload)"
    fail "main /api/health billing configuration unknown (invalid payload)"
    return
  fi

  if [[ "$status" == "healthy" ]]; then
    pass "main /api/health status=healthy"
  elif [[ "$status" == "degraded" ]]; then
    pass "main /api/health status=degraded"
  else
    fail "main /api/health status=${status:-missing}"
  fi

  if [[ "$email_configured" == "true" ]]; then
    pass "main /api/health reports email configured"
  else
    fail "main /api/health reports email not configured"
  fi

  if [[ "$billing_configured" == "true" && ( "$paddle_configured" == "true" || "$dodo_configured" == "true" ) ]]; then
    pass "main /api/health billing configured with at least one provider"
  elif [[ "$billing_configured" == "false" && "$paddle_configured" == "false" && "$dodo_configured" == "false" ]]; then
    pass "main /api/health billing truthfully reports unconfigured providers"
  else
    fail "main /api/health billing configuration fields inconsistent"
  fi
}

check_forgot_password_contract() {
  local body success message
  body="$(curl -sS -X POST "${RECODER_BASE_URL}/api/auth/forgot-password" \
    -H "content-type: application/json" \
    --data '{"email":"phase14-smoke@recoder.xyz"}' 2>/dev/null | strip_control_chars || true)"
  if [[ -z "$body" ]]; then
    fail "forgot-password endpoint unreachable"
    return
  fi
  success="$(printf "%s" "$body" | jq -r '.success // false' 2>/dev/null || echo false)"
  message="$(printf "%s" "$body" | jq -r '.message // empty' 2>/dev/null || true)"

  if [[ "$success" == "true" && "$message" == *"If an account exists"* ]]; then
    pass "forgot-password endpoint returns safe success contract"
  else
    fail "forgot-password endpoint contract mismatch"
  fi
}

check_docker_health() {
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${DOCKER_URL}/health" || true)"
  [[ -n "$code" ]] || code="000"
  if [[ "$code" == "200" ]]; then
    pass "docker backend health returned 200"
  else
    fail "docker backend health returned ${code}"
  fi
}

check_web_runtime() {
  local root_headers root_status location health_status

  root_headers="$(curl -sSI "${WEB_URL}" || true)"
  root_status="$(printf "%s\n" "$root_headers" | grep -im1 '^HTTP/' | tr -d '\r' | cut -d' ' -f2)"
  location="$(printf "%s\n" "$root_headers" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')"

  if [[ "$root_status" == "302" && "$location" == https://recoder.xyz/auth/signin* ]]; then
    pass "web root is intentionally auth-gated (302 to recoder.xyz signin)"
  elif [[ "$root_status" == "200" ]]; then
    pass "web root returned 200"
  else
    fail "web root unexpected status/location (${root_status:-missing}, ${location:-none})"
  fi

  health_status="$(curl -sS -o /tmp/phase14_web_health.json -w "%{http_code}" "${WEB_URL}/api/health" || true)"
  [[ -n "$health_status" ]] || health_status="000"
  if [[ "$health_status" == "200" ]]; then
    pass "web /api/health returned 200"
  else
    fail "web /api/health returned ${health_status}"
  fi
}

check_queue_status_optional() {
  local url code
  url="${BACKEND_URL}/v1/admin/analytics/conversations/queue-status"

  if [[ -n "${BACKEND_BEARER_TOKEN:-}" ]]; then
    code="$(curl -sS -o /tmp/phase14_queue_status.json -w "%{http_code}" \
      -H "Authorization: Bearer ${BACKEND_BEARER_TOKEN}" \
      "$url" || true)"
  else
    code="$(curl -sS -o /tmp/phase14_queue_status.json -w "%{http_code}" "$url" || true)"
  fi
  [[ -n "$code" ]] || code="000"

  case "$code" in
    200)
      pass "analytics queue-status endpoint returned 200"
      ;;
    401|403)
      pass "analytics queue-status endpoint auth-protected (${code})"
      ;;
    *)
      fail "analytics queue-status endpoint returned ${code}"
      ;;
  esac
}

echo "Running Phase 14 runtime verifier..."
check_social "github"
check_social "google"
check_agents_csp
check_main_health
check_forgot_password_contract
check_docker_health
check_web_runtime
check_queue_status_optional

echo "Summary: PASS=${PASS} FAIL=${FAIL}"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
