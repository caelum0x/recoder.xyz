#!/usr/bin/env bash
set -euo pipefail

# Post-rotation verification for production runtime.
# - Does NOT print secret values.
# - Verifies service/monitoring health and key-presence categories.
#
# Usage:
#   bash scripts/post-rotation-verify.sh
#   RUN_ALERT_TEST_FIRE=true bash scripts/post-rotation-verify.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/logs/post-rotation-verify}"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
SUMMARY_MD="$OUT_DIR/$RUN_ID-summary.md"
SUMMARY_JSON="$OUT_DIR/$RUN_ID-summary.json"
STEP_DATA_FILE="$OUT_DIR/$RUN_ID-steps.tsv"

REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_DIR="${REMOTE_DIR:-/root/recoder.xyz}"
RUN_ALERT_TEST_FIRE="${RUN_ALERT_TEST_FIRE:-false}"

mkdir -p "$OUT_DIR"
rm -f "$STEP_DATA_FILE"

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

STEP_TITLES=()
STEP_STATUS=()
STEP_LOGS=()

ssh_remote() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_HOST" "$@"
}

record_step() {
  STEP_TITLES+=("$1")
  STEP_STATUS+=("$2")
  STEP_LOGS+=("$3")
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$STEP_DATA_FILE"
}

run_step() {
  local title="$1"
  shift
  ((TOTAL+=1))
  echo "" | tee -a "$LOG_FILE"
  echo "=== $title ===" | tee -a "$LOG_FILE"
  if "$@" 2>&1 | tee -a "$LOG_FILE"; then
    ((PASSED+=1))
    record_step "$title" "PASS" "$LOG_FILE"
    echo "status: PASS" | tee -a "$LOG_FILE"
  else
    ((FAILED+=1))
    record_step "$title" "FAIL" "$LOG_FILE"
    echo "status: FAIL" | tee -a "$LOG_FILE"
  fi
}

skip_step() {
  local title="$1"
  ((TOTAL+=1))
  ((SKIPPED+=1))
  record_step "$title" "SKIP" "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "=== $title ===" | tee -a "$LOG_FILE"
  echo "status: SKIP" | tee -a "$LOG_FILE"
}

check_key_group() {
  local audit_file="$1"
  local label="$2"
  local regex="$3"
  if grep -Eq "$regex" "$audit_file"; then
    echo "PASS key-group: ${label}"
    return 0
  fi
  echo "FAIL key-group missing: ${label}" >&2
  return 1
}

echo "== Post-rotation verification ==" | tee "$LOG_FILE"
echo "target: ${REMOTE_HOST}" | tee -a "$LOG_FILE"
echo "run_id: ${RUN_ID}" | tee -a "$LOG_FILE"

run_step "1/5 Service status snapshot" \
  ssh_remote "cd '${REMOTE_DIR}' && docker compose -f docker-compose.deploy.yml ps"

run_step "2/5 Core HTTP health checks" \
  ssh_remote '
    set -euo pipefail
    app=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/ || true)
    frontend=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3001/ || true)
    web=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:5173/ || true)
    backend=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3100/health || true)
    web_present=$(docker inspect recoder-web >/dev/null 2>&1 && echo yes || echo no)

    echo "app=${app}"
    echo "frontend=${frontend}"
    echo "web=${web}"
    echo "web_present=${web_present}"
    echo "backend=${backend}"

    test "${app}" = "200"
    test "${frontend}" = "200"
    if [[ "${web_present}" == "yes" ]]; then
      case "${web}" in
        200|301|302|307|308) ;;
        *) echo "FAIL: recoder-web expected 2xx/3xx, got ${web}"; exit 1 ;;
      esac
    else
      echo "INFO: recoder-web container absent; skipping retired surface HTTP check"
    fi
    test "${backend}" = "200"
  '

run_step "3/5 Monitoring stack verification" \
  bash "$REPO_ROOT/scripts/verify-monitoring-stack.sh" remote

