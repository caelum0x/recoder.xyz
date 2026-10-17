#!/usr/bin/env bash
# Recoder self-host: one-command install for a fresh Linux box.
#
#   sudo scripts/install-selfhost.sh
#
# What it does, in order (real and runnable — fails loudly, never fakes
# success):
#   1. Detects the OS. Linux only for the systemd path below; on macOS it
#      prints the (different, verified) manual path instead and exits 0.
#   2. Installs Docker Engine + Compose plugin via the official get.docker.com
#      convenience script, IF `docker` is not already on PATH. Skipped
#      entirely if Docker is already installed.
#   3. Seeds .env.selfhost from .env.selfhost.example if .env.selfhost does
#      not already exist. NEVER overwrites an existing .env.selfhost.
#   4. Installs deploy/systemd/recoder-selfhost.service to
#      /etc/systemd/system/, rewritten so WorkingDirectory/ExecStart/ExecStop
#      point at THIS repo checkout (not a hardcoded /opt/recoder).
#   5. `systemctl daemon-reload` + `systemctl enable` the unit — but does NOT
#      start it, because POSTGRES_PASSWORD must be set first (see output).
#
# What this script does NOT do: it does not build backend/dist, does not
# build the Loom engine, and does not fetch/configure AI provider keys. Those
# remain explicit, documented, owner-driven steps — see docs/SELF-HOST.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UNIT_SRC="$ROOT_DIR/deploy/systemd/recoder-selfhost.service"
UNIT_DEST="/etc/systemd/system/recoder-selfhost.service"
ENV_FILE="$ROOT_DIR/.env.selfhost"
ENV_EXAMPLE="$ROOT_DIR/.env.selfhost.example"

info() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# --- 1. OS detection ---
OS_NAME="$(uname -s)"
if [ "$OS_NAME" = "Darwin" ]; then
  cat <<'EOF'
This installs a systemd boot-time service, which macOS does not have.

On a Mac mini / macOS host, self-host Recoder like this instead:

  1. Install Docker Desktop (https://www.docker.com/products/docker-desktop).
  2. cp .env.selfhost.example .env.selfhost  # then set POSTGRES_PASSWORD
  3. scripts/selfhost-up.sh

There is no launchd auto-start-on-boot unit shipped yet (tracked as a known
gap in docs/SELF-HOST.md) — after a reboot, re-run scripts/selfhost-up.sh.
EOF
  exit 0
fi
if [ "$OS_NAME" != "Linux" ]; then
  die "unsupported OS: $OS_NAME (this script targets Linux; see docs/SELF-HOST.md for macOS/Windows notes)"
fi

# --- Require root for package install + systemd unit install ---
if [ "$(id -u)" -ne 0 ]; then
  die "run as root (sudo scripts/install-selfhost.sh) — installs packages and a systemd unit"
fi

[ -f "$UNIT_SRC" ] || die "unit file not found: $UNIT_SRC"

# --- 2. Docker (skip if already present) ---
if command -v docker >/dev/null 2>&1; then
  info "docker already installed ($(docker --version)), skipping install"
else
  info "docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  die "docker installed but Compose v2/legacy not found — install the compose plugin and re-run"
fi

systemctl is-active --quiet docker 2>/dev/null || systemctl enable --now docker 2>/dev/null || true

# --- 3. Seed .env.selfhost (never overwrite) ---
if [ -f "$ENV_FILE" ]; then
  info ".env.selfhost already exists, leaving it untouched"
else
  [ -f "$ENV_EXAMPLE" ] || die "neither .env.selfhost nor .env.selfhost.example exists in $ROOT_DIR"
  info "creating .env.selfhost from template"
  cp -f "$ENV_EXAMPLE" "$ENV_FILE"
fi

# --- 4. Install the systemd unit, rewritten for THIS checkout's path ---
info "installing recoder-selfhost.service (WorkingDirectory=$ROOT_DIR)"
sed \
  -e "s|WorkingDirectory=/opt/recoder|WorkingDirectory=$ROOT_DIR|" \
  -e "s|ExecStart=/usr/bin/env bash /opt/recoder/scripts/selfhost-up.sh|ExecStart=/usr/bin/env bash $ROOT_DIR/scripts/selfhost-up.sh|" \
  -e "s|ExecStop=/usr/bin/env bash /opt/recoder/scripts/selfhost-down.sh|ExecStop=/usr/bin/env bash $ROOT_DIR/scripts/selfhost-down.sh|" \
  "$UNIT_SRC" > "$UNIT_DEST"

# --- 5. Enable (not start — POSTGRES_PASSWORD still needs to be set) ---
systemctl daemon-reload
systemctl enable recoder-selfhost.service

cat <<EOF

Installed. Before starting the service:

  1. Edit $ENV_FILE and set POSTGRES_USER / POSTGRES_PASSWORD
     (required — selfhost-up.sh fails fast without them).
  2. Optionally set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY
     (BYOK — consumed by the agent CLI inside a workspace pane, not by
     Recoder itself).

Then bring it up (builds + waits for health, bounded at 600s):

  systemctl start recoder-selfhost.service
  systemctl status recoder-selfhost.service
  journalctl -u recoder-selfhost.service -f

It will also start automatically on every future boot.

See docs/SELF-HOST.md for the known gaps this install does not paper over
(notably: the backend image does not yet bake the Loom workspace-substrate
binary — set CONDUCTOR_LOOM_DISABLED=1 in .env.selfhost to use the tmux
substrate instead, or build Loom yourself — see that doc for exact steps).
EOF
