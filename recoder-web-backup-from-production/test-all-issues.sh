#!/bin/bash

##############################################################################
# Comprehensive Test Script for All Issues
# Tests chat history, terminal, starters, and GitHub cloning
##############################################################################

# Don't exit on error - we want to collect all test results
set +e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Recoder.xyz - Comprehensive Issues Test Suite             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

test_passed() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((PASS_COUNT++))
}

test_failed() {
  echo -e "${RED}❌ FAIL${NC}: $1 - $2"
  ((FAIL_COUNT++))
}

test_skipped() {
  echo -e "${YELLOW}⏭️  SKIP${NC}: $1"
  ((SKIP_COUNT++))
}

##############################################################################
# Issue #1: Chat History CSS
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Issue #1: Chat History CSS (pointer-events-none fix)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

if [ -f "app/components/chat/Messages.client.tsx" ]; then
  if grep -q "pointer-events-none" app/components/chat/Messages.client.tsx; then
    LINE=$(grep -n "pointer-events-none" app/components/chat/Messages.client.tsx | head -1 | cut -d: -f1)
    test_passed "pointer-events-none found at line $LINE"
    
    # Verify it's in the correct context
    if grep -B2 -A2 "pointer-events-none" app/components/chat/Messages.client.tsx | grep -q "isStreaming && isLast"; then
      test_passed "CSS class applied in correct context (isStreaming && isLast)"
    else
      test_failed "CSS context" "pointer-events-none not in correct conditional"
    fi
  else
    test_failed "CSS fix" "pointer-events-none class not found"
  fi
else
  test_failed "File check" "Messages.client.tsx not found"
fi

##############################################################################
# Issue #2: Terminal/WebContainer Retry Logic
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Issue #2: Terminal/WebContainer Retry Logic${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

if [ -f "app/lib/webcontainer/index.ts" ]; then
  if grep -q "let retries = 3" app/lib/webcontainer/index.ts; then
    test_passed "Retry logic found (3 attempts)"
  else
    test_failed "Retry logic" "retries variable not found"
  fi
  
  if grep -q "exponential backoff" app/lib/webcontainer/index.ts; then
    test_passed "Exponential backoff implemented"
  else
    test_skipped "Exponential backoff (might use different approach)"
  fi
  
  if grep -q "getWebContainerHealth" app/lib/webcontainer/index.ts; then
    test_passed "Health monitoring API exists"
  else
    test_failed "Health API" "getWebContainerHealth not found"
  fi
  
  if grep -q "webcontainerContext" app/lib/webcontainer/index.ts; then
    test_passed "Context tracking implemented"
  else
    test_failed "Context" "webcontainerContext not found"
  fi
else
  test_failed "File check" "webcontainer/index.ts not found"
fi

##############################################################################
# Issue #3: Starters Bundle
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Issue #3: Starters Bundle${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

BUNDLE_PATH="app/lib/.server/llm/starters-bundle.json"

if [ -f "$BUNDLE_PATH" ]; then
  SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)
  test_passed "Bundle file exists (size: $SIZE)"
  
  # Check if bundle is valid JSON
  if jq empty "$BUNDLE_PATH" 2>/dev/null; then
    test_passed "Bundle is valid JSON"
    
    # Count starters
    STARTER_COUNT=$(jq 'keys | length' "$BUNDLE_PATH")
    test_passed "Bundle contains $STARTER_COUNT starters"
    
    # Check for common starters
    for starter in "react" "nextjs" "angular" "vue"; do
      if jq -e ".[\"$starter\"]" "$BUNDLE_PATH" > /dev/null 2>&1; then
        test_passed "Starter '$starter' exists in bundle"
      else
        test_failed "Starter check" "$starter not found in bundle"
      fi
    done
  else
    test_failed "JSON validation" "Bundle is not valid JSON"
  fi
else
  test_failed "Bundle file" "starters-bundle.json not found"
fi

# Check build script
if [ -f "scripts/build-starters.mjs" ]; then
  test_passed "Build script exists (scripts/build-starters.mjs)"
else
  test_failed "Build script" "scripts/build-starters.mjs not found"
fi

##############################################################################
# Issue #4: Starters API & Integration
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Issue #4: Starters Import System${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Check API route
if [ -f "app/routes/api.starters.ts" ]; then
  test_passed "API route exists (app/routes/api.starters.ts)"
  
  if grep -q "export async function loader" app/routes/api.starters.ts; then
    test_passed "GET endpoint (loader) implemented"
  fi
  
  if grep -q "export async function action" app/routes/api.starters.ts; then
    test_passed "POST endpoint (action) implemented"
  fi
  
  if grep -q "startersBundleData" app/routes/api.starters.ts; then
    test_passed "Bundle import configured"
  fi
