#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs/hetzner-closeout}"
LOG_FILE="$LOG_DIR/$RUN_ID.log"
mkdir -p "$LOG_DIR"

BILLING_ACTIONS_ENABLED_RAW="${BILLING_ACTIONS_ENABLED:-false}"
BILLING_ACTIONS_ENABLED="$(echo "$BILLING_ACTIONS_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
if [[ "$BILLING_ACTIONS_ENABLED" != "true" && "$BILLING_ACTIONS_ENABLED" != "false" ]]; then
  echo "Invalid BILLING_ACTIONS_ENABLED='$BILLING_ACTIONS_ENABLED_RAW' (expected true|false)." >&2
  exit 1
fi
GH_REVIEWER_LOGIN="${GH_REVIEWER_LOGIN:-caelum0x}"
CONTINUE_ON_ENV_GATE_FAIL="${CONTINUE_ON_ENV_GATE_FAIL:-false}"
CONTROL_PLANE="${CONTROL_PLANE:-ssh}"

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

echo "Hetzner production closeout started: $RUN_ID" | tee "$LOG_FILE"
echo "repo: $REPO_ROOT" | tee -a "$LOG_FILE"
echo "billing_mode: $BILLING_ACTIONS_ENABLED" | tee -a "$LOG_FILE"
echo "reviewer_login: $GH_REVIEWER_LOGIN" | tee -a "$LOG_FILE"
echo "continue_on_env_gate_fail: $CONTINUE_ON_ENV_GATE_FAIL" | tee -a "$LOG_FILE"
echo "control_plane: $CONTROL_PLANE" | tee -a "$LOG_FILE"

FAILURES=0

run_step "A0 production env gate" \
  pnpm -C "$REPO_ROOT" run check:prod-env-gate
ENV_GATE_RC=$?
((FAILURES+= ENV_GATE_RC))

if [[ "$ENV_GATE_RC" -ne 0 && "$CONTINUE_ON_ENV_GATE_FAIL" != "true" ]]; then
  echo "" | tee -a "$LOG_FILE"
  echo "Stopping after A0 production env gate failure." | tee -a "$LOG_FILE"
  echo "Set CONTINUE_ON_ENV_GATE_FAIL=true to continue downstream steps." | tee -a "$LOG_FILE"
  echo "Hetzner production closeout complete. Log: $LOG_FILE" | tee -a "$LOG_FILE"
  echo "overall: FAIL ($FAILURES failing step(s))" | tee -a "$LOG_FILE"
  exit 1
fi

run_step "A1 preflight" \
  bash "$REPO_ROOT/scripts/af-networked-preflight.sh"
((FAILURES+= $?))

run_step "A1 smoke:phase1" \
  env BILLING_ACTIONS_ENABLED="$BILLING_ACTIONS_ENABLED" pnpm -C "$REPO_ROOT" run smoke:phase1
((FAILURES+= $?))

if [[ "$CONTROL_PLANE" == "github" ]]; then
  run_step "A2 gh auth status" \
    gh auth status
  ((FAILURES+= $?))

  GH_USER_ID=""
  if GH_USER_ID="$(gh api "users/$GH_REVIEWER_LOGIN" --jq '.id' 2>/dev/null)"; then
    echo "github_reviewer: $GH_REVIEWER_LOGIN ($GH_USER_ID)" | tee -a "$LOG_FILE"
  else
    echo "github_reviewer: unresolved for $GH_REVIEWER_LOGIN" | tee -a "$LOG_FILE"
  fi

  if [[ -n "$GH_USER_ID" ]]; then
    run_step "A2 create/update production-promotion environment with owner reviewer" \
      gh api repos/caelum0x/recoder.xyz/environments/production-promotion \
        -X PUT \
        -f "reviewers[][type]=User" \
        -F "reviewers[][id]=$GH_USER_ID"
    ((FAILURES+= $?))
  else
    echo "" | tee -a "$LOG_FILE"
    echo "=== A2 create/update production-promotion environment with owner reviewer ===" | tee -a "$LOG_FILE"
    echo "status: FAIL (unable to resolve gh user id)" | tee -a "$LOG_FILE"
    ((FAILURES+=1))
  fi
else
  echo "" | tee -a "$LOG_FILE"
  echo "=== A2 github control-plane steps ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (CONTROL_PLANE=$CONTROL_PLANE)" | tee -a "$LOG_FILE"
fi

run_step "A3 pm migrate" \
  /bin/zsh -lc "set -a; source '$REPO_ROOT/recoder-pm/.env.docker'; set +a; pnpm -C '$REPO_ROOT/recoder-pm' migrate"
((FAILURES+= $?))

echo "" | tee -a "$LOG_FILE"
echo "Hetzner production closeout complete. Log: $LOG_FILE" | tee -a "$LOG_FILE"
if [[ "$FAILURES" -ne 0 ]]; then
  echo "overall: FAIL ($FAILURES failing step(s))" | tee -a "$LOG_FILE"
  exit 1
fi
echo "overall: PASS" | tee -a "$LOG_FILE"
