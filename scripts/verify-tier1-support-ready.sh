#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-tier1-support-ready.sh
#
# Evidence gate for Tier-1 connector support status.
# Runs all A2A contract tests, adapter parity tests, and control-plane tests.
# Produces a support-readiness evidence report.
#
# Usage:
#   bash scripts/verify-tier1-support-ready.sh
#
# Exit code 0 = all gates pass (Tier-1 is support-ready)
# Exit code 1 = one or more gates failed
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SHARED_DIR="$ROOT_DIR/shared"

RUN_ID="$(date +%Y%m%d-%H%M%S)"
EVIDENCE_DIR="$ROOT_DIR/logs/release-evidence"
EVIDENCE_FILE="$EVIDENCE_DIR/$RUN_ID-tier1-support-ready.md"

PASS=0
FAIL=0
RESULTS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
header() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

gate() {
  local name="$1"
  shift
  echo ""
  echo "--- Gate: $name ---"

  if "$@" 2>&1; then
    echo "  PASS: $name"
    RESULTS+=("PASS $name")
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name" >&2
    RESULTS+=("FAIL $name")
    FAIL=$((FAIL + 1))
  fi
}

run_vitest() {
  local test_file="$1"
  cd "$SHARED_DIR"
  npx vitest run "$test_file" --reporter=verbose 2>&1
}

# ---------------------------------------------------------------------------
# Gate 1: Schema contract tests (connector-contracts.test.ts)
# ---------------------------------------------------------------------------
header "Gate 1: Schema Contract Tests"
gate "connector-contracts" run_vitest "src/a2a/schemas/__tests__/connector-contracts.test.ts"

# ---------------------------------------------------------------------------
# Gate 2: Tier-1 adapter parity tests
# ---------------------------------------------------------------------------
header "Gate 2: Tier-1 Adapter Parity Tests"
gate "tier1-adapter-parity" run_vitest "src/a2a/schemas/__tests__/tier1-adapter-parity.test.ts"

# ---------------------------------------------------------------------------
# Gate 3: Control-plane integration tests
# ---------------------------------------------------------------------------
header "Gate 3: Control-Plane Integration Tests"
gate "control-plane" run_vitest "src/a2a/control-plane.test.ts"

# ---------------------------------------------------------------------------
# Gate 4: Error contract snapshot tests
# ---------------------------------------------------------------------------
header "Gate 4: Error Contract Snapshot Tests"
gate "error-contract" run_vitest "src/a2a/error-contract.test.ts"

# ---------------------------------------------------------------------------
# Gate 5: Persistence tests
# ---------------------------------------------------------------------------
header "Gate 5: Persistence Tests"
gate "persistent-services" run_vitest "src/a2a/persistent-services.test.ts"

# ---------------------------------------------------------------------------
# Evidence Report
# ---------------------------------------------------------------------------
header "Evidence Report"

mkdir -p "$EVIDENCE_DIR"

{
  echo "# Tier-1 Support-Ready Evidence Report"
  echo ""
  echo "**Run ID:** $RUN_ID"
  echo "**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "**Host:** $(hostname)"
  echo "**Git SHA:** $(cd "$ROOT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  echo ""
  echo "## Gate Results"
  echo ""
  echo "| Status | Gate |"
  echo "|--------|------|"
  for result in "${RESULTS[@]}"; do
    status="${result%% *}"
    name="${result#* }"
    if [[ "$status" == "PASS" ]]; then
      echo "| PASS | $name |"
    else
      echo "| **FAIL** | $name |"
    fi
  done
  echo ""
  echo "## Summary"
  echo ""
  echo "- **Passed:** $PASS"
  echo "- **Failed:** $FAIL"
  echo "- **Total:**  $((PASS + FAIL))"
  echo ""

  if [[ $FAIL -eq 0 ]]; then
    echo "## Verdict: SUPPORT-READY"
    echo ""
    echo "All evidence gates passed. Tier-1 connectors (\`codex\`, \`claude\`) meet"
    echo "the support-ready criteria defined in the Unified A2A/UACB Architecture."
    echo ""
    echo "Connector status can be promoted from \`experimental\` to \`supported\`."
  else
    echo "## Verdict: NOT READY"
    echo ""
    echo "$FAIL gate(s) failed. Tier-1 connectors remain \`experimental\`."
    echo "Fix the failing gates and re-run this script."
  fi
} | tee "$EVIDENCE_FILE"

echo ""
echo "Evidence written to: $EVIDENCE_FILE"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "RESULT: FAIL ($FAIL gate(s) failed)"
  exit 1
fi

echo "RESULT: PASS (all gates passed)"
exit 0
