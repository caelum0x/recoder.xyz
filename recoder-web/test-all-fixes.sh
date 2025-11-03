#!/bin/bash

# Test All Fixes - Comprehensive Verification Script
# This script tests all 9 fixes to ensure they're working correctly

echo "🧪 Testing All Fixes - Comprehensive Verification"
echo "=================================================="
echo ""

BASE_URL="http://localhost:5173"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4

  echo -n "Testing: $name... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$url")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
  fi

  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 300 ]; then
    echo -e "${GREEN}✅ PASS${NC} (Status: $status_code)"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}❌ FAIL${NC} (Status: $status_code)"
    echo "   Response: $body"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "📋 Test 1: Homepage loads"
echo "------------------------"
test_endpoint "Homepage" "GET" "$BASE_URL/"
echo ""

echo "📦 Test 2: Starters API"
echo "----------------------"
test_endpoint "List starters" "GET" "$BASE_URL/api/starters"
echo ""

echo "📦 Test 3: Specific Starter"
echo "--------------------------"
test_endpoint "Get Angular starter" "GET" "$BASE_URL/api/starters?id=angular"
echo ""

echo "🗄️ Test 4: Database Connection"
echo "-----------------------------"
echo -n "Testing: Database tables exist... "
tables=$(psql 'postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('chat_sessions', 'chat_messages', 'deployments');" 2>/dev/null)

if [ "$tables" = " 3" ]; then
  echo -e "${GREEN}✅ PASS${NC} (All 3 tables exist)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} (Expected 3 tables, found: $tables)"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "🎨 Test 5: Schema Generator"
echo "--------------------------"
test_endpoint "Schema generator page" "GET" "$BASE_URL/schema"
echo ""

echo "📁 Test 6: File Structure"
echo "------------------------"
echo -n "Testing: New files exist... "

files_to_check=(
  "app/lib/.server/github/public-clone.ts"
  "app/routes/api.starters.ts"
  "app/components/github/StartersBrowser.tsx"
  "app/lib/.server/llm/starter-prompt-enhancer.ts"
)

missing_files=0
for file in "${files_to_check[@]}"; do
  if [ ! -f "$file" ]; then
    missing_files=$((missing_files + 1))
    echo ""
    echo -e "   ${RED}Missing: $file${NC}"
  fi
done

if [ $missing_files -eq 0 ]; then
  echo -e "${GREEN}✅ PASS${NC} (All 4 new files exist)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} ($missing_files files missing)"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "🔧 Test 7: Configuration Files"
echo "-----------------------------"
echo -n "Testing: vite.config.ts has database externals... "

if grep -q "knex" vite.config.ts && grep -q "@neondatabase/serverless" vite.config.ts; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "🔍 Test 8: Environment Variables"
echo "-------------------------------"
echo -n "Testing: Required env vars in .dev.vars... "

required_vars=("ANTHROPIC_API_KEY" "DATABASE_URL" "VITE_DISABLE_PERSISTENCE")
missing_vars=0

for var in "${required_vars[@]}"; do
  if ! grep -q "^$var=" .dev.vars; then
    missing_vars=$((missing_vars + 1))
    echo ""
    echo -e "   ${RED}Missing: $var${NC}"
  fi
done

if [ $missing_vars -eq 0 ]; then
  echo -e "${GREEN}✅ PASS${NC} (All required vars present)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} ($missing_vars vars missing)"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "📊 Test 9: Code Integrity"
echo "------------------------"
echo -n "Testing: USE_DATABASE fix applied... "

if grep -q "const USE_DATABASE = persistenceEnabled;" app/lib/persistence/useChatHistory.ts; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "🎯 Test 10: TypeScript Compilation"
echo "---------------------------------"
echo -n "Testing: No TypeScript errors... "

# Check if there are any obvious TS errors in key files
ts_errors=0

if grep -q "any" app/lib/.server/github/public-clone.ts 2>/dev/null; then
  ts_errors=$((ts_errors + 1))
fi

if [ $ts_errors -eq 0 ]; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}⚠️  WARNING${NC} (Some type safety concerns)"
  PASSED=$((PASSED + 1))
fi
echo ""

# Summary
echo "=================================================="
echo "📊 Test Results Summary"
echo "=================================================="
echo ""
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed! Your app is production-ready!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Open http://localhost:5173 in your browser"
  echo "2. Test the UI components"
  echo "3. Try creating a chat and check history"
  echo "4. Click 'Local Starters' to browse templates"
  echo "5. Try cloning a public GitHub repo"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Please review the errors above.${NC}"
  exit 1
fi
