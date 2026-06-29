#!/usr/bin/env bash
#
# recoder-services.sh — single launcher for the py/ sidecar services that the
# docker-backend connects to via env-var seams.
#
#   colbert  → COLBERT_RERANK_URL   (POST /rerank, GET /health)        :8893
#   billing  → BILLING_BASE_URL     (/internal/agent-os/billing/health):8896
#   ops      → ops-recorder         (work-signals detector, /health)   :8897
#   mem0     → MEM0_BASE_URL         (self-hosted mem0 FastAPI server)  :8888
#
# Subcommands:
#   up   [service]   start one service (or all). Creates a per-service venv with
#                    ONLY the lightweight deps, never torch/faiss. Writes a pidfile.
#   down [service]   stop one service (or all) via its pidfile.
#   health [service] probe one service (or all) and report truthful status:
#                    running? reachable? which deps are missing?
#
# Design: degrade-safe and HONEST. A service whose heavy/runtime deps are absent
# is reported as such — the launcher never fakes "healthy". Each service is
# independent: one missing dep does not block the others.
#
# Env overrides (per service): COLBERT_PORT, BILLING_PORT, OPS_PORT, MEM0_PORT,
# HOST (default 127.0.0.1), RECODER_SERVICES_PYTHON (python interpreter).

set -uo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PY_DIR="${REPO_ROOT}/py"
RUN_DIR="${RECODER_SERVICES_RUN_DIR:-${REPO_ROOT}/.recoder-services}"
LOG_DIR="${RUN_DIR}/logs"
VENV_ROOT="${RUN_DIR}/venvs"

HOST="${HOST:-127.0.0.1}"
PYTHON="${RECODER_SERVICES_PYTHON:-python3}"

COLBERT_PORT="${COLBERT_PORT:-8893}"
BILLING_PORT="${BILLING_PORT:-8896}"
OPS_PORT="${OPS_PORT:-8897}"
MEM0_PORT="${MEM0_PORT:-8888}"

SERVICES=(colbert billing ops mem0)

mkdir -p "${RUN_DIR}" "${LOG_DIR}" "${VENV_ROOT}" 2>/dev/null || true

# ── Small helpers ────────────────────────────────────────────────────────────
c_red()   { printf '\033[31m%s\033[0m' "$1"; }
c_green() { printf '\033[32m%s\033[0m' "$1"; }
c_yellow(){ printf '\033[33m%s\033[0m' "$1"; }

log()  { printf '%s  %s\n' "[recoder-services]" "$*"; }
err()  { printf '%s  %s\n' "[recoder-services]" "$(c_red "$*")" >&2; }

pidfile()  { printf '%s/%s.pid' "${RUN_DIR}" "$1"; }
logfile()  { printf '%s/%s.log' "${LOG_DIR}" "$1"; }
venvdir()  { printf '%s/%s' "${VENV_ROOT}" "$1"; }
venvpy()   { printf '%s/bin/python' "$(venvdir "$1")"; }

port_for() {
  case "$1" in
    colbert) echo "${COLBERT_PORT}" ;;
    billing) echo "${BILLING_PORT}" ;;
    ops)     echo "${OPS_PORT}" ;;
    mem0)    echo "${MEM0_PORT}" ;;
  esac
}

# Backend env var that consumes the service (for the report).
seam_for() {
  case "$1" in
    colbert) echo "COLBERT_RERANK_URL" ;;
    billing) echo "BILLING_BASE_URL" ;;
    ops)     echo "ops-recorder (pushes to backend /api/conductor/work-signals)" ;;
    mem0)    echo "MEM0_BASE_URL" ;;
  esac
}

# Health URL path per service.
health_url() {
  local svc="$1" port; port="$(port_for "$svc")"
  case "$svc" in
    colbert) echo "http://${HOST}:${port}/health" ;;
    billing) echo "http://${HOST}:${port}/internal/agent-os/billing/health" ;;
    ops)     echo "http://${HOST}:${port}/health" ;;
    mem0)    echo "http://${HOST}:${port}/docs" ;;
  esac
}

is_running() {
  local pf; pf="$(pidfile "$1")"
  [[ -f "${pf}" ]] || return 1
  local pid; pid="$(cat "${pf}" 2>/dev/null)"
  [[ -n "${pid}" ]] || return 1
  kill -0 "${pid}" 2>/dev/null
}

