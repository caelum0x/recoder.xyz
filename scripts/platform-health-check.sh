#!/bin/bash

# Recoder platform health check for active surfaces only.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_PATH="$ROOT_DIR/build-health-report.json"

status_json='{"timestamp":"","status":"running","platforms":{},"summary":{"total":0,"passed":0,"failed":0,"warnings":0}}'
echo "$status_json" > "$REPORT_PATH"

update_report() {
  local platform="$1"
  local status="$2"
  local message="$3"
  local elapsed="$4"

  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    const platform = process.argv[2];
    const status = process.argv[3];
    const message = process.argv[4];
    const elapsed = Number(process.argv[5]);
    const report = JSON.parse(fs.readFileSync(p, 'utf8'));
    report.timestamp = new Date().toISOString();
    report.platforms[platform] = {
      status,
      message,
      buildTime: elapsed,
      timestamp: new Date().toISOString()
    };
    const values = Object.values(report.platforms);
    report.summary.total = values.length;
    report.summary.passed = values.filter(v => v.status === 'passed').length;
    report.summary.failed = values.filter(v => v.status === 'failed').length;
    report.summary.warnings = values.filter(v => v.status === 'warning').length;
    report.status = report.summary.failed > 0 ? 'degraded' : 'healthy';
    fs.writeFileSync(p, JSON.stringify(report, null, 2));
  " "$REPORT_PATH" "$platform" "$status" "$message" "$elapsed"
}

run_check() {
  local platform="$1"
  local dir="$2"
  local cmd="$3"
  local strict="${4:-true}"
  local start
  start=$(date +%s)

  if [[ ! -d "$ROOT_DIR/$dir" ]]; then
    update_report "$platform" "warning" "Directory missing: $dir" "0"
    return 0
  fi

  if [[ ! -f "$ROOT_DIR/$dir/package.json" ]]; then
    update_report "$platform" "warning" "package.json missing: $dir" "0"
    return 0
  fi

  if (cd "$ROOT_DIR/$dir" && eval "$cmd" >/dev/null 2>&1); then
    update_report "$platform" "passed" "Check passed" "$(( $(date +%s) - start ))"
    return 0
  fi

  if [[ "$strict" == "true" ]]; then
    update_report "$platform" "failed" "Check failed: $cmd" "$(( $(date +%s) - start ))"
    return 1
  fi

  update_report "$platform" "warning" "Advisory check failed: $cmd" "$(( $(date +%s) - start ))"
  return 0
}

echo "Running active-surface platform health checks..."

failures=0
if [[ -d "$ROOT_DIR/recoder-web" ]]; then
  run_check "recoder-web" "recoder-web" "npm run build" false || failures=$((failures + 1))
else
  update_report "recoder-web" "warning" "Directory missing: recoder-web (retired surface)" "0"
fi
run_check "recoder-agents" "recoder-agents" "npm run build" false || failures=$((failures + 1))
run_check "apps-mobile" "apps/mobile" "npm run typecheck" false || failures=$((failures + 1))
run_check "apps-desktop" "apps/desktop" "npm run lint" false || failures=$((failures + 1))
run_check "backend" "backend" "npm run build" false || failures=$((failures + 1))
run_check "docker-backend" "docker-backend" "npm run build" true || failures=$((failures + 1))

echo "Report written to: $REPORT_PATH"
cat "$REPORT_PATH"

if [[ "$failures" -gt 0 ]]; then
  echo "Platform health check failed: $failures strict checks failed."
  exit 1
fi

echo "Platform health check completed successfully."
