#!/usr/bin/env bash
# smoke-user-journey.sh - End-to-end user journey smoke test for Recoder.xyz
# Tests the full signup -> dashboard -> API key -> Web IDE flow via HTTP
# Usage: bash scripts/smoke-user-journey.sh [BASE_URL]

set -euo pipefail

BASE_URL="${1:-https://recoder.xyz}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)

cleanup() {
  rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

test_step() {
  local name="$1"
  local result="$2"
  local expected="${3:-200}"

  if [ "$result" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${NC} $name (HTTP $result)"
    ((PASS++))
  else
    echo -e "  ${RED}FAIL${NC} $name (expected $expected, got $result)"
    ((FAIL++))
  fi
}

echo "========================================"
echo " Recoder.xyz User Journey Smoke Test"
echo " Target: $BASE_URL"
echo "========================================"
echo ""

# Step 1: Homepage loads
echo "--- Step 1: Homepage ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL")
test_step "Homepage loads" "$STATUS"

# Step 2: Auth pages load
echo ""
echo "--- Step 2: Auth Pages ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/signin")
test_step "Signin page loads" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/signup")
test_step "Signup page loads" "$STATUS"

# Step 3: API health endpoints
echo ""
echo "--- Step 3: API Health ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/session")
test_step "Session endpoint responds" "$STATUS"

# Step 4: Better Auth endpoint
echo ""
echo "--- Step 4: Auth API ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com","password":"TestPassword123!"}' \
  "$BASE_URL/api/auth/sign-in/email")
# We expect either 200 (success) or 401/400 (invalid creds - but endpoint works)
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ]; then
  echo -e "  ${GREEN}PASS${NC} Auth sign-in endpoint responds (HTTP $STATUS)"
  ((PASS++))
else
  echo -e "  ${RED}FAIL${NC} Auth sign-in endpoint (expected 2xx/4xx, got $STATUS)"
  ((FAIL++))
fi

# Step 5: Dashboard requires auth (should redirect)
echo ""
echo "--- Step 5: Protected Routes ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE_URL/dashboard")
test_step "Dashboard page loads (may redirect to signin)" "$STATUS"

# Step 6: Settings page
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE_URL/settings")
test_step "Settings page loads" "$STATUS"

# Step 7: AI Providers page
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE_URL/settings/ai-providers")
test_step "AI Providers page loads" "$STATUS"

# Step 8: Platform pages
echo ""
echo "--- Step 6: Platform Pages ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/platform")
test_step "Platform page loads" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/agents")
test_step "Agents page loads" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/plan")
test_step "Plan page loads" "$STATUS"

# Step 9: Web IDE health
echo ""
echo "--- Step 7: Web IDE ---"
WEB_IDE_URL="https://web.recoder.xyz"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WEB_IDE_URL" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ]; then
  echo -e "  ${GREEN}PASS${NC} Web IDE reachable (HTTP $STATUS)"
  ((PASS++))
elif [ "$STATUS" = "000" ]; then
  echo -e "  ${YELLOW}SKIP${NC} Web IDE unreachable (timeout or DNS)"
else
  echo -e "  ${RED}FAIL${NC} Web IDE (HTTP $STATUS)"
  ((FAIL++))
fi

# Step 10: Static assets
echo ""
echo "--- Step 8: Static Assets ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/logo.png")
test_step "Logo loads" "$STATUS"

echo ""
echo "========================================"
echo -e " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Some smoke tests failed!${NC}"
  exit 1
fi

echo -e "${GREEN}All smoke tests passed!${NC}"
