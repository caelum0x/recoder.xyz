#!/usr/bin/env bash
set -euo pipefail

find_running_container() {
  local explicit="${1:-}"
  local exact="${2:-}"
  local regex="${3:-}"
  local names found

  if [[ -n "$explicit" ]]; then
    echo "$explicit"
    return 0
  fi

  names="$(docker ps --format '{{.Names}}')"

  if [[ -n "$exact" ]] && grep -Fxq "$exact" <<<"$names"; then
    echo "$exact"
    return 0
  fi

  if [[ -n "$regex" ]]; then
    found="$(grep -E "$regex" <<<"$names" | head -n 1 || true)"
    if [[ -n "$found" ]]; then
      echo "$found"
      return 0
    fi
  fi

  return 1
}

ZROK2_CONTROLLER_CONTAINER="$(
  find_running_container \
    "${ZROK2_CONTROLLER_CONTAINER:-}" \
    "recoder-zrok2-controller" \
    'zrok2-controller'
)"
ZROK2_FRONTEND_CONTAINER="$(
  find_running_container \
    "${ZROK2_FRONTEND_CONTAINER:-}" \
    "recoder-zrok2-frontend" \
    'zrok2-frontend'
)"
DOCKER_BACKEND_CONTAINER="$(
  find_running_container \
    "${DOCKER_BACKEND_CONTAINER:-}" \
    "recoder-docker-backend" \
    'docker-backend'
)"

ZROK2_API_ENDPOINT="${ZROK2_API_ENDPOINT:-http://127.0.0.1:18080}"
PREVIEW_BASE_DOMAIN="${PREVIEW_BASE_DOMAIN:-preview.recoder.xyz}"
ZROK2_ENABLE_TOKEN="${ZROK2_ENABLE_TOKEN:-}"
DIAG_IMAGE="${DIAG_IMAGE:-nginx:1.27-alpine}"
DIAG_ID="$(date +%s)-$$"
DIAG_HOME="/tmp/zrok-diag-${DIAG_ID}"
DIAG_CONTAINER="recoder-zrok2-diag-http-${DIAG_ID}"
SHARE_LOG="/tmp/zrok2-share-${DIAG_ID}.log"
SHARE_TOKEN=""

cleanup() {
  if [[ -n "${SHARE_TOKEN:-}" ]]; then
    docker exec "$ZROK2_CONTROLLER_CONTAINER" sh -lc \
      "HOME='$DIAG_HOME' XDG_CONFIG_HOME='$DIAG_HOME/.config' ZROK2_API_ENDPOINT='$ZROK2_API_ENDPOINT' zrok2 delete share '$SHARE_TOKEN' >/dev/null 2>&1 || true" \
      >/dev/null 2>&1 || true
  fi

  docker rm -f "$DIAG_CONTAINER" >/dev/null 2>&1 || true

  docker exec "$ZROK2_CONTROLLER_CONTAINER" sh -lc \
    "HOME='$DIAG_HOME' XDG_CONFIG_HOME='$DIAG_HOME/.config' ZROK2_API_ENDPOINT='$ZROK2_API_ENDPOINT' zrok2 disable >/dev/null 2>&1 || true; rm -rf '$DIAG_HOME'" \
    >/dev/null 2>&1 || true

  rm -f "$SHARE_LOG"
}

trap cleanup EXIT

if [[ -z "$ZROK2_ENABLE_TOKEN" ]]; then
  ZROK2_ENABLE_TOKEN="$(
    docker inspect "$DOCKER_BACKEND_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | awk -F= '/^ZROK_TOKEN=/{print substr($0, 12)}' \
      | head -n 1
  )"
fi

if [[ -z "$ZROK2_ENABLE_TOKEN" ]]; then
  echo "Missing ZROK2 enable token. Set ZROK2_ENABLE_TOKEN or expose ZROK_TOKEN in $DOCKER_BACKEND_CONTAINER." >&2
  exit 1
fi

ZROK2_NETWORK="$(
  docker inspect "$ZROK2_CONTROLLER_CONTAINER" \
    | python3 -c 'import json,sys; data=json.load(sys.stdin)[0]; print(next(iter(data["NetworkSettings"]["Networks"])))'
)"

echo "[1/8] Verifying controller and frontend containers..."
docker ps --format '{{.Names}} {{.Status}}' \
  | grep -E "(${ZROK2_CONTROLLER_CONTAINER}|${ZROK2_FRONTEND_CONTAINER}|${DOCKER_BACKEND_CONTAINER})"

echo "[2/8] Starting disposable backend on network ${ZROK2_NETWORK}..."
docker rm -f "$DIAG_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$DIAG_CONTAINER" --network "$ZROK2_NETWORK" "$DIAG_IMAGE" >/dev/null

