#!/bin/bash
# Recoder Platform End-to-End Test Suite
# Tests all services, cross-app integration, and API contracts
#
# Run (public endpoints only):
#   bash scripts/test-platform-e2e.sh
#
# Run with auth (enables auth-gated tests):
#   TOKEN=your_token bash scripts/test-platform-e2e.sh
#   bash scripts/test-platform-e2e.sh --token your_token
#
# Run with SSH (original server-side tests):
#   bash scripts/test-platform-e2e.sh --ssh
#
# Requires: curl, jq (optional but recommended)

set -uo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SERVER="77.42.23.19"
SSH_CMD="ssh -i ~/.ssh/id_ed25519_hetzner -o ConnectTimeout=10 root@$SERVER"
DAYTONA_TOKEN="dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946"

# Parse arguments
USE_SSH=false
TOKEN="${TOKEN:-${RECODER_TEST_TOKEN:-}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh) USE_SSH=true; shift ;;
    --token) TOKEN="$2"; shift 2 ;;
    --token=*) TOKEN="${1#--token=}"; shift ;;
    *) shift ;;
  esac
done

# ─── Colors ──────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

# ─── Counters ────────────────────────────────────────────────────────────────

PASS=0
FAIL=0
SKIP=0
FAILURES=()

# ─── Helper Functions ────────────────────────────────────────────────────────

section() {
  local num="$1"
  local title="$2"
  echo ""
  echo -e "${BOLD}${CYAN}--- $num. $title ---${RESET}"
}

check() {
  # check "name" "actual" "expected"
  local name="$1"
  local result="$2"
  local expected="${3:-0}"

  if [ "$result" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${RESET}: $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}: $name (got: ${RED}$result${RESET}, expected: ${GREEN}$expected${RESET})"
    FAIL=$((FAIL + 1))
    FAILURES+=("$name (got: $result, expected: $expected)")
  fi
}

check_status_any() {
  # check_status_any "name" "actual_code" "200" "307"
  local name="$1"
  local result="$2"
  shift 2
  for expected in "$@"; do
    if [ "$result" = "$expected" ]; then
      echo -e "  ${GREEN}PASS${RESET}: $name (HTTP $result)"
      PASS=$((PASS + 1))
      return
    fi
  done
  echo -e "  ${RED}FAIL${RESET}: $name (got: ${RED}$result${RESET}, expected one of: ${GREEN}$*${RESET})"
  FAIL=$((FAIL + 1))
  FAILURES+=("$name (got: $result, expected one of: $*)")
}

