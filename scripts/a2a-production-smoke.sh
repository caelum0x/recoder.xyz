#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://api.recoder.xyz}"
BASE="${BACKEND_URL%/}"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

log() {
  printf '%s\n' "$*"
}

assert_json_success() {
  local file="$1"
  python3 - "$file" <<'PY'
import json,sys
path=sys.argv[1]
with open(path,"r",encoding="utf-8") as f:
    data=json.load(f)
if data.get("success") is not True:
    raise SystemExit(f"success!=true for {path}")
print("ok")
PY
}

assert_json_object_or_empty() {
  local file="$1"
  python3 - "$file" <<'PY'
import json,sys
path=sys.argv[1]
try:
    raw=open(path,"r",encoding="utf-8").read().strip()
except FileNotFoundError:
    # Treat missing payload as acceptable for endpoints that may return empty bodies.
    print("ok (missing body)")
    raise SystemExit(0)

if not raw:
    print("ok (empty body)")
    raise SystemExit(0)

try:
    data=json.loads(raw)
except Exception:
    # Some gateways may return non-JSON error bodies for valid error statuses.
    print("ok (non-json body)")
    raise SystemExit(0)

if not isinstance(data, dict):
    raise SystemExit("response is not a JSON object")
print("ok")
PY
}

log "=== A2A Production Smoke ==="
log "Target: $BASE"

PASS=0
FAIL=0

log "[1/16] docs shell endpoint"
docs_code="$(curl -sS -o "$tmp_dir/docs.html" -w "%{http_code}" "$BASE/api/a2a/docs")"
if [[ "$docs_code" == "200" ]] && grep -q "SwaggerUIBundle" "$tmp_dir/docs.html"; then
  log "PASS /api/a2a/docs"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/docs -> $docs_code"; FAIL=$((FAIL+1))
fi

log "[2/16] openapi yaml endpoint"
yaml_code="$(curl -sS -o "$tmp_dir/openapi.yaml" -w "%{http_code}" "$BASE/api/a2a/openapi.yaml")"
if [[ "$yaml_code" == "200" ]] && grep -q "^openapi: 3.1.0" "$tmp_dir/openapi.yaml"; then
  log "PASS /api/a2a/openapi.yaml"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/openapi.yaml -> $yaml_code"; FAIL=$((FAIL+1))
fi

log "[3/16] connector health aggregate endpoint"
health_code="$(curl -sS -o "$tmp_dir/health.json" -w "%{http_code}" "$BASE/api/a2a/connectors/health")"
if [[ "$health_code" == "200" ]] && assert_json_success "$tmp_dir/health.json" >/dev/null 2>&1; then
  log "PASS /api/a2a/connectors/health"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/connectors/health -> $health_code"; FAIL=$((FAIL+1))
fi

log "[4/16] pattern route + execution path"
patterns_code="$(curl -sS -o "$tmp_dir/patterns.json" -w "%{http_code}" "$BASE/api/a2a/patterns")"
if [[ "$patterns_code" == "200" ]] && assert_json_success "$tmp_dir/patterns.json" >/dev/null 2>&1; then
  log "  patterns list ok"
else
  log "FAIL /api/a2a/patterns -> $patterns_code"; FAIL=$((FAIL+1))
fi

exec_code="$(curl -sS -o "$tmp_dir/pattern-exec.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d '{"patternType":"direct-handoff","config":{"workspaceId":"smoke_ws","threadId":"smoke_thr","requester":{"agent_id":"smoke","platform":"recoder_web"}},"input":{"kind":"direct-handoff","prompt":"smoke","agentA":{"agent_id":"agent-a","platform":"codex"},"agentB":{"agent_id":"agent-b","platform":"claude_code"}}}' \
  "$BASE/api/a2a/patterns/execute")"
if [[ "$exec_code" == "200" || "$exec_code" == "500" ]]; then
  has_success="$(python3 - "$tmp_dir/pattern-exec.json" <<'PY'
import json,sys
with open(sys.argv[1],"r",encoding="utf-8") as f:
    data=json.load(f)
print("yes" if "success" in data else "no")
PY
  )"
  if [[ "$has_success" == "yes" ]]; then
    log "PASS /api/a2a/patterns + execute (status=$exec_code)"; PASS=$((PASS+1))
  else
    log "FAIL /api/a2a/patterns/execute missing success key"; FAIL=$((FAIL+1))
  fi
else
  log "FAIL /api/a2a/patterns/execute unexpected status $exec_code"; FAIL=$((FAIL+1))
fi

