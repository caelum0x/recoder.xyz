#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/logs/release-evidence}"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
SUMMARY_MD="$OUT_DIR/$RUN_ID-summary.md"
SUMMARY_JSON="$OUT_DIR/$RUN_ID-summary.json"
CONNECTOR_SUPPORT_MD="$OUT_DIR/$RUN_ID-connectors-support.md"
CONNECTOR_SUPPORT_JSON="$OUT_DIR/$RUN_ID-connectors-support.json"
A5_SKIP_ENV_GATES_RAW="${A5_SKIP_ENV_GATES:-false}"
A5_SKIP_TYPECHECK_GATES_RAW="${A5_SKIP_TYPECHECK_GATES:-false}"
PRODUCTION_SCOPE="${PRODUCTION_SCOPE:-core}"
mkdir -p "$OUT_DIR"

FAILURES=0
FAIL_STEPS=()

A5_SKIP_ENV_GATES="$(echo "$A5_SKIP_ENV_GATES_RAW" | tr '[:upper:]' '[:lower:]')"
A5_SKIP_TYPECHECK_GATES="$(echo "$A5_SKIP_TYPECHECK_GATES_RAW" | tr '[:upper:]' '[:lower:]')"
if [[ "$A5_SKIP_ENV_GATES" != "true" && "$A5_SKIP_ENV_GATES" != "false" ]]; then
  echo "Invalid A5_SKIP_ENV_GATES='$A5_SKIP_ENV_GATES_RAW' (expected true|false)." >&2
  exit 1
fi
if [[ "$A5_SKIP_TYPECHECK_GATES" != "true" && "$A5_SKIP_TYPECHECK_GATES" != "false" ]]; then
  echo "Invalid A5_SKIP_TYPECHECK_GATES='$A5_SKIP_TYPECHECK_GATES_RAW' (expected true|false)." >&2
  exit 1
fi

record_fail_step() {
  FAIL_STEPS+=("$1")
}

run_step() {
  local title="$1"
  shift
  echo "" | tee -a "$LOG_FILE"
  echo "=== $title ===" | tee -a "$LOG_FILE"
  if {
    "$@"
  } 2>&1 | tee -a "$LOG_FILE"; then
    echo "status: PASS" | tee -a "$LOG_FILE"
    return 0
  fi
  echo "status: FAIL" | tee -a "$LOG_FILE"
  ((FAILURES+=1))
  record_fail_step "$title"
  return 1
}

echo "A5 release evidence run started: $RUN_ID" | tee "$LOG_FILE"
echo "repo: $REPO_ROOT" | tee -a "$LOG_FILE"
echo "production_scope: $PRODUCTION_SCOPE" | tee -a "$LOG_FILE"

run_step "A5 structure: required repos present" /bin/zsh -lc '
  set -euo pipefail
  req=(backend docker-backend apps/mobile recoder-agency recoder-pm recoder-web)
  for d in "${req[@]}"; do
    [[ -d "$d" ]] || { echo "missing directory: $d" >&2; exit 1; }
  done
  if [[ ! -d "app" && ! -d "apps/frontend" ]]; then
    echo "missing frontend directory: expected app or apps/frontend" >&2
    exit 1
  fi
  echo "all required directories present"
'

run_step "A5 structure: critical scripts present" /bin/zsh -lc '
  set -euo pipefail
  req=(
    scripts/phase1-main-branch-smoke.sh
    scripts/af-networked-preflight.sh
    scripts/af-networked-runner.sh
    scripts/af-networked-handoff.sh
    scripts/check-ecosystem-readiness.sh
    scripts/check-production-env-gate.sh
    scripts/hetzner-prod-closeout.sh
  )
  for f in "${req[@]}"; do
    [[ -f "$f" ]] || { echo "missing file: $f" >&2; exit 1; }
  done
  echo "all critical scripts present"
'