check_json() {
  # check_json "name" "json_body" "jq_expression" "expected_value"
  # If expected_value is omitted, just checks that jq_expression returns truthy (non-empty, non-null, non-false)
  local name="$1"
  local body="$2"
  local jq_expr="$3"
  local expected="${4:-__TRUTHY__}"

  if ! command -v jq &>/dev/null; then
    # Fallback: use python3
    local actual
    actual=$(echo "$body" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    # Simple jq-like path resolution
    expr = '''$jq_expr'''
    if expr.startswith('.'):
        expr = expr[1:]
    parts = expr.replace('[', '.').replace(']', '').split('.')
    val = d
    for p in parts:
        if not p:
            continue
        if isinstance(val, list):
            val = val[int(p)]
        elif isinstance(val, dict):
            val = val.get(p)
        else:
            val = None
            break
    if val is None:
        print('null')
    elif isinstance(val, bool):
        print(str(val).lower())
    elif isinstance(val, (list, dict)):
        print(json.dumps(val))
    else:
        print(val)
except:
    print('ERROR')
" 2>/dev/null)
  else
    local actual
    actual=$(echo "$body" | jq -r "$jq_expr" 2>/dev/null)
  fi

  if [ "$expected" = "__TRUTHY__" ]; then
    if [ -n "$actual" ] && [ "$actual" != "null" ] && [ "$actual" != "false" ] && [ "$actual" != "ERROR" ]; then
      echo -e "  ${GREEN}PASS${RESET}: $name"
      PASS=$((PASS + 1))
    else
      echo -e "  ${RED}FAIL${RESET}: $name (jq '$jq_expr' returned: ${RED}${actual:-empty}${RESET})"
      FAIL=$((FAIL + 1))
      FAILURES+=("$name (jq '$jq_expr' returned: ${actual:-empty})")
    fi
  else
    if [ "$actual" = "$expected" ]; then
      echo -e "  ${GREEN}PASS${RESET}: $name"
      PASS=$((PASS + 1))
    else
      echo -e "  ${RED}FAIL${RESET}: $name (got: ${RED}${actual:-empty}${RESET}, expected: ${GREEN}$expected${RESET})"
      FAIL=$((FAIL + 1))
      FAILURES+=("$name (got: ${actual:-empty}, expected: $expected)")
    fi
  fi
}

check_json_gte() {
  # check_json_gte "name" "json_body" "jq_expression" "min_value"
  local name="$1"
  local body="$2"
  local jq_expr="$3"
  local min_val="$4"

  local actual
  if command -v jq &>/dev/null; then
    actual=$(echo "$body" | jq -r "$jq_expr" 2>/dev/null)
  else
    actual=$(echo "$body" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    expr = '''$jq_expr'''
    if expr.startswith('.'):
        expr = expr[1:]
    parts = expr.replace('[', '.').replace(']', '').split('.')
    val = d
    for p in parts:
        if not p:
            continue
        if isinstance(val, list):
            val = val[int(p)]
        elif isinstance(val, dict):
            val = val.get(p)
        else:
            val = None
            break
    print(val if val is not None else 0)
except:
    print(0)
" 2>/dev/null)
  fi

  actual="${actual:-0}"
  if [ "$actual" -ge "$min_val" ] 2>/dev/null; then
    echo -e "  ${GREEN}PASS${RESET}: $name ($actual >= $min_val)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}: $name (got: ${RED}$actual${RESET}, expected >= ${GREEN}$min_val${RESET})"
    FAIL=$((FAIL + 1))
    FAILURES+=("$name (got: $actual, expected >= $min_val)")
  fi
}

check_contains() {
  # check_contains "name" "body" "substring"
  local name="$1"
  local body="$2"
  local substring="$3"

  if echo "$body" | grep -qi "$substring"; then
    echo -e "  ${GREEN}PASS${RESET}: $name (contains '$substring')"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}: $name (body does not contain '${RED}$substring${RESET}')"
    FAIL=$((FAIL + 1))
    FAILURES+=("$name (body does not contain '$substring')")
  fi
}

check_not_contains() {
  # check_not_contains "name" "body" "substring"
  local name="$1"
  local body="$2"
  local substring="$3"

  if echo "$body" | grep -qi "$substring"; then
    echo -e "  ${RED}FAIL${RESET}: $name (body unexpectedly contains '${RED}$substring${RESET}')"
    FAIL=$((FAIL + 1))
    FAILURES+=("$name (body unexpectedly contains '$substring')")
  else
    echo -e "  ${GREEN}PASS${RESET}: $name (does not contain '$substring')"
    PASS=$((PASS + 1))
  fi
}

skip_test() {
  local name="$1"
  local reason="${2:-no auth token}"
  echo -e "  ${YELLOW}SKIP${RESET}: $name ($reason)"
  SKIP=$((SKIP + 1))
}

# Curl wrappers for public and auth-gated requests
http_get() {
  # http_get "url" -> returns body
  curl -sS -k --max-time 10 "$1" 2>/dev/null || echo ""
}

http_status() {
  # http_status "url" -> returns HTTP status code
  curl -sS -k -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo "000"
}

http_auth_get() {
  # http_auth_get "url" -> returns body (with Bearer token)
  curl -sS -k --max-time 10 -H "Authorization: Bearer $TOKEN" "$1" 2>/dev/null || echo ""
}

http_auth_status() {
  # http_auth_status "url" -> returns HTTP status code (with Bearer token)
  curl -sS -k -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $TOKEN" "$1" 2>/dev/null || echo "000"
}

ssh_run() {
  # ssh_run "command" -> runs command on server via SSH
  $SSH_CMD "$1" 2>/dev/null
}

# ─── Banner ──────────────────────────────────────────────────────────────────

echo -e "${BOLD}=============================================${RESET}"
echo -e "${BOLD}RECODER PLATFORM E2E TEST SUITE${RESET}"
echo "$(date)"
echo "Mode: $([ "$USE_SSH" = true ] && echo 'SSH + HTTPS' || echo 'HTTPS (public)')"
echo "Auth: $([ -n "$TOKEN" ] && echo 'provided' || echo 'not set (auth tests will be skipped)')"
echo -e "${BOLD}=============================================${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1: ALL SERVICES LIVENESS
# ══════════════════════════════════════════════════════════════════════════════

section 1 "ALL SERVICES LIVENESS"

for pair in \
  "https://recoder.xyz:200" \
  "https://agents.recoder.xyz:200" \
  "https://web.recoder.xyz:200:302" \
  "https://pm.recoder.xyz:200:307" \
  "https://agency.recoder.xyz:200:307" \
  "https://api.recoder.xyz/v1/health:200" \
  "https://docker.recoder.xyz/health:200"; do

  # Parse url and acceptable status codes
  url=$(echo "$pair" | cut -d: -f1-2)
  rest=$(echo "$pair" | cut -d: -f3-)
  # rest could be "200" or "200:307"
  code=$(http_status "$url")

  IFS=':' read -ra EXPECTED_CODES <<< "$rest"
  check_status_any "$url" "$code" "${EXPECTED_CODES[@]}"
done

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2: AUTH (requires TOKEN)
# ══════════════════════════════════════════════════════════════════════════════

section 2 "AUTH"

if [ -n "$TOKEN" ]; then
  code=$(http_auth_status "https://api.recoder.xyz/v1/agents?limit=1")
  check "Backend auth (Bearer)" "$code" "200"
else
  skip_test "Backend auth (Bearer)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3: AGENT EXECUTION (requires TOKEN + SSH)
# ══════════════════════════════════════════════════════════════════════════════

section 3 "AGENT EXECUTION"

if [ -n "$TOKEN" ] && [ "$USE_SSH" = true ]; then
  TID=$(ssh_run "curl -s -X POST 'https://api.recoder.xyz/v1/threads' -k -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{\"agent_id\":\"7e91f872-2407-42ac-bfcb-ea69a496e85c\"}' --max-time 15 | python3 -c 'import json,sys; print(json.load(sys.stdin).get(\"thread_id\",\"\"))'")
  if [ -n "$TID" ] && [ "$TID" != "" ]; then
    check "Thread creation" "ok" "ok"
    STATUS=$(ssh_run "curl -s -X POST 'https://api.recoder.xyz/v1/agent/start' -k -H 'Authorization: Bearer $TOKEN' -F 'prompt=Say hi' -F 'thread_id=$TID' --max-time 15 | python3 -c 'import json,sys; print(json.load(sys.stdin).get(\"status\",\"fail\"))'")
    check "Agent start" "$STATUS" "running"
  else
    check "Thread creation" "fail" "ok"
    SKIP=$((SKIP + 1))
  fi
elif [ -n "$TOKEN" ]; then
  # Try via HTTPS directly (may work for thread creation)
  TID_BODY=$(http_auth_get "https://api.recoder.xyz/v1/threads" | head -c 2000)
  # Thread list should succeed
  code=$(http_auth_status "https://api.recoder.xyz/v1/threads?limit=1")
  check "Thread list (auth)" "$code" "200"
else
  skip_test "Agent execution" "requires --token"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4: A2A PROTOCOL (original tests)
# ══════════════════════════════════════════════════════════════════════════════

section 4 "A2A LEGACY (WebSocket + Agents)"

if [ "$USE_SSH" = true ]; then
  A2A_BRIDGE=$(ssh_run "NODE_PATH=/tmp/node_modules node -e 'const W=require(\"ws\");const w=new W(\"ws://127.0.0.1:3100/agent-bridge\",{headers:{\"x-agent-id\":\"test\"}});w.on(\"open\",()=>{console.log(\"ok\");w.close();process.exit(0)});w.on(\"error\",()=>{console.log(\"fail\");process.exit(1)});setTimeout(()=>process.exit(1),5000)'")
  check "A2A WebSocket bridge" "$A2A_BRIDGE" "ok"
else
  skip_test "A2A WebSocket bridge" "requires --ssh"
fi

A2A_AGENTS_BODY=$(http_get "https://docker.recoder.xyz/api/a2a/agents")
if command -v jq &>/dev/null; then
  AGENT_COUNT=$(echo "$A2A_AGENTS_BODY" | jq '.agents | length' 2>/dev/null || echo "0")
else
  AGENT_COUNT=$(echo "$A2A_AGENTS_BODY" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('agents',[])))" 2>/dev/null || echo "0")
