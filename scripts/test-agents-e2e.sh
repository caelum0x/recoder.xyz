#!/bin/bash
# =============================================================================
# Recoder Agents E2E Test Suite
# Tests core AI features on agents.recoder.xyz via the backend API
#
# Usage:
#   bash scripts/test-agents-e2e.sh <TOKEN>
#   TOKEN=xxx bash scripts/test-agents-e2e.sh
#   bash scripts/test-agents-e2e.sh              # uses default session token
#
# Environment:
#   TOKEN      - Better Auth session token (or first argument)
#   API_BASE   - Backend API base URL (default: https://api.recoder.xyz/v1)
# =============================================================================
set -uo pipefail

# --- Configuration ---
TOKEN="${1:-${TOKEN:-TW4RckaW72UaCulXixoDHDY6czsECP2u}}"
API_BASE="${API_BASE:-https://api.recoder.xyz/v1}"

PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Track created resources for cleanup
CLEANUP_THREAD_ID=""
CLEANUP_AGENT_ID=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# --- Helpers ---

ok() {
  echo -e "  ${GREEN}PASS${RESET}: $1"
  ((PASS++))
  ((TOTAL++))
}

fail() {
  echo -e "  ${RED}FAIL${RESET}: $1 ${RED}($2)${RESET}"
  ((FAIL++))
  ((TOTAL++))
}

skip() {
  echo -e "  ${YELLOW}SKIP${RESET}: $1 ${YELLOW}($2)${RESET}"
  ((SKIP++))
  ((TOTAL++))
}

info() {
  echo -e "  ${CYAN}INFO${RESET}: $1"
}

# Authenticated GET request, check HTTP status code
test_get() {
  local label="$1" path="$2" expected="$3"
  local url="${API_BASE}${path}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null) || code="000"
  if [[ "$code" == "$expected" ]]; then
    ok "$label (HTTP $code)"
  else
    fail "$label" "expected $expected, got $code"
  fi
}

# Authenticated GET, return body and status
get_body() {
  local path="$1"
  local url="${API_BASE}${path}"
  local tmpfile
  tmpfile=$(mktemp)
  local code
  code=$(curl -s -o "$tmpfile" -w "%{http_code}" --max-time 15 \
    -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null) || code="000"
  echo "$code"
  cat "$tmpfile"
  rm -f "$tmpfile"
}

# Authenticated POST (form-encoded), return body and status
post_form_body() {
  local path="$1"
  shift
  local url="${API_BASE}${path}"
  local tmpfile
  tmpfile=$(mktemp)
  local code
  code=$(curl -s -o "$tmpfile" -w "%{http_code}" --max-time 30 \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    "$@" "$url" 2>/dev/null) || code="000"
  echo "$code"
  cat "$tmpfile"
  rm -f "$tmpfile"
}

# Parse JSON field using python3 (available on macOS and most Linux)
json_field() {
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    keys = '$1'.split('.')
    for k in keys:
        if isinstance(data, dict):
            data = data.get(k, '')
        elif isinstance(data, list) and k.isdigit():
            data = data[int(k)]
        else:
            data = ''
            break
    print(data if data is not None else '')
except:
    print('')
" 2>/dev/null
}

json_len() {
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    keys = '$1'.split('.')
    for k in keys:
        if isinstance(data, dict):
            data = data.get(k, [])
        elif isinstance(data, list) and k.isdigit():
            data = data[int(k)]
        else:
            data = []
            break
    if isinstance(data, list):
        print(len(data))
    elif isinstance(data, dict):
        print(len(data))
    else:
        print(0)
except:
    print(0)
" 2>/dev/null
}

# Cleanup function
cleanup() {
  if [[ -n "$CLEANUP_THREAD_ID" ]]; then
    info "Cleaning up test thread $CLEANUP_THREAD_ID..."
    curl -s -X DELETE --max-time 10 \
      -H "Authorization: Bearer $TOKEN" \
      "${API_BASE}/threads/${CLEANUP_THREAD_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CLEANUP_AGENT_ID" ]]; then
    info "Cleaning up test agent $CLEANUP_AGENT_ID..."
    curl -s -X DELETE --max-time 10 \
      -H "Authorization: Bearer $TOKEN" \
      "${API_BASE}/agents/${CLEANUP_AGENT_ID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

