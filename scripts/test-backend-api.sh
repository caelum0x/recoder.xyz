#!/bin/bash
# =============================================================================
# Backend API Route Test Suite
# Tests all major Python backend + Docker backend API routes with authentication
#
# Usage:
#   bash scripts/test-backend-api.sh <TOKEN>
#   bash scripts/test-backend-api.sh              # uses default token
#
# Environment:
#   API_BASE    - Python backend base URL  (default: https://api.recoder.xyz/v1)
#   DOCKER_BASE - Docker backend base URL  (default: https://docker.recoder.xyz)
# =============================================================================
set -uo pipefail
# Note: not using -e because we handle errors per-test

# --- Configuration ---
TOKEN="${1:-TW4RckaW72UaCulXixoDHDY6czsECP2u}"
API_BASE="${API_BASE:-https://api.recoder.xyz/v1}"
DOCKER_BASE="${DOCKER_BASE:-https://docker.recoder.xyz}"
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# --- Test helpers ---

# Standard endpoint test: method, path, expected_status, label, [base_url]
test_endpoint() {
  local method="$1" path="$2" expect="$3" label="$4"
  local base="${5:-$API_BASE}"
  local url="${base}${path}"
  local status
  ((TOTAL++))

  if [[ "$method" == "GET" ]]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null) || status="000"
  elif [[ "$method" == "POST_JSON" ]]; then
    # POST with JSON body — body passed via stdin or as $6
    local body="${6:-{}}"
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body" "$url" 2>/dev/null) || status="000"
  elif [[ "$method" == "DELETE" ]]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -X DELETE \
      -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null) || status="000"
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" "$url" 2>/dev/null) || status="000"
  fi

  if [[ "$status" == "$expect" ]]; then
    echo -e "  ${GREEN}✅ $label${RESET} ($method $path → $status)"
    ((PASS++))
  else
    echo -e "  ${RED}❌ $label${RESET} ($method $path → $status, expected $expect)"
    ((FAIL++))
  fi
}

# Test endpoint and capture response body (for assertions on content)
test_endpoint_body() {
  local method="$1" path="$2" expect="$3" label="$4"
  local base="${5:-$API_BASE}"
  local url="${base}${path}"
  local tmpfile
  tmpfile=$(mktemp)
  ((TOTAL++))

  local status
  status=$(curl -s -o "$tmpfile" -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null) || status="000"

  if [[ "$status" == "$expect" ]]; then
    echo -e "  ${GREEN}✅ $label${RESET} ($method $path → $status)"
    ((PASS++))
  else
    echo -e "  ${RED}❌ $label${RESET} ($method $path → $status, expected $expect)"
    ((FAIL++))
  fi

  # Output body to stdout for caller to capture
  cat "$tmpfile"
  rm -f "$tmpfile"
}

# Shorthand for legacy tests (backward compatible with original `t` function)
t() {
  local method="$1" path="$2" expected="$3" name="${4:-$path}"
  test_endpoint "$method" "$path" "$expected" "$name"
}

# Section header
section() {
  echo ""
  echo -e "${CYAN}${BOLD}--- $1 ---${RESET}"
}

# =============================================================================
# TEST EXECUTION
# =============================================================================

echo -e "${BOLD}=============================================${RESET}"
echo -e "${BOLD}BACKEND API ROUTE TESTS${RESET} — $(date)"
echo -e "API Base:    $API_BASE"
echo -e "Docker Base: $DOCKER_BASE"
echo -e "${BOLD}=============================================${RESET}"

# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECKS
# ─────────────────────────────────────────────────────────────────────────────
section "Health — Python Backend"
t GET "/health" "200" "backend /v1/health"

section "Health — Docker Backend"
test_endpoint GET "/health" "200" "docker /health" "$DOCKER_BASE"
test_endpoint GET "/api/health/daytona" "200" "docker /api/health/daytona" "$DOCKER_BASE"

# ─────────────────────────────────────────────────────────────────────────────
# MODELS API (unified registry)
# ─────────────────────────────────────────────────────────────────────────────
section "Models API"
MODELS_BODY=$(test_endpoint_body GET "/models" "200" "GET /models")