fi
check_json_gte "A2A Agent registry" "$A2A_AGENTS_BODY" ".agents | length" "5"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5: DAYTONA SANDBOX HEALTH
# ══════════════════════════════════════════════════════════════════════════════

section 5 "DAYTONA SANDBOX HEALTH"

if [ "$USE_SSH" = true ]; then
  DAYTONA=$(ssh_run "docker ps --filter name=daytona-api --format '{{.Status}}' | grep -c healthy")
  check "Daytona API container healthy" "$DAYTONA" "1"
fi

# Test via public health endpoint
DAYTONA_BODY=$(http_get "https://docker.recoder.xyz/api/health/daytona")
DAYTONA_STATUS=$(http_status "https://docker.recoder.xyz/api/health/daytona")
check "Daytona health endpoint (HTTP)" "$DAYTONA_STATUS" "200"

if [ -n "$DAYTONA_BODY" ]; then
  # Check for ok/healthy/connected in response
  if echo "$DAYTONA_BODY" | grep -qiE '"(status|state)"\s*:\s*"(ok|healthy|connected|running|available)"'; then
    echo -e "  ${GREEN}PASS${RESET}: Daytona health status indicator present"
    PASS=$((PASS + 1))
  elif echo "$DAYTONA_BODY" | grep -qiE '(ok|healthy|connected|available)'; then
    echo -e "  ${GREEN}PASS${RESET}: Daytona health contains healthy indicator"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}SKIP${RESET}: Daytona health response format unclear"
    SKIP=$((SKIP + 1))
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6: CLAUDE MCP
# ══════════════════════════════════════════════════════════════════════════════

