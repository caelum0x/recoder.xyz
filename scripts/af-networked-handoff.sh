#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AF_LOG_DIR="$REPO_ROOT/logs/af-networked"
HANDOFF_DIR="$AF_LOG_DIR/handoff"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%SZ)"
BILLING_MODE="${BILLING_ACTIONS_ENABLED:-false}"
RUN_STATUS="not_run"

mkdir -p "$AF_LOG_DIR" "$HANDOFF_DIR"

if [[ "$BILLING_MODE" != "true" && "$BILLING_MODE" != "false" ]]; then
  echo "BILLING_ACTIONS_ENABLED must be true or false (got '$BILLING_MODE')." >&2
  exit 1
fi

if [[ "${SKIP_AF_RUN:-false}" != "true" ]]; then
  echo "Running AF pipeline with BILLING_ACTIONS_ENABLED=$BILLING_MODE"
  if BILLING_ACTIONS_ENABLED="$BILLING_MODE" pnpm -C "$REPO_ROOT" run af:networked; then
    RUN_STATUS="pass"
  else
    RUN_STATUS="fail"
  fi
else
  echo "Skipping AF run (SKIP_AF_RUN=true); generating handoff from latest AF log."
  RUN_STATUS="skipped"
fi

LATEST_LOG="$(ls -1t "$AF_LOG_DIR"/*.log 2>/dev/null | head -n 1 || true)"
if [[ -z "$LATEST_LOG" ]]; then
  echo "No AF log found in $AF_LOG_DIR" >&2
  exit 1
fi

SUMMARY_MD="$HANDOFF_DIR/$TIMESTAMP-summary.md"
SUMMARY_JSON="$HANDOFF_DIR/$TIMESTAMP-summary.json"

map_blocker_id() {
  case "$1" in
    "AF preflight network+auth") echo "BLK-L0-01" ;;
    "A1 smoke:phase1") echo "BLK-L1-01" ;;
    "A2 gh auth status") echo "BLK-L2-01" ;;
    "A2 gh user") echo "BLK-L2-02" ;;
    "A2 create/update production-promotion environment") echo "BLK-L2-02" ;;
    "A3 pm migrate") echo "BLK-L3-01" ;;
    *) echo "BLK-UNMAPPED" ;;
  esac
}

map_owner() {
  case "$1" in
    "AF preflight network+auth") echo "A0" ;;
    "A1 smoke:phase1") echo "A1" ;;
    "A2 gh auth status") echo "A2" ;;
    "A2 gh user") echo "A2" ;;
    "A2 create/update production-promotion environment") echo "A2" ;;
    "A3 pm migrate") echo "A3" ;;
    *) echo "A0" ;;
  esac
}

FAIL_STEP_COUNT="$(awk '
  /^=== / { step=$0; sub(/^=== /, "", step); sub(/ ===$/, "", step); next }
  /^status: FAIL$/ { c++ }
  END { print c+0 }
' "$LATEST_LOG")"

OVERALL_LINE="$(grep -E '^overall:' "$LATEST_LOG" | tail -n 1 || true)"
if [[ -z "$OVERALL_LINE" ]]; then
  OVERALL_LINE="overall: UNKNOWN"
fi

{
  echo "{"
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"run_status\": \"$RUN_STATUS\","
  echo "  \"billing_mode\": \"$BILLING_MODE\","
  echo "  \"latest_log\": \"$LATEST_LOG\","
  echo "  \"overall\": \"${OVERALL_LINE#overall: }\","
  echo "  \"failing_steps\": ["
  awk '
    BEGIN { first=1 }
    /^=== / { step=$0; sub(/^=== /, "", step); sub(/ ===$/, "", step); next }
    /^status: FAIL$/ {
      if (!first) printf(",\n");
      gsub(/"/, "\\\"", step);
      printf("    \"%s\"", step);
      first=0;
    }
  ' "$LATEST_LOG"
  echo ""
  echo "  ]"
  echo "}"
} > "$SUMMARY_JSON"

{
  echo "# AF Networked Handoff Summary"
  echo ""
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- AF run status in this invocation: $RUN_STATUS"
  echo "- Billing mode: $BILLING_MODE"
  echo "- Source AF log: \`$LATEST_LOG\`"
  echo "- Overall: ${OVERALL_LINE#overall: }"
  echo ""
  echo "## Failing Steps"
  if [[ "$FAIL_STEP_COUNT" -eq 0 ]]; then
    echo "- None"
  else
    awk '
      /^=== / { step=$0; sub(/^=== /, "", step); sub(/ ===$/, "", step); next }
      /^status: FAIL$/ { print step }
    ' "$LATEST_LOG" | while IFS= read -r step; do
      blk="$(map_blocker_id "$step")"
      owner="$(map_owner "$step")"
      echo "- [$blk][$owner] $step"
    done
  fi
  echo ""
  echo "## Next Commands"
  echo "1. \`pnpm run af:preflight\`"
  echo "2. \`BILLING_ACTIONS_ENABLED=$BILLING_MODE pnpm run smoke:phase1\`"
  echo "3. \`gh auth login -h github.com\`"
  echo "4. \`gh api user\`"
  echo "5. \`gh api repos/caelum0x/recoder.xyz/environments/production-promotion -X PUT\`"
  echo "6. \`set -a; source recoder-pm/.env.docker; set +a; pnpm -C recoder-pm migrate\`"
  echo ""
  echo "## Artifacts"
  echo "- JSON: \`$SUMMARY_JSON\`"
  echo "- Markdown: \`$SUMMARY_MD\`"
} > "$SUMMARY_MD"

echo "Wrote handoff summary:"
echo "- $SUMMARY_MD"
echo "- $SUMMARY_JSON"

# Keep status docs in sync with latest AF handoff artifact.
bash "$REPO_ROOT/scripts/af-sync-status-docs.sh" "$SUMMARY_MD"

if [[ "$RUN_STATUS" == "fail" ]]; then
  exit 1
fi