echo "[3/8] Verifying controller can reach the disposable backend..."
docker exec "$ZROK2_CONTROLLER_CONTAINER" sh -lc \
  "curl -sfI 'http://${DIAG_CONTAINER}:80' >/dev/null"

echo "[4/8] Enabling disposable zrok2 environment..."
docker exec "$ZROK2_CONTROLLER_CONTAINER" sh -lc \
  "rm -rf '$DIAG_HOME' && mkdir -p '$DIAG_HOME' && HOME='$DIAG_HOME' XDG_CONFIG_HOME='$DIAG_HOME/.config' ZROK2_API_ENDPOINT='$ZROK2_API_ENDPOINT' zrok2 enable --headless --description 'recoder-zrok2-diag' '$ZROK2_ENABLE_TOKEN' >/dev/null"

echo "[5/8] Starting disposable public share..."
docker exec "$ZROK2_CONTROLLER_CONTAINER" sh -lc \
  "HOME='$DIAG_HOME' XDG_CONFIG_HOME='$DIAG_HOME/.config' ZROK2_API_ENDPOINT='$ZROK2_API_ENDPOINT' timeout 25 zrok2 share public 'http://${DIAG_CONTAINER}:80' --headless -n public --open" \
  >"$SHARE_LOG" 2>&1 &
SHARE_PID=$!

for _ in $(seq 1 30); do
  SHARES_JSON="$(
    docker exec "$ZROK2_CONTROLLER_CONTAINER" sh -lc \
      "HOME='$DIAG_HOME' XDG_CONFIG_HOME='$DIAG_HOME/.config' ZROK2_API_ENDPOINT='$ZROK2_API_ENDPOINT' zrok2 list shares --json" \
      2>/dev/null || true
  )"

  SHARE_TOKEN="$(
    python3 - "$DIAG_CONTAINER" <<'PY' <<<"$SHARES_JSON"
import json
import sys

target = f"http://{sys.argv[1]}:80"
raw = sys.stdin.read().strip()
if not raw:
    raise SystemExit(0)

data = json.loads(raw)
for share in data.get("shares", []):
    if share.get("target") == target:
        print(share["shareToken"])
        raise SystemExit(0)
PY
  )"

  if [[ -n "$SHARE_TOKEN" ]]; then
    break
  fi

  if [[ -f "$SHARE_LOG" ]]; then
    SHARE_TOKEN="$(
      python3 - "$PREVIEW_BASE_DOMAIN" "$SHARE_LOG" <<'PY'
import re
import sys

domain = re.escape(sys.argv[1])
path = sys.argv[2]
pattern = re.compile(rf'([a-z0-9-]+)\.{domain}')

try:
    text = open(path, encoding="utf-8").read()
except FileNotFoundError:
    raise SystemExit(0)

match = pattern.search(text)
if match:
    print(match.group(1))
PY
    )"
  fi

  if [[ -n "$SHARE_TOKEN" ]]; then
    break
  fi

  sleep 1
done

if [[ -z "$SHARE_TOKEN" ]]; then
  echo "Failed to discover disposable share token. Share command log:" >&2
  sed -n '1,160p' "$SHARE_LOG" >&2 || true
  exit 1
fi

PREVIEW_URL="https://${SHARE_TOKEN}.${PREVIEW_BASE_DOMAIN}"

echo "[6/8] Waiting for public preview URL ${PREVIEW_URL}..."
for _ in $(seq 1 20); do
  if curl -skfI "$PREVIEW_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[7/8] Verifying public preview returns 200..."
STATUS_LINE="$(curl -skI "$PREVIEW_URL" | sed -n '1p')"
BODY_SNIPPET="$(curl -sk "$PREVIEW_URL" | sed -n '1,5p')"

if ! grep -q ' 200' <<<"$STATUS_LINE"; then
  echo "Expected HTTP 200 from ${PREVIEW_URL}, got: ${STATUS_LINE}" >&2
  echo "Share command log:" >&2
  sed -n '1,160p' "$SHARE_LOG" >&2 || true
  exit 1
fi

echo "[8/8] Cleaning up disposable share and environment..."
kill "$SHARE_PID" >/dev/null 2>&1 || true
wait "$SHARE_PID" >/dev/null 2>&1 || true

echo "Zrok2 share flow verified successfully."
echo "  Controller: ${ZROK2_CONTROLLER_CONTAINER}"
echo "  Frontend:   ${ZROK2_FRONTEND_CONTAINER}"
echo "  Network:    ${ZROK2_NETWORK}"
echo "  Preview:    ${PREVIEW_URL}"
echo "  Status:     ${STATUS_LINE}"
echo "  Body:"
echo "$BODY_SNIPPET"