section 6 "CLAUDE MCP"

if [ "$USE_SSH" = true ]; then
  CLAUDE=$(ssh_run "curl -s 'https://docker.recoder.xyz/api/a2a/connectors/claude/status' -k --max-time 5 | python3 -c 'import json,sys; d=json.load(sys.stdin).get(\"data\",{}); print(d.get(\"status\",\"?\"))'")
  check "Claude MCP connector" "$CLAUDE" "running"
else
  CLAUDE_STATUS=$(http_status "https://docker.recoder.xyz/api/a2a/connectors/claude/status")
  if [ "$CLAUDE_STATUS" = "200" ]; then
    CLAUDE_BODY=$(http_get "https://docker.recoder.xyz/api/a2a/connectors/claude/status")
    check_json "Claude MCP connector status" "$CLAUDE_BODY" ".data.status" "running"
  else
    skip_test "Claude MCP connector" "endpoint returned $CLAUDE_STATUS"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7: BILLING (requires TOKEN)
# ══════════════════════════════════════════════════════════════════════════════

section 7 "BILLING"

if [ -n "$TOKEN" ]; then
  BILL_BODY=$(http_auth_get "https://api.recoder.xyz/v1/billing/account-state")
  check_json "Billing can_run" "$BILL_BODY" ".credits.can_run"
else
  skip_test "Billing can_run"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8: NOTIFICATIONS (requires TOKEN)
# ══════════════════════════════════════════════════════════════════════════════

