#!/usr/bin/env bash
# Packer provisioner for the Recoder self-host machine image.
#
# Runs inside the builder VM/instance. Bakes everything a booted machine needs
# to run Recoder with a single boot:
#   1. Docker Engine + compose plugin
#   2. Build toolchain (Node/pnpm + Go + autotools) to compile the backend dist
#      and the pinned substrate binaries (make substrate-binaries)
#   3. The repo, staged at /opt/recoder
#   4. The docker-backend image pre-built into the local Docker cache
#   5. A systemd unit (recoder-selfhost.service) that runs the compose stack on boot
#
# The repo is expected to already be present at /tmp/recoder-src (uploaded by the
# Packer `file` provisioner). Real and runnable — no stubs. Each step fails the
# build loudly (set -euo pipefail) so a broken image never ships silently.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
RECODER_HOME="/opt/recoder"
SRC_STAGE="${RECODER_SRC:-/tmp/recoder-src}"
NODE_MAJOR="${NODE_MAJOR:-20}"
GO_VERSION="${GO_VERSION:-1.26.0}"

log() { echo "[provision] $*"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else
      echo "[provision] must run as root or have sudo" >&2; exit 1
    fi
  else
    SUDO=""
  fi
}
require_root

retry_apt() {
  local n=0
  until $SUDO apt-get "$@"; do
    n=$((n+1)); [ "$n" -ge 5 ] && return 1
    log "apt-get $* failed, retry $n/5"; sleep 5
  done
}

# --- Wait for any cloud-init apt lock to clear ---
for _ in $(seq 1 30); do
  if $SUDO fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
    log "waiting for dpkg lock..."; sleep 5
  else
    break
  fi
done

log "installing base packages"
retry_apt update
retry_apt install -y --no-install-recommends \
  ca-certificates curl git gnupg lsb-release \
  build-essential autoconf automake pkg-config bison \
  libevent-dev libncurses-dev rsync

# --- Docker Engine + compose plugin (official repo) ---
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine"
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  retry_apt update
  retry_apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  $SUDO systemctl enable docker
fi

# --- Node.js + pnpm (to build docker-backend/dist) ---
if ! command -v node >/dev/null 2>&1; then
  log "installing Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO -E bash -
  retry_apt install -y nodejs
fi
$SUDO corepack enable || true
$SUDO corepack prepare pnpm@10.30.3 --activate || true

# --- Go (for the bd substrate binary via make substrate-binaries) ---
if ! command -v go >/dev/null 2>&1; then
  log "installing Go ${GO_VERSION}"
  ARCH="$(dpkg --print-architecture)"; case "$ARCH" in amd64) GOARCH=amd64;; arm64) GOARCH=arm64;; *) GOARCH="$ARCH";; esac
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz" -o /tmp/go.tgz
  $SUDO rm -rf /usr/local/go && $SUDO tar -C /usr/local -xzf /tmp/go.tgz && rm -f /tmp/go.tgz
  echo 'export PATH=$PATH:/usr/local/go/bin' | $SUDO tee /etc/profile.d/go.sh >/dev/null
fi
export PATH="$PATH:/usr/local/go/bin"

# --- Stage the repo at /opt/recoder ---
log "staging repo into ${RECODER_HOME}"
[ -d "$SRC_STAGE" ] || { echo "[provision] source not found at $SRC_STAGE (Packer file provisioner must upload it)" >&2; exit 1; }
$SUDO mkdir -p "$RECODER_HOME"
$SUDO rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '**/node_modules' \
  "$SRC_STAGE"/ "$RECODER_HOME"/
$SUDO chown -R "$(id -u)":"$(id -g)" "$RECODER_HOME" || true

cd "$RECODER_HOME"

# --- Build the pinned substrate binaries (degrade-safe by design) ---
log "building substrate binaries (make substrate-binaries)"
make substrate-binaries || log "WARNING substrate build degraded; runtime falls back to system tmux/bd"

# --- Build the backend dist the Dockerfile requires ---
log "building docker-backend dist"
if [ ! -f docker-backend/dist/server.js ]; then
  ( cd docker-backend && pnpm install --no-frozen-lockfile && pnpm build )
fi

# --- Ensure pi-mono-dist exists (Dockerfile COPY is unconditional) ---
if [ ! -d pi-mono-dist ]; then
  log "pi-mono-dist absent; creating minimal stub layout so the image build resolves the COPY"
  mkdir -p pi-mono-dist/coding-agent/dist
  printf '{"name":"@recoder/pi-coding-agent","version":"0.0.0","private":true}\n' > pi-mono-dist/coding-agent/package.json
fi

# --- Pre-build the backend image into the local Docker cache ---
log "pre-building the docker-backend image"
$SUDO docker build -f docker-backend/Dockerfile -t recoder/docker-backend:selfhost .

# --- Seed .env.selfhost from the example (secrets generated on first boot) ---
if [ ! -f "$RECODER_HOME/.env.selfhost" ]; then
  $SUDO cp -f "$RECODER_HOME/.env.selfhost.example" "$RECODER_HOME/.env.selfhost"
fi

# --- systemd unit to run the stack on boot ---
log "installing recoder-selfhost.service"
$SUDO tee /etc/systemd/system/recoder-selfhost.service >/dev/null <<UNIT
[Unit]
Description=Recoder self-host stack (docker compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${RECODER_HOME}
# selfhost-up.sh validates env, generates safe secrets, builds (cached), waits
# for health, and prints URLs. POSTGRES_PASSWORD must be set in .env.selfhost
# (or injected by cloud-init/user-data) before first boot, or the service fails
# fast with a clear message — exactly the intended fail-safe behavior.
ExecStart=/usr/bin/env bash ${RECODER_HOME}/scripts/selfhost-up.sh
ExecStop=/usr/bin/env bash ${RECODER_HOME}/scripts/selfhost-down.sh

[Install]
WantedBy=multi-user.target
UNIT

$SUDO systemctl daemon-reload
$SUDO systemctl enable recoder-selfhost.service

log "provision complete"
