#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/logs/phase16-validation}"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
SUMMARY_JSON="$OUT_DIR/$RUN_ID-summary.json"
SUMMARY_MD="$OUT_DIR/$RUN_ID-summary.md"
mkdir -p "$OUT_DIR"

HETZNER_HOST="${HETZNER_HOST:-77.42.23.19}"
HETZNER_USER="${HETZNER_USER:-root}"
HETZNER_SSH_KEY="${HETZNER_SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_REPO_ROOT="${REMOTE_REPO_ROOT:-/root/recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
REMOTE_BACKEND_URL="${REMOTE_BACKEND_URL:-$BACKEND_URL}"
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

step_local_dns_probe() {
  local host
  host="${BACKEND_URL#https://}"
  host="${host#http://}"
  host="${host%%/*}"
  curl -sS --max-time 5 -o /dev/null "https://$host"
}

step_remote_repo_readiness() {
  ssh "${SSH_OPTS[@]}" "$HETZNER_USER@$HETZNER_HOST" \
    "cd '$REMOTE_REPO_ROOT' && test -f scripts/a2a-production-smoke.sh && echo ready"
}

step_remote_a2a_smoke() {
  ssh "${SSH_OPTS[@]}" "$HETZNER_USER@$HETZNER_HOST" \
    "cd '$REMOTE_REPO_ROOT' && BACKEND_URL='$REMOTE_BACKEND_URL' bash scripts/a2a-production-smoke.sh"
}

echo "Phase 16 production deployment validation started: $RUN_ID" | tee "$LOG_FILE"
echo "host: $HETZNER_USER@$HETZNER_HOST" | tee -a "$LOG_FILE"
echo "backend_url: $BACKEND_URL" | tee -a "$LOG_FILE"

run_step "P16.1 local DNS probe" "Detect whether local runner can resolve production backend host" step_local_dns_probe
run_step "P16.2 remote repo readiness" "Verify remote deployment repository + smoke script availability" step_remote_repo_readiness
run_step "P16.3 remote A2A production smoke" "Run smoke against deployed A2A endpoint from Hetzner host" step_remote_a2a_smoke

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
    comma=","
    if [[ "$i" -eq "$((${#STEP_TITLES[@]} - 1))" ]]; then
      comma=""
    fi
    echo "    { \"title\": \"${STEP_TITLES[$i]}\", \"status\": \"${STEP_STATUS[$i]}\", \"note\": \"${STEP_NOTES[$i]}\" }$comma"
  done
  echo "  ]"
  echo "}"
} > "$SUMMARY_JSON"

{
  echo "# Phase 16 Production Deployment Validation"
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