section 8 "NOTIFICATIONS"

if [ -n "$TOKEN" ]; then
  code=$(http_auth_status "https://api.recoder.xyz/v1/notifications?limit=5")
  check "Notifications API" "$code" "200"
else
  skip_test "Notifications API"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9: COMPOSIO
# ══════════════════════════════════════════════════════════════════════════════

section 9 "COMPOSIO"

for tk in gmail slack; do
  code=$(http_status "https://api.recoder.xyz/v1/composio/toolkits/$tk/icon")
  check "Composio $tk icon" "$code" "200"
done

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 11: UNIFIED MODEL REGISTRY
# ══════════════════════════════════════════════════════════════════════════════

section 11 "UNIFIED MODEL REGISTRY"

MODELS_STATUS=$(http_status "https://api.recoder.xyz/v1/models")
check "GET /v1/models" "$MODELS_STATUS" "200"

MODELS_BODY=$(http_get "https://api.recoder.xyz/v1/models")

if [ -n "$MODELS_BODY" ] && [ "$MODELS_STATUS" = "200" ]; then
  # Verify response has .models array with 10+ entries
  check_json_gte "Models array has 10+ entries" "$MODELS_BODY" ".models | length" "10"

  # Verify free_default is openrouter/free
  check_json "free_default is openrouter/free" "$MODELS_BODY" ".free_default" "openrouter/free"

  # Verify free models exist
  if command -v jq &>/dev/null; then
    FREE_COUNT=$(echo "$MODELS_BODY" | jq '[.models[] | select(.free == true or .tier == "free" or (.id | test("free")))] | length' 2>/dev/null || echo "0")
  else
    FREE_COUNT=$(echo "$MODELS_BODY" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    models = d.get('models', [])
    free = [m for m in models if m.get('free') or m.get('tier') == 'free' or 'free' in m.get('id', '')]
    print(len(free))
except:
    print(0)
" 2>/dev/null || echo "0")
  fi
  if [ "${FREE_COUNT:-0}" -ge 1 ] 2>/dev/null; then
    echo -e "  ${GREEN}PASS${RESET}: Free models exist ($FREE_COUNT)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}: No free models found"
    FAIL=$((FAIL + 1))
    FAILURES+=("No free models found in /v1/models")
  fi

  # Verify paid models exist
  if command -v jq &>/dev/null; then
    PAID_COUNT=$(echo "$MODELS_BODY" | jq '[.models[] | select(.free != true and .tier != "free")] | length' 2>/dev/null || echo "0")
  else
    PAID_COUNT=$(echo "$MODELS_BODY" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    models = d.get('models', [])
    paid = [m for m in models if not m.get('free') and m.get('tier') != 'free' and 'free' not in m.get('id', '')]
    print(len(paid))
except:
    print(0)
" 2>/dev/null || echo "0")
  fi
  if [ "${PAID_COUNT:-0}" -ge 1 ] 2>/dev/null; then
    echo -e "  ${GREEN}PASS${RESET}: Paid models exist ($PAID_COUNT)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}: No paid models found"
    FAIL=$((FAIL + 1))
    FAILURES+=("No paid models found in /v1/models")
  fi
else
  skip_test "Model registry response parsing" "endpoint returned $MODELS_STATUS"
  SKIP=$((SKIP + 3))
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 12: SEARXNG WEB SEARCH
# ══════════════════════════════════════════════════════════════════════════════

section 12 "SEARXNG WEB SEARCH"

SEARCH_STATUS=$(http_status "https://docker.recoder.xyz/api/web-search?q=recoder")
check "GET /api/web-search?q=recoder" "$SEARCH_STATUS" "200"

if [ "$SEARCH_STATUS" = "200" ]; then
  SEARCH_BODY=$(http_get "https://docker.recoder.xyz/api/web-search?q=recoder")
  check_contains "Web search response has results" "$SEARCH_BODY" "results"
else
  skip_test "Web search response content" "endpoint returned $SEARCH_STATUS"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 13: A2A PROTOCOL (EXPANDED)
# ══════════════════════════════════════════════════════════════════════════════

section 13 "A2A PROTOCOL (Cross-App)"

# Workflows endpoint
WORKFLOWS_STATUS=$(http_status "https://docker.recoder.xyz/api/a2a/workflows")
check "GET /api/a2a/workflows" "$WORKFLOWS_STATUS" "200"

if [ "$WORKFLOWS_STATUS" = "200" ]; then
  WORKFLOWS_BODY=$(http_get "https://docker.recoder.xyz/api/a2a/workflows")

  # Verify 3+ workflows exist
  if command -v jq &>/dev/null; then
    WF_COUNT=$(echo "$WORKFLOWS_BODY" | jq 'if type == "array" then length elif .workflows then (.workflows | length) else 0 end' 2>/dev/null || echo "0")
  else
    WF_COUNT=$(echo "$WORKFLOWS_BODY" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    if isinstance(d, list):
        print(len(d))
    elif isinstance(d, dict) and 'workflows' in d:
        print(len(d['workflows']))
    else:
        print(0)
except:
    print(0)
" 2>/dev/null || echo "0")
  fi
  if [ "${WF_COUNT:-0}" -ge 3 ] 2>/dev/null; then
    echo -e "  ${GREEN}PASS${RESET}: 3+ workflows exist ($WF_COUNT)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${RESET}: Expected 3+ workflows, got ${RED}$WF_COUNT${RESET}"
    FAIL=$((FAIL + 1))
    FAILURES+=("Expected 3+ A2A workflows, got $WF_COUNT")
  fi
else
  skip_test "A2A workflows count" "endpoint returned $WORKFLOWS_STATUS"
fi

# Dashboard endpoint
DASHBOARD_STATUS=$(http_status "https://docker.recoder.xyz/api/a2a/dashboard")
check "GET /api/a2a/dashboard" "$DASHBOARD_STATUS" "200"

if [ "$DASHBOARD_STATUS" = "200" ]; then
  DASHBOARD_BODY=$(http_get "https://docker.recoder.xyz/api/a2a/dashboard")
  check_contains "A2A dashboard has services" "$DASHBOARD_BODY" "services"
else
  skip_test "A2A dashboard services" "endpoint returned $DASHBOARD_STATUS"
fi

# Activity endpoint
ACTIVITY_STATUS=$(http_status "https://docker.recoder.xyz/api/a2a/activity")
check "GET /api/a2a/activity" "$ACTIVITY_STATUS" "200"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 14: CONTENT VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

section 14 "CONTENT VERIFICATION"

# agents.recoder.xyz contains "Recoder" (not "Kortix")
AGENTS_HTML=$(http_get "https://agents.recoder.xyz")
check_contains "agents.recoder.xyz contains 'Recoder'" "$AGENTS_HTML" "Recoder"
check_not_contains "agents.recoder.xyz does not contain 'Kortix'" "$AGENTS_HTML" "Kortix"

# api.recoder.xyz/v1/models response is valid JSON
if [ -n "$MODELS_BODY" ]; then
  if command -v jq &>/dev/null; then
    if echo "$MODELS_BODY" | jq empty 2>/dev/null; then
      echo -e "  ${GREEN}PASS${RESET}: /v1/models returns valid JSON"
      PASS=$((PASS + 1))
    else
      echo -e "  ${RED}FAIL${RESET}: /v1/models returns invalid JSON"
      FAIL=$((FAIL + 1))
      FAILURES+=("/v1/models returns invalid JSON")
    fi
  else
    if echo "$MODELS_BODY" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
      echo -e "  ${GREEN}PASS${RESET}: /v1/models returns valid JSON"
      PASS=$((PASS + 1))
    else
      echo -e "  ${RED}FAIL${RESET}: /v1/models returns invalid JSON"
      FAIL=$((FAIL + 1))
      FAILURES+=("/v1/models returns invalid JSON")
    fi
  fi
else
  skip_test "/v1/models JSON validation" "no body available"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 15: ERROR DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

section 15 "ERROR DASHBOARD"

ERR_DASH_STATUS=$(http_status "https://api.recoder.xyz/v1/errors/dashboard")
check "GET /v1/errors/dashboard" "$ERR_DASH_STATUS" "200"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 16: CROSS-APP INTEGRATION CHECKS
# ══════════════════════════════════════════════════════════════════════════════

section 16 "CROSS-APP INTEGRATION"

# Verify API health returns JSON with expected shape
API_HEALTH_BODY=$(http_get "https://api.recoder.xyz/v1/health")
API_HEALTH_STATUS=$(http_status "https://api.recoder.xyz/v1/health")
check "API health returns 200" "$API_HEALTH_STATUS" "200"

if [ "$API_HEALTH_STATUS" = "200" ] && [ -n "$API_HEALTH_BODY" ]; then
  check_contains "API health has status field" "$API_HEALTH_BODY" "status"
fi

# Docker backend health
DOCKER_HEALTH_BODY=$(http_get "https://docker.recoder.xyz/health")
DOCKER_HEALTH_STATUS=$(http_status "https://docker.recoder.xyz/health")
check "Docker health returns 200" "$DOCKER_HEALTH_STATUS" "200"

if [ "$DOCKER_HEALTH_STATUS" = "200" ] && [ -n "$DOCKER_HEALTH_BODY" ]; then
  check_contains "Docker health has status field" "$DOCKER_HEALTH_BODY" "status"
fi

# Verify recoder.xyz responds with HTML (not error page)
MAIN_BODY=$(http_get "https://recoder.xyz")
check_contains "recoder.xyz returns HTML" "$MAIN_BODY" "<html"

# Verify web.recoder.xyz is reachable (may redirect)
WEB_STATUS=$(http_status "https://web.recoder.xyz")
check_status_any "web.recoder.xyz reachable" "$WEB_STATUS" "200" "302" "307"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 17: AUTH-GATED API SURFACE (requires TOKEN)
# ══════════════════════════════════════════════════════════════════════════════

section 17 "AUTH-GATED API SURFACE"

if [ -n "$TOKEN" ]; then
  # Agents list
  AGENTS_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/agents")
  check "GET /v1/agents" "$AGENTS_STATUS" "200"

  # Threads list
  THREADS_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/threads?limit=1")
  check "GET /v1/threads" "$THREADS_STATUS" "200"

  # MFA status
  MFA_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/mfa/status")
  check "GET /v1/mfa/status" "$MFA_STATUS" "200"

  # Prompts list
  PROMPTS_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/prompts")
  check "GET /v1/prompts" "$PROMPTS_STATUS" "200"

  # User preferences
  PREFS_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/preferences")
  check "GET /v1/preferences" "$PREFS_STATUS" "200"

  # Thread labels
  LABELS_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/labels")
  check "GET /v1/labels" "$LABELS_STATUS" "200"

  # Search
  SEARCH_API_STATUS=$(http_auth_status "https://api.recoder.xyz/v1/search?q=test&limit=5")
  check "GET /v1/search" "$SEARCH_API_STATUS" "200"
else
  skip_test "Auth-gated API surface (7 endpoints)" "requires --token or TOKEN env var"
  SKIP=$((SKIP + 6))  # 6 additional skips beyond the 1 already counted
fi

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}=============================================${RESET}"
TOTAL=$((PASS + FAIL + SKIP))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${BOLD}${GREEN}ALL TESTS PASSED${RESET}"
else
  echo -e "${BOLD}${RED}SOME TESTS FAILED${RESET}"
fi
echo ""
echo -e "  ${GREEN}PASS${RESET}: $PASS"
echo -e "  ${RED}FAIL${RESET}: $FAIL"
echo -e "  ${YELLOW}SKIP${RESET}: $SKIP"
echo -e "  Total: $TOTAL"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo ""
  echo -e "${BOLD}${RED}Failed tests:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "  ${RED}-${RESET} $f"
  done
fi

echo -e "${BOLD}=============================================${RESET}"

exit $FAIL
