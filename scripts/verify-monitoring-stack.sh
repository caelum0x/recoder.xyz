#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-remote}"
REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_DIR="${REMOTE_DIR:-/root/recoder.xyz}"

check_cmd='
set -euo pipefail
containers=(
  recoder-victoriametrics
  recoder-alertmanager
  recoder-node-exporter
  recoder-redis-exporter
  recoder-blackbox-exporter
  recoder-redis
)

echo "== Monitoring Container State =="
for c in "${containers[@]}"; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "FAIL missing container: $c" >&2
    exit 1
  fi

  state="$(docker inspect --format "{{.State.Status}}" "$c")"
  health="$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" "$c")"
  restarts="$(docker inspect --format "{{.RestartCount}}" "$c")"

  echo "$c state=$state health=$health restarts=$restarts"

  if [[ "$state" != "running" ]]; then
    echo "FAIL container not running: $c (state=$state)" >&2
    exit 1
  fi

  if [[ "$health" == "healthy" || "$health" == "none" ]]; then
    continue
  fi

  # Allow transient startup/recovery windows before failing.
  echo "waiting for container health: $c (current=$health)"
  for attempt in $(seq 1 20); do
    sleep 3
    state="$(docker inspect --format "{{.State.Status}}" "$c")"
    health="$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" "$c")"
    echo "  attempt=${attempt} $c state=$state health=$health"
    if [[ "$state" != "running" ]]; then
      echo "FAIL container not running during health wait: $c (state=$state)" >&2
      exit 1
    fi
    if [[ "$health" == "healthy" || "$health" == "none" ]]; then
      break
    fi
  done

  if [[ "$health" != "healthy" && "$health" != "none" ]]; then
    # Health status is advisory for some exporter images; hard gate is endpoint checks below.
    echo "WARN unhealthy container after wait: $c (health=$health) -- continuing to endpoint verification"
  fi
done

echo
echo "== Monitoring Endpoint Health =="
vm="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:9090/-/healthy || true)"
am="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:9093/-/healthy || true)"
nodeexp="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:9100/metrics || true)"
redisexp="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:9121/metrics || true)"
blackbox="$(curl -sS -o /dev/null -w "%{http_code}" 'http://127.0.0.1:9115/probe?target=https://recoder.xyz&module=http_public_site' || true)"

echo "victoriametrics=$vm"
echo "alertmanager=$am"
echo "node-exporter=$nodeexp"
echo "redis-exporter=$redisexp"
echo "blackbox-exporter=$blackbox"

test "$vm" = "200"
test "$am" = "200"
test "$nodeexp" = "200"
test "$redisexp" = "200"
test "$blackbox" = "200"

echo
echo "PASS monitoring stack is healthy"
'

if [[ "$TARGET" == "local" ]]; then
  bash -lc "$check_cmd"
  exit 0
fi

if [[ "$TARGET" == "remote" ]]; then
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_HOST" "cd '$REMOTE_DIR' && bash -lc '$check_cmd'"
  exit 0
fi

echo "Usage: $0 [local|remote]" >&2
exit 1
