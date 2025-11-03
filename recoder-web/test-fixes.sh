#!/bin/bash
# Test script for fixes implemented on 2025-10-29
# Tests Issues #1-6

echo "🧪 Testing Recoder-Web Fixes"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "📋 Pre-flight Checks"
echo "--------------------"

# Check if files were modified
if grep -q "Restoring files to workbench" app/lib/persistence/useChatHistory.ts; then
    pass "Issue #1: Chat history fix applied"
else
    fail "Issue #1: Chat history fix NOT found"
fi

if grep -q "Quick check that process didn't immediately fail" app/lib/runtime/action-runner.ts; then
    pass "Issue #4: Dev server fix applied"
else
    fail "Issue #4: Dev server fix NOT found"
fi

if grep -q "category-mismatch" app/lib/.server/llm/starter-search.ts; then
    pass "Issue #3: Template matching fix applied"
else
    fail "Issue #3: Template matching fix NOT found"
fi

if grep -q "CARDINAL RULE: BUILD ONLY WHAT THE USER EXPLICITLY REQUESTS" app/lib/.server/llm/prompts.ts; then
    pass "Issue #2: AI prompt fix applied"
else
    fail "Issue #2: AI prompt fix NOT found"
fi

echo ""
echo "🔍 TypeScript Compilation Check"
echo "--------------------------------"

# Check for TypeScript errors in OUR modified files only
ERRORS=$(npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "app/lib/persistence/useChatHistory|app/lib/.server/llm/prompts|app/lib/.server/llm/starter-search|app/lib/runtime/action-runner")

if [ -z "$ERRORS" ]; then
    pass "TypeScript compiles without errors in modified files"
else
    fail "TypeScript errors in modified files"
    warn "Run: npx tsc --noEmit to see all errors"
fi

echo ""
echo "📦 Build Test"
echo "-------------"

# Try to build
if npm run build > /dev/null 2>&1; then
    pass "Production build succeeds"
else
    fail "Production build failed"
    warn "Run: npm run build to see errors"
fi

echo ""
echo "🧪 Summary"
echo "=========="
echo "Fixes Applied: ${PASSED} / 4 expected"
echo "Issues Found: ${FAILED}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All fixes successfully applied!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start dev server: npm run dev"
    echo "2. Test chat history loading (Issue #1)"
    echo "3. Test dev server startup (Issue #4)"
    echo "4. Test template matching (Issue #3)"
    echo "5. Test AI responses (Issue #2)"
    exit 0
else
    echo -e "${RED}✗ Some fixes are missing or failed${NC}"
    echo ""
    echo "Review the failed checks above and re-apply fixes"
    exit 1
fi