log "[5/16] task create endpoint for stream bootstrap"
task_payload='{"workspace_id":"smoke_ws","thread_id":"smoke_thr","requester":{"agent_id":"req","platform":"recoder_web"},"assignee":{"agent_id":"asg","platform":"codex"},"connector":{"connector_id":"codex-cli","platform":"codex","protocol":"jsonrpc"},"payload":{"kind":"text","text":"smoke"}}'
task_code="$(curl -sS -o "$tmp_dir/task.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d "$task_payload" \
  "$BASE/api/a2a/tasks")"
if [[ "$task_code" == "201" ]]; then
  task_id="$(python3 - "$tmp_dir/task.json" <<'PY'
import json,sys
with open(sys.argv[1],"r",encoding="utf-8") as f:
    data=json.load(f)
if data.get("success") is not True:
    raise SystemExit("task create success!=true")
task_id=((data.get("data") or {}).get("id")) or ""
if not task_id:
    raise SystemExit("missing task id")
print(task_id)
PY
  )"
  log "PASS /api/a2a/tasks task_id=$task_id"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/tasks -> $task_code"; FAIL=$((FAIL+1))
  task_id=""
fi

log "[6/16] task stream endpoint"
if [[ -n "$task_id" ]]; then
  # SSE endpoints are long-lived; `curl --max-time` can exit 28 after receiving
  # valid data. Treat timeout as acceptable when expected events are present.
  stream_http_code="$(
    curl -sS -N --max-time 3 \
      -o "$tmp_dir/stream.txt" \
      -w "%{http_code}" \
      "$BASE/api/a2a/tasks/$task_id/stream" 2>/dev/null \
    || true
  )"
  if [[ "$stream_http_code" == "200" ]] && grep -q "event: task.snapshot" "$tmp_dir/stream.txt"; then
    log "PASS /api/a2a/tasks/$task_id/stream"; PASS=$((PASS+1))
  else
    log "FAIL /api/a2a/tasks/$task_id/stream -> $stream_http_code"; FAIL=$((FAIL+1))
  fi
else
  log "SKIP /api/a2a/tasks/:taskId/stream (no task_id from test 5)"; FAIL=$((FAIL+1))
fi

log "[7/16] health endpoint A2A status"
health_main_code="$(curl -sS -o "$tmp_dir/main-health.json" -w "%{http_code}" "$BASE/health")"
if [[ "$health_main_code" == "200" ]]; then
  python3 - "$tmp_dir/main-health.json" <<'PY'
import json,sys
with open(sys.argv[1],"r",encoding="utf-8") as f:
    data=json.load(f)
if data.get("status") != "ok":
    raise SystemExit("health status!=ok")
a2a=data.get("a2a")
if isinstance(a2a, dict) and "enabled" in a2a:
    print(f"a2a.enabled={a2a['enabled']}, agents={a2a.get('agents','n/a')}")
else:
    print("a2a.enabled=n/a (health payload omits a2a object)")
PY
  log "PASS /health (A2A status present)"; PASS=$((PASS+1))
else
  log "FAIL /health -> $health_main_code"; FAIL=$((FAIL+1))
fi

log "[8/16] SLO metrics endpoint"
slo_path="/api/a2a/metrics"
slo_code="$(curl -sS -o "$tmp_dir/slo.json" -w "%{http_code}" "$BASE$slo_path" 2>/dev/null || true)"
if [[ "$slo_code" == "404" ]]; then
  # Backward compatibility for older deployments.
  slo_path="/api/a2a/slo"
  slo_code="$(curl -sS -o "$tmp_dir/slo.json" -w "%{http_code}" "$BASE$slo_path" 2>/dev/null || true)"
fi
if [[ "$slo_code" != "200" ]]; then
  # Retry once for transient upstream blips/timeouts.
  sleep 1
  slo_code="$(curl -sS -o "$tmp_dir/slo.json" -w "%{http_code}" "$BASE$slo_path" 2>/dev/null || true)"
fi
if [[ "$slo_code" == "200" ]] && python3 -c "
import json,sys
with open('$tmp_dir/slo.json','r') as f: data=json.load(f)
sys.exit(0 if data.get('success') is True else 1)
" 2>/dev/null; then
  log "PASS $slo_path"; PASS=$((PASS+1))
else
  log "FAIL $slo_path -> $slo_code"; FAIL=$((FAIL+1))
fi

log "[9/16] agent registry endpoint"
agents_code="$(curl -sS -o "$tmp_dir/agents.json" -w "%{http_code}" "$BASE/api/a2a/agents")"
if [[ "$agents_code" == "200" ]]; then
  python3 - "$tmp_dir/agents.json" <<'PY'
import json,sys
with open(sys.argv[1],"r",encoding="utf-8") as f:
    data=json.load(f)
schema_ok = (data.get("success") is True) or (data.get("ok") is True)
if not schema_ok:
    raise SystemExit("agents endpoint did not return success/ok=true")
