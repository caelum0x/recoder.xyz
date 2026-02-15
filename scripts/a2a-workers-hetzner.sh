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

if [[ -z "${RECODER_A2A_REDIS_URL:-${REDIS_URL:-}}" ]]; then
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
  (
    cd "$ROOT_DIR"
    nohup env \
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
}

status_worker() {
  local name="$1"
  local pid_file="$RUN_DIR/$name.pid"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name: running (pid=$(cat "$pid_file"))"
  else
    echo "$name: stopped"
  fi
}

case "${1:-}" in
  start)
    start_worker "recoder-web" "pnpm -C recoder-web a2a:worker" "recoder_web" "${RECODER_WEB_INTERNAL_URL:-http://127.0.0.1:5173}"
    start_worker "recoder-agency" "pnpm -C recoder-agency/apps/agency a2a:worker" "recoder_agency" "${RECODER_AGENCY_INTERNAL_URL:-http://127.0.0.1:3005}"
    start_worker "recoder-pm-api" "pnpm -C recoder-pm/apps/api a2a:worker" "recoder_pm" "${RECODER_PM_API_INTERNAL_URL:-http://127.0.0.1:3004}"
    start_worker "docker-backend" "pnpm -C docker-backend a2a:worker" "recoder_backend" "${DOCKER_BACKEND_INTERNAL_URL:-http://127.0.0.1:3100}"
    ;;
  stop)
    stop_worker "recoder-web"
    stop_worker "recoder-agency"
    stop_worker "recoder-pm-api"
    stop_worker "docker-backend"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    status_worker "recoder-web"
    status_worker "recoder-agency"
    status_worker "recoder-pm-api"
    status_worker "docker-backend"
    ;;
  logs)
    tail -n 150 -f "$LOG_DIR"/*.log
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
