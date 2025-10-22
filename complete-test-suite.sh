#!/bin/bash
echo ""
echo "🎯 COMPLETE RECODER.XYZ TEST SUITE"
echo "===================================="
echo ""
echo "This will verify your entire system is working."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

test_endpoint() {
  local name=$1
  local url=$2
  local expected=$3
  
  echo -n "Testing $name... "
  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  
  if [ "$response" == "$expected" ]; then
    echo -e "${GREEN}✅ PASS${NC} ($response)"
    ((PASS++))
  else
    echo -e "${RED}❌ FAIL${NC} (got $response, expected $expected)"
    ((FAIL++))
  fi
}

test_content() {
  local name=$1
  local url=$2
  local pattern=$3
  
  echo -n "Testing $name... "
  content=$(curl -s "$url" 2>/dev/null)
  
  if echo "$content" | grep -q "$pattern"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
  else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAIL++))
  fi
}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 1: Service Health Checks${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

test_content "Backend health endpoint" "http://localhost:3001/health" "ok"
test_content "App health endpoint" "http://localhost:3002/api/health" "healthy"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 2: Authentication Endpoints${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Better Auth endpoints should return 405 for GET (only accept POST)
test_endpoint "Sign-in endpoint" "http://localhost:3002/api/auth/sign-in" "405"
test_endpoint "Sign-up endpoint" "http://localhost:3002/api/auth/sign-up" "405"
test_endpoint "Session endpoint" "http://localhost:3002/api/auth/session" "200"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 3: OAuth Callbacks${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# OAuth callbacks should return 400 without proper params (not 404)
test_endpoint "GitHub callback" "http://localhost:3002/api/auth/callback/github" "400"
test_endpoint "Google callback" "http://localhost:3002/api/auth/callback/google" "400"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 4: Frontend Pages${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

test_endpoint "Sign-in page" "http://localhost:3002/auth/signin" "200"
test_endpoint "Sign-up page" "http://localhost:3002/auth/signup" "200"
test_endpoint "Onboarding page" "http://localhost:3002/onboarding" "200"
test_endpoint "Dashboard page" "http://localhost:3002/dashboard" "200"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 5: Backend API Routes${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Backend routes should exist (may return 401 without auth)
test_endpoint "Premium API keys" "http://localhost:3001/api/premium/api-keys" "401"
test_endpoint "AI chat endpoint" "http://localhost:3001/api/ai/chat" "400"

echo ""
echo "========================================"
echo -e "${BLUE}  TEST RESULTS${NC}"
echo "========================================"
echo ""
echo -e "  ${GREEN}✅ Passed: $PASS${NC}"
echo -e "  ${RED}❌ Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo ""
  echo "Your system is fully operational!"
  echo ""
  echo "Next steps:"
  echo "  1. Test sign up: open http://localhost:3002/auth/signup"
  echo "  2. Try OAuth: Click 'Continue with GitHub' or 'Google'"
  echo "  3. Complete onboarding flow"
  echo "  4. View your dashboard"
  echo ""
else
  echo -e "${YELLOW}⚠️  Some tests failed${NC}"
  echo "Check the output above for details"
fi

echo "========================================"
