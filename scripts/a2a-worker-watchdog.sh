#!/usr/bin/env bash
set -euo pipefail

# A2A Worker Watchdog
# Checks each worker is alive, restarts dead ones, kills duplicates.
# Designed for cron: */5 * * * * /path/to/scripts/a2a-worker-watchdog.sh
#
# Install:
#   crontab -e
#   */5 * * * * /opt/recoder/scripts/a2a-worker-watchdog.sh >> /var/log/recoder/worker-watchdog.log 2>&1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_SCRIPT="$ROOT_DIR/scripts/a2a-workers-hetzner.sh"
RUN_DIR="${A2A_WORKER_RUN_DIR:-$ROOT_DIR/.run/a2a-workers}"
LOG_DIR="${A2A_WORKER_LOG_DIR:-$ROOT_DIR/logs/a2a-workers}"
WATCHDOG_LOG="${WATCHDOG_LOG:-$LOG_DIR/watchdog.log}"

mkdir -p "$LOG_DIR" "$RUN_DIR"

TS="$(date '+%Y-%m-%d %H:%M:%S')"

log() {
  echo "[$TS] $*" >> "$WATCHDOG_LOG"
}

# Workers: name, grep pattern (must match a2a-workers-hetzner.sh)
WORKERS=(
  "recoder-web|pnpm -C recoder-web a2a:worker"
  "recoder-agency|pnpm -C recoder-agency/apps/agency a2a:worker"
  "recoder-pm-api|pnpm -C recoder-pm/apps/api a2a:worker"
  "docker-backend|pnpm -C docker-backend a2a:worker"
)

DEAD_WORKERS=()

for entry in "${WORKERS[@]}"; do
  IFS='|' read -r name pattern <<< "$entry"
  pid_file="$RUN_DIR/$name.pid"
  alive=false

  # Check PID file first
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      alive=true
    else
      # Stale PID file — clean up
      rm -f "$pid_file"
    fi
  fi

  # Fallback: check by process pattern
  if ! $alive && pgrep -f "$pattern" >/dev/null 2>&1; then
    alive=true
    # Fix missing PID file
    new_pid="$(pgrep -f "$pattern" | head -n1)"
    echo "$new_pid" > "$pid_file"
    log "WARN $name: recovered PID file (pid=$new_pid)"
  fi

  if ! $alive; then
    log "DEAD $name: not running"
    DEAD_WORKERS+=("$name")
  fi

  # Kill duplicates: keep the oldest process, kill the rest
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  pid_count="$(echo "$pids" | grep -c . 2>/dev/null || echo 0)"
  if [[ "$pid_count" -gt 1 ]]; then
    oldest="$(echo "$pids" | head -n1)"
    log "WARN $name: $pid_count processes found, keeping oldest (pid=$oldest)"
    echo "$pids" | tail -n +2 | while read -r dup_pid; do
      log "KILL $name: duplicate pid=$dup_pid"
      kill "$dup_pid" 2>/dev/null || true
    done
    # Ensure PID file points to the oldest
    echo "$oldest" > "$pid_file"
  fi
done

# Restart dead workers
if [[ ${#DEAD_WORKERS[@]} -gt 0 ]]; then
  log "RESTART: restarting ${#DEAD_WORKERS[@]} dead worker(s): ${DEAD_WORKERS[*]}"

  # Use the existing worker script to restart all workers.
  # It's safe to call start — it skips workers that are already running.
  if [[ -x "$WORKER_SCRIPT" ]]; then
    "$WORKER_SCRIPT" start >> "$WATCHDOG_LOG" 2>&1 || {
      log "ERROR: worker restart failed (exit=$?)"
    }
    log "RESTART: complete"
  else
    log "ERROR: worker script not found or not executable: $WORKER_SCRIPT"
  fi
else
  # Only log heartbeat every 6th run (~30 min) to avoid log spam
  MINUTE="$(date '+%M')"
  if [[ "$((MINUTE % 30))" -lt 5 ]]; then
    log "OK: all ${#WORKERS[@]} workers healthy"
  fi
fi