run_step "4/5 Sensitive key presence audit (no values)" \
  bash -lc "
    set -euo pipefail
    audit_file='$OUT_DIR/$RUN_ID-audit.txt'
    bash '$REPO_ROOT/scripts/credential-rotation-audit.sh' remote | tee \"\$audit_file\"
    grep -Eq '^=== recoder-app ===' \"\$audit_file\"
    grep -Eq '^=== recoder-docker-backend ===' \"\$audit_file\"
    grep -Eq '^=== recoder-redis ===' \"\$audit_file\"
    $(typeset -f check_key_group)
    check_key_group \"\$audit_file\" 'database' '(DATABASE_URL|AUTH_DATABASE_URL)=SET'
    check_key_group \"\$audit_file\" 'redis' '(REDIS_URL|REDIS_PASSWORD)=SET'
    check_key_group \"\$audit_file\" 'auth/session' '(BETTER_AUTH_SECRET|NEXTAUTH_SECRET|SESSION_SYNC_SECRET)=SET'
    check_key_group \"\$audit_file\" 'internal-service' 'INTERNAL_SERVICE_KEY=SET'
    check_key_group \"\$audit_file\" 'ai-provider' '(OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY|GOOGLE_API_KEY|GROQ_API_KEY)=SET'
    check_key_group \"\$audit_file\" 'a2a/gateway' '(RECODER_A2A_SHARED_SECRET|RECODER_A2A_WORKER_TOKEN)=SET'
  "

if [[ "${RUN_ALERT_TEST_FIRE}" == "true" ]]; then
  run_step "5/5 Monitoring test-fire" \
    ssh_remote "cd '${REMOTE_DIR}' && bash scripts/monitoring-test-fire.sh"
else
  skip_step "5/5 Monitoring test-fire (set RUN_ALERT_TEST_FIRE=true to enable)"
fi

{
  echo "# Post-Rotation Verification Summary"
  echo
  echo "- Run ID: \`$RUN_ID\`"
  echo "- Target: \`$REMOTE_HOST\`"
  echo "- Log: \`$LOG_FILE\`"
  echo
  echo "| Step | Status |"
  echo "|---|---|"
  for i in "${!STEP_TITLES[@]}"; do
    printf "| %s | %s |\n" "${STEP_TITLES[$i]}" "${STEP_STATUS[$i]}"
  done
  echo
  echo "- Totals: PASS=$PASSED FAIL=$FAILED SKIP=$SKIPPED TOTAL=$TOTAL"
} > "$SUMMARY_MD"

RUN_ID="$RUN_ID" \
REMOTE_HOST="$REMOTE_HOST" \
TOTAL="$TOTAL" \
PASSED="$PASSED" \
FAILED="$FAILED" \
SKIPPED="$SKIPPED" \
STEP_DATA_FILE="$STEP_DATA_FILE" \
python3 - <<'PY' > "$SUMMARY_JSON"
import json
import os

steps = []
step_data_file = os.environ["STEP_DATA_FILE"]

if os.path.exists(step_data_file):
    with open(step_data_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                steps.append({"step": parts[0], "status": parts[1]})

print(json.dumps({
  "run_id": os.environ["RUN_ID"],
  "target": os.environ["REMOTE_HOST"],
  "totals": {
    "total": int(os.environ["TOTAL"]),
    "passed": int(os.environ["PASSED"]),
    "failed": int(os.environ["FAILED"]),
    "skipped": int(os.environ["SKIPPED"])
  },
  "steps": steps
}, indent=2))
PY

echo "" | tee -a "$LOG_FILE"
echo "summary_md: $SUMMARY_MD" | tee -a "$LOG_FILE"
echo "summary_json: $SUMMARY_JSON" | tee -a "$LOG_FILE"

if [[ "$FAILED" -gt 0 ]]; then
  echo "FAIL: post-rotation verification completed with $FAILED failing step(s)" | tee -a "$LOG_FILE"
  exit 1
fi

echo "PASS: post-rotation verification completed" | tee -a "$LOG_FILE"
