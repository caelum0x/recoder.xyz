#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs/af-networked}"
LOG_FILE="$LOG_DIR/$RUN_ID.log"

mkdir -p "$LOG_DIR"

BILLING_ACTIONS_ENABLED_RAW="${BILLING_ACTIONS_ENABLED:-}"
if [[ -z "$BILLING_ACTIONS_ENABLED_RAW" ]]; then
  echo "BILLING_ACTIONS_ENABLED must be set to true or false." >&2
  exit 1
fi

BILLING_ACTIONS_ENABLED="$(echo "$BILLING_ACTIONS_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
if [[ "$BILLING_ACTIONS_ENABLED" != "true" && "$BILLING_ACTIONS_ENABLED" != "false" ]]; then
  echo "Invalid BILLING_ACTIONS_ENABLED='$BILLING_ACTIONS_ENABLED_RAW' (expected true|false)." >&2
  exit 1
fi

run_step() {
  local title="$1"
  shift
  echo ""
  echo "=== $title ===" | tee -a "$LOG_FILE"
  if {
    "$@"
  } 2>&1 | tee -a "$LOG_FILE"; then
    echo "status: PASS" | tee -a "$LOG_FILE"
    return 0
  fi
  echo "status: FAIL" | tee -a "$LOG_FILE"
  return 1
}

echo "AF networked runner started: $RUN_ID" | tee "$LOG_FILE"
echo "repo: $REPO_ROOT" | tee -a "$LOG_FILE"
echo "billing_mode: $BILLING_ACTIONS_ENABLED" | tee -a "$LOG_FILE"

FAILURES=0

run_step "AF preflight network+auth" \
  bash "$REPO_ROOT/scripts/af-networked-preflight.sh"
((FAILURES+= $?))

run_step "A1 smoke:phase1" \
  env BILLING_ACTIONS_ENABLED="$BILLING_ACTIONS_ENABLED" pnpm -C "$REPO_ROOT" run smoke:phase1
((FAILURES+= $?))

run_step "A2 gh auth status" \
  gh auth status
((FAILURES+= $?))

run_step "A2 gh user" \
  gh api user --jq '.id,.login'
((FAILURES+= $?))

run_step "A2 create/update production-promotion environment" \
  gh api repos/caelum0x/recoder.xyz/environments/production-promotion -X PUT
((FAILURES+= $?))

run_step "A3 pm migrate" \
  /bin/zsh -lc "set -a; source '$REPO_ROOT/recoder-pm/.env.docker'; set +a; pnpm -C '$REPO_ROOT/recoder-pm' migrate"
((FAILURES+= $?))

echo ""
echo "AF networked runner complete. Log: $LOG_FILE" | tee -a "$LOG_FILE"
if [[ "$FAILURES" -ne 0 ]]; then
  echo "overall: FAIL ($FAILURES failing step(s))" | tee -a "$LOG_FILE"
  exit 1
fi
echo "overall: PASS" | tee -a "$LOG_FILE"
