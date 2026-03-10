#!/usr/bin/env bash
set -u

# External-production closeout runner for tasks that need live access.
# This script is non-destructive: it verifies and reports PASS/FAIL/SKIP.
#
# Optional env:
#   RECODER_BASE_URL=https://recoder.xyz
#   ALERTMANAGER_URL=http://127.0.0.1:9093
#   ADMIN_SECRET=...
#   TEST_EMAIL=you@example.com
#   NEON_DATABASE_URL=postgresql://...
#   RUN_SSO_MATRIX=true
#   RUN_MEMORY_CHECK=true
#   SSH_HOST=root@77.42.23.19
#   SSH_KEY=~/.ssh/id_ed25519_hetzner

RECODER_BASE_URL="${RECODER_BASE_URL:-https://recoder.xyz}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://127.0.0.1:9093}"
NEON_DATABASE_URL="${NEON_DATABASE_URL:-${DATABASE_URL:-}}"
RUN_SSO_MATRIX="${RUN_SSO_MATRIX:-false}"
RUN_MEMORY_CHECK="${RUN_MEMORY_CHECK:-false}"
SSH_HOST="${SSH_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
skip() { echo "SKIP: $*"; SKIP_COUNT=$((SKIP_COUNT + 1)); return 2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

run_or_fail() {
  local label="$1"
  shift
  "$@"
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    pass "$label"
  elif [[ $rc -eq 2 ]]; then
    :
  else
    fail "$label"
  fi
}

check_billing_health() {
  local payload configured paddle dodo
  payload="$(curl -fsS "${RECODER_BASE_URL}/api/health")" || return 1

  if require_cmd jq; then
    configured="$(printf '%s' "$payload" | jq -r 'if (.billing | type) == "object" and (.billing | has("configured")) then .billing.configured else "unknown" end')"
    paddle="$(printf '%s' "$payload" | jq -r 'if (.billing.paddle | type) == "object" and (.billing.paddle | has("configured")) then .billing.paddle.configured else "unknown" end')"
    dodo="$(printf '%s' "$payload" | jq -r 'if (.billing.dodo | type) == "object" and (.billing.dodo | has("configured")) then .billing.dodo.configured else "unknown" end')"
    echo "INFO: billing.configured=${configured} paddle=${paddle} dodo=${dodo}"
    [[ "$configured" != "unknown" && "$paddle" != "unknown" && "$dodo" != "unknown" ]]
  else
    echo "INFO: jq not installed; raw /api/health payload follows"
    echo "$payload"
    [[ "$payload" == *'"billing"'* ]]
  fi
}

check_admin_email_config() {
  if [[ -z "${ADMIN_SECRET:-}" ]]; then
    skip "ADMIN_SECRET not set; skipping admin email config check"
    return 2
  fi

  local code
  code="$(curl -sS -o /tmp/admin_test_email_get.json -w "%{http_code}" \
    -H "x-admin-secret: ${ADMIN_SECRET}" \
    "${RECODER_BASE_URL}/api/admin/test-email" || true)"
  if [[ "$code" != "200" ]]; then
    cat /tmp/admin_test_email_get.json 2>/dev/null || true
    return 1
  fi

  cat /tmp/admin_test_email_get.json
  return 0
}

send_test_email() {
  if [[ -z "${ADMIN_SECRET:-}" || -z "${TEST_EMAIL:-}" ]]; then
    skip "ADMIN_SECRET or TEST_EMAIL not set; skipping live email send verification"
    return 2
  fi

  local code
  code="$(curl -sS -o /tmp/admin_test_email_post.json -w "%{http_code}" \
    -X POST \
    -H "content-type: application/json" \
    -H "x-admin-secret: ${ADMIN_SECRET}" \
    --data "{\"email\":\"${TEST_EMAIL}\",\"type\":\"verification\"}" \
    "${RECODER_BASE_URL}/api/admin/test-email" || true)"
  if [[ "$code" != "200" ]]; then
    cat /tmp/admin_test_email_post.json 2>/dev/null || true
    return 1
  fi

  cat /tmp/admin_test_email_post.json
  return 0
}

check_neon_quota() {
  if [[ -z "$NEON_DATABASE_URL" ]]; then
    skip "NEON_DATABASE_URL/DATABASE_URL not set; skipping DB quota probe"
    return 2
  fi
  if ! require_cmd psql; then
    skip "psql not installed; skipping DB quota probe"
    return 2
  fi

  local out
  out="$(psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "select now();" 2>&1)" || {
    echo "$out"
    return 1
  }
  echo "INFO: neon probe now() => $out"
  return 0
}

check_memory_snapshot() {
  if [[ "$RUN_MEMORY_CHECK" != "true" ]]; then
    skip "RUN_MEMORY_CHECK=false; skipping server memory snapshot"
    return 2
  fi
  if ! require_cmd ssh; then
    skip "ssh not installed; skipping server memory snapshot"
    return 2
  fi

  local ssh_opts=(-o StrictHostKeyChecking=no -o ConnectTimeout=10)
  if [[ -f "$SSH_KEY" ]]; then
    ssh_opts+=(-i "$SSH_KEY")
  fi

  ssh "${ssh_opts[@]}" "$SSH_HOST" '
    echo "== free -m =="
    free -m || true
    echo
    echo "== docker stats (no-stream) =="
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" || true
  '
}

run_sso_matrix() {
  if [[ "$RUN_SSO_MATRIX" != "true" ]]; then
    skip "RUN_SSO_MATRIX=false; skipping SSO/logout matrix"
    return 2
  fi
  bash scripts/sso-logout-matrix.sh
}

echo "== Production External Closeout =="
echo "BASE=${RECODER_BASE_URL}"
echo "ALERTMANAGER=${ALERTMANAGER_URL}"
echo

run_or_fail "Billing health endpoint responds with billing fields" check_billing_health
run_or_fail "Admin email config endpoint" check_admin_email_config
run_or_fail "Live verification email send (admin test)" send_test_email
run_or_fail "Neon DB quota probe (simple SELECT now())" check_neon_quota

if bash scripts/monitoring-test-fire.sh; then
  pass "Alertmanager synthetic fire script"
else
  fail "Alertmanager synthetic fire script"
fi

run_or_fail "Cross-subdomain SSO/logout matrix" run_sso_matrix
run_or_fail "Server memory snapshot" check_memory_snapshot

echo
echo "== Manual Items =="
echo "- Google Search Console: submit sitemap indexes for recoder.xyz and subdomains."
echo "- Email inbox confirmation: verify TEST_EMAIL inbox received the sent verification email."
echo "- Billing provider keys: if billing is still unconfigured, set live provider keys and rerun this script."
echo
echo "Summary: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT} SKIP=${SKIP_COUNT}"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
