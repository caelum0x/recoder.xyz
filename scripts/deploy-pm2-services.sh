#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_DIR="${REMOTE_DIR:-/root/recoder.xyz}"

SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=10)
if [[ -f "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

RSYNC_RSH="ssh ${SSH_OPTS[*]}"

SYNC_PATHS=(
  "ecosystem.config.js"
  "package.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "app"
  "backend"
  "internal-packages"
  "packages"
  "recoder-agency"
  "recoder-agents"
  "recoder-pm"
)

RSYNC_EXCLUDES=(
  "--exclude=.git"
  "--exclude=.env*"
  "--exclude=.venv"
  "--exclude=.pytest_cache"
  "--exclude=.mypy_cache"
  "--exclude=.ruff_cache"
  "--exclude=__pycache__"
  "--exclude=node_modules"
  "--exclude=.next"
  "--exclude=dist"
  "--exclude=coverage"
  "--exclude=logs"
  "--exclude=.turbo"
  "--exclude=.cache"
  "--exclude=.artifacts"
  "--exclude=*.tsbuildinfo"
  "--exclude=.DS_Store"
  "--exclude=data/backups"
)

ssh_remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "$@"
}

echo "== PM2 deploy =="
echo "target: $REMOTE_HOST"

echo "--- Check remote disk headroom ---"
available_kb="$(
  ssh_remote "df -Pk '$REMOTE_DIR' | awk 'NR==2 {print \$4}'"
)"

if [[ -z "$available_kb" ]]; then
  echo "FAIL could not determine free disk space on $REMOTE_HOST" >&2
  exit 1
fi

minimum_kb=$((2560 * 1024))
if (( available_kb < minimum_kb )); then
  echo "FAIL remote disk headroom too low for deploy: ${available_kb}KB available, need at least ${minimum_kb}KB" >&2
  exit 1
fi

echo "--- Sync PM2 runtime sources ---"
# Preserve server-managed env files. They may contain rotated secrets or host-only
# overrides that should not be overwritten by local rsync metadata/content.
for path in "${SYNC_PATHS[@]}"; do
  if [[ ! -e "$path" ]]; then
    continue
  fi

  rsync -avz --relative "${RSYNC_EXCLUDES[@]}" -e "$RSYNC_RSH" "./${path}" "${REMOTE_HOST}:${REMOTE_DIR}/"
done

ssh_remote "REMOTE_DIR='$REMOTE_DIR' bash -s" <<'ENDSSH'
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/root/recoder.xyz}"
cd "$REMOTE_DIR"

echo "--- Verify PM2 ecosystem file ---"
test -f ecosystem.config.js

echo "--- Prepare pnpm ---"
corepack enable
corepack prepare pnpm@10.30.3 --activate
corepack pnpm --version

export_app_env() {
  local app_dir="$1"
  local root_dir="${2:-$REMOTE_DIR}"

  export_env_file() {
    local env_file="$1"
    python3 - "$env_file" <<'PY'
import shlex
import sys

path = sys.argv[1]

with open(path, "r", encoding="utf-8") as handle:
    for raw in handle:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        print(f"export {key}={shlex.quote(value)}")
PY
  }

  for env_file in \
    "$root_dir/.env.production" \
    "$root_dir/.env.local" \
    "$root_dir/.env" \
    "$app_dir/.env.production" \
    "$app_dir/.env.local" \
    "$app_dir/.env"
  do
    if [[ -f "$env_file" ]]; then
      eval "$(export_env_file "$env_file")"
    fi
  done
}

build_app() {
  local label="$1"
  local app_dir="$2"
  local workspace_filter="$3"
  local prebuild_cmd="${4:-}"
  local build_cmd="${5:-build}"

  echo "--- Building $label ---"
  cd "$REMOTE_DIR"
  export_app_env "$app_dir"
  corepack pnpm --filter "$workspace_filter..." install --no-frozen-lockfile
  if [[ -n "$prebuild_cmd" ]]; then
    cd "$app_dir"
    eval "$prebuild_cmd"
    cd "$REMOTE_DIR"
  fi
  corepack pnpm --filter "$workspace_filter" run "$build_cmd"
}

build_auth_workspace() {
  echo "--- Building @recoder/auth workspace ---"
  cd "$REMOTE_DIR"
  export_app_env "$REMOTE_DIR/app"
  AUTH_DATABASE_URL="${AUTH_DATABASE_URL:-postgresql://build:build@localhost:5432/build}" \
    corepack pnpm --filter @recoder/auth... install --no-frozen-lockfile
  AUTH_DATABASE_URL="${AUTH_DATABASE_URL:-postgresql://build:build@localhost:5432/build}" \
    corepack pnpm --filter @recoder/auth run build
}

pm2_app_status() {
  local app_name="$1"

  pm2 jlist | node -e '
    const fs = require("fs");
    const appName = process.argv[1];
    const list = JSON.parse(fs.readFileSync(0, "utf8"));
    const match = list.find((entry) => entry.name === appName);
    if (!match) process.exit(2);
    process.stdout.write(match.pm2_env?.status || "");
  ' "$app_name"
}

require_pm2_online() {
  local app_name="$1"
  local status

  status="$(pm2_app_status "$app_name")" || {
    echo "FAIL missing PM2 app after reload: $app_name" >&2
    exit 1
  }

  echo "$app_name status=$status"
  if [[ "$status" != "online" ]]; then
    echo "FAIL PM2 app not online after reload: $app_name" >&2
    exit 1
  fi
}

require_http_status() {
  local label="$1"
  local url="$2"
  local expected_regex="$3"
  local status

  status="$(curl -sS -o /dev/null -w '%{http_code}' "$url" || true)"
  echo "$label=$status"
  if [[ ! "$status" =~ $expected_regex ]]; then
    echo "FAIL unexpected HTTP status for $label ($url): $status" >&2
    exit 1
  fi
}

build_auth_workspace
build_app "recoder-app" "$REMOTE_DIR/app" "./app" "pnpm exec prisma generate"
build_app "recoder-agents" "$REMOTE_DIR/recoder-agents" "./recoder-agents"
# recoder-studio removed (abandoned) — see docs/direction.md
build_app "recoder-pm" "$REMOTE_DIR/recoder-pm/apps/app" "./recoder-pm/apps/app"
build_app "recoder-agency" "$REMOTE_DIR/recoder-agency/apps/agency" "./recoder-agency/apps/agency"

echo "--- Reload PM2 ecosystem ---"
cd "$REMOTE_DIR"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "--- PM2 status ---"
pm2 status

echo "--- PM2 deploy verification ---"
require_pm2_online "recoder-app"
require_pm2_online "recoder-agents"
require_pm2_online "recoder-backend"
require_pm2_online "recoder-pm"
require_pm2_online "recoder-agency"

echo "--- PM2 health endpoints ---"
require_http_status "recoder-app" "http://127.0.0.1:3000/" '^200$'
require_http_status "recoder-agents" "http://127.0.0.1:3001/" '^(200|301|302|307|308)$'
require_http_status "recoder-backend-docs" "http://127.0.0.1:8000/docs" '^200$'
require_http_status "recoder-pm" "http://127.0.0.1:3004/" '^200$'
require_http_status "recoder-agency" "http://127.0.0.1:3007/" '^(200|301|302|307|308)$'
ENDSSH