# =============================================================================
# TEST EXECUTION
# =============================================================================

echo -e "${BOLD}=============================================${RESET}"
echo -e "${BOLD}RECODER AGENTS E2E TEST SUITE${RESET}"
echo -e "Date:     $(date)"
echo -e "API Base: $API_BASE"
echo -e "Token:    ${TOKEN:0:8}..."
echo -e "${BOLD}=============================================${RESET}"

# ─────────────────────────────────────────────────────────────────────────────
# 0. PRE-FLIGHT: Verify auth token is valid
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 0. PRE-FLIGHT: Auth Verification ---${RESET}"

AUTH_RESPONSE=$(get_body "/health")
AUTH_CODE=$(echo "$AUTH_RESPONSE" | head -1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | tail -n +2)

if [[ "$AUTH_CODE" == "200" ]]; then
  ok "API health check (HTTP $AUTH_CODE)"
else
  fail "API health check" "HTTP $AUTH_CODE -- API may be down"
fi

# Quick auth test
AUTH_RESPONSE=$(get_body "/agents?limit=1")
AUTH_CODE=$(echo "$AUTH_RESPONSE" | head -1)

if [[ "$AUTH_CODE" == "200" ]]; then
  ok "Auth token is valid"
else
  fail "Auth token validation" "HTTP $AUTH_CODE"
  if [[ "$AUTH_CODE" == "401" ]]; then
    echo ""
    echo -e "  ${RED}${BOLD}TOKEN IS INVALID OR EXPIRED.${RESET}"
    echo -e "  Get a fresh session token from recoder.xyz cookies"
    echo -e "  (cookie name: recoder.session_token or better-auth.session_token)"
    echo -e "  Or use an API key in pk_xxx:sk_xxx format via x-api-key header."
    echo ""
    echo -e "${BOLD}=============================================${RESET}"
    echo -e "  ${GREEN}Passed:  $PASS${RESET}"
    echo -e "  ${RED}Failed:  $FAIL${RESET}"
    echo -e "  ${YELLOW}Skipped: $SKIP${RESET}"
    echo -e "  Total:   $TOTAL"
    echo -e "${BOLD}=============================================${RESET}"
    exit 1
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 1. AGENT LISTING
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 1. Agent Listing ---${RESET}"

AGENTS_RESPONSE=$(get_body "/agents?limit=10")
AGENTS_CODE=$(echo "$AGENTS_RESPONSE" | head -1)
AGENTS_BODY=$(echo "$AGENTS_RESPONSE" | tail -n +2)

if [[ "$AGENTS_CODE" == "200" ]]; then
  ok "GET /agents (HTTP $AGENTS_CODE)"
else
  fail "GET /agents" "HTTP $AGENTS_CODE"
fi