# Verify 10+ models
MODEL_COUNT=$(echo "$MODELS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(len(data.get('models', [])))
except:
    print(0)
" 2>/dev/null)
((TOTAL++))
if [[ "$MODEL_COUNT" -ge 10 ]]; then
  echo -e "  ${GREEN}✅ Model count >= 10${RESET} (found $MODEL_COUNT)"
  ((PASS++))
else
  echo -e "  ${RED}❌ Model count >= 10${RESET} (found $MODEL_COUNT)"
  ((FAIL++))
fi

# Verify free models exist
FREE_MODEL_COUNT=$(echo "$MODELS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    free = [m for m in data.get('models', []) if m.get('tier') == 'free']
    print(len(free))
except:
    print(0)
" 2>/dev/null)
((TOTAL++))
if [[ "$FREE_MODEL_COUNT" -ge 1 ]]; then
  echo -e "  ${GREEN}✅ Free-tier models exist${RESET} (found $FREE_MODEL_COUNT)"
  ((PASS++))
else
  echo -e "  ${RED}❌ Free-tier models exist${RESET} (found $FREE_MODEL_COUNT)"
  ((FAIL++))
fi

# Verify free_default field
FREE_DEFAULT=$(echo "$MODELS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('free_default', ''))
except:
    print('')
" 2>/dev/null)
((TOTAL++))
if [[ "$FREE_DEFAULT" == "openrouter/free" ]]; then
  echo -e "  ${GREEN}✅ free_default == openrouter/free${RESET}"
  ((PASS++))
else
  echo -e "  ${RED}❌ free_default == openrouter/free${RESET} (got: $FREE_DEFAULT)"
  ((FAIL++))
fi

# ─────────────────────────────────────────────────────────────────────────────
# AGENTS API (CRUD lifecycle)
# ─────────────────────────────────────────────────────────────────────────────
section "Agents API"
t GET "/agents" "200" "list agents"
t GET "/agents?limit=1&sort_by=name&sort_order=asc" "200" "list agents (sorted)"

# Create a test agent
CREATE_BODY=$(curl -s --max-time 10 \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"__test_agent_api_suite__"}' \
  "${API_BASE}/agents" 2>/dev/null)

CREATED_ID=$(echo "$CREATE_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # Handle both {agent_id:..} and {id:..} shapes
    print(data.get('agent_id', data.get('id', '')))
except:
    print('')
" 2>/dev/null)

((TOTAL++))
if [[ -n "$CREATED_ID" && "$CREATED_ID" != "" ]]; then
  echo -e "  ${GREEN}✅ POST /agents (create)${RESET} → id=$CREATED_ID"
  ((PASS++))
else
  # Check if it was a 402 (agent limit) — that is acceptable
  CREATE_STATUS=$(echo "$CREATE_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    detail = data.get('detail', {})
    if isinstance(detail, dict) and detail.get('error_code') == 'AGENT_LIMIT_EXCEEDED':
        print('LIMIT')
    else:
        print('FAIL')
except:
    print('FAIL')
" 2>/dev/null)
  if [[ "$CREATE_STATUS" == "LIMIT" ]]; then
    echo -e "  ${YELLOW}⏭  POST /agents (create)${RESET} — skipped (agent limit reached)"
    ((SKIP++))
    CREATED_ID=""
  else
    echo -e "  ${RED}❌ POST /agents (create)${RESET} — no agent_id in response"
    ((FAIL++))
    CREATED_ID=""
  fi
fi

# Get the created agent
if [[ -n "$CREATED_ID" ]]; then
  test_endpoint GET "/agents/${CREATED_ID}" "200" "GET /agents/{id}"

  # Delete the test agent (cleanup)
  test_endpoint DELETE "/agents/${CREATED_ID}" "200" "DELETE /agents/{id} (cleanup)"
else
  echo -e "  ${YELLOW}⏭  GET /agents/{id}${RESET} — skipped (no test agent)"
  ((SKIP++))
  echo -e "  ${YELLOW}⏭  DELETE /agents/{id}${RESET} — skipped (no test agent)"
  ((SKIP++))
fi

# ─────────────────────────────────────────────────────────────────────────────
# THREADS API
# ─────────────────────────────────────────────────────────────────────────────
section "Threads API"
t GET "/threads" "200" "list threads"
t GET "/threads?limit=5" "200" "list threads (limited)"
t GET "/threads/pinned" "200" "pinned threads"

# ─────────────────────────────────────────────────────────────────────────────
# BILLING API
# ─────────────────────────────────────────────────────────────────────────────
section "Billing API"
t GET "/billing/account-state" "200" "account state (full)"
t GET "/billing/account-state/minimal" "200" "account state (minimal)"

# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATIONS API
# ─────────────────────────────────────────────────────────────────────────────
section "Notifications API"
t GET "/notifications?limit=5" "200" "list notifications"
test_endpoint POST "/notifications/read-all" "200" "mark all read"

# ─────────────────────────────────────────────────────────────────────────────
# KNOWLEDGE BASE API
# ─────────────────────────────────────────────────────────────────────────────
section "Knowledge Base API"
t GET "/knowledge-base/folders" "200" "list KB folders"
t GET "/knowledge-base/entries?limit=5" "200" "list KB entries"

# ─────────────────────────────────────────────────────────────────────────────
# COMPOSIO API
# ─────────────────────────────────────────────────────────────────────────────
section "Composio API"
t GET "/composio/categories" "200" "composio categories"
t GET "/composio/toolkits" "200" "composio toolkits"
t GET "/composio/toolkits/gmail/icon" "200" "composio/gmail icon"
t GET "/composio/toolkits/slack/icon" "200" "composio/slack icon"
t GET "/composio/toolkits/notion/icon" "200" "composio/notion icon"
t GET "/composio/toolkits/googledrive/icon" "200" "composio/drive icon"

# ─────────────────────────────────────────────────────────────────────────────
# WEB SEARCH API (Python backend)
# ─────────────────────────────────────────────────────────────────────────────
section "Web Search API (backend)"
t GET "/web-search?q=test&limit=3" "200" "web search"

# ─────────────────────────────────────────────────────────────────────────────
# SEARCH API
# ─────────────────────────────────────────────────────────────────────────────
section "Search API"
t GET "/search?q=test&limit=5" "200" "search"

# ─────────────────────────────────────────────────────────────────────────────
# MFA
# ─────────────────────────────────────────────────────────────────────────────
section "MFA"
t GET "/mfa/status" "200" "MFA status"

# ─────────────────────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────────────────────
section "Prompts"
t GET "/prompts" "200" "list prompts"

# ─────────────────────────────────────────────────────────────────────────────
# USER PREFERENCES
# ─────────────────────────────────────────────────────────────────────────────
section "User Preferences"
t GET "/preferences" "200" "all preferences"
t GET "/preferences?category=appearance" "200" "appearance prefs"

# ─────────────────────────────────────────────────────────────────────────────
# COMMAND PALETTE / HISTORY
# ─────────────────────────────────────────────────────────────────────────────
section "Commands"
t GET "/commands/history?limit=5" "200" "command history"
t GET "/commands/pins" "200" "pinned commands"

# ─────────────────────────────────────────────────────────────────────────────
# KEYBOARD SHORTCUTS
# ─────────────────────────────────────────────────────────────────────────────
section "Keyboard Shortcuts"
t GET "/shortcuts" "200" "shortcuts"

# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD LAYOUTS
# ─────────────────────────────────────────────────────────────────────────────
section "Dashboard Layouts"
t GET "/dashboard/layouts" "200" "dashboard layouts"

# ─────────────────────────────────────────────────────────────────────────────
# SAVED FILTERS
# ─────────────────────────────────────────────────────────────────────────────
section "Saved Filters"
t GET "/filters" "200" "saved filters"

# ─────────────────────────────────────────────────────────────────────────────
# AGENT FEATURES
# ─────────────────────────────────────────────────────────────────────────────
section "Agent Features"
t GET "/agent-versions?agent_id=7e91f872-2407-42ac-bfcb-ea69a496e85c" "200" "agent versions"

# ─────────────────────────────────────────────────────────────────────────────
# THREAD LABELS
# ─────────────────────────────────────────────────────────────────────────────
section "Thread Labels"
t GET "/labels" "200" "thread labels"

# ─────────────────────────────────────────────────────────────────────────────
# PRESENCE
# ─────────────────────────────────────────────────────────────────────────────
section "Presence"
t POST "/presence/update" "200" "presence update"

# ─────────────────────────────────────────────────────────────────────────────
# WORKFLOWS
# ─────────────────────────────────────────────────────────────────────────────
section "Workflows"
t GET "/workflows" "200" "list workflows"

# ─────────────────────────────────────────────────────────────────────────────
# A2A APIs (Docker Backend)
# ─────────────────────────────────────────────────────────────────────────────
section "A2A APIs (Docker Backend)"
test_endpoint GET "/api/a2a/dashboard" "200" "A2A dashboard" "$DOCKER_BASE"
test_endpoint GET "/api/a2a/workflows" "200" "A2A workflows" "$DOCKER_BASE"
test_endpoint GET "/api/a2a/activity" "200" "A2A activity feed" "$DOCKER_BASE"

# ─────────────────────────────────────────────────────────────────────────────
# DOCKER BACKEND — Web Search
# ─────────────────────────────────────────────────────────────────────────────
section "Web Search (Docker Backend)"
test_endpoint GET "/api/web-search?q=test" "200" "docker web search" "$DOCKER_BASE"

# ─────────────────────────────────────────────────────────────────────────────
# DOCKER BACKEND — Additional Health
# ─────────────────────────────────────────────────────────────────────────────
section "Docker Backend — Additional Health"
test_endpoint GET "/api/health/byok-readiness" "200" "BYOK readiness" "$DOCKER_BASE"

# ─────────────────────────────────────────────────────────────────────────────
# MONITORING (backend final check)
# ─────────────────────────────────────────────────────────────────────────────
section "Monitoring — Final"
t GET "/health" "200" "health (final ping)"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo -e "${BOLD}=============================================${RESET}"
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}ALL TESTS PASSED${RESET}"
else
  echo -e "${RED}${BOLD}SOME TESTS FAILED${RESET}"
fi
echo -e "  ${GREEN}Passed:  $PASS${RESET}"
echo -e "  ${RED}Failed:  $FAIL${RESET}"
if [[ $SKIP -gt 0 ]]; then
  echo -e "  ${YELLOW}Skipped: $SKIP${RESET}"
fi
echo -e "  Total:   $TOTAL"
echo -e "${BOLD}=============================================${RESET}"

exit "$FAIL"