run_step "A5 guard: phase1 env consistency" pnpm -C "$REPO_ROOT" run check:phase1-env
if [[ "$A5_SKIP_ENV_GATES" == "true" ]]; then
  echo "" | tee -a "$LOG_FILE"
  echo "=== A5 guard: ecosystem readiness ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (A5_SKIP_ENV_GATES=true)" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "=== A5 guard: production env gate ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (A5_SKIP_ENV_GATES=true)" | tee -a "$LOG_FILE"
else
  run_step "A5 guard: ecosystem readiness" env ECOSYSTEM_SCOPE="$PRODUCTION_SCOPE" pnpm -C "$REPO_ROOT" run check:ecosystem
  run_step "A5 guard: production env gate" env PRODUCTION_SCOPE="$PRODUCTION_SCOPE" pnpm -C "$REPO_ROOT" run check:prod-env-gate
fi

if [[ "$A5_SKIP_TYPECHECK_GATES" == "true" ]]; then
  echo "" | tee -a "$LOG_FILE"
  echo "=== A5 typecheck: frontend ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (A5_SKIP_TYPECHECK_GATES=true)" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "=== A5 typecheck: mobile ===" | tee -a "$LOG_FILE"
  echo "status: SKIP (A5_SKIP_TYPECHECK_GATES=true)" | tee -a "$LOG_FILE"
else
  FRONTEND_DIR="$REPO_ROOT/app"
  if [[ ! -d "$FRONTEND_DIR" ]]; then
    FRONTEND_DIR="$REPO_ROOT/apps/frontend"
  fi
  run_step "A5 typecheck: frontend" pnpm -C "$FRONTEND_DIR" run typecheck
  run_step "A5 typecheck: mobile" pnpm -C "$REPO_ROOT/apps/mobile" run typecheck
fi

run_step "A5 backend guard: no supabase imports" /bin/zsh -lc "
  set -uo pipefail
  SCRIPT='$REPO_ROOT/backend/core/utils/scripts/check_no_supabase_imports.py'
  if command -v python3 >/dev/null 2>&1; then
    python3 \"\$SCRIPT\"
    exit 0
  fi
  UV_CACHE_DIR='$REPO_ROOT/.uv-cache' uv run --python 3.13 python \"\$SCRIPT\"
"

run_step "A5 backend guard: no dbconnection usage" /bin/zsh -lc "
  set -uo pipefail
  SCRIPT='$REPO_ROOT/backend/core/utils/scripts/check_no_dbconnection_usage.py'
  if command -v python3 >/dev/null 2>&1; then
    python3 \"\$SCRIPT\"
    exit 0
  fi
  UV_CACHE_DIR='$REPO_ROOT/.uv-cache' uv run --python 3.13 python \"\$SCRIPT\"
"

OVERALL="PASS"
if [[ "$FAILURES" -gt 0 ]]; then
  OVERALL="FAIL ($FAILURES failing step(s))"
fi

{
  echo "{"
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"run_id\": \"$RUN_ID\","
  echo "  \"source\": \"a5-release-evidence\","
  echo "  \"overall\": \"$OVERALL\","
  echo "  \"note\": \"A5 lane does not execute full support smoke gates; Tier-1 remains experimental in this lane\","
  echo "  \"connectors\": ["
  echo "    { \"id\": \"codex\", \"tier\": \"tier1\", \"status\": \"experimental\", \"reason\": \"A5 evidence lane only; full support gates not executed here\" },"
  echo "    { \"id\": \"claude\", \"tier\": \"tier1\", \"status\": \"experimental\", \"reason\": \"A5 evidence lane only; full support gates not executed here\" },"
  echo "    { \"id\": \"cursor\", \"tier\": \"tier2\", \"status\": \"backlog\", \"reason\": \"Tier-2 backlog until no-skip Phase 3 closeout succeeds\" },"
  echo "    { \"id\": \"windsurf\", \"tier\": \"tier2\", \"status\": \"backlog\", \"reason\": \"Tier-2 backlog until no-skip Phase 3 closeout succeeds\" },"
  echo "    { \"id\": \"replit\", \"tier\": \"tier2\", \"status\": \"backlog\", \"reason\": \"Tier-2 backlog until no-skip Phase 3 closeout succeeds\" },"
  echo "    { \"id\": \"vscode-copilot\", \"tier\": \"tier2\", \"status\": \"backlog\", \"reason\": \"Tier-2 backlog until no-skip Phase 3 closeout succeeds\" },"
  echo "    { \"id\": \"jetbrains\", \"tier\": \"tier2\", \"status\": \"backlog\", \"reason\": \"Tier-2 backlog until no-skip Phase 3 closeout succeeds\" }"
  echo "  ]"
  echo "}"
} > "$CONNECTOR_SUPPORT_JSON"