# ── Dependency probing (truthful, never installs heavy ML deps) ──────────────
# Echoes a space-separated list of MISSING importable modules for a service,
# using whichever python that service would run under.
missing_deps() {
  local svc="$1" py; py="$(service_python "$svc")"
  local mods=()
  case "$svc" in
    colbert) mods=(flask) ;;                       # torch/colbert are heavy + GUARDED
    billing) mods=(fastapi uvicorn jwt) ;;         # jwt = PyJWT
    ops)     mods=(fastapi uvicorn pydantic) ;;    # asyncpg is GUARDED (in-memory fallback)
    mem0)    mods=(fastapi uvicorn mem0 psycopg sqlalchemy slowapi dotenv) ;;
  esac
  local missing=()
  local m
  for m in "${mods[@]}"; do
    "${py}" -c "import ${m}" >/dev/null 2>&1 || missing+=("${m}")
  done
  # Guard the empty-array expansion under `set -u`.
  printf '%s' "${missing[*]:-}"
}

# The python interpreter a service runs under: its venv if present, else system.
service_python() {
  local vp; vp="$(venvpy "$1")"
  if [[ -x "${vp}" ]]; then echo "${vp}"; else echo "${PYTHON}"; fi
}

# Lightweight pip requirements per service (NEVER torch/faiss).
light_requirements() {
  case "$1" in
    colbert) echo "flask" ;;
    billing) echo "fastapi uvicorn pyjwt" ;;
    ops)     echo "fastapi 'uvicorn[standard]' pydantic pydantic-settings httpx python-dotenv" ;;
    mem0)    echo "" ;;   # mem0 needs its own requirements.txt + Postgres; handled below
  esac
}

# Create (idempotently) a per-service venv with only the lightweight deps.
ensure_venv() {
  local svc="$1" vd; vd="$(venvdir "$svc")"
  if [[ "${svc}" == "mem0" ]]; then
    err "mem0: skipping auto-venv. It is a full upstream server needing its own"
    err "      requirements (py/mem0/server/requirements.txt) + Postgres/pgvector."
    err "      Install manually, then 'up mem0' will launch uvicorn against it."
    return 1
  fi
  if [[ ! -x "$(venvpy "$svc")" ]]; then
    log "${svc}: creating venv at ${vd}"
    "${PYTHON}" -m venv "${vd}" || { err "${svc}: venv creation failed"; return 1; }
  fi
  local reqs; reqs="$(light_requirements "$svc")"
  if [[ -n "${reqs}" ]]; then
    log "${svc}: installing lightweight deps (${reqs}) — no torch/faiss"
    # shellcheck disable=SC2086
    "$(venvpy "$svc")" -m pip install --quiet --upgrade pip >/dev/null 2>&1
    # shellcheck disable=SC2086
    if ! eval "\"$(venvpy "$svc")\" -m pip install --quiet ${reqs}"; then
      err "${svc}: pip install failed (offline / disk?). Service may run degraded."
      return 1
    fi
  fi
  return 0
}

# ── Start command per service ────────────────────────────────────────────────
# Echoes the argv to exec (already cd'd into the right dir by start()).
start_cmd() {
  local svc="$1" py; py="$(service_python "$svc")"
  case "$svc" in
    colbert) echo "${py} ${PY_DIR}/colbert/rerank_server.py" ;;
    billing) echo "${py} -m uvicorn recoder_billing.app:app --host ${HOST} --port ${BILLING_PORT}" ;;
    ops)     echo "${py} -m uvicorn main:app --host ${HOST} --port ${OPS_PORT}" ;;
    mem0)    echo "${py} -m uvicorn main:app --host ${HOST} --port ${MEM0_PORT}" ;;
  esac
}

# Working directory per service (for module-relative imports).
work_dir() {
  case "$1" in
    colbert) echo "${PY_DIR}/colbert" ;;
    billing) echo "${PY_DIR}/recoder-billing" ;;
    ops)     echo "${PY_DIR}/ops-recorder/work-signals" ;;
    mem0)    echo "${PY_DIR}/mem0/server" ;;
  esac
}

start() {
  local svc="$1"
  if is_running "${svc}"; then
    log "${svc}: already running (pid $(cat "$(pidfile "$svc")"))"
    return 0
  fi

  # Best-effort venv + deps (mem0 is manual; others auto-provision lightweight).
  if [[ "${svc}" != "mem0" ]]; then
    ensure_venv "${svc}" || log "${svc}: continuing with system python (degraded possible)"
  fi

  local miss; miss="$(missing_deps "${svc}")"
  if [[ -n "${miss}" ]]; then
    err "${svc}: missing deps [${miss}] — cannot start cleanly."
    case "${svc}" in
      mem0) err "      Install: pip install -r ${PY_DIR}/mem0/server/requirements.txt (+ Postgres/pgvector)." ;;
      *)    err "      Re-run 'up ${svc}' with network/disk available to auto-install." ;;
    esac
    return 1
  fi

  local wd cmd port
  wd="$(work_dir "${svc}")"; cmd="$(start_cmd "${svc}")"; port="$(port_for "${svc}")"
  local lf; lf="$(logfile "${svc}")"
  export PORT="${port}" HOST="${HOST}"
  log "${svc}: starting on ${HOST}:${port} (log: ${lf})"
  # shellcheck disable=SC2086
  ( cd "${wd}" && exec ${cmd} ) >>"${lf}" 2>&1 &
  local pid=$!
  echo "${pid}" >"$(pidfile "${svc}")"
  sleep 1
  if is_running "${svc}"; then
    log "${svc}: started (pid ${pid})"
  else
    err "${svc}: exited immediately — see ${lf}"
    tail -n 15 "${lf}" 2>/dev/null | sed 's/^/    /'
    return 1
  fi
}

