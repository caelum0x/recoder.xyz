#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/logs/phase3-gates}"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
SUMMARY_MD="$OUT_DIR/$RUN_ID-summary.md"
SUMMARY_JSON="$OUT_DIR/$RUN_ID-summary.json"
SCORECARD_MD="$OUT_DIR/$RUN_ID-scorecard.md"
SCORECARD_JSON="$OUT_DIR/$RUN_ID-scorecard.json"
mkdir -p "$OUT_DIR"

PHASE3_MODE="${PHASE3_MODE:-production}"
DRY_RUN="${DRY_RUN:-false}"
CONTINUE_ON_FAIL="${CONTINUE_ON_FAIL:-true}"
BILLING_ACTIONS_ENABLED="${BILLING_ACTIONS_ENABLED:-false}"
RECODER_WEB_URL="${RECODER_WEB_URL:-https://web.recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
BASE_URL="${BASE_URL:-https://recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"
ENABLE_A2A_INTEROP_SMOKE="${ENABLE_A2A_INTEROP_SMOKE:-false}"
A2A_WORKER_STATUS_CHECK="${A2A_WORKER_STATUS_CHECK:-true}"
SKIP_ENV_GATES="${SKIP_ENV_GATES:-false}"
SKIP_TYPECHECK_GATES="${SKIP_TYPECHECK_GATES:-false}"

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

STEP_TITLES=()
STEP_STATUS=()
STEP_REQUIRED=()
STEP_LOGS=()

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true|false)
      echo "$(echo "$1" | tr '[:upper:]' '[:lower:]')"
      ;;
    *)
      echo "invalid"
      ;;
  esac
}

record_step() {
  local title="$1"
  local status="$2"
  local required="$3"
  local log_ref="$4"
  STEP_TITLES+=("$title")
  STEP_STATUS+=("$status")
  STEP_REQUIRED+=("$required")
  STEP_LOGS+=("$log_ref")
}

run_step() {
  local title="$1"
  local required="$2"
  local network_class="$3"
  shift 3

  ((TOTAL+=1))

  echo "" | tee -a "$LOG_FILE"
  echo "=== $title ===" | tee -a "$LOG_FILE"

  if [[ "$DRY_RUN" == "true" && "$network_class" == "network" ]]; then
    echo "status: SKIP (DRY_RUN=true for network step)" | tee -a "$LOG_FILE"
    ((SKIPPED+=1))
    record_step "$title" "SKIP" "$required" "$LOG_FILE"
    return 0
  fi

  if {
    "$@"
  } 2>&1 | tee -a "$LOG_FILE"; then
    echo "status: PASS" | tee -a "$LOG_FILE"
    ((PASSED+=1))
    record_step "$title" "PASS" "$required" "$LOG_FILE"
    return 0
  fi

  echo "status: FAIL" | tee -a "$LOG_FILE"
  ((FAILED+=1))
  record_step "$title" "FAIL" "$required" "$LOG_FILE"

  if [[ "$required" == "required" && "$CONTINUE_ON_FAIL" != "true" ]]; then
    echo "Halting on required step failure (CONTINUE_ON_FAIL=false)." | tee -a "$LOG_FILE"
    return 2
  fi

  return 1
}

PHASE3_MODE="$(echo "$PHASE3_MODE" | tr '[:upper:]' '[:lower:]')"
if [[ "$PHASE3_MODE" != "production" && "$PHASE3_MODE" != "local-dev" ]]; then
  echo "Invalid PHASE3_MODE='$PHASE3_MODE' (expected production|local-dev)" >&2
  exit 1
fi

DRY_RUN="$(normalize_bool "$DRY_RUN")"
CONTINUE_ON_FAIL="$(normalize_bool "$CONTINUE_ON_FAIL")"
ENABLE_A2A_INTEROP_SMOKE="$(normalize_bool "$ENABLE_A2A_INTEROP_SMOKE")"
A2A_WORKER_STATUS_CHECK="$(normalize_bool "$A2A_WORKER_STATUS_CHECK")"
SKIP_ENV_GATES="$(normalize_bool "$SKIP_ENV_GATES")"
SKIP_TYPECHECK_GATES="$(normalize_bool "$SKIP_TYPECHECK_GATES")"

