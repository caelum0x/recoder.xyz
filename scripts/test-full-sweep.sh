#!/usr/bin/env bash
# =============================================================================
# test-full-sweep.sh — Recoder Platform Full Test Sweep
#
# Master script that runs all verification and test suites in sequence.
# Set TOKEN env var to enable authenticated test suites.
# Exit code = number of suite failures (0 = all passed).
#
# Usage:
#   bash scripts/test-full-sweep.sh
#   TOKEN=<bearer-token> bash scripts/test-full-sweep.sh
# =============================================================================
set -uo pipefail

echo "+==============================================+"
echo "|  RECODER PLATFORM -- FULL TEST SWEEP         |"
echo "+==============================================+"
echo ""

PASS=0
FAIL=0

run_suite() {
  local name="$1"
  shift
  echo "--- $name ---"
  if bash "$@" 2>&1; then
    echo "PASS  $name"
    echo ""
    ((PASS++))
  else
    echo "FAIL  $name"
    echo ""
    ((FAIL++))
  fi
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Core suites (always run) ---

if [[ -f "$SCRIPT_DIR/verify-phase7-deployed-fixes.sh" ]]; then
  run_suite "Deployed Fix Verification" "$SCRIPT_DIR/verify-phase7-deployed-fixes.sh"
else
  echo "SKIP  Deployed Fix Verification (script not found)"
  echo ""
fi

run_suite "Monitoring Tests" "$SCRIPT_DIR/test-monitoring.sh"

# --- Authenticated suites (require TOKEN env var) ---

if [[ -n "${TOKEN:-}" ]]; then
  if [[ -f "$SCRIPT_DIR/test-backend-api.sh" ]]; then
    run_suite "Backend API Tests" "$SCRIPT_DIR/test-backend-api.sh" "$TOKEN"
  fi

  if [[ -f "$SCRIPT_DIR/test-platform-e2e.sh" ]]; then
    run_suite "Platform E2E Tests" "$SCRIPT_DIR/test-platform-e2e.sh"
  fi
else
  echo "SKIP  Backend API Tests (no TOKEN set)"
  echo "SKIP  Platform E2E Tests (no TOKEN set)"
  echo ""
fi

echo "+==============================================+"
echo "|  RESULTS: $PASS passed, $FAIL failed            |"
echo "+==============================================+"

exit $FAIL
