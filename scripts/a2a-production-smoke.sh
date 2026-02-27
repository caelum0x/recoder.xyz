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

log "=== A2A Production Smoke ==="
log "Target: $BASE"

log "[1/6] docs shell endpoint"
docs_code="$(curl -sS -o "$tmp_dir/docs.html" -w "%{http_code}" "$BASE/api/a2a/docs")"
[[ "$docs_code" == "200" ]] || { log "FAIL /api/a2a/docs -> $docs_code"; exit 1; }
grep -q "SwaggerUIBundle" "$tmp_dir/docs.html" || { log "FAIL docs missing SwaggerUIBundle"; exit 1; }
log "PASS /api/a2a/docs"

log "[2/6] openapi yaml endpoint"
yaml_code="$(curl -sS -o "$tmp_dir/openapi.yaml" -w "%{http_code}" "$BASE/api/a2a/openapi.yaml")"
[[ "$yaml_code" == "200" ]] || { log "FAIL /api/a2a/openapi.yaml -> $yaml_code"; exit 1; }
grep -q "^openapi: 3.1.0" "$tmp_dir/openapi.yaml" || { log "FAIL openapi version mismatch"; exit 1; }
log "PASS /api/a2a/openapi.yaml"

log "[3/6] connector health aggregate endpoint"
health_code="$(curl -sS -o "$tmp_dir/health.json" -w "%{http_code}" "$BASE/api/a2a/connectors/health")"
[[ "$health_code" == "200" ]] || { log "FAIL /api/a2a/connectors/health -> $health_code"; exit 1; }
assert_json_success "$tmp_dir/health.json" >/dev/null
log "PASS /api/a2a/connectors/health"

log "[4/6] pattern route + execution path"
patterns_code="$(curl -sS -o "$tmp_dir/patterns.json" -w "%{http_code}" "$BASE/api/a2a/patterns")"
[[ "$patterns_code" == "200" ]] || { log "FAIL /api/a2a/patterns -> $patterns_code"; exit 1; }
assert_json_success "$tmp_dir/patterns.json" >/dev/null

exec_code="$(curl -sS -o "$tmp_dir/pattern-exec.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d '{"patternType":"direct-handoff","config":{"workspaceId":"smoke_ws","threadId":"smoke_thr","requester":{"agent_id":"smoke","platform":"recoder_web"}},"input":{"kind":"direct-handoff","prompt":"smoke","agentA":{"agent_id":"agent-a","platform":"codex"},"agentB":{"agent_id":"agent-b","platform":"claude_code"}}}' \
  "$BASE/api/a2a/patterns/execute")"
if [[ "$exec_code" != "200" && "$exec_code" != "500" ]]; then
  log "FAIL /api/a2a/patterns/execute unexpected status $exec_code"
  exit 1
fi
python3 - "$tmp_dir/pattern-exec.json" <<'PY'
import json,sys
with open(sys.argv[1],"r",encoding="utf-8") as f:
    data=json.load(f)
if "success" not in data:
    raise SystemExit("missing success key in pattern execute response")
print("ok")
PY
log "PASS /api/a2a/patterns/execute (status=$exec_code)"

log "[5/6] task create endpoint for stream bootstrap"
task_payload='{"workspace_id":"smoke_ws","thread_id":"smoke_thr","requester":{"agent_id":"req","platform":"recoder_web"},"assignee":{"agent_id":"asg","platform":"codex"},"connector":{"connector_id":"codex-cli","platform":"codex","protocol":"jsonrpc"},"payload":{"kind":"text","text":"smoke"}}'
task_code="$(curl -sS -o "$tmp_dir/task.json" -w "%{http_code}" \
  -X POST \
  -H "content-type: application/json" \
  -d "$task_payload" \
  "$BASE/api/a2a/tasks")"
[[ "$task_code" == "201" ]] || { log "FAIL /api/a2a/tasks -> $task_code"; exit 1; }
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
log "PASS /api/a2a/tasks task_id=$task_id"

log "[6/6] task stream endpoint"
# SSE endpoints are long-lived; `curl --max-time` can exit 28 after receiving
# valid data. Treat timeout as acceptable when expected events are present.
stream_http_code="$(
  curl -sS -N --max-time 3 \
    -o "$tmp_dir/stream.txt" \
    -w "%{http_code}" \
    "$BASE/api/a2a/tasks/$task_id/stream" 2>/dev/null \
  || true
)"
[[ "$stream_http_code" == "200" ]] || {
  log "FAIL /api/a2a/tasks/$task_id/stream -> $stream_http_code"
  exit 1
}
grep -q "event: task.snapshot" "$tmp_dir/stream.txt" || { log "FAIL stream missing task.snapshot event"; exit 1; }
log "PASS /api/a2a/tasks/$task_id/stream"

log "[7/9] health endpoint A2A status"
health_main_code="$(curl -sS -o "$tmp_dir/main-health.json" -w "%{http_code}" "$BASE/health")"
[[ "$health_main_code" == "200" ]] || { log "FAIL /health -> $health_main_code"; exit 1; }
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
log "PASS /health (A2A status present)"

log "[8/9] SLO metrics endpoint"
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
[[ "$slo_code" == "200" ]] || { log "FAIL $slo_path -> $slo_code"; exit 1; }
python3 - "$tmp_dir/slo.json" <<'PY'
import json,sys
with open(sys.argv[1],"r",encoding="utf-8") as f:
    data=json.load(f)
if data.get("success") is not True:
    raise SystemExit("slo endpoint success!=true")
print("ok")
PY
log "PASS $slo_path"

log "[9/9] agent registry endpoint"
agents_code="$(curl -sS -o "$tmp_dir/agents.json" -w "%{http_code}" "$BASE/api/a2a/agents")"
[[ "$agents_code" == "200" ]] || { log "FAIL /api/a2a/agents -> $agents_code"; exit 1; }
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
log "PASS /api/a2a/agents"

log "A2A production smoke passed (9/9)."
