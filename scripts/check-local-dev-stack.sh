#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

run_step() {
  local label="$1"
  shift

  echo ""
  echo "=== $label ==="
  if "$@"; then
    echo "PASS: $label"
    ((PASS++))
  else
    echo "FAIL: $label"
    ((FAIL++))
  fi
}

run_step "Ecosystem local readiness" \
  pnpm -C "$REPO_ROOT" run check:ecosystem:local

if [[ -d "$REPO_ROOT/recoder-web" ]]; then
  run_step "recoder-web unit tests" \
    pnpm -C "$REPO_ROOT/recoder-web" test
else
  echo ""
  echo "=== recoder-web unit tests ==="
  echo "SKIP: recoder-web unit tests (retired surface missing)"
fi

run_step "docker-backend unit tests" \
  pnpm -C "$REPO_ROOT/docker-backend" test -- --runInBand

echo ""
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
