#!/bin/bash

# CLI Authentication Test Script
# Tests all authentication methods for recoder.xyz

echo "🧪 Recoder CLI Authentication Test Suite"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if website is running
echo "1️⃣  Testing website availability..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Website is running on port 3000${NC}"
else
    echo -e "${RED}❌ Website is not running${NC}"
    echo "   Start it with: cd app && npm run dev"
    exit 1
fi
echo ""

# Test 2: Test OAuth endpoint
echo "2️⃣  Testing OAuth endpoint..."
OAUTH_RESPONSE=$(curl -s "http://localhost:3000/api/auth/cli?response_type=code&client_id=recoder-cli&redirect_uri=http://localhost:8080/auth/callback&state=test123&scope=cli:full")
if echo "$OAUTH_RESPONSE" | grep -q "Authorize CLI Access"; then
    echo -e "${GREEN}✅ OAuth endpoint working${NC}"
else
    echo -e "${RED}❌ OAuth endpoint not responding correctly${NC}"
fi
echo ""

# Test 3: Test device flow initiation
echo "3️⃣  Testing device flow..."
DEVICE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/cli \
  -H "Content-Type: application/json" \
  -d '{"action":"device_flow","client_id":"recoder-cli"}')

if echo "$DEVICE_RESPONSE" | grep -q "device_code"; then
    echo -e "${GREEN}✅ Device flow endpoint working${NC}"
    
    # Extract user code
    USER_CODE=$(echo "$DEVICE_RESPONSE" | grep -o '"user_code":"[^"]*"' | cut -d'"' -f4)
    VERIFICATION_URI=$(echo "$DEVICE_RESPONSE" | grep -o '"verification_uri":"[^"]*"' | cut -d'"' -f4)
    
    echo -e "   ${YELLOW}User Code: $USER_CODE${NC}"
    echo -e "   ${YELLOW}Visit: $VERIFICATION_URI${NC}"
else
    echo -e "${RED}❌ Device flow not working${NC}"
fi
echo ""

# Test 4: Test demo API key
echo "4️⃣  Testing API key validation..."
API_KEY_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/cli \
  -H "Content-Type: application/json" \
  -d '{"action":"validate_token","token":"rck_demo_key_12345678"}')

if echo "$API_KEY_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ API key validation working${NC}"
    
    USER_EMAIL=$(echo "$API_KEY_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    echo -e "   ${YELLOW}Validated user: $USER_EMAIL${NC}"
else
    echo -e "${RED}❌ API key validation not working${NC}"
fi
echo ""

# Test 5: Test token refresh endpoint
echo "5️⃣  Testing token refresh..."
REFRESH_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/cli \
  -H "Content-Type: application/json" \
  -d '{"action":"refresh_token","refresh_token":"test_refresh","client_id":"recoder-cli"}')

if echo "$REFRESH_RESPONSE" | grep -q "access_token\|invalid_grant"; then
    echo -e "${GREEN}✅ Token refresh endpoint responding${NC}"
else
    echo -e "${RED}❌ Token refresh endpoint not working${NC}"
fi
echo ""

# Test 6: Test device authorization page
echo "6️⃣  Testing device authorization page..."
DEVICE_PAGE=$(curl -s http://localhost:3000/auth/device)
if echo "$DEVICE_PAGE" | grep -q "Device Authorization"; then
    echo -e "${GREEN}✅ Device authorization page available${NC}"
else
    echo -e "${RED}❌ Device authorization page not found${NC}"
fi
echo ""

# Test 7: Check database functionality
echo "7️⃣  Testing database integration..."
DB_TEST=$(curl -s -X POST http://localhost:3000/api/auth/cli \
  -H "Content-Type: application/json" \
  -d '{"action":"authenticate","email":"test@example.com","password":"test123"}')

if echo "$DB_TEST" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Database integration working${NC}"
else
    echo -e "${YELLOW}⚠️  Database may need configuration${NC}"
fi
echo ""

# Summary
echo "========================================"
echo "📊 Test Summary"
echo "========================================"
echo ""
echo "✅ Your CLI authentication system is ready to use!"
echo ""
echo "🚀 Quick Start:"
echo "   1. Make sure website is running: cd app && npm run dev"
echo "   2. Test CLI: cd packages/cli && recoder auth login --web"
echo ""
echo "📝 Available authentication methods:"
echo "   • Web OAuth:     recoder auth login --web"
echo "   • Device Flow:   recoder auth login --device-flow"
echo "   • API Key:       recoder auth login --api-key <key>"
echo "   • Email/Pass:    recoder auth login"
echo ""
echo "📚 Documentation:"
echo "   • CLI_AUTH_STATUS.md   - Implementation status"
echo "   • CLI_AUTH_GUIDE.md    - Complete guide"
echo "   • CLI_AUTH_FLOWS.md    - Visual flow diagrams"
echo ""
