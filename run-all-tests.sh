#!/bin/bash

##############################################################################
# Master Test Runner for Recoder.xyz
# Runs all comprehensive tests for OAuth, Onboarding, and Payments
##############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
APP_URL="${TEST_APP_URL:-http://localhost:3000}"
BACKEND_URL="${TEST_BACKEND_URL:-http://localhost:3001}"
LOG_DIR="./test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create log directory
mkdir -p "$LOG_DIR"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        RECODER.XYZ COMPREHENSIVE TEST SUITE               ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}App URL:${NC} $APP_URL"
echo -e "${BLUE}Backend URL:${NC} $BACKEND_URL"
echo -e "${BLUE}Timestamp:${NC} $TIMESTAMP"
echo -e "${BLUE}Logs:${NC} $LOG_DIR"
echo ""

# Check if servers are running
echo -e "${YELLOW}🔍 Checking if servers are running...${NC}"

if curl -s -f -o /dev/null "$APP_URL"; then
    echo -e "${GREEN}✅ App server is running${NC}"
else
    echo -e "${RED}❌ App server is not responding at $APP_URL${NC}"
    echo -e "${YELLOW}⚠️  Please start the app server with: cd app && npm run dev${NC}"
    exit 1
fi

if curl -s -f -o /dev/null "$BACKEND_URL/api/health" || curl -s -f -o /dev/null "$BACKEND_URL"; then
    echo -e "${GREEN}✅ Backend server is running${NC}"
else
    echo -e "${YELLOW}⚠️  Backend server is not responding (some tests may fail)${NC}"
fi

echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/chalk/package.json" ]; then
    echo -e "${YELLOW}📦 Installing test dependencies...${NC}"
    npm install axios chalk --save-dev
    echo ""
fi

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test suite
run_test_suite() {
    local test_name=$1
    local test_file=$2
    local log_file="$LOG_DIR/${test_name}_${TIMESTAMP}.log"
    
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}Running: ${test_name}${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    
    if node "$test_file" 2>&1 | tee "$log_file"; then
        echo -e "${GREEN}✅ ${test_name} PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ ${test_name} FAILED${NC}"
        echo -e "${YELLOW}   Check logs: $log_file${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Run test suites
echo ""
echo -e "${BLUE}🚀 Starting test execution...${NC}"
echo ""

# Test 1: OAuth (GitHub & Google)
TOTAL_TESTS=$((TOTAL_TESTS + 1))
run_test_suite "OAuth Authentication" "./test-oauth-complete.js" || true
echo ""

# Test 2: User Onboarding
TOTAL_TESTS=$((TOTAL_TESTS + 1))
run_test_suite "User Onboarding" "./test-onboarding-complete.js" || true
echo ""

# Test 3: Payments & Subscriptions
TOTAL_TESTS=$((TOTAL_TESTS + 1))
run_test_suite "Payments & Subscriptions" "./test-payments-subscriptions-complete.js" || true
echo ""

# Summary
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}FINAL TEST SUMMARY${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Total Test Suites:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Passed:${NC} $PASSED_TESTS"
echo -e "${RED}Failed:${NC} $FAILED_TESTS"

PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo -e "${BLUE}Pass Rate:${NC} ${PASS_RATE}%"

echo ""
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  🎉 ALL TESTS PASSED! 🎉                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              ⚠️  SOME TESTS FAILED  ⚠️                     ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Check test logs in: $LOG_DIR${NC}"
    exit 1
fi
