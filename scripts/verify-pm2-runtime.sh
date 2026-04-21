#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_DIR="${REMOTE_DIR:-/root/recoder.xyz}"

SSH_OPTS=(-o StrictHostKeyChecking=no)
if [[ -f "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

ssh_remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "$@"
}

echo "== PM2 runtime verification =="
echo "target: $REMOTE_HOST"

ssh_remote "bash -s" <<'ENDSSH'
set -euo pipefail

cd "${REMOTE_DIR:-/root/recoder.xyz}"

required_apps=(
  recoder-app
  recoder-agents
  recoder-backend
  recoder-studio
  recoder-agency
  recoder-pm
)

echo "--- PM2 status ---"
pm2 status

for app in "${required_apps[@]}"; do
  status="$(pm2 jlist | node -e '
    const fs = require("fs");
    const appName = process.argv[1];
    const list = JSON.parse(fs.readFileSync(0, "utf8"));
    const match = list.find((entry) => entry.name === appName);
    if (!match) process.exit(2);
    process.stdout.write(match.pm2_env?.status || "");
  ' "$app")" || {
    echo "FAIL missing PM2 app: $app" >&2
    exit 1
  }

  echo "$app status=$status"
  if [[ "$status" != "online" ]]; then
    echo "FAIL PM2 app not online: $app" >&2
    exit 1
  fi
done

echo "--- PM2 health endpoints ---"
app_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"
agents_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/ || true)"
backend_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/docs || true)"
agency_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3007/ || true)"
pm_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3004/ || true)"

echo "recoder-app=$app_code"
echo "recoder-agents=$agents_code"
echo "recoder-backend-docs=$backend_code"
echo "recoder-agency=$agency_code"
echo "recoder-pm=$pm_code"

test "$app_code" = "200"
test "$agents_code" = "200"
test "$backend_code" = "200"
case "$studio_code" in 200|301|302|307|308) ;; *) exit 1 ;; esac
case "$agency_code" in 200|301|302|307|308) ;; *) exit 1 ;; esac
test "$pm_code" = "200"

echo "PASS PM2 runtime verification"
ENDSSH
