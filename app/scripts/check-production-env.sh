#!/usr/bin/env bash
# check-production-env.sh - Verify all required env vars for Recoder.xyz production
# Usage: bash scripts/check-production-env.sh [--remote]
# With --remote: checks env vars on Hetzner server via SSH

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_var() {
  local var_name="$1"
  local required="${2:-true}"
  local value="${!var_name:-}"

  if [ -n "$value" ]; then
    echo -e "  ${GREEN}PASS${NC} $var_name"
    ((PASS++))
  elif [ "$required" = "true" ]; then
    echo -e "  ${RED}FAIL${NC} $var_name (required)"
    ((FAIL++))
  else
    echo -e "  ${YELLOW}WARN${NC} $var_name (optional)"
    ((WARN++))
  fi
}

echo "========================================"
echo " Recoder.xyz Production Env Check"
echo "========================================"
echo ""

if [ "${1:-}" = "--remote" ]; then
  echo "Checking remote server (77.42.23.19)..."
  ssh root@77.42.23.19 'cd /root/recoder.xyz && bash -c "
    source app/.env 2>/dev/null || true
    echo \"=== Auth ===\"
    [ -n \"\${BETTER_AUTH_SECRET:-}\" ] && echo \"  PASS BETTER_AUTH_SECRET\" || echo \"  FAIL BETTER_AUTH_SECRET\"
    [ -n \"\${NEXTAUTH_SECRET:-}\" ] && echo \"  PASS NEXTAUTH_SECRET\" || echo \"  FAIL NEXTAUTH_SECRET\"
    [ -n \"\${SESSION_SYNC_SECRET:-}\${NEXTAUTH_SECRET:-}\${JWT_SECRET:-}\" ] && echo \"  PASS SESSION_SYNC_SECRET (or fallback)\" || echo \"  FAIL SESSION_SYNC_SECRET\"
    echo \"\"
    echo \"=== Database ===\"
    [ -n \"\${DATABASE_URL:-}\" ] && echo \"  PASS DATABASE_URL\" || echo \"  FAIL DATABASE_URL\"
    echo \"\"
    echo \"=== OAuth ===\"
    [ -n \"\${GITHUB_CLIENT_ID:-}\${GITHUB_ID:-}\" ] && echo \"  PASS GITHUB_CLIENT_ID\" || echo \"  WARN GITHUB_CLIENT_ID (optional)\"
    [ -n \"\${GITHUB_CLIENT_SECRET:-}\${GITHUB_SECRET:-}\" ] && echo \"  PASS GITHUB_CLIENT_SECRET\" || echo \"  WARN GITHUB_CLIENT_SECRET (optional)\"
    [ -n \"\${GOOGLE_CLIENT_ID:-}\" ] && echo \"  PASS GOOGLE_CLIENT_ID\" || echo \"  WARN GOOGLE_CLIENT_ID (optional)\"
    [ -n \"\${GOOGLE_CLIENT_SECRET:-}\" ] && echo \"  PASS GOOGLE_CLIENT_SECRET\" || echo \"  WARN GOOGLE_CLIENT_SECRET (optional)\"
    echo \"\"
    echo \"=== Email ===\"
    [ -n \"\${RESEND_API_KEY:-}\" ] && echo \"  PASS RESEND_API_KEY\" || echo \"  WARN RESEND_API_KEY (optional)\"
    [ -n \"\${EMAIL_FROM:-}\" ] && echo \"  PASS EMAIL_FROM\" || echo \"  WARN EMAIL_FROM\"
    echo \"\"
    echo \"=== Encryption ===\"
    [ -n \"\${ENCRYPTION_KEY:-}\" ] && echo \"  PASS ENCRYPTION_KEY\" || echo \"  FAIL ENCRYPTION_KEY\"
    [ -n \"\${JWT_SECRET:-}\" ] && echo \"  PASS JWT_SECRET\" || echo \"  FAIL JWT_SECRET\"
  "'
  exit 0
fi

# Local check - source .env if available
if [ -f "app/.env" ]; then
  set -a
  source app/.env
  set +a
fi

echo "--- Auth ---"
check_var BETTER_AUTH_SECRET true
check_var NEXTAUTH_SECRET true
check_var JWT_SECRET true

echo ""
echo "--- Database ---"
check_var DATABASE_URL true

echo ""
echo "--- OAuth ---"
check_var GITHUB_CLIENT_ID false
check_var GITHUB_CLIENT_SECRET false
check_var GOOGLE_CLIENT_ID false
check_var GOOGLE_CLIENT_SECRET false

echo ""
echo "--- Email ---"
check_var RESEND_API_KEY false
check_var EMAIL_FROM false

echo ""
echo "--- Encryption ---"
check_var ENCRYPTION_KEY true
check_var ENCRYPTION_SALT true

echo ""
echo "--- Services ---"
check_var NEXT_PUBLIC_APP_URL false
check_var REDIS_URL false

echo ""
echo "========================================"
echo -e " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Some required environment variables are missing!${NC}"
  exit 1
fi

echo -e "${GREEN}All required environment variables are set.${NC}"
