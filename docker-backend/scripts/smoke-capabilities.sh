#!/usr/bin/env bash
# End-to-end smoke test for the agent capability layer. Probes every health
# endpoint, prints a status table, and (optionally) exercises the coding-runtime
# session+prompt flow with auto-enrichment.
#
# Usage:
#   BASE=http://localhost:3001 scripts/smoke-capabilities.sh
#   AUTH="Bearer <token>" PROJECT_ID=<id> scripts/smoke-capabilities.sh   # also runs coding-runtime
#
# Exits non-zero if /api/capabilities is unreachable or not JSON (e.g. a Next
# app is on the port instead of docker-backend).
set -uo pipefail

BASE="${BASE:-http://localhost:3001}"
AUTH="${AUTH:-}"
PROJECT_ID="${PROJECT_ID:-}"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

auth_args=()
[ -n "$AUTH" ] && auth_args=(-H "authorization: $AUTH")

pass=0; fail=0
check() { # name, url, [needs_auth]
  local name="$1" url="$2" needs_auth="${3:-0}" args=(-s -m 15)
  [ "$needs_auth" = "1" ] && args+=("${auth_args[@]}")
  local body; body=$(curl "${args[@]}" "$BASE$url" 2>/dev/null)
  if echo "$body" | jq -e . >/dev/null 2>&1; then
    printf "  ✓ %-34s %s\n" "$name" "$(echo "$body" | jq -c '.data // . | {success: (.success // true)} + (.data // .) | del(.success) | (if (.codingRuntimes or .secureRunner) then {caps: (keys|length)} else . end)' 2>/dev/null | head -c 140)"
    pass=$((pass+1))
  else
    printf "  ✗ %-34s NON-JSON/UNREACHABLE (first: %s)\n" "$name" "$(echo "$body" | head -c 40)"
    fail=$((fail+1))
  fi
}

echo "==> Capability layer smoke test against $BASE"
echo

# Gate: /api/capabilities must be reachable JSON, else the rest is moot.
caps=$(curl -s -m 15 "$BASE/api/capabilities" 2>/dev/null)
if ! echo "$caps" | jq -e . >/dev/null 2>&1; then
  echo "  ✗ /api/capabilities did not return JSON. Is docker-backend running at $BASE?" >&2
  echo "    (Got: $(echo "$caps" | head -c 80))" >&2
  exit 1
fi
echo "Capability status:"
echo "$caps" | jq -r '(.data // .) | to_entries[] | "  - \(.key): \(.value.available // .value.mode // "n/a")\(if .value.reason then "  (\(.value.reason))" else "" end)"'
echo

echo "Health endpoints:"
check "capabilities"        "/api/capabilities"            0
check "e2b/health"          "/api/e2b/health"              0
check "browser/verify"      "/api/browser/verify/health"   0
check "memory/mem0"         "/api/memory/mem0/health"      0
check "context7"            "/api/context7/health"         0
check "ziti"                "/api/ziti/health"             0
check "billing/polar"       "/api/billing/polar/health"    0
check "coding-runtime list" "/api/coding-runtime/runtimes" 0
check "llm/providers"       "/api/llm/providers"           1
check "squads list"         "/api/a2a/squads"              1
check "collaboration feed"  "/api/a2a/collaboration/feed"  1
check "collaboration summary" "/api/a2a/collaboration/summary" 1
check "collaboration events" "/api/a2a/collaboration/events" 1
check "collaboration roster" "/api/a2a/collaboration/roster" 1
check "skills leaderboard"  "/api/agent-skills/leaderboard" 1
echo