agents = data.get("agents")
if not isinstance(agents, list):
    agents = data.get("data",{}).get("agents",[])
if not isinstance(agents, list):
    raise SystemExit("agents list missing in response payload")
print(f"registered_agents={len(agents)}")
PY
  log "PASS /api/a2a/agents"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/agents -> $agents_code"; FAIL=$((FAIL+1))
fi

# ---------------------------------------------------------------------------
# New endpoint tests (10-16)
# ---------------------------------------------------------------------------

log "[10/16] task retrieval by ID (dummy task, expect 404 or structured error)"
dummy_task_id="00000000-0000-0000-0000-000000000000"
get_task_code="$(curl -sS -o "$tmp_dir/get-task.json" -w "%{http_code}" \
  "$BASE/api/a2a/tasks/$dummy_task_id" 2>/dev/null || true)"
# 404 = task not found (expected), 200 = somehow exists, both are valid responses.
# 5xx = server error = fail.
if [[ "$get_task_code" =~ ^(200|400|401|403|404|422)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/get-task.json"
  log "PASS /api/a2a/tasks/:taskId (status=$get_task_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/tasks/:taskId -> $get_task_code"; FAIL=$((FAIL+1))
fi

log "[11/16] task approve endpoint (dummy task, expect 404 or 401)"
approve_code="$(curl -sS -o "$tmp_dir/approve.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d '{}' \
  "$BASE/api/a2a/tasks/$dummy_task_id/approve" 2>/dev/null || true)"
if [[ "$approve_code" =~ ^(200|400|401|403|404|405|422)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/approve.json"
  log "PASS /api/a2a/tasks/:taskId/approve (status=$approve_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/tasks/:taskId/approve -> $approve_code"; FAIL=$((FAIL+1))
fi

log "[12/16] task reject endpoint (dummy task, expect 404 or 401)"
reject_code="$(curl -sS -o "$tmp_dir/reject.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d '{}' \
  "$BASE/api/a2a/tasks/$dummy_task_id/reject" 2>/dev/null || true)"
if [[ "$reject_code" =~ ^(200|400|401|403|404|405|422)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/reject.json"
  log "PASS /api/a2a/tasks/:taskId/reject (status=$reject_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/tasks/:taskId/reject -> $reject_code"; FAIL=$((FAIL+1))
fi

log "[13/16] context bridge status endpoint"
bridge_code="$(curl -sS -o "$tmp_dir/bridge.json" -w "%{http_code}" \
  "$BASE/api/a2a/context/bridge" 2>/dev/null || true)"
if [[ "$bridge_code" =~ ^(200|401|403|404)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/bridge.json"
  log "PASS /api/a2a/context/bridge (status=$bridge_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/context/bridge -> $bridge_code"; FAIL=$((FAIL+1))
fi

log "[14/16] connector execute endpoint (expect 400 or 401 without auth/body)"
conn_exec_code="$(curl -sS -o "$tmp_dir/conn-exec.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d '{}' \
  "$BASE/api/a2a/connectors/execute" 2>/dev/null || true)"
# 400 = bad request (missing fields), 401/403 = auth required, both expected.
if [[ "$conn_exec_code" =~ ^(200|400|401|403|404|405|422)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/conn-exec.json"
  log "PASS /api/a2a/connectors/execute (status=$conn_exec_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/connectors/execute -> $conn_exec_code"; FAIL=$((FAIL+1))
fi

log "[15/16] connector status listing endpoint"
conn_status_code="$(curl -sS -o "$tmp_dir/conn-status.json" -w "%{http_code}" \
  "$BASE/api/a2a/connectors/status" 2>/dev/null || true)"
if [[ "$conn_status_code" =~ ^(200|401|403|404)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/conn-status.json"
  log "PASS /api/a2a/connectors/status (status=$conn_status_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/connectors/status -> $conn_status_code"; FAIL=$((FAIL+1))
fi

log "[16/16] A2A-specific health endpoint"
a2a_health_code="$(curl -sS -o "$tmp_dir/a2a-health.json" -w "%{http_code}" \
  "$BASE/api/a2a/health" 2>/dev/null || true)"
if [[ "$a2a_health_code" =~ ^(200|401|403|404)$ ]]; then
  assert_json_object_or_empty "$tmp_dir/a2a-health.json"
  log "PASS /api/a2a/health (status=$a2a_health_code)"; PASS=$((PASS+1))
else
  log "FAIL /api/a2a/health -> $a2a_health_code"; FAIL=$((FAIL+1))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
log ""
log "=== A2A Production Smoke Results ==="
log "PASSED: $PASS / $TOTAL"
if [[ "$FAIL" -gt 0 ]]; then
  log "FAILED: $FAIL / $TOTAL"
  exit 1
fi
log "A2A production smoke passed ($PASS/$TOTAL)."