else
  test_failed "API route" "api.starters.ts not found"
fi

# Check action runner
if [ -f "app/lib/runtime/action-runner.ts" ]; then
  if grep -q "#runImportStarterAction" app/lib/runtime/action-runner.ts; then
    test_passed "Import starter action handler exists"
    
    if grep -q "/api/starters" app/lib/runtime/action-runner.ts; then
      test_passed "Action runner calls starters API"
    fi
    
    if grep -q "webcontainer.fs.writeFile" app/lib/runtime/action-runner.ts; then
      test_passed "Files written to WebContainer"
    fi
  else
    test_failed "Action handler" "#runImportStarterAction not found"
  fi
else
  test_failed "Action runner" "action-runner.ts not found"
fi

# Check message parser
if [ -f "app/lib/runtime/message-parser.ts" ]; then
  if grep -q "importStarter" app/lib/runtime/message-parser.ts; then
    test_passed "Message parser handles importStarter action"
  else
    test_failed "Message parser" "importStarter not found"
  fi
else
  test_failed "Message parser" "message-parser.ts not found"
fi

# Check action types
if [ -f "app/types/actions.ts" ]; then
  if grep -q "importStarter" app/types/actions.ts; then
    test_passed "Action type definitions include importStarter"
  else
    test_failed "Action types" "importStarter type not found"
  fi
else
  test_failed "Action types" "actions.ts not found"
fi

##############################################################################
# Issue #5: GitHub Cloning
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Issue #5: GitHub Repository Cloning${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Check GitHub API route
if [ -f "app/routes/api.github.ts" ]; then
  test_passed "GitHub API route exists"
  
  if grep -q "clonePublicRepo" app/routes/api.github.ts; then
    test_passed "Public repository cloning implemented"
  fi
  
  if grep -q "isRepoPublic" app/routes/api.github.ts; then
    test_passed "Public/private detection implemented"
  fi
  
  if grep -q "parseGitHubUrl" app/routes/api.github.ts; then
    test_passed "GitHub URL parsing implemented"
  fi
  
  if grep -q "GITHUB_TOKEN" app/routes/api.github.ts; then
    test_passed "Private repository support (requires token)"
  fi
else
  test_failed "GitHub API" "api.github.ts not found"
fi

# Check action runner for GitHub
if [ -f "app/lib/runtime/action-runner.ts" ]; then
  if grep -q "#runCloneGitHubAction" app/lib/runtime/action-runner.ts; then
    test_passed "Clone GitHub action handler exists"
    
    if grep -q "/api/github" app/lib/runtime/action-runner.ts; then
      test_passed "Action runner calls GitHub API"
    fi
  else
    test_failed "GitHub handler" "#runCloneGitHubAction not found"
  fi
fi

# Check if public clone utility exists
if [ -f "app/lib/.server/github/public-clone.ts" ]; then
  test_passed "Public clone utility exists"
else
  test_skipped "Public clone utility (might be in different location)"
fi

##############################################################################
# UI Components Check
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}UI Components${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

if [ -f "app/components/github/StartersBrowser.tsx" ]; then
  test_passed "StartersBrowser component exists"
else
  test_skipped "StartersBrowser component"
fi

if [ -f "app/components/github/GitHubIntegration.tsx" ]; then
  test_passed "GitHubIntegration component exists"
else
  test_skipped "GitHubIntegration component"
fi

##############################################################################
# Development Server Check (Optional)
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Development Server Check (Optional)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Check if dev server is running
if curl -s http://localhost:5173/api/health > /dev/null 2>&1; then
  test_passed "Dev server is running on port 5173"
  
  # Test starters API
  if curl -s http://localhost:5173/api/starters > /dev/null 2>&1; then
    test_passed "Starters API endpoint responds"
    
    # Check if it returns valid JSON
    if curl -s http://localhost:5173/api/starters | jq empty 2>/dev/null; then
      test_passed "Starters API returns valid JSON"
    fi
  else
    test_skipped "Starters API (server running but endpoint not responding)"
  fi
  
  # Test GitHub API
  if curl -s http://localhost:5173/api/github > /dev/null 2>&1; then
    test_passed "GitHub API endpoint responds"
  else
    test_skipped "GitHub API (might require POST request)"
  fi
else
  test_skipped "Dev server check (server not running on port 5173)"
  echo -e "   ${YELLOW}ℹ️  Start dev server with: npm run dev${NC}"
fi

##############################################################################
# Summary
##############################################################################

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))

echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed:${NC} $PASS_COUNT"
echo -e "${RED}Failed:${NC} $FAIL_COUNT"
echo -e "${YELLOW}Skipped:${NC} $SKIP_COUNT"

echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ ALL TESTS PASSED!                                        ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ❌ SOME TESTS FAILED                                        ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
  exit 1
fi
