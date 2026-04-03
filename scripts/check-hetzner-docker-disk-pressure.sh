#!/usr/bin/env bash
set -euo pipefail

# Guard against Docker rebuilds starting when the host root disk is already near
# exhaustion. Safe reclaim only touches dangling images and BuildKit cache.

TARGET_PATH="${TARGET_PATH:-/}"
WARN_USAGE_PERCENT="${WARN_USAGE_PERCENT:-85}"
RECLAIM_USAGE_PERCENT="${RECLAIM_USAGE_PERCENT:-88}"
FAIL_USAGE_PERCENT="${FAIL_USAGE_PERCENT:-90}"
AUTO_RECLAIM="${AUTO_RECLAIM:-1}"

usage_percent() {
  df -P "${TARGET_PATH}" | awk 'NR==2 {gsub("%", "", $5); print $5}'
}

print_context() {
  echo "Disk usage for ${TARGET_PATH}: $(df -h "${TARGET_PATH}" | awk 'NR==2 {print $3 " used / " $2 " total (" $5 " used, " $4 " avail)"}')"
  docker system df || true
}

safe_reclaim() {
  echo "Running safe Docker reclaim: docker image prune -f && docker builder prune -f"
  docker image prune -f || true
  docker builder prune -f || true
}

CURRENT_USAGE="$(usage_percent)"

echo "[disk-guard] Current root usage: ${CURRENT_USAGE}%"
print_context

if [ "${CURRENT_USAGE}" -lt "${WARN_USAGE_PERCENT}" ]; then
  echo "[disk-guard] OK: usage is below ${WARN_USAGE_PERCENT}%."
  exit 0
fi

if [ "${CURRENT_USAGE}" -lt "${RECLAIM_USAGE_PERCENT}" ]; then
  echo "[disk-guard] WARN: usage is above ${WARN_USAGE_PERCENT}% but below reclaim threshold ${RECLAIM_USAGE_PERCENT}%."
  exit 0
fi

if [ "${AUTO_RECLAIM}" != "1" ]; then
  echo "[disk-guard] FAIL: usage is ${CURRENT_USAGE}% and AUTO_RECLAIM is disabled."
  echo "[disk-guard] Run: docker image prune -f && docker builder prune -f"
  exit 1
fi

safe_reclaim

POST_RECLAIM_USAGE="$(usage_percent)"
echo "[disk-guard] Usage after reclaim: ${POST_RECLAIM_USAGE}%"
print_context

if [ "${POST_RECLAIM_USAGE}" -gt "${FAIL_USAGE_PERCENT}" ]; then
  echo "[disk-guard] FAIL: root usage is still above ${FAIL_USAGE_PERCENT}% after safe reclaim."
  echo "[disk-guard] Manual follow-up:"
  echo "  1. Inspect docker system df and large images"
  echo "  2. Remove obsolete images/build cache more aggressively if safe"
  echo "  3. Free non-Docker host disk before retrying deploy"
  exit 1
fi

echo "[disk-guard] OK: safe reclaim reduced pressure enough to continue."
