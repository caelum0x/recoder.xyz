#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG_SCRIPT="$ROOT_DIR/scripts/a2a-worker-watchdog.sh"
SCHEDULE="${A2A_WATCHDOG_CRON_SCHEDULE:-*/5 * * * *}"
CRON_MARKER="# recoder-a2a-worker-watchdog"
CRON_LINE="$SCHEDULE $WATCHDOG_SCRIPT $CRON_MARKER"

if [[ ! -x "$WATCHDOG_SCRIPT" ]]; then
  echo "watchdog script not executable: $WATCHDOG_SCRIPT" >&2
  exit 1
fi

existing="$(crontab -l 2>/dev/null || true)"
cleaned="$(printf '%s\n' "$existing" | grep -v "$CRON_MARKER" || true)"

{
  printf '%s\n' "$cleaned"
  printf '%s\n' "$CRON_LINE"
} | awk 'NF' | crontab -

echo "Installed watchdog cron: $CRON_LINE"