# Optional: exercise the full squad lifecycle (create → member → dispatch →
# transition → presence → collaboration feed → run-steps → delete).
if [ -n "$AUTH" ]; then
  echo "Squad + dispatch + workflow lifecycle:"
  sq=$(curl -s -m 15 "${auth_args[@]}" -H 'content-type: application/json' \
    -d '{"name":"smoke-squad","description":"smoke test"}' "$BASE/api/a2a/squads")
  sid=$(echo "$sq" | jq -r '(.data // .).id // empty')
  if [ -n "$sid" ]; then
    echo "  created squad $sid"
    curl -s -m 15 "${auth_args[@]}" -H 'content-type: application/json' \
      -d '{"id":"agent-smoke-1","kind":"agent","role":"builder"}' "$BASE/api/a2a/squads/$sid/members" >/dev/null

    # Dispatch a task to the squad, then drive one assignment to completion.
    disp=$(curl -s -m 15 "${auth_args[@]}" -H 'content-type: application/json' \
      -d '{"task":"smoke task","strategy":"all"}' "$BASE/api/a2a/squads/$sid/dispatch")
    stid=$(echo "$disp" | jq -r '(.data // .).id // empty')
    echo "  dispatched: $(echo "$disp" | jq -c '(.data // .) | {status, delivered: (.deliveredTo|length), assignments: (.assignments|length)}' 2>/dev/null | head -c 120)"
    if [ -n "$stid" ]; then
      curl -s -m 15 "${auth_args[@]}" -H 'content-type: application/json' -d '{"status":"in_progress"}' \
        "$BASE/api/a2a/squad-tasks/$stid/assignments/agent-smoke-1" >/dev/null
      done=$(curl -s -m 15 "${auth_args[@]}" -H 'content-type: application/json' -d '{"status":"completed"}' \
        "$BASE/api/a2a/squad-tasks/$stid/assignments/agent-smoke-1")
      echo "  task status: $(echo "$done" | jq -r '(.data // .).status' 2>/dev/null)"
    fi

    pres=$(curl -s -m 15 "${auth_args[@]}" "$BASE/api/a2a/presence?agentIds=agent-smoke-1")
    echo "  presence: $(echo "$pres" | jq -c '(.data // .).presence."agent-smoke-1" | {availability, workload}' 2>/dev/null | head -c 100)"

    # Run a workflow step list that dispatches to the squad.
    steps="{\"steps\":[{\"type\":\"squad\",\"name\":\"fanout\",\"config\":{\"squadId\":\"$sid\",\"task\":\"do it\",\"strategy\":\"leader\"}}]}"
    rs=$(curl -s -m 30 "${auth_args[@]}" -H 'content-type: application/json' -d "$steps" "$BASE/api/workflows/run-steps")
    echo "  run-steps: $(echo "$rs" | jq -c '(.data // .) | {success, steps: (.results|length)}' 2>/dev/null | head -c 100)"

    curl -s -m 15 "${auth_args[@]}" -X DELETE "$BASE/api/a2a/squads/$sid" >/dev/null
    echo "  cleaned up squad $sid"
  else
    echo "  ✗ squad create failed (auth? got: $(echo "$sq" | head -c 60))"
  fi
else
  echo "(Skipping squad lifecycle — set AUTH to exercise it.)"
fi
echo

# Optional: exercise the coding-runtime flow with auto-enrichment.
if [ -n "$AUTH" ] && [ -n "$PROJECT_ID" ]; then
  echo "Coding-runtime flow (auto mode, project=$PROJECT_ID):"
  sess=$(curl -s -m 60 "${auth_args[@]}" -H 'content-type: application/json' \
    -d "{\"projectId\":\"$PROJECT_ID\",\"runtimeType\":\"auto\",\"prompt\":\"List the project files\"}" \
    "$BASE/api/coding-runtime/session")
  echo "  session -> $(echo "$sess" | jq -c '(.data // .) | {selectedRuntime, autoSelection: (.autoSelection.routeDecision.category // null)}' 2>/dev/null | head -c 160)"
  prompt=$(curl -s -m 120 "${auth_args[@]}" -H 'content-type: application/json' \
    -d "{\"projectId\":\"$PROJECT_ID\",\"runtimeType\":\"auto\",\"prompt\":\"Summarize this project.\",\"codeContext\":true,\"useMemory\":true}" \
    "$BASE/api/coding-runtime/prompt")
  echo "  prompt  -> $(echo "$prompt" | jq -c '(.data // .) | {selectedRuntime, completed, adaptive: (.autoSelection.adaptive // null)}' 2>/dev/null | head -c 200)"
else
  echo "(Skipping coding-runtime flow — set AUTH and PROJECT_ID to exercise it.)"
fi

echo
echo "==> $pass passed, $fail failed"
[ "$fail" -eq 0 ]
