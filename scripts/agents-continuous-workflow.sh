#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
MODE="local-dev"
CYCLES=1
SLEEP_SECONDS=60
RUN_EXTENDED=0
PLAN_FILE="$REPO_ROOT/plan.md"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs/agents-continuous}"
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/$RUN_ID.log"
SUMMARY_JSON="$LOG_DIR/$RUN_ID-summary.json"
SUMMARY_MD="$LOG_DIR/$RUN_ID-summary.md"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

Options:
  --mode <local-dev|production>   Ecosystem gate mode (default: local-dev)
  --cycles <n>                    Number of cycles to run (0 = infinite, default: 1)
  --sleep <seconds>               Sleep between cycles (default: 60)
  --extended                      Include heavier/non-default lanes (default: off)
  --plan-file <path>              Plan file to append cycle summaries to (default: plan.md)
  --help                          Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --cycles)
      CYCLES="${2:-}"
      shift 2
      ;;
    --sleep)
      SLEEP_SECONDS="${2:-}"
      shift 2
      ;;
    --extended)
      RUN_EXTENDED=1
      shift
      ;;
    --plan-file)
      PLAN_FILE="${2:-}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "local-dev" && "$MODE" != "production" ]]; then
  echo "--mode must be local-dev or production" >&2
  exit 1
fi

if ! [[ "$CYCLES" =~ ^[0-9]+$ ]]; then
  echo "--cycles must be a non-negative integer" >&2
  exit 1
fi

