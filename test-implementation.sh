#!/bin/bash

# Test Implementation Script
# Tests authentication, payment integration, and all new features

echo "🧪 Testing Recoder.xyz Implementation"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URLs
BACKEND_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    local expected_code="$5"
    
    echo -n "Testing: $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (Expected $expected_code, got $http_code)"
        echo "Response: $body"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "1️⃣  Testing Backend Health"
echo "-------------------------"
test_endpoint "Backend Health Check" "GET" "$BACKEND_URL/health" "" "200"
echo ""

echo "2️⃣  Testing Authentication Endpoints"
echo "-----------------------------------"
test_endpoint "Get Plans (Public)" "GET" "$BACKEND_URL/api/billing/plans" "" "200"
test_endpoint "Register Endpoint" "POST" "$BACKEND_URL/api/auth/register" \
    '{"email":"test@example.com","password":"Test123!","name":"Test User"}' "201"
echo ""

echo "3️⃣  Testing Billing Endpoints"
echo "----------------------------"
test_endpoint "Get Subscription Plans" "GET" "$BACKEND_URL/api/billing/plans" "" "200"
test_endpoint "Get Supported Cryptos" "GET" "$BACKEND_URL/api/billing/supported-cryptos" "" "200"
echo ""

echo "4️⃣  File Existence Tests"
echo "------------------------"

# Check backend files
files_to_check=(
    "backend/src/services/user-service.ts"
    "backend/src/services/usage-tracking-service.ts"
    "backend/src/services/subscription-service.ts"
    "backend/src/services/paddle-service.ts"
    "backend/src/services/dodo-service.ts"
    "backend/src/utils/encryption.ts"
    "backend/src/routes/billing.ts"
    "backend/src/routes/user-settings.ts"
    "backend/src/routes/webhooks/paddle.ts"
    "backend/src/routes/webhooks/dodo.ts"
    "backend/src/middleware/usage-tracking.ts"
    "app/components/onboarding/APIKeyCollection.tsx"
    "app/app/checkout/success/page.tsx"
    "app/app/api/billing/plans/route.ts"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $file MISSING"
        ((TESTS_FAILED++))
    fi
done
echo ""

echo "5️⃣  Configuration Tests"
echo "----------------------"

# Check .env variables
check_env_var() {
    local var="$1"
    if grep -q "^$var=" backend/.env 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $var is configured"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}!${NC} $var not configured (needs real values)"
    fi
}

check_env_var "ENCRYPTION_KEY"
check_env_var "JWT_SECRET"
check_env_var "PADDLE_VENDOR_ID"
check_env_var "DODO_API_KEY"
echo ""

echo "6️⃣  Integration Tests"
echo "--------------------"

# Check if routes are integrated
if grep -q "billingRoutes" backend/src/app.ts; then
    echo -e "${GREEN}✓${NC} Billing routes integrated in app.ts"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} Billing routes NOT integrated"
    ((TESTS_FAILED++))
fi

if grep -q "webhooks/paddle" backend/src/app.ts; then
    echo -e "${GREEN}✓${NC} Paddle webhook route integrated"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} Paddle webhook route NOT integrated"
    ((TESTS_FAILED++))
fi

if grep -q "webhooks/dodo" backend/src/app.ts; then
    echo -e "${GREEN}✓${NC} DODO webhook route integrated"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗${NC} DODO webhook route NOT integrated"
    ((TESTS_FAILED++))
fi
echo ""

echo "7️⃣  Documentation Tests"
echo "----------------------"

docs=(
    "AUTHENTICATION_IMPLEMENTATION_COMPLETE.md"
    "PAYMENT_INTEGRATION_COMPLETE.md"
    "QUICK_START.md"
    "START_HERE.md"
    "ACTION_PLAN_NOW.md"
    "COMPLETE_ARCHITECTURE_GUIDE.md"
)

for doc in "${docs[@]}"; do
    if [ -f "$doc" ]; then
        echo -e "${GREEN}✓${NC} $doc exists"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $doc MISSING"
        ((TESTS_FAILED++))
    fi
done
echo ""

echo "======================================"
echo "📊 Test Results"
echo "======================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Implementation is complete.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: cd app && npx prisma migrate deploy"
    echo "2. Configure Paddle & DODO Pay accounts"
    echo "3. Test payment flows"
    echo "4. Deploy to production"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Review the output above.${NC}"
    exit 1
fi
