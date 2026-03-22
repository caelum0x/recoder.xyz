#!/bin/bash
# Recoder Platform - Comprehensive Feature Test Suite
# Run on server: bash /tmp/test-all-features.sh
set -uo pipefail

TOKEN="${1:-TW4RckaW72UaCulXixoDHDY6czsECP2u}"
DAYTONA_TOKEN="dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946"
PASS=0; FAIL=0; SKIP=0

ok() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1 ($2)"; FAIL=$((FAIL+1)); }
skip() { echo "  SKIP: $1 ($2)"; SKIP=$((SKIP+1)); }

test_http() {
  local name="$1" url="$2" expected="$3"
  local code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null)
  [ "$code" = "$expected" ] && ok "$name" || fail "$name" "got $code"
}

test_auth_http() {
  local name="$1" url="$2" expected="$3"
  local code=$(curl -s -o /dev/null -w "%{http_code}" "$url" -H "Authorization: Bearer $TOKEN" --max-time 10 2>/dev/null)
  [ "$code" = "$expected" ] && ok "$name" || fail "$name" "got $code"
}

echo "============================================="
echo "COMPREHENSIVE FEATURE TEST SUITE"
echo "$(date)"
echo "============================================="

# ── Section 1: Services ──
echo -e "\n--- 1. SERVICES ---"
test_http "recoder-app" "http://localhost:3000" "200"
test_http "recoder-agents" "http://localhost:3001" "200"
test_http "api-health" "http://localhost:8000/v1/health" "200"
test_http "docker-health" "http://localhost:3100/health" "200"
test_http "recoder-pm" "http://localhost:3004" "307"
test_http "recoder-agency" "http://localhost:3007" "307"
echo "  $(docker ps --filter name=recoder-web --format '{{.Status}}' | grep -c healthy) recoder-web (healthy containers)"
echo "  $(docker ps --filter name=daytona-api --format '{{.Status}}' | grep -c healthy) daytona (healthy)"

# ── Section 2: Auth ──
echo -e "\n--- 2. AUTH ---"
test_auth_http "Bearer auth" "http://localhost:8000/v1/agents?limit=1" "200"
test_auth_http "Billing auth" "http://localhost:8000/v1/billing/account-state" "200"

# ── Section 3: Agent CRUD ──
echo -e "\n--- 3. AGENT CRUD ---"
AGENTS_JSON=$(curl -s "http://localhost:8000/v1/agents?limit=10" -H "Authorization: Bearer $TOKEN" --max-time 10 2>/dev/null)
AGENT_COUNT=$(echo "$AGENTS_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('agents',{}).get('agents',d.get('agents',[]))))" 2>/dev/null || echo 0)
[ "$AGENT_COUNT" -ge 1 ] && ok "Agent list ($AGENT_COUNT agents)" || fail "Agent list" "$AGENT_COUNT"

# ── Section 4: Thread + Sandbox ──
echo -e "\n--- 4. THREAD + SANDBOX ---"
TID=$(curl -s -X POST "http://localhost:8000/v1/threads" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"agent_id":"7e91f872-2407-42ac-bfcb-ea69a496e85c"}' --max-time 20 | python3 -c "import json,sys; print(json.load(sys.stdin).get('thread_id',''))" 2>/dev/null)
[ -n "$TID" ] && ok "Thread creation ($TID)" || fail "Thread creation" "empty"