{
  echo "# Connector Support Status (A5 lane)"
  echo ""
  echo "- Run ID: $RUN_ID"
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Overall: $OVERALL"
  echo "- JSON: \`$CONNECTOR_SUPPORT_JSON\`"
  echo ""
  echo "A5 lane does not execute full support smoke gates; Tier-1 remains experimental in this lane."
  echo ""
  echo "## Connectors"
  echo "| Connector | Tier | Status | Reason |"
  echo "|---|---|---|---|"
  echo "| codex | tier1 | experimental | A5 evidence lane only; full support gates not executed here |"
  echo "| claude | tier1 | experimental | A5 evidence lane only; full support gates not executed here |"
  echo "| cursor | tier2 | backlog | Tier-2 backlog until no-skip Phase 3 closeout succeeds |"
  echo "| windsurf | tier2 | backlog | Tier-2 backlog until no-skip Phase 3 closeout succeeds |"
  echo "| replit | tier2 | backlog | Tier-2 backlog until no-skip Phase 3 closeout succeeds |"
  echo "| vscode-copilot | tier2 | backlog | Tier-2 backlog until no-skip Phase 3 closeout succeeds |"
  echo "| jetbrains | tier2 | backlog | Tier-2 backlog until no-skip Phase 3 closeout succeeds |"
} > "$CONNECTOR_SUPPORT_MD"

{
  echo "{"
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"run_id\": \"$RUN_ID\","
  echo "  \"log_file\": \"$LOG_FILE\","
  echo "  \"overall\": \"$OVERALL\","
  echo "  \"failing_steps\": ["
  for i in "${!FAIL_STEPS[@]}"; do
    step="${FAIL_STEPS[$i]}"
    step="${step//\"/\\\"}"
    if [[ "$i" -gt 0 ]]; then echo ","; fi
    echo -n "    \"$step\""
  done
  echo ""
  echo "  ]"
  echo "}"
} > "$SUMMARY_JSON"

{
  echo "# A5 Release Evidence"
  echo ""
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Run ID: $RUN_ID"
  echo "- Overall: $OVERALL"
  echo "- Log: \`$LOG_FILE\`"
  echo "- JSON: \`$SUMMARY_JSON\`"
  echo ""
  echo "## Failing Steps"
  if [[ "${#FAIL_STEPS[@]}" -eq 0 ]]; then
    echo "- None"
  else
    for step in "${FAIL_STEPS[@]}"; do
      echo "- $step"
    done
  fi
} > "$SUMMARY_MD"

echo "" | tee -a "$LOG_FILE"
echo "A5 release evidence complete. Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Summary markdown: $SUMMARY_MD" | tee -a "$LOG_FILE"
echo "Summary json: $SUMMARY_JSON" | tee -a "$LOG_FILE"
echo "Connector support markdown: $CONNECTOR_SUPPORT_MD" | tee -a "$LOG_FILE"
echo "Connector support json: $CONNECTOR_SUPPORT_JSON" | tee -a "$LOG_FILE"
echo "overall: $OVERALL" | tee -a "$LOG_FILE"

if [[ "$FAILURES" -gt 0 ]]; then
  exit 1
fi