if [[ "$DRY_RUN" == "invalid" || "$CONTINUE_ON_FAIL" == "invalid" || "$ENABLE_A2A_INTEROP_SMOKE" == "invalid" || "$A2A_WORKER_STATUS_CHECK" == "invalid" || "$SKIP_ENV_GATES" == "invalid" || "$SKIP_TYPECHECK_GATES" == "invalid" ]]; then
  echo "One or more boolean env vars are invalid (expected true|false)." >&2
  exit 1
fi

echo "Phase 3 production gates run started: $RUN_ID" | tee "$LOG_FILE"
echo "repo: $REPO_ROOT" | tee -a "$LOG_FILE"
echo "mode: $PHASE3_MODE" | tee -a "$LOG_FILE"
echo "dry_run: $DRY_RUN" | tee -a "$LOG_FILE"
echo "continue_on_fail: $CONTINUE_ON_FAIL" | tee -a "$LOG_FILE"
echo "skip_env_gates: $SKIP_ENV_GATES" | tee -a "$LOG_FILE"
echo "skip_typecheck_gates: $SKIP_TYPECHECK_GATES" | tee -a "$LOG_FILE"

RUNBOOK_FILES=(
  "$REPO_ROOT/PRODUCTION_RUNBOOK.md"
  "$REPO_ROOT/docs/PHASE3_PRODUCTION_HARDENING_PACK.md"
  "$REPO_ROOT/docs/SMOKE_COMMAND_INDEX.md"
)

