#!/usr/bin/env bash
set -euo pipefail

# Guard against deploy/build work starting when the host root disk is already
# near exhaustion. Automatic reclaim stays intentionally conservative:
#   1. prune dangling Docker images + BuildKit cache
#   2. optionally vacuum oversized systemd journals
# Active containers, active volumes, and application data are never removed.

TARGET_PATH="${TARGET_PATH:-/}"
WARN_USAGE_PERCENT="${WARN_USAGE_PERCENT:-85}"
RECLAIM_USAGE_PERCENT="${RECLAIM_USAGE_PERCENT:-88}"
FAIL_USAGE_PERCENT="${FAIL_USAGE_PERCENT:-90}"
AUTO_RECLAIM="${AUTO_RECLAIM:-1}"
AUTO_VACUUM_JOURNAL="${AUTO_VACUUM_JOURNAL:-1}"
JOURNAL_TARGET_SIZE="${JOURNAL_TARGET_SIZE:-1G}"

journalctl_available() {
  command -v journalctl >/dev/null 2>&1
}

journal_usage_summary() {
  if ! journalctl_available; then
    echo "systemd journal: unavailable"
    return 0
  fi

  journalctl --disk-usage 2>/dev/null || echo "systemd journal: unavailable"
}

usage_percent() {
  df -P "${TARGET_PATH}" | awk 'NR==2 {gsub("%", "", $5); print $5}'
}

top_volume_summary() {
  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi

  docker volume ls --format '{{.Name}}' 2>/dev/null \
    | while read -r volume_name; do
        [ -n "${volume_name}" ] || continue
        mountpoint="$(docker volume inspect -f '{{.Mountpoint}}' "${volume_name}" 2>/dev/null || true)"
        [ -n "${mountpoint}" ] || continue
        du -sh "${mountpoint}" 2>/dev/null \
          | awk -v vol="${volume_name}" '{print $1 "\t" vol}'
      done \
    | sort -h \
    | tail -n 10 || true
}

print_context() {
  echo "Disk usage for ${TARGET_PATH}: $(df -h "${TARGET_PATH}" | awk 'NR==2 {print $3 " used / " $2 " total (" $5 " used, " $4 " avail)"}')"
  docker system df || true
  journal_usage_summary
}

safe_reclaim() {
  echo "Running safe Docker reclaim: docker image prune -f && docker builder prune -f"
  docker image prune -f || true
  docker builder prune -f || true
}

safe_vacuum_journals() {
  if ! journalctl_available; then
    echo "Skipping journal vacuum: journalctl is unavailable."
    return 0
  fi

  echo "Running safe journal vacuum: journalctl --vacuum-size=${JOURNAL_TARGET_SIZE}"
  journalctl --vacuum-size="${JOURNAL_TARGET_SIZE}" || true
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

POST_DOCKER_RECLAIM_USAGE="$(usage_percent)"
echo "[disk-guard] Usage after Docker reclaim: ${POST_DOCKER_RECLAIM_USAGE}%"
print_context

FINAL_USAGE="${POST_DOCKER_RECLAIM_USAGE}"

if [ "${FINAL_USAGE}" -gt "${FAIL_USAGE_PERCENT}" ] && [ "${AUTO_VACUUM_JOURNAL}" = "1" ]; then
  safe_vacuum_journals
  FINAL_USAGE="$(usage_percent)"
  echo "[disk-guard] Usage after journal vacuum: ${FINAL_USAGE}%"
  print_context
fi

if [ "${FINAL_USAGE}" -gt "${FAIL_USAGE_PERCENT}" ]; then
  echo "[disk-guard] FAIL: root usage is still above ${FAIL_USAGE_PERCENT}% after safe reclaim."
  echo "[disk-guard] Manual follow-up:"
  echo "  1. Inspect docker system df and large images"
  echo "  2. Inspect oversized active volumes before deleting anything"
  echo "  3. Free non-Docker host disk before retrying deploy"
  echo "  4. Do not remove shared-host application data without verifying ownership"
  echo "[disk-guard] Largest Docker volumes:"
  top_volume_summary
  exit 1
fi

echo "[disk-guard] OK: safe reclaim reduced pressure enough to continue."
