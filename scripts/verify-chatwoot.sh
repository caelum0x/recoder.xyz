#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-remote}"
REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_DIR="${REMOTE_DIR:-/root/recoder.xyz}"

check_cmd='
set -euo pipefail

echo "== Chatwoot Bootstrap State =="
init_state="$(docker inspect --format "{{.State.Status}}" recoder-chatwoot-init)"
init_exit="$(docker inspect --format "{{.State.ExitCode}}" recoder-chatwoot-init)"
echo "recoder-chatwoot-init state=${init_state} exit_code=${init_exit}"
test "${init_state}" = "exited"
test "${init_exit}" = "0"

echo
echo "== Chatwoot Runtime State =="
state="$(docker inspect --format "{{.State.Status}}" recoder-chatwoot)"
health="$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" recoder-chatwoot)"
restarts="$(docker inspect --format "{{.RestartCount}}" recoder-chatwoot)"
echo "recoder-chatwoot state=${state} health=${health} restarts=${restarts}"
test "${state}" = "running"

if [[ "${health}" != "healthy" ]]; then
  echo "waiting for Chatwoot health to settle..."
  for attempt in $(seq 1 20); do
    sleep 6
    state="$(docker inspect --format "{{.State.Status}}" recoder-chatwoot)"
    health="$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" recoder-chatwoot)"
    echo "  attempt=${attempt} state=${state} health=${health}"
    test "${state}" = "running"
    if [[ "${health}" == "healthy" ]]; then
      break
    fi
  done
fi

test "${health}" = "healthy"

echo
echo "== Chatwoot HTTP Check =="
status="$(curl -sS -H "Host: chat.recoder.xyz" -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/auth/sign_in || true)"
echo "chatwoot_auth_sign_in=${status}"
case "${status}" in
  200|302|303|307|308) ;;
  *) echo "FAIL unexpected Chatwoot auth/sign_in status: ${status}" >&2; exit 1 ;;
esac

echo
echo "PASS chatwoot bootstrap and runtime are healthy"
'

if [[ "${TARGET}" == "local" ]]; then
  bash -lc "${check_cmd}"
  exit 0
fi

if [[ "${TARGET}" == "remote" ]]; then
  ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${REMOTE_HOST}" "cd '${REMOTE_DIR}' && bash -lc '${check_cmd}'"
  exit 0
fi

echo "Usage: $0 [local|remote]" >&2
exit 1
