#!/usr/bin/env bash
# =============================================================================
# A2A Worker Liveness Watchdog
#
# Install as cron job:
#   */5 * * * * /path/to/scripts/a2a-worker-watchdog.sh
#
# Checks each A2A worker is alive. Restarts dead workers, kills duplicates.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${A2A_WATCHDOG_LOG_DIR:-/var/log/recoder}"
LOG_FILE="${A2A_WATCHDOG_LOG_FILE:-$LOG_DIR/worker-watchdog.log}"
LOCK_FILE="${A2A_WATCHDOG_LOCK_FILE:-/tmp/a2a-worker-watchdog.lock}"
WORKER_SCRIPT="$ROOT_DIR/scripts/a2a-workers-hetzner.sh"
LOG_MAX_BYTES="${A2A_WATCHDOG_LOG_MAX_BYTES:-10485760}"  # 10MB

mkdir -p "$LOG_DIR"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    exit 0
  fi
fi

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(timestamp)] $*" | tee -a "$LOG_FILE"; }

if [[ ! -x "$WORKER_SCRIPT" ]]; then
  log "ERROR watchdog cannot execute worker script: $WORKER_SCRIPT"
  exit 1
fi

# name|pgrep pattern used by the worker script
WORKERS=(
  "recoder-agency|pnpm -C recoder-agency/apps/agency a2a:worker"
  "recoder-pm-api|pnpm -C recoder-pm/apps/api a2a:worker"
  "docker-backend|pnpm -C docker-backend a2a:worker"
)

any_stopped=0
any_duplicate_fixed=0

for entry in "${WORKERS[@]}"; do
  name="${entry%%|*}"
  pattern="${entry##*|}"

  pids=()
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(pgrep -f "$pattern" 2>/dev/null || true)
  count="${#pids[@]}"

  if (( count == 0 )); then
    log "WARN $name is stopped"
    any_stopped=1
    continue
  fi

  if (( count > 1 )); then
    oldest="${pids[0]}"
    for pid in "${pids[@]:1}"; do
      if [[ "$pid" -lt "$oldest" ]]; then
        oldest="$pid"
      fi
    done

    for pid in "${pids[@]}"; do
      if [[ "$pid" != "$oldest" ]]; then
        kill "$pid" 2>/dev/null || true
        sleep 1
        kill -9 "$pid" 2>/dev/null || true
      fi
    done

    log "WARN $name had $count processes; kept pid=$oldest and removed duplicates"
    any_duplicate_fixed=1
  else
    log "OK $name pid=${pids[0]}"
  fi
done

if (( any_stopped == 1 )); then
  log "ACTION restarting all A2A workers (at least one worker was stopped)"
  if "$WORKER_SCRIPT" restart >>"$LOG_FILE" 2>&1; then
    log "OK worker restart completed"
  else
    log "ERROR worker restart failed"
    exit 1
  fi
elif (( any_duplicate_fixed == 1 )); then
  log "OK duplicate cleanup applied; no restart required"
else
  log "OK all workers healthy"
fi

# --- Log rotation ---
if [[ -f "$LOG_FILE" ]]; then
  size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if (( size > LOG_MAX_BYTES )); then
    mv "$LOG_FILE" "${LOG_FILE}.old"
    log "LOG rotated (previous was ${size} bytes)"
  fi
fi