run_step "P3.0 required artifacts present" required local /bin/zsh -lc '
  set -euo pipefail
  req=(
    scripts/a5-release-evidence.sh
    scripts/check-ecosystem-readiness.sh
    scripts/check-production-env-gate.sh
    scripts/phase1-main-branch-smoke.sh
    app/scripts/smoke-static-assets.sh
    docker-backend/scripts/smoke-public-queue.sh
    docs/PHASE3_PRODUCTION_HARDENING_PACK.md
    docs/SMOKE_COMMAND_INDEX.md
    PRODUCTION_RUNBOOK.md
  )
  for f in "${req[@]}"; do
    [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
  done
  echo "artifact set is complete"
' || [[ $? -eq 2 ]] && true

if [[ "$SKIP_ENV_GATES" == "true" ]]; then
  ((TOTAL+=1))
  ((SKIPPED+=1))
  record_step "P3.1 ecosystem readiness gate" "SKIP" "optional" "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "=== P3.1 ecosystem readiness gate ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (SKIP_ENV_GATES=true)" | tee -a "$LOG_FILE"

  ((TOTAL+=1))
  ((SKIPPED+=1))
  record_step "P3.2 production env gate" "SKIP" "optional" "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "=== P3.2 production env gate ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (SKIP_ENV_GATES=true)" | tee -a "$LOG_FILE"
else
  run_step "P3.1 ecosystem readiness gate" required local pnpm -C "$REPO_ROOT" run check:ecosystem || [[ $? -eq 2 ]] && true
  if [[ "$PHASE3_MODE" == "production" ]]; then
    run_step "P3.2 production env gate" required local pnpm -C "$REPO_ROOT" run check:prod-env-gate || [[ $? -eq 2 ]] && true
  else
    run_step "P3.2 production env gate (local-dev advisory)" optional local pnpm -C "$REPO_ROOT" run check:prod-env-gate || true
  fi
fi

if [[ "$SKIP_ENV_GATES" == "true" ]]; then
  run_step "P3.3 release evidence baseline" required local env A5_SKIP_ENV_GATES=true A5_SKIP_TYPECHECK_GATES="$SKIP_TYPECHECK_GATES" pnpm -C "$REPO_ROOT" run release:evidence || [[ $? -eq 2 ]] && true
else
  run_step "P3.3 release evidence baseline" required local env A5_SKIP_TYPECHECK_GATES="$SKIP_TYPECHECK_GATES" pnpm -C "$REPO_ROOT" run release:evidence || [[ $? -eq 2 ]] && true
fi

if [[ "$PHASE3_MODE" == "production" ]]; then
  run_step "P3.4 phase1 smoke gate" required network env BILLING_ACTIONS_ENABLED="$BILLING_ACTIONS_ENABLED" RECODER_WEB_URL="$RECODER_WEB_URL" BACKEND_URL="$BACKEND_URL" EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" pnpm -C "$REPO_ROOT" run smoke:phase1 || [[ $? -eq 2 ]] && true
  run_step "P3.5 docker backend queue smoke" required network env BACKEND_URL="$BACKEND_URL" EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" pnpm -C "$REPO_ROOT/docker-backend" run smoke:queue || [[ $? -eq 2 ]] && true
  run_step "P3.6 static asset smoke" required network env BASE_URL="$BASE_URL" pnpm -C "$REPO_ROOT/app" run smoke:static || [[ $? -eq 2 ]] && true
else
  run_step "P3.4 phase1 smoke gate (local-dev advisory)" optional network env BILLING_ACTIONS_ENABLED="$BILLING_ACTIONS_ENABLED" RECODER_WEB_URL="$RECODER_WEB_URL" BACKEND_URL="$BACKEND_URL" EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" pnpm -C "$REPO_ROOT" run smoke:phase1 || true
  run_step "P3.5 docker backend queue smoke (local-dev advisory)" optional network env BACKEND_URL="$BACKEND_URL" EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" pnpm -C "$REPO_ROOT/docker-backend" run smoke:queue || true
  run_step "P3.6 static asset smoke (local-dev advisory)" optional network env BASE_URL="$BASE_URL" pnpm -C "$REPO_ROOT/app" run smoke:static || true
fi

if [[ "$ENABLE_A2A_INTEROP_SMOKE" == "true" ]]; then
  if [[ "$PHASE3_MODE" == "production" ]]; then
    run_step "P3.7 A2A Codex<->Claude interop smoke" required network pnpm -C "$REPO_ROOT" run a2a:smoke:codex-claude || [[ $? -eq 2 ]] && true
  else
    run_step "P3.7 A2A Codex<->Claude interop smoke (local-dev advisory)" optional network pnpm -C "$REPO_ROOT" run a2a:smoke:codex-claude || true
  fi
else
  ((TOTAL+=1))
  ((SKIPPED+=1))
  record_step "P3.7 A2A Codex<->Claude interop smoke" "SKIP" "optional" "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "=== P3.7 A2A Codex<->Claude interop smoke ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (ENABLE_A2A_INTEROP_SMOKE=false)" | tee -a "$LOG_FILE"
fi

if [[ "$A2A_WORKER_STATUS_CHECK" == "true" ]]; then
  if [[ -n "${RECODER_A2A_REDIS_URL:-${REDIS_URL:-}}" ]]; then
    run_step "P3.8 A2A worker status snapshot" optional local bash "$REPO_ROOT/scripts/a2a-workers-hetzner.sh" status || true
  else
    ((TOTAL+=1))
    ((SKIPPED+=1))
    record_step "P3.8 A2A worker status snapshot" "SKIP" "optional" "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    echo "=== P3.8 A2A worker status snapshot ===" | tee -a "$LOG_FILE"
    echo "status: SKIP (RECODER_A2A_REDIS_URL/REDIS_URL not set)" | tee -a "$LOG_FILE"
  fi
else
  ((TOTAL+=1))
  ((SKIPPED+=1))
  record_step "P3.8 A2A worker status snapshot" "SKIP" "optional" "$LOG_FILE"
fi

RUNBOOK_MISSING=0
for rf in "${RUNBOOK_FILES[@]}"; do
  if [[ ! -f "$rf" ]]; then
    RUNBOOK_MISSING=1
  fi
done

REQUIRED_FAILS=0
for i in "${!STEP_TITLES[@]}"; do
  if [[ "${STEP_REQUIRED[$i]}" == "required" && "${STEP_STATUS[$i]}" == "FAIL" ]]; then
    ((REQUIRED_FAILS+=1))
  fi
done

OVERALL="PASS"
if [[ "$REQUIRED_FAILS" -gt 0 || "$RUNBOOK_MISSING" -gt 0 ]]; then
  OVERALL="FAIL"
fi

BLOCKERS=()
WARNINGS=()
for i in "${!STEP_TITLES[@]}"; do
  title="${STEP_TITLES[$i]}"
  status="${STEP_STATUS[$i]}"
  required="${STEP_REQUIRED[$i]}"
  if [[ "$status" == "FAIL" && "$required" == "required" ]]; then
    BLOCKERS+=("$title")
    continue
  fi
  if [[ "$status" == "FAIL" && "$required" != "required" ]]; then
    WARNINGS+=("$title")
    continue
  fi
  if [[ "$status" == "SKIP" ]]; then
    WARNINGS+=("$title (skipped)")
  fi
done

if [[ "$RUNBOOK_MISSING" -gt 0 ]]; then
  BLOCKERS+=("Runbook references missing")
fi

GA_READY="false"
if [[ "$OVERALL" == "PASS" && "$PHASE3_MODE" == "production" && "$DRY_RUN" == "false" ]]; then
  GA_READY="true"
fi

step_status_by_prefix() {
  local prefix="$1"
  for i in "${!STEP_TITLES[@]}"; do
    if [[ "${STEP_TITLES[$i]}" == "$prefix"* ]]; then
      echo "${STEP_STATUS[$i]}"
      return 0
    fi
  done
  echo "UNKNOWN"
}

RELEASE_EVIDENCE_STATUS="$(step_status_by_prefix "P3.3")"
SMOKE_PHASE1_STATUS="$(step_status_by_prefix "P3.4")"
SMOKE_QUEUE_STATUS="$(step_status_by_prefix "P3.5")"
SMOKE_STATIC_STATUS="$(step_status_by_prefix "P3.6")"
A2A_INTEROP_STATUS="$(step_status_by_prefix "P3.7")"
A2A_WORKER_STATUS="$(step_status_by_prefix "P3.8")"

{
  echo "{"
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"," 
  echo "  \"run_id\": \"$RUN_ID\"," 
  echo "  \"mode\": \"$PHASE3_MODE\"," 
  echo "  \"dry_run\": $DRY_RUN,"
  echo "  \"overall\": \"$OVERALL\"," 
  echo "  \"ga_ready\": $GA_READY,"
  echo "  \"counts\": {"
  echo "    \"total\": $TOTAL,"
  echo "    \"passed\": $PASSED,"
  echo "    \"failed\": $FAILED,"
  echo "    \"skipped\": $SKIPPED,"
  echo "    \"required_failed\": $REQUIRED_FAILS"
  echo "  },"
  echo "  \"log_file\": \"$LOG_FILE\"," 
  echo "  \"runbooks\": ["
  for i in "${!RUNBOOK_FILES[@]}"; do
    comma=","
    if [[ "$i" -eq $((${#RUNBOOK_FILES[@]} - 1)) ]]; then
      comma=""
    fi
    path="${RUNBOOK_FILES[$i]}"
    echo "    \"$path\"$comma"
  done
  echo "  ],"
  echo "  \"steps\": ["
  for i in "${!STEP_TITLES[@]}"; do
    comma=","
    if [[ "$i" -eq $((${#STEP_TITLES[@]} - 1)) ]]; then
      comma=""
    fi
    title="${STEP_TITLES[$i]//\"/\\\"}"
    echo "    { \"title\": \"$title\", \"status\": \"${STEP_STATUS[$i]}\", \"required\": \"${STEP_REQUIRED[$i]}\", \"log\": \"${STEP_LOGS[$i]}\" }$comma"
  done
  echo "  ],"
  echo "  \"scorecard\": {"
  echo "    \"blockers\": ["
  for i in "${!BLOCKERS[@]}"; do
    comma=","
    if [[ "$i" -eq $((${#BLOCKERS[@]} - 1)) ]]; then
      comma=""
    fi
    blocker="${BLOCKERS[$i]//\"/\\\"}"
    echo "      \"$blocker\"$comma"
  done
  echo "    ],"
  echo "    \"warnings\": ["
  for i in "${!WARNINGS[@]}"; do
    comma=","
    if [[ "$i" -eq $((${#WARNINGS[@]} - 1)) ]]; then
      comma=""
    fi
    warning="${WARNINGS[$i]//\"/\\\"}"
    echo "      \"$warning\"$comma"
  done
  echo "    ]"
  echo "  }"
  echo "}"
} > "$SUMMARY_JSON"

{
  echo "# Phase 3 Production Gates Summary"
  echo ""
  echo "- Run ID: $RUN_ID"
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Mode: $PHASE3_MODE"
  echo "- Dry run: $DRY_RUN"
  echo "- Overall: $OVERALL"
  echo "- Log: \`$LOG_FILE\`"
  echo "- JSON: \`$SUMMARY_JSON\`"
  echo ""
  echo "## Step Results"
  for i in "${!STEP_TITLES[@]}"; do
    echo "- [${STEP_STATUS[$i]}] (${STEP_REQUIRED[$i]}) ${STEP_TITLES[$i]}"
  done
  echo ""
  echo "## Runbook References"
  for rf in "${RUNBOOK_FILES[@]}"; do
    echo "- \`$rf\`"
  done
} > "$SUMMARY_MD"

{
  echo "{"
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"run_id\": \"$RUN_ID\","
  echo "  \"mode\": \"$PHASE3_MODE\","
  echo "  \"dry_run\": $DRY_RUN,"
  echo "  \"overall\": \"$OVERALL\","
  echo "  \"ga_ready\": $GA_READY,"
  echo "  \"subsystems\": {"
  echo "    \"release_evidence\": \"$RELEASE_EVIDENCE_STATUS\","
  echo "    \"smoke_phase1\": \"$SMOKE_PHASE1_STATUS\","
  echo "    \"smoke_queue\": \"$SMOKE_QUEUE_STATUS\","
  echo "    \"smoke_static\": \"$SMOKE_STATIC_STATUS\","
  echo "    \"a2a_interop\": \"$A2A_INTEROP_STATUS\","
  echo "    \"a2a_workers\": \"$A2A_WORKER_STATUS\""
  echo "  },"
  echo "  \"blockers\": ["
  for i in "${!BLOCKERS[@]}"; do
    comma=","
    if [[ "$i" -eq $((${#BLOCKERS[@]} - 1)) ]]; then
      comma=""
    fi
    blocker="${BLOCKERS[$i]//\"/\\\"}"
    echo "    \"$blocker\"$comma"
  done
  echo "  ],"
  echo "  \"warnings\": ["
  for i in "${!WARNINGS[@]}"; do
    comma=","
    if [[ "$i" -eq $((${#WARNINGS[@]} - 1)) ]]; then
      comma=""
    fi
    warning="${WARNINGS[$i]//\"/\\\"}"
    echo "    \"$warning\"$comma"
  done
  echo "  ]"
  echo "}"
} > "$SCORECARD_JSON"

{
  echo "# Phase 3 Ecosystem Scorecard"
  echo ""
  echo "- Run ID: $RUN_ID"
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Mode: $PHASE3_MODE"
  echo "- Dry run: $DRY_RUN"
  echo "- Overall: $OVERALL"
  echo "- GA Ready: $GA_READY"
  echo "- Scorecard JSON: \`$SCORECARD_JSON\`"
  echo ""
  echo "## Subsystem Status"
  echo "- release_evidence: $RELEASE_EVIDENCE_STATUS"
  echo "- smoke_phase1: $SMOKE_PHASE1_STATUS"
  echo "- smoke_queue: $SMOKE_QUEUE_STATUS"
  echo "- smoke_static: $SMOKE_STATIC_STATUS"
  echo "- a2a_interop: $A2A_INTEROP_STATUS"
  echo "- a2a_workers: $A2A_WORKER_STATUS"
  echo ""
  echo "## Blockers"
  if [[ "${#BLOCKERS[@]}" -eq 0 ]]; then
    echo "- None"
  else
    for blocker in "${BLOCKERS[@]}"; do
      echo "- $blocker"
    done
  fi
  echo ""
  echo "## Warnings"
  if [[ "${#WARNINGS[@]}" -eq 0 ]]; then
    echo "- None"
  else
    for warning in "${WARNINGS[@]}"; do
      echo "- $warning"
    done
  fi
} > "$SCORECARD_MD"

echo "" | tee -a "$LOG_FILE"
echo "Phase 3 gates complete." | tee -a "$LOG_FILE"
echo "Summary markdown: $SUMMARY_MD" | tee -a "$LOG_FILE"
echo "Summary json: $SUMMARY_JSON" | tee -a "$LOG_FILE"
echo "Scorecard markdown: $SCORECARD_MD" | tee -a "$LOG_FILE"
echo "Scorecard json: $SCORECARD_JSON" | tee -a "$LOG_FILE"
echo "overall: $OVERALL" | tee -a "$LOG_FILE"

if [[ "$OVERALL" == "FAIL" ]]; then
  exit 1
fi