if ! [[ "$SLEEP_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--sleep must be a non-negative integer" >&2
  exit 1
fi

run_lane() {
  local lane="$1"
  local label="$2"
  shift 2

  echo "" | tee -a "$RUN_LOG"
  echo "[$lane] $label" | tee -a "$RUN_LOG"
  if {
    "$@"
  } 2>&1 | tee -a "$RUN_LOG"; then
    echo "[$lane] status=PASS" | tee -a "$RUN_LOG"
    return 0
  fi

  echo "[$lane] status=FAIL" | tee -a "$RUN_LOG"
  return 1
}

append_cycle_summary_to_plan() {
  local cycle="$1"
  local pass_count="$2"
  local fail_count="$3"
  local skip_count="$4"
  local failed_lanes="$5"

  if [[ ! -f "$PLAN_FILE" ]]; then
    return 0
  fi

  cat <<EOF >> "$PLAN_FILE"

### Continuous Agent Cycle ($RUN_ID / cycle $cycle)
- Mode: \`$MODE\`
- PASS lanes: $pass_count
- FAIL lanes: $fail_count
- SKIP lanes: $skip_count
- Failed lanes: ${failed_lanes:-none}
- Log: \`$RUN_LOG\`
EOF
}

echo "Continuous agent workflow started: $RUN_ID" | tee "$RUN_LOG"
echo "repo: $REPO_ROOT" | tee -a "$RUN_LOG"
echo "mode: $MODE" | tee -a "$RUN_LOG"
echo "cycles: $CYCLES" | tee -a "$RUN_LOG"
echo "sleep_seconds: $SLEEP_SECONDS" | tee -a "$RUN_LOG"

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
cycle=0

has_pnpm_script() {
  local dir="$1"
  local script_name="$2"
  if [[ ! -f "$dir/package.json" ]]; then
    return 1
  fi

  node -e 'const fs=require("fs"); const p=process.argv[1]; const s=process.argv[2]; const j=JSON.parse(fs.readFileSync(p,"utf8")); process.exit(j.scripts&&j.scripts[s]?0:1);' "$dir/package.json" "$script_name" >/dev/null 2>&1
}

skip_lane() {
  local lane="$1"
  local label="$2"
  local reason="$3"
  echo "[$lane] $label: SKIP ($reason)" | tee -a "$RUN_LOG"
  return 2
}

run_optional_pnpm_lane() {
  local lane="$1"
  local label="$2"
  local dir="$3"
  local script_name="$4"
  shift 4

  if ! has_pnpm_script "$dir" "$script_name"; then
    echo "[$lane] $label: SKIP (missing script '$script_name' in $dir)" | tee -a "$RUN_LOG"
    return 2
  fi

  run_lane "$lane" "$label" pnpm -C "$dir" run "$script_name" "$@"
}

record_lane_result() {
  local rc="$1"
  local lane="$2"

  case "$rc" in
    0)
      PASS_IN_CYCLE=$((PASS_IN_CYCLE + 1))
      ;;
    1)
      FAIL_IN_CYCLE=$((FAIL_IN_CYCLE + 1))
      FAILED_LANES="${FAILED_LANES}${lane} "
      ;;
    2)
      SKIP_IN_CYCLE=$((SKIP_IN_CYCLE + 1))
      ;;
  esac
}

while :; do
  cycle=$((cycle + 1))
  if [[ "$CYCLES" -ne 0 && "$cycle" -gt "$CYCLES" ]]; then
    break
  fi

  echo "" | tee -a "$RUN_LOG"
  echo "=== cycle $cycle ===" | tee -a "$RUN_LOG"

  PASS_IN_CYCLE=0
  FAIL_IN_CYCLE=0
  SKIP_IN_CYCLE=0
  FAILED_LANES=""

  run_lane "A0" "path coverage (all listed repos present)" \
    /bin/zsh -lc "
      set -euo pipefail
      paths=(
      '$REPO_ROOT/app'
      '$REPO_ROOT/apps/desktop'
      '$REPO_ROOT/apps/frontend'
      '$REPO_ROOT/apps/mobile'
      '$REPO_ROOT/apps/studio.giselles.ai'
      '$REPO_ROOT/apps/ui.giselles.ai'
      '$REPO_ROOT/backend'
      '$REPO_ROOT/docker-backend'
      '$REPO_ROOT/openclaw'
      '$REPO_ROOT/packages'
      '$REPO_ROOT/recoder-agency'
      '$REPO_ROOT/recoder-pm'
      '$REPO_ROOT/recoder-skill'
      '$REPO_ROOT/recoder-web'
      '$REPO_ROOT/tools'
      '$REPO_ROOT/plan.md'
      )
      for p in \"\${paths[@]}\"; do
        [[ -e \"\$p\" ]] || { echo \"missing: \$p\" >&2; exit 1; }
      done
      echo \"all listed paths present\"
    "
  record_lane_result $? "A0-paths"

  if [[ "$MODE" == "local-dev" ]]; then
    run_lane "A0" "ecosystem local readiness" \
      pnpm -C "$REPO_ROOT" run check:ecosystem:local
  else
    run_lane "A0" "ecosystem production readiness" \
      pnpm -C "$REPO_ROOT" run check:ecosystem
  fi
  record_lane_result $? "A0"

  if [[ "$RUN_EXTENDED" -eq 1 ]]; then
    run_optional_pnpm_lane "A1" "app lint" "$REPO_ROOT/app" "lint"
    record_lane_result $? "A1-app"

    run_optional_pnpm_lane "A4" "apps/frontend lint" "$REPO_ROOT/apps/frontend" "lint"
    record_lane_result $? "A4-frontend"

    run_optional_pnpm_lane "A5" "apps/studio.giselles.ai test" "$REPO_ROOT/apps/studio.giselles.ai" "test"
    record_lane_result $? "A5-studio"

    run_optional_pnpm_lane "A6" "apps/desktop validate:release" "$REPO_ROOT/apps/desktop" "validate:release"
    record_lane_result $? "A6-desktop"

    run_optional_pnpm_lane "A7" "openclaw check" "$REPO_ROOT/openclaw" "check"
    record_lane_result $? "A7-openclaw"
  else
    skip_lane "A1" "app lint" "extended mode disabled"
    record_lane_result $? "A1-app"
    skip_lane "A4" "apps/frontend lint" "extended mode disabled"
    record_lane_result $? "A4-frontend"
    skip_lane "A5" "apps/studio.giselles.ai test" "extended mode disabled"
    record_lane_result $? "A5-studio"
    skip_lane "A6" "apps/desktop validate:release" "extended mode disabled"
    record_lane_result $? "A6-desktop"
    skip_lane "A7" "openclaw check" "extended mode disabled"
    record_lane_result $? "A7-openclaw"
  fi

  run_optional_pnpm_lane "A2" "recoder-agency check-types" "$REPO_ROOT/recoder-agency" "check-types"
  record_lane_result $? "A2"

  run_lane "A1" "recoder-web unit tests" \
    pnpm -C "$REPO_ROOT/recoder-web" test
  record_lane_result $? "A1"

  run_lane "A1" "docker-backend unit tests" \
    pnpm -C "$REPO_ROOT/docker-backend" test -- --runInBand
  record_lane_result $? "A1-docker"

  run_lane "A4" "backend supabase guard" \
    /bin/zsh -lc "set -uo pipefail; cd '$REPO_ROOT/backend'; if command -v python3 >/dev/null 2>&1; then python3 core/utils/scripts/check_no_supabase_imports.py; else UV_CACHE_DIR='$REPO_ROOT/.uv-cache' uv run --python 3.13 python core/utils/scripts/check_no_supabase_imports.py; fi"
  record_lane_result $? "A4"

  run_lane "A3" "recoder-pm check" \
    pnpm -C "$REPO_ROOT/recoder-pm" check
  record_lane_result $? "A3"

  TOTAL_PASS=$((TOTAL_PASS + PASS_IN_CYCLE))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL_IN_CYCLE))
  TOTAL_SKIP=$((TOTAL_SKIP + SKIP_IN_CYCLE))

  echo "cycle=$cycle pass=$PASS_IN_CYCLE fail=$FAIL_IN_CYCLE skip=$SKIP_IN_CYCLE failed_lanes='${FAILED_LANES:-none}'" | tee -a "$RUN_LOG"
  append_cycle_summary_to_plan "$cycle" "$PASS_IN_CYCLE" "$FAIL_IN_CYCLE" "$SKIP_IN_CYCLE" "${FAILED_LANES:-none}"

  if [[ "$CYCLES" -eq 0 || "$cycle" -lt "$CYCLES" ]]; then
    sleep "$SLEEP_SECONDS"
  fi
done

OVERALL="PASS"
if [[ "$TOTAL_FAIL" -gt 0 ]]; then
  OVERALL="FAIL"
fi

{
  echo "{"
  echo "  \"run_id\": \"$RUN_ID\","
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"mode\": \"$MODE\","
  echo "  \"cycles\": $CYCLES,"
  echo "  \"total_pass\": $TOTAL_PASS,"
  echo "  \"total_fail\": $TOTAL_FAIL,"
  echo "  \"total_skip\": $TOTAL_SKIP,"
  echo "  \"overall\": \"$OVERALL\","
  echo "  \"log\": \"$RUN_LOG\""
  echo "}"
} > "$SUMMARY_JSON"

{
  echo "# Continuous Agent Workflow Summary"
  echo ""
  echo "- Run ID: $RUN_ID"
  echo "- Mode: $MODE"
  echo "- Cycles: $CYCLES"
  echo "- Total PASS lanes: $TOTAL_PASS"
  echo "- Total FAIL lanes: $TOTAL_FAIL"
  echo "- Total SKIP lanes: $TOTAL_SKIP"
  echo "- Overall: $OVERALL"
  echo "- Log: \`$RUN_LOG\`"
  echo "- JSON: \`$SUMMARY_JSON\`"
} > "$SUMMARY_MD"

echo "" | tee -a "$RUN_LOG"
echo "workflow complete: overall=$OVERALL" | tee -a "$RUN_LOG"
echo "summary_md: $SUMMARY_MD" | tee -a "$RUN_LOG"
echo "summary_json: $SUMMARY_JSON" | tee -a "$RUN_LOG"

if [[ "$TOTAL_FAIL" -gt 0 ]]; then
  exit 1
fi
