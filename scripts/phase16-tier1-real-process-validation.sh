#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/logs/phase16-tier1-real-process}"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
SUMMARY_JSON="$OUT_DIR/$RUN_ID-summary.json"
SUMMARY_MD="$OUT_DIR/$RUN_ID-summary.md"
mkdir -p "$OUT_DIR"

HETZNER_HOST="${HETZNER_HOST:-77.42.23.19}"
HETZNER_USER="${HETZNER_USER:-root}"
HETZNER_SSH_KEY="${HETZNER_SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"

SSH_TIMEOUT_SECONDS="${SSH_TIMEOUT_SECONDS:-12}"
SSH_OPTS=(
  -i "$HETZNER_SSH_KEY"
  -o StrictHostKeyChecking=no
  -o BatchMode=yes
  -o ConnectTimeout="$SSH_TIMEOUT_SECONDS"
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)

TOTAL=0
PASSED=0
FAILED=0
STEP_TITLES=()
STEP_STATUS=()
STEP_NOTES=()

run_step() {
  local title="$1"
  local note="$2"
  local fn="$3"

  ((TOTAL+=1))
  echo "" | tee -a "$LOG_FILE"
  echo "=== $title ===" | tee -a "$LOG_FILE"

  if "$fn" 2>&1 | tee -a "$LOG_FILE"; then
    ((PASSED+=1))
    STEP_TITLES+=("$title")
    STEP_STATUS+=("PASS")
    STEP_NOTES+=("$note")
    echo "status: PASS" | tee -a "$LOG_FILE"
    return 0
  fi

  ((FAILED+=1))
  STEP_TITLES+=("$title")
  STEP_STATUS+=("FAIL")
  STEP_NOTES+=("$note")
  echo "status: FAIL" | tee -a "$LOG_FILE"
  return 1
}

remote() {
  ssh "${SSH_OPTS[@]}" "$HETZNER_USER@$HETZNER_HOST" "$@"
}

step_remote_basic_access() {
  remote "hostname && date"
}

step_connector_env_flags() {
  local values
  values="$(remote "docker exec recoder-docker-backend sh -lc 'echo \${RECODER_A2A_ENABLE_CODEX:-unset},\${RECODER_A2A_ENABLE_CLAUDE_CODE:-unset}'")"
  echo "flags=$values"
  local codex_flag="${values%%,*}"
  local claude_flag="${values##*,}"
  [[ "$codex_flag" == "true" && "$claude_flag" == "true" ]]
}

step_connector_binaries_present() {
  remote "docker exec recoder-docker-backend sh -lc 'command -v codex >/dev/null && command -v claude >/dev/null'"
}

step_connector_status_endpoints() {
  remote "curl -sS -X POST '$BACKEND_URL/api/a2a/connectors/codex/start' >/tmp/phase16-codex-start.json"
  remote "curl -sS -X POST '$BACKEND_URL/api/a2a/connectors/claude/start' >/tmp/phase16-claude-start.json"
  remote "curl -sS '$BACKEND_URL/api/a2a/connectors/codex/status' > /tmp/phase16-codex-status.json"
  remote "curl -sS '$BACKEND_URL/api/a2a/connectors/claude/status' > /tmp/phase16-claude-status.json"
  remote "python3 - <<'PY'
import json
for start_file in ('/tmp/phase16-codex-start.json', '/tmp/phase16-claude-start.json'):
    with open(start_file, 'r', encoding='utf-8') as f:
        start_payload = json.load(f)
    if start_payload.get('success') is not True:
        raise SystemExit(f'connector start failed for {start_file}: {start_payload}')
for status_file in ('/tmp/phase16-codex-status.json', '/tmp/phase16-claude-status.json'):
    with open(status_file, 'r', encoding='utf-8') as f:
        status_payload = json.load(f)
    if status_payload.get('success') is not True:
        raise SystemExit(f'connector status failed for {status_file}: {status_payload}')
print('codex/claude connector status endpoints reachable')
PY"
}

