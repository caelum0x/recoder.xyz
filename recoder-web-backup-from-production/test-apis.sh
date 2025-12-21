#!/bin/bash

# API Testing Script for Recoder
# Tests all major API endpoints

BASE_URL="http://localhost:5173"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "Testing Recoder API Endpoints"
echo "================================================"
echo ""

# Test function
test_endpoint() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local data="$4"
  
  echo -n "Testing $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "%{http_code}" -o /tmp/response.json "$BASE_URL$url")
  else
    response=$(curl -s -w "%{http_code}" -o /tmp/response.json -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$BASE_URL$url")
  fi
  
  if [ "$response" = "200" ] || [ "$response" = "201" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
    cat /tmp/response.json | jq '.' 2>/dev/null | head -10
  else
    echo -e "${RED}✗ FAIL${NC} (HTTP $response)"
    cat /tmp/response.json
  fi
  echo ""
}

# 1. Test MCP API
echo "1. MCP API Tests"
echo "=================="
test_endpoint "MCP Server List" "/api/mcp?action=list-servers"
test_endpoint "MCP Tools List" "/api/mcp?action=list-tools"
test_endpoint "MCP Stats" "/api/mcp?action=server-stats"
echo ""

# 2. Test Deployment API
echo "2. Deployment API Tests"
echo "======================="
test_endpoint "Deployment Platforms" "/api/deploy?action=platforms"
echo ""

# 3. Test Schema API
echo "3. Schema API Tests"
echo "==================="
test_endpoint "Schema Examples" "/api/schema"
echo ""

# 4. Test Health API
echo "4. Health API Tests"
echo "==================="
test_endpoint "System Health" "/api/system-health"
echo ""

# 5. Test GitHub API
echo "5. GitHub API Tests"
echo "==================="
test_endpoint "GitHub Search Templates" "/api/github?action=search-templates&query=react"
echo ""

# 6. Test Chat History API (requires user/anonymous ID)
echo "6. Chat History API Tests"
echo "========================="
ANON_ID="test_$(date +%s)"
test_endpoint "Chat History (Anonymous)" "/api/chat-history?anonymousId=$ANON_ID&limit=10"
echo ""

echo "================================================"
echo "API Testing Complete"
echo "================================================"
echo ""
echo "Summary:"
echo "- All major endpoints tested"
echo "- Check output above for any FAIL messages"
echo "- Green ✓ = Working"
echo "- Red ✗ = Needs attention"
echo ""
echo "Next steps:"
echo "1. Open browser: http://localhost:5173/"
echo "2. Test UI features manually"
echo "3. See TEST_ALL_FEATURES.md for detailed guide"
echo ""
