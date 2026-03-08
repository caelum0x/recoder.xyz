#!/usr/bin/env bash
# Check test counts across all apps to catch regressions.
# Usage: bash scripts/check-test-counts.sh
set -euo pipefail

FAIL=0
TOTAL=0

check_tests() {
  local name="$1"
  local cmd="$2"
  local min_count="$3"
  local dir="$4"

  if [ ! -d "$dir" ]; then
    echo "SKIP  $name — directory not found: $dir"
    return
  fi

  echo -n "CHECK $name (min: $min_count) ... "

  local output
  if output=$(cd "$dir" && eval "$cmd" 2>&1); then
    # Extract test count from output
    local count
    # vitest format: "Tests  N passed"
    count=$(echo "$output" | grep -oE 'Tests\s+[0-9]+' | grep -oE '[0-9]+' | head -1 || true)
    # node:test format: "# pass N" or "pass N"
    if [ -z "$count" ]; then
      count=$(echo "$output" | grep -oE '(pass|# pass)\s+[0-9]+' | grep -oE '[0-9]+' | tail -1 || true)
    fi
    # node:test alternate: "ℹ pass N"
    if [ -z "$count" ]; then
      count=$(echo "$output" | grep -oE 'pass [0-9]+' | grep -oE '[0-9]+' | head -1 || true)
    fi

    if [ -z "$count" ]; then
      echo "WARN — tests passed but couldn't parse count"
      echo "  Output tail: $(echo "$output" | tail -3)"
    elif [ "$count" -ge "$min_count" ]; then
      echo "PASS ($count tests)"
      TOTAL=$((TOTAL + count))
    else
      echo "FAIL ($count tests, expected >= $min_count)"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "FAIL — tests failed"
    echo "  Last 5 lines:"
    echo "$output" | tail -5 | sed 's/^/    /'
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Test Count Check ==="
echo ""

# recoder-agents (vitest)
check_tests "recoder-agents" "npx vitest run 2>&1" 90 "recoder-agents"

# recoder-pm API (node:test)
check_tests "recoder-pm/api" "node --import tsx --test tests/webhook-feedback-analyze.test.ts tests/webhook-organization-delete.test.ts tests/webhook-user-upsert.test.ts 2>&1" 20 "recoder-pm/apps/api"

# @recoder/auth (node:test)
check_tests "@recoder/auth" "node --import tsx --test src/edge.test.ts src/cross-domain.test.ts 2>&1" 25 "packages/auth"

# app (vitest) — only if vitest is available
if [ -f "app/vitest.config.ts" ]; then
  check_tests "app" "npx vitest run 2>&1" 270 "app"
fi

echo ""
echo "=== Summary ==="
echo "Total tests counted: $TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: $FAIL check(s) FAILED"
  exit 1
else
  echo "RESULT: ALL PASSED"
  exit 0
fi