step_tier1_http_smoke() {
  # Run on Hetzner with the deployed shared secret to avoid local env drift.
  remote "cd /root/recoder.xyz && \
    RECODER_A2A_SHARED_SECRET=\$(docker exec recoder-docker-backend sh -lc 'printf \"%s\" \"\$RECODER_A2A_SHARED_SECRET\"') \
    RECODER_A2A_SMOKE_ENDPOINT='$BACKEND_URL/api/a2a/envelope' \
    pnpm run a2a:smoke:codex-claude"
}

echo "Phase 16 Tier-1 real-process validation started: $RUN_ID" | tee "$LOG_FILE"
echo "host: $HETZNER_USER@$HETZNER_HOST" | tee -a "$LOG_FILE"
echo "backend_url: $BACKEND_URL" | tee -a "$LOG_FILE"

run_step "P16-T1.1 remote access" "SSH/control-plane reachability" step_remote_basic_access
run_step "P16-T1.2 connector enable flags" "RECODER_A2A_ENABLE_CODEX and RECODER_A2A_ENABLE_CLAUDE_CODE must be true" step_connector_env_flags
run_step "P16-T1.3 connector binaries available" "codex and claude binaries must exist in docker-backend runtime" step_connector_binaries_present
run_step "P16-T1.4 connector status endpoints" "codex + claude status endpoints must be reachable after start attempt" step_connector_status_endpoints
run_step "P16-T1.5 Tier-1 HTTP smoke" "signed envelope smoke for codex<->claude path" step_tier1_http_smoke

OVERALL_STATUS="PASS"
if [[ "$FAILED" -ne 0 ]]; then
  OVERALL_STATUS="FAIL"
fi

{
  echo "{"
  echo "  \"run_id\": \"$RUN_ID\"," 
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," 
  echo "  \"overall_status\": \"$OVERALL_STATUS\"," 
  echo "  \"host\": \"$HETZNER_USER@$HETZNER_HOST\"," 
  echo "  \"backend_url\": \"$BACKEND_URL\"," 
  echo "  \"totals\": { \"total\": $TOTAL, \"passed\": $PASSED, \"failed\": $FAILED },"
  echo "  \"steps\": ["
  for i in "${!STEP_TITLES[@]}"; do
    comma=","; if [[ "$i" -eq "$((${#STEP_TITLES[@]} - 1))" ]]; then comma=""; fi
    echo "    { \"title\": \"${STEP_TITLES[$i]}\", \"status\": \"${STEP_STATUS[$i]}\", \"note\": \"${STEP_NOTES[$i]}\" }$comma"
  done
  echo "  ]"
  echo "}"
} > "$SUMMARY_JSON"

{
  echo "# Phase 16 Tier-1 Real-Process Validation"
  echo ""
  echo "- Run ID: \`$RUN_ID\`"
  echo "- Host: \`$HETZNER_USER@$HETZNER_HOST\`"
  echo "- Backend URL: \`$BACKEND_URL\`"
  echo "- Overall: **$OVERALL_STATUS**"
  echo ""
  echo "| Step | Status | Note |"
  echo "|---|---|---|"
  for i in "${!STEP_TITLES[@]}"; do
    echo "| ${STEP_TITLES[$i]} | ${STEP_STATUS[$i]} | ${STEP_NOTES[$i]} |"
  done
  echo ""
  echo "- Log: \`$LOG_FILE\`"
  echo "- Summary JSON: \`$SUMMARY_JSON\`"
} > "$SUMMARY_MD"

echo "" | tee -a "$LOG_FILE"
echo "Summary JSON: $SUMMARY_JSON" | tee -a "$LOG_FILE"
echo "Summary MD: $SUMMARY_MD" | tee -a "$LOG_FILE"
echo "Overall: $OVERALL_STATUS" | tee -a "$LOG_FILE"

if [[ "$OVERALL_STATUS" != "PASS" ]]; then
  exit 1
fi