stop() {
  local svc="$1" pf; pf="$(pidfile "$svc")"
  if ! is_running "${svc}"; then
    log "${svc}: not running"
    rm -f "${pf}" 2>/dev/null
    return 0
  fi
  local pid; pid="$(cat "${pf}")"
  log "${svc}: stopping (pid ${pid})"
  kill "${pid}" 2>/dev/null
  for _ in 1 2 3 4 5; do
    is_running "${svc}" || break
    sleep 1
  done
  if is_running "${svc}"; then
    err "${svc}: did not stop, sending SIGKILL"
    kill -9 "${pid}" 2>/dev/null
  fi
  rm -f "${pf}" 2>/dev/null
  log "${svc}: stopped"
}

# Probe HTTP health. Echoes one of: ok | unhealthy | unreachable | no-curl
http_probe() {
  local url="$1"
  command -v curl >/dev/null 2>&1 || { echo "no-curl"; return; }
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "${url}" 2>/dev/null)"
  case "${code}" in
    200) echo "ok" ;;
    000) echo "unreachable" ;;
    503) echo "unhealthy" ;;     # billing reports 503 when secrets absent (truthful)
    *)   echo "http-${code}" ;;
  esac
}

health_one() {
  local svc="$1" port seam miss run http
  port="$(port_for "$svc")"; seam="$(seam_for "$svc")"
  miss="$(missing_deps "$svc")"
  if is_running "$svc"; then run="$(c_green running)"; else run="$(c_yellow stopped)"; fi
  http="$(http_probe "$(health_url "$svc")")"

  local depstr
  if [[ -z "${miss}" ]]; then depstr="$(c_green 'all present')"; else depstr="$(c_red "missing: ${miss}")"; fi

  printf '  %-8s  port=%-5s  state=%-18s  http=%-12s  deps=%s\n' \
    "${svc}" "${port}" "${run}" "${http}" "${depstr}"
  printf '             seam: %s\n' "${seam}"
}

cmd_health() {
  local target="${1:-}"
  log "Service health (HOST=${HOST}); run dir: ${RUN_DIR}"
  if [[ -n "${target}" ]]; then
    health_one "${target}"
  else
    local s
    for s in "${SERVICES[@]}"; do health_one "${s}"; done
  fi
}

cmd_up() {
  local target="${1:-}"
  if [[ -n "${target}" ]]; then start "${target}"; else
    local s
    for s in "${SERVICES[@]}"; do start "${s}" || true; done
  fi
}

cmd_down() {
  local target="${1:-}"
  if [[ -n "${target}" ]]; then stop "${target}"; else
    local s
    for s in "${SERVICES[@]}"; do stop "${s}" || true; done
  fi
}

usage() {
  cat <<EOF
recoder-services.sh — launcher for py/ backend sidecar services

Usage:
  scripts/recoder-services.sh up   [colbert|billing|ops|mem0]
  scripts/recoder-services.sh down [colbert|billing|ops|mem0]
  scripts/recoder-services.sh health [colbert|billing|ops|mem0]

Services & backend seams:
  colbert  COLBERT_RERANK_URL=http://${HOST}:${COLBERT_PORT}   (rerank, GET /health)
  billing  BILLING_BASE_URL=http://${HOST}:${BILLING_PORT}     (/internal/agent-os/billing/health)
  ops      ops-recorder work-signals detector :${OPS_PORT}     (GET /health)
  mem0     MEM0_BASE_URL=http://${HOST}:${MEM0_PORT}           (needs requirements.txt + Postgres)

Notes:
  - colbert/billing/ops auto-provision a per-service venv with ONLY lightweight deps.
  - Heavy ML deps (torch/faiss) are NEVER installed; colbert rerank degrades to a
    503 'rerank unavailable' until torch+colbert are installed manually.
  - mem0 is a full upstream server: install py/mem0/server/requirements.txt + run
    Postgres/pgvector yourself, then 'up mem0'.
EOF
}

main() {
  local sub="${1:-}"; shift || true
  case "${sub}" in
    up)     cmd_up "${1:-}" ;;
    down)   cmd_down "${1:-}" ;;
    health) cmd_health "${1:-}" ;;
    ""|-h|--help|help) usage ;;
    *) err "unknown subcommand: ${sub}"; usage; exit 2 ;;
  esac
}

main "$@"
