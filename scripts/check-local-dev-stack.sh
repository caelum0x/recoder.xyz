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

run_step "recoder-web unit tests" \
  pnpm -C "$REPO_ROOT/recoder-web" test

run_step "docker-backend unit tests" \
  pnpm -C "$REPO_ROOT/docker-backend" test -- --runInBand

echo ""
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

