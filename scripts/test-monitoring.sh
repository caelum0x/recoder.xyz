#!/usr/bin/env bash
# =============================================================================
# test-monitoring.sh — Monitoring & Observability Endpoint Tests
#
# Tests all health, metrics, and dashboard endpoints across Recoder services.
# Exit code = number of failures (0 = all passed).
#
# Usage:
#   bash scripts/test-monitoring.sh
#   API=http://localhost:8000 DOCKER=http://localhost:3001 bash scripts/test-monitoring.sh
# =============================================================================
set -uo pipefail

API="${API:-https://api.recoder.xyz}"
DOCKER="${DOCKER:-https://docker.recoder.xyz}"

PASS=0
FAIL=0

check() {
  local name="$1" url="$2" expect="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "$expect" ]]; then
    echo "  PASS  $name (HTTP $status)"
    ((PASS++))
  else
    echo "  FAIL  $name (expected $expect, got $status)"
    ((FAIL++))
  fi
}

echo "=== Monitoring & Observability Tests ==="
echo ""

echo "--- Health Endpoints ---"
check "API health"          "$API/v1/health"
check "Docker health"       "$DOCKER/health"
check "Daytona health"      "$DOCKER/api/health/daytona"
check "Container health"    "$DOCKER/api/health/containers"
check "Pool stats"          "$DOCKER/api/pool/stats"
check "BYOK readiness"      "$DOCKER/api/health/byok-readiness"

echo ""
echo "--- Metrics & Stats ---"
check "WebSocket stats"     "$DOCKER/api/websocket/stats"
check "Collab stats"        "$DOCKER/api/collab/stats"

echo ""
echo "--- Error Tracking ---"
check "Error dashboard"     "$API/v1/errors/dashboard"

echo ""
echo "--- A2A Dashboard ---"
check "A2A dashboard"       "$DOCKER/api/a2a/dashboard"
check "A2A activity"        "$DOCKER/api/a2a/activity"

echo ""
echo "================================"
echo "  PASS: $PASS  FAIL: $FAIL"
echo "================================"
exit $FAIL