# Count agents (response may be {agents: {agents: [...]}} or {agents: [...]})
AGENT_COUNT=$(echo "$AGENTS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    agents = data.get('agents', {})
    if isinstance(agents, dict):
        agents = agents.get('agents', [])
    print(len(agents) if isinstance(agents, list) else 0)
except:
    print(0)
" 2>/dev/null)

if [[ "$AGENT_COUNT" -ge 1 ]]; then
  ok "Default agent exists ($AGENT_COUNT agents found)"
else
  fail "Default agent check" "found $AGENT_COUNT agents"
fi

# Extract first agent ID for later use
FIRST_AGENT_ID=$(echo "$AGENTS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    agents = data.get('agents', {})
    if isinstance(agents, dict):
        agents = agents.get('agents', [])
    if isinstance(agents, list) and len(agents) > 0:
        print(agents[0].get('agent_id', ''))
    else:
        print('')
except:
    print('')
" 2>/dev/null)

if [[ -n "$FIRST_AGENT_ID" ]]; then
  info "First agent ID: $FIRST_AGENT_ID"

  # Test getting a specific agent
  test_get "GET /agents/{id}" "/agents/${FIRST_AGENT_ID}" "200"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. THREAD CREATION
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 2. Thread Creation ---${RESET}"

THREAD_RESPONSE=$(post_form_body "/threads" -F "name=E2E Test Thread")
THREAD_CODE=$(echo "$THREAD_RESPONSE" | head -1)
THREAD_BODY=$(echo "$THREAD_RESPONSE" | tail -n +2)

if [[ "$THREAD_CODE" == "200" ]]; then
  THREAD_ID=$(echo "$THREAD_BODY" | json_field "thread_id")
  PROJECT_ID=$(echo "$THREAD_BODY" | json_field "project_id")

  if [[ -n "$THREAD_ID" ]]; then
    ok "Thread created (thread_id: ${THREAD_ID:0:12}...)"
    CLEANUP_THREAD_ID="$THREAD_ID"
    if [[ -n "$PROJECT_ID" ]]; then
      info "Project ID: ${PROJECT_ID:0:12}..."
    fi
  else
    fail "Thread creation" "no thread_id in response"
  fi
elif [[ "$THREAD_CODE" == "402" ]]; then
  skip "Thread creation" "limit reached (HTTP 402)"
  THREAD_ID=""
else
  fail "Thread creation" "HTTP $THREAD_CODE"
  THREAD_ID=""
fi

# Test thread listing
test_get "GET /threads (list)" "/threads?limit=5" "200"

# Test pinned threads
test_get "GET /threads/pinned" "/threads/pinned" "200"

# ─────────────────────────────────────────────────────────────────────────────
# 3. MODEL LISTING
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 3. Model Listing ---${RESET}"

MODELS_RESPONSE=$(get_body "/models")
MODELS_CODE=$(echo "$MODELS_RESPONSE" | head -1)
MODELS_BODY=$(echo "$MODELS_RESPONSE" | tail -n +2)

if [[ "$MODELS_CODE" == "200" ]]; then
  ok "GET /models (HTTP $MODELS_CODE)"
else
  fail "GET /models" "HTTP $MODELS_CODE"
fi

MODEL_COUNT=$(echo "$MODELS_BODY" | json_len "models")
if [[ "$MODEL_COUNT" -ge 5 ]]; then
  ok "Sufficient models available ($MODEL_COUNT models)"
else
  fail "Model count check" "found $MODEL_COUNT models, expected >= 5"
fi

# Check for free models
FREE_COUNT=$(echo "$MODELS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    free = [m for m in data.get('models', []) if m.get('tier') == 'free']
    print(len(free))
except:
    print(0)
" 2>/dev/null)

if [[ "$FREE_COUNT" -ge 1 ]]; then
  ok "Free-tier models available ($FREE_COUNT)"
else
  fail "Free-tier model check" "found $FREE_COUNT free models"
fi

# Check free_default
FREE_DEFAULT=$(echo "$MODELS_BODY" | json_field "free_default")
if [[ -n "$FREE_DEFAULT" ]]; then
  ok "free_default model set ($FREE_DEFAULT)"
else
  fail "free_default model" "not set"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. BILLING CHECK
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 4. Billing Check ---${RESET}"

BILLING_RESPONSE=$(get_body "/billing/account-state")
BILLING_CODE=$(echo "$BILLING_RESPONSE" | head -1)
BILLING_BODY=$(echo "$BILLING_RESPONSE" | tail -n +2)

if [[ "$BILLING_CODE" == "200" ]]; then
  ok "GET /billing/account-state (HTTP $BILLING_CODE)"
else
  fail "GET /billing/account-state" "HTTP $BILLING_CODE"
fi

CAN_RUN=$(echo "$BILLING_BODY" | json_field "credits.can_run")
if [[ "$CAN_RUN" == "True" || "$CAN_RUN" == "true" ]]; then
  ok "User can run agents (can_run=$CAN_RUN)"
else
  fail "Billing can_run check" "can_run=$CAN_RUN"
fi

BILLING_MODELS=$(echo "$BILLING_BODY" | json_len "models")
if [[ "$BILLING_MODELS" -ge 1 ]]; then
  ok "Billing lists available models ($BILLING_MODELS)"
else
  fail "Billing models check" "found $BILLING_MODELS models"
fi

# Check minimal billing endpoint
test_get "GET /billing/account-state/minimal" "/billing/account-state/minimal" "200"

# ─────────────────────────────────────────────────────────────────────────────
# 5. AGENT START (AI Execution)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 5. Agent Start (AI Execution) ---${RESET}"

if [[ -n "${THREAD_ID:-}" ]]; then
  # Use the thread we just created
  START_RESPONSE=$(post_form_body "/agent/start" \
    -F "prompt=What is 2+2? Reply with just the number." \
    -F "thread_id=$THREAD_ID")
  START_CODE=$(echo "$START_RESPONSE" | head -1)
  START_BODY=$(echo "$START_RESPONSE" | tail -n +2)

  if [[ "$START_CODE" == "200" ]]; then
    START_STATUS=$(echo "$START_BODY" | json_field "status")
    AGENT_RUN_ID=$(echo "$START_BODY" | json_field "agent_run_id")

    if [[ "$START_STATUS" == "running" || "$START_STATUS" == "completed" ]]; then
      ok "Agent started successfully (status=$START_STATUS)"
      if [[ -n "$AGENT_RUN_ID" ]]; then
        info "Agent run ID: ${AGENT_RUN_ID:0:12}..."
      fi

      # Give the AI a moment to process, then check for messages
      info "Waiting 10s for AI response..."
      sleep 10

      # Check thread messages
      MSGS_RESPONSE=$(get_body "/threads/${THREAD_ID}/messages")
      MSGS_CODE=$(echo "$MSGS_RESPONSE" | head -1)
      MSGS_BODY=$(echo "$MSGS_RESPONSE" | tail -n +2)

      if [[ "$MSGS_CODE" == "200" ]]; then
        MSG_COUNT=$(echo "$MSGS_BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msgs = data.get('messages', data if isinstance(data, list) else [])
    print(len(msgs))
except:
    print(0)
" 2>/dev/null)

        if [[ "$MSG_COUNT" -ge 1 ]]; then
          ok "Thread has messages after agent run ($MSG_COUNT messages)"
        else
          skip "Thread messages" "no messages yet (may still be processing)"
        fi
      else
        fail "Get thread messages" "HTTP $MSGS_CODE"
      fi
    else
      fail "Agent start" "status=$START_STATUS"
      info "Response: $(echo "$START_BODY" | head -c 200)"
    fi
  elif [[ "$START_CODE" == "402" ]]; then
    skip "Agent start" "billing/credit limit (HTTP 402)"
  elif [[ "$START_CODE" == "429" ]]; then
    skip "Agent start" "rate limited (HTTP 429)"
  else
    fail "Agent start" "HTTP $START_CODE"
    info "Response: $(echo "$START_BODY" | head -c 300)"
  fi
else
  skip "Agent start" "no thread available (thread creation was skipped or failed)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. SUPPORTING FEATURES
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 6. Supporting Features ---${RESET}"

test_get "GET /notifications" "/notifications?limit=5" "200"
test_get "GET /prompts" "/prompts" "200"
test_get "GET /mfa/status" "/mfa/status" "200"
test_get "GET /labels" "/labels" "200"
test_get "GET /knowledge-base/folders" "/knowledge-base/folders" "200"
test_get "GET /preferences" "/preferences" "200"

# ─────────────────────────────────────────────────────────────────────────────
# 7. SEARCH
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}--- 7. Search ---${RESET}"

test_get "GET /search" "/search?q=test&limit=5" "200"
test_get "GET /web-search" "/web-search?q=test&limit=3" "200"

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
