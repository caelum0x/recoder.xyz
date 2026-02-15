#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCORE_DIR="$REPO_ROOT/logs/phase3-gates"
ALLOW_NON_GA_RAW="${PHASE3_ALLOW_NON_GA:-false}"

usage() {
  cat <<'USAGE'
Usage: check-phase3-ga-ready.sh [--scorecard <path>] [--allow-non-ga]

Validates Phase 3 scorecard for final promotion signoff.
Pass criteria:
- overall == "PASS"
- ga_ready == true
- blockers is empty
USAGE
}

scorecard_path=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scorecard)
      scorecard_path="${2:-}"
      shift 2
      ;;
    --allow-non-ga)
      ALLOW_NON_GA_RAW="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

ALLOW_NON_GA="$(echo "$ALLOW_NON_GA_RAW" | tr '[:upper:]' '[:lower:]')"
if [[ "$ALLOW_NON_GA" != "true" && "$ALLOW_NON_GA" != "false" ]]; then
  echo "Invalid PHASE3_ALLOW_NON_GA='$ALLOW_NON_GA_RAW' (expected true|false)." >&2
  exit 1
fi

if [[ -z "$scorecard_path" ]]; then
  if ! scorecard_path="$(ls -1t "$SCORE_DIR"/*-scorecard.json 2>/dev/null | head -n1)"; then
    scorecard_path=""
  fi
fi

if [[ -z "$scorecard_path" || ! -f "$scorecard_path" ]]; then
  echo "phase3 ga-ready check: scorecard not found" >&2
  echo "hint: run 'pnpm run phase3:gates' first" >&2
  exit 1
fi

parsed_raw="$(node -e '
const fs = require("fs");
const p = process.argv[1];
const data = JSON.parse(fs.readFileSync(p, "utf8"));
const blockers = Array.isArray(data.blockers) ? data.blockers : [];
const warnings = Array.isArray(data.warnings) ? data.warnings : [];
console.log([
  data.run_id || "",
  data.overall || "",
  String(Boolean(data.ga_ready)),
  String(blockers.length),
  String(warnings.length)
].join("|"));
' "$scorecard_path")"

IFS='|' read -r run_id overall ga_ready blockers_count warnings_count <<< "$parsed_raw"
run_id="${run_id:-}"
overall="${overall:-UNKNOWN}"
ga_ready="${ga_ready:-false}"
blockers_count="${blockers_count:-0}"
warnings_count="${warnings_count:-0}"

echo "Phase 3 signoff check"
echo "scorecard: $scorecard_path"
echo "run_id: $run_id"
echo "overall: $overall"
echo "ga_ready: $ga_ready"
echo "blockers: $blockers_count"
echo "warnings: $warnings_count"

if [[ "$overall" == "PASS" && "$ga_ready" == "true" && "$blockers_count" == "0" ]]; then
  echo "phase3 ga-ready check: PASS"
  exit 0
fi

if [[ "$ALLOW_NON_GA" == "true" ]]; then
  echo "phase3 ga-ready check: WARN (non-GA pass allowed)"
  exit 0
fi

echo "phase3 ga-ready check: FAIL" >&2
exit 1
