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
  ".env.production"
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
  "recoder-studio"
  "recoder-web/package.json"
)

RSYNC_EXCLUDES=(
  "--exclude=.git"
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

build_app "recoder-app" "$REMOTE_DIR/app" "./app" "pnpm exec prisma generate"
build_app "recoder-agents" "$REMOTE_DIR/recoder-agents" "./recoder-agents"
build_app "recoder-studio" "$REMOTE_DIR/recoder-studio" "./recoder-studio"
build_app "recoder-pm" "$REMOTE_DIR/recoder-pm/apps/web" "./recoder-pm/apps/web"
build_app "recoder-agency" "$REMOTE_DIR/recoder-agency/apps/agency" "./recoder-agency/apps/agency"

echo "--- Reload PM2 ecosystem ---"
cd "$REMOTE_DIR"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "--- PM2 status ---"
pm2 status
ENDSSH