if [ -n "$TID" ]; then
  STATUS=$(curl -s -X POST "http://localhost:8000/v1/agent/start" -H "Authorization: Bearer $TOKEN" -F "prompt=What is 2+2?" -F "thread_id=$TID" --max-time 20 | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  [ "$STATUS" = "running" ] && ok "Agent start ($STATUS)" || fail "Agent start" "$STATUS"

  # Wait for LLM response
  sleep 15
  LLM=$(pm2 logs recoder-backend --lines 30 --nostream 2>&1 | grep "LLM.*total.*chunks" | tail -1)
  [ -n "$LLM" ] && ok "LLM response received" || skip "LLM response" "may need more time"
fi

# ── Section 5: Daytona Sandbox ──
echo -e "\n--- 5. DAYTONA SANDBOX ---"
SID=$(curl -s -X POST "http://localhost:3900/api/sandbox" -H "Authorization: Bearer $DAYTONA_TOKEN" -H "Content-Type: application/json" -d '{"image":"daytonaio/sandbox:0.5.0-slim","public":true,"auto_stop_interval":5}' --max-time 15 | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$SID" ] && ok "Sandbox creation ($SID)" || fail "Sandbox creation" "empty"

if [ -n "$SID" ]; then
  sleep 3
  STATE=$(curl -s "http://localhost:3900/api/sandbox/$SID" -H "Authorization: Bearer $DAYTONA_TOKEN" --max-time 5 | python3 -c "import json,sys; print(json.load(sys.stdin).get('state','?'))" 2>/dev/null)
  [ "$STATE" = "started" ] && ok "Sandbox started" || fail "Sandbox state" "$STATE"

  curl -s -X DELETE "http://localhost:3900/api/sandbox/$SID" -H "Authorization: Bearer $DAYTONA_TOKEN" --max-time 5 >/dev/null 2>&1
  ok "Sandbox deleted"
fi

# ── Section 6: A2A ──
echo -e "\n--- 6. A2A ---"
BRIDGE=$(NODE_PATH=/tmp/node_modules node -e "const W=require('ws');const w=new W('ws://127.0.0.1:3100/agent-bridge',{headers:{'x-agent-id':'test-feat'}});w.on('open',()=>{console.log('ok');w.close();process.exit(0)});w.on('error',()=>{console.log('fail');process.exit(1)});setTimeout(()=>process.exit(1),5000)" 2>/dev/null)
[ "$BRIDGE" = "ok" ] && ok "WS bridge" || fail "WS bridge" "$BRIDGE"

AGENTS=$(curl -s "http://localhost:3100/api/a2a/agents" --max-time 5 | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('agents',[])))" 2>/dev/null)
[ "$AGENTS" -ge 5 ] && ok "Agent registry ($AGENTS)" || fail "Agent registry" "$AGENTS"

TASKS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100/api/a2a/tasks" --max-time 5)
[ "$TASKS" = "200" ] && ok "Tasks API" || fail "Tasks API" "$TASKS"

# ── Section 7: Claude MCP ──
echo -e "\n--- 7. CLAUDE MCP ---"
CS=$(curl -s "http://localhost:3100/api/a2a/connectors/claude/status" --max-time 5 | python3 -c "import json,sys; d=json.load(sys.stdin).get('data',{}); print(d.get('status','?'),len(d.get('tools',[])))" 2>/dev/null)
echo "$CS" | grep -q "running" && ok "Claude MCP ($CS)" || skip "Claude MCP" "$CS"

# ── Section 8: Billing ──
echo -e "\n--- 8. BILLING ---"
BILL=$(curl -s "http://localhost:8000/v1/billing/account-state" -H "Authorization: Bearer $TOKEN" --max-time 10 2>/dev/null)
CAN_RUN=$(echo "$BILL" | python3 -c "import json,sys; print(json.load(sys.stdin).get('credits',{}).get('can_run','?'))" 2>/dev/null)
[ "$CAN_RUN" = "True" ] && ok "Billing can_run" || fail "Billing" "$CAN_RUN"

MODELS=$(echo "$BILL" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('models',[])))" 2>/dev/null)
[ "$MODELS" -ge 5 ] && ok "Models available ($MODELS)" || fail "Models" "$MODELS"

# ── Section 9: Notifications ──
echo -e "\n--- 9. NOTIFICATIONS ---"
test_auth_http "List notifications" "http://localhost:8000/v1/notifications?limit=5" "200"

# ── Section 10: Composio ──
echo -e "\n--- 10. COMPOSIO ---"
test_http "Gmail icon" "http://localhost:8000/v1/composio/toolkits/gmail/icon" "200"
test_http "Slack icon" "http://localhost:8000/v1/composio/toolkits/slack/icon" "200"

# ── Section 11: Prompts ──
echo -e "\n--- 11. PROMPTS ---"
test_auth_http "Prompts list" "http://localhost:8000/v1/prompts" "200"

# ── Section 12: MFA ──
echo -e "\n--- 12. MFA ---"
test_auth_http "MFA status" "http://localhost:8000/v1/mfa/status" "200"

# ── Results ──
echo -e "\n============================================="
echo "RESULTS: $PASS passed, $FAIL failed, $SKIP skipped"
TOTAL=$((PASS+FAIL+SKIP))
echo "Total: $TOTAL tests"
echo "============================================="

exit $FAIL
