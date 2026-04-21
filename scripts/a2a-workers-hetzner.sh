#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${A2A_WORKER_ENV_FILE:-$ROOT_DIR/.env.a2a.workers}"
LOG_DIR="${A2A_WORKER_LOG_DIR:-$ROOT_DIR/logs/a2a-workers}"
RUN_DIR="${A2A_WORKER_RUN_DIR:-$ROOT_DIR/.run/a2a-workers}"

mkdir -p "$LOG_DIR" "$RUN_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Always overlay deploy-time secrets if available.
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

# Guard against stale template values like redis://:changeme@...
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
  if [[ -z "${RECODER_A2A_REDIS_URL:-}" || "${RECODER_A2A_REDIS_URL}" == *":changeme@"* ]]; then
    RECODER_A2A_REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379/0"
  fi
  if [[ -n "${REDIS_URL:-}" && "${REDIS_URL}" == *":changeme@"* ]]; then
    REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379/0"
  fi
fi

if [[ -z "${RECODER_A2A_REDIS_URL:-}" && -n "${REDIS_URL:-}" ]]; then
  RECODER_A2A_REDIS_URL="$REDIS_URL"
fi

if [[ -z "${RECODER_A2A_REDIS_URL:-}" ]]; then
  echo "RECODER_A2A_REDIS_URL (or REDIS_URL) is required" >&2
  exit 1
fi

start_worker() {
  local name="$1"
  local command="$2"
  local service_id="$3"
  local handler_base="$4"
  local pid_file="$RUN_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name already running (pid=$(cat "$pid_file"))"
    return 0
  fi

  echo "starting $name"
  local plan_handler="${RECODER_A2A_PLAN_HANDLER_URL:-${handler_base}/api/a2a/intents/plan}"
  local execute_handler="${RECODER_A2A_EXECUTE_HANDLER_URL:-${handler_base}/api/a2a/intents/execute}"
  local handoff_handler="${RECODER_A2A_HANDOFF_HANDLER_URL:-${handler_base}/api/a2a/intents/handoff}"
  local tool_call_handler="${RECODER_A2A_TOOL_CALL_HANDLER_URL:-${handler_base}/api/a2a/intents/tool_call}"
  local effective_redis_url="${RECODER_A2A_REDIS_URL:-${REDIS_URL:-}}"
  if [[ "${effective_redis_url}" == *":changeme@"* && -n "${REDIS_PASSWORD:-}" ]]; then
    effective_redis_url="redis://:${REDIS_PASSWORD}@127.0.0.1:6379/0"
  fi
  (
    cd "$ROOT_DIR"
    nohup env \
      RECODER_A2A_REDIS_URL="$effective_redis_url" \
      REDIS_URL="$effective_redis_url" \
      RECODER_A2A_CONSUMER_SERVICE="$service_id" \
      RECODER_A2A_CONSUMER_NAME="${name}-$(hostname)-$$" \
      RECODER_A2A_PLAN_HANDLER_URL="$plan_handler" \
      RECODER_A2A_EXECUTE_HANDLER_URL="$execute_handler" \
      RECODER_A2A_HANDOFF_HANDLER_URL="$handoff_handler" \
      RECODER_A2A_TOOL_CALL_HANDLER_URL="$tool_call_handler" \
      $command \
      >>"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
}

stop_worker() {
  local name="$1"
  local pattern="$2"
  local pid_file="$RUN_DIR/$name.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name not running"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "stopping $name (pid=$pid)"
    kill "$pid" || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" || true
    fi
  fi

  rm -f "$pid_file"

  if [[ -n "$pattern" ]]; then
    pkill -f "$pattern" 2>/dev/null || true
  fi
}

status_worker() {
  local name="$1"
  local pattern="$2"
  local pid_file="$RUN_DIR/$name.pid"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name: running (pid=$(cat "$pid_file"))"
  elif [[ -n "$pattern" ]] && pgrep -f "$pattern" >/dev/null 2>&1; then
    local pid
    pid="$(pgrep -f "$pattern" | head -n1)"
    echo "$name: running (pid=${pid})"
  else
    echo "$name: stopped"
  fi
}

kill_existing_workers() {
  # Best-effort cleanup for orphan worker processes from previous runs.
  pkill -f "pnpm -C recoder-web a2a:worker" 2>/dev/null || true
  pkill -f "pnpm -C recoder-agency/apps/agency a2a:worker" 2>/dev/null || true
  pkill -f "pnpm -C recoder-pm/apps/api a2a:worker" 2>/dev/null || true
  pkill -f "pnpm -C docker-backend a2a:worker" 2>/dev/null || true
  pkill -f "a2a-intent-worker" 2>/dev/null || true
  rm -f "$RUN_DIR"/*.pid 2>/dev/null || true
}

case "${1:-}" in
  start)
    kill_existing_workers
    start_worker "recoder-web" "pnpm -C recoder-web a2a:worker" "recoder_web" "${RECODER_WEB_INTERNAL_URL:-http://127.0.0.1:5173}"
    start_worker "recoder-agency" "pnpm -C recoder-agency/apps/agency a2a:worker" "recoder_agency" "${RECODER_AGENCY_INTERNAL_URL:-http://127.0.0.1:3007}"
    start_worker "recoder-pm-api" "pnpm -C recoder-pm/apps/api a2a:worker" "recoder_pm" "${RECODER_PM_API_INTERNAL_URL:-http://127.0.0.1:3004}"
    start_worker "docker-backend" "pnpm -C docker-backend a2a:worker" "recoder_backend" "${DOCKER_BACKEND_INTERNAL_URL:-http://127.0.0.1:3100}"
    ;;
  stop)
    stop_worker "recoder-web" "pnpm -C recoder-web a2a:worker"
    stop_worker "recoder-agency" "pnpm -C recoder-agency/apps/agency a2a:worker"
    stop_worker "recoder-pm-api" "pnpm -C recoder-pm/apps/api a2a:worker"
    stop_worker "docker-backend" "pnpm -C docker-backend a2a:worker"
    kill_existing_workers
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    status_worker "recoder-web" "pnpm -C recoder-web a2a:worker"
    status_worker "recoder-agency" "pnpm -C recoder-agency/apps/agency a2a:worker"
    status_worker "recoder-pm-api" "pnpm -C recoder-pm/apps/api a2a:worker"
    status_worker "docker-backend" "pnpm -C docker-backend a2a:worker"
    ;;
  logs)
    tail -n 150 -f "$LOG_DIR"/*.log
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
