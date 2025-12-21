#!/bin/bash

# Production Verification Script
# Verifies all production features are working correctly

set -e

BASE_URL="${BASE_URL:-http://localhost:5174}"
FAILED_TESTS=0
TOTAL_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting Production Verification Tests"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Helper function to run tests
run_test() {
    local test_name=$1
    local test_command=$2

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "Testing: $test_name... "

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Test 1: Basic Health Check
echo "📊 Testing Health Endpoints"
echo "----------------------------"
run_test "Basic health check" \
    "curl -f -s $BASE_URL/api/health | grep -q 'healthy'"

run_test "Detailed health check" \
    "curl -f -s '$BASE_URL/api/health?detailed=true' | grep -q 'components'"

run_test "Deep health check (POST)" \
    "curl -f -s -X POST $BASE_URL/api/health | grep -q 'checks'"

echo ""

# Test 2: Security Headers
echo "🔒 Testing Security Headers"
echo "----------------------------"
run_test "Content-Security-Policy header" \
    "curl -I -s $BASE_URL/api/health | grep -q 'Content-Security-Policy'"

run_test "Strict-Transport-Security header" \
    "curl -I -s $BASE_URL/api/health | grep -q 'Strict-Transport-Security'"

run_test "X-Frame-Options header" \
    "curl -I -s $BASE_URL/api/health | grep -q 'X-Frame-Options'"

run_test "X-Content-Type-Options header" \
    "curl -I -s $BASE_URL/api/health | grep -q 'X-Content-Type-Options'"

echo ""

# Test 3: Rate Limiting
echo "⏱️  Testing Rate Limiting"
echo "----------------------------"

# Make initial request to get rate limit headers
RATE_LIMIT=$(curl -I -s -X POST $BASE_URL/api/chat \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}' \
    | grep -i "x-ratelimit-limit")

run_test "Rate limit headers present" \
    "echo '$RATE_LIMIT' | grep -q 'X-RateLimit-Limit'"

echo ""

# Test 4: Request Validation
echo "✅ Testing Request Validation"
echo "----------------------------"

# Test invalid message format
run_test "Rejects invalid message format" \
    "curl -s -X POST $BASE_URL/api/chat \
        -H 'Content-Type: application/json' \
        -d '{\"messages\":\"invalid\"}' \
        | grep -q 'Validation failed'"

# Test empty messages array
run_test "Rejects empty messages array" \
    "curl -s -X POST $BASE_URL/api/chat \
        -H 'Content-Type: application/json' \
        -d '{\"messages\":[]}' \
        | grep -q 'cannot be empty'"

echo ""

# Test 5: CORS Headers
echo "🌐 Testing CORS Configuration"
echo "----------------------------"
run_test "CORS headers on OPTIONS request" \
    "curl -I -s -X OPTIONS $BASE_URL/api/health \
        -H 'Origin: http://localhost:5173' \
        | grep -q 'Access-Control-Allow'"

echo ""

# Test 6: Error Handling
echo "⚠️  Testing Error Handling"
echo "----------------------------"
run_test "Returns 400 for invalid JSON" \
    "curl -s -w '%{http_code}' -X POST $BASE_URL/api/chat \
        -H 'Content-Type: application/json' \
        -d 'invalid-json' \
        | grep -q '400'"

run_test "Returns 404 for invalid endpoint" \
    "curl -s -w '%{http_code}' $BASE_URL/api/nonexistent \
        -o /dev/null | grep -q '404'"

echo ""

# Test 7: Performance
echo "⚡ Testing Performance"
echo "----------------------------"

START_TIME=$(date +%s%N)
curl -s $BASE_URL/api/health > /dev/null
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

if [ $DURATION -lt 500 ]; then
    echo -e "Health endpoint response time: ${GREEN}${DURATION}ms ✓${NC}"
else
    echo -e "Health endpoint response time: ${YELLOW}${DURATION}ms (>500ms)${NC}"
fi

echo ""

# Summary
echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$((TOTAL_TESTS - FAILED_TESTS))${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! System is production-ready.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review and fix before deploying.${NC}"
    exit 1
fi
