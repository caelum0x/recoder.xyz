#!/usr/bin/env bash
# Install an already-enrolled OpenZiti dial identity for Finder-launched Recoder.

set -euo pipefail

IDENTITY_SOURCE="${1:?usage: $0 /absolute/path/client-identity.json loom-control}"
SERVICE_NAME="${2:?usage: $0 /absolute/path/client-identity.json loom-control}"
if [[ "$IDENTITY_SOURCE" != /* || ! -f "$IDENTITY_SOURCE" ]]; then
  echo "identity must be an existing absolute file" >&2
  exit 2
fi
if [[ ! "$SERVICE_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$ ]]; then
  echo "invalid OpenZiti service name" >&2
  exit 2
fi

APP_SUPPORT_DIR="${RECODER_APP_SUPPORT_DIR:-$HOME/Library/Application Support/Recoder}"
REMOTE_DIR="$APP_SUPPORT_DIR/remote-loom"
IDENTITY_FILE="$REMOTE_DIR/identity.json"
PROVISION_FILE="$REMOTE_DIR/provision.json"

umask 077
mkdir -p "$REMOTE_DIR"
install -m 600 "$IDENTITY_SOURCE" "$IDENTITY_FILE"
printf '{\n  "mode": "ziti",\n  "service": "%s",\n  "identityFile": "identity.json"\n}\n' \
  "$SERVICE_NAME" > "$PROVISION_FILE"
chmod 600 "$PROVISION_FILE"

echo "Recoder remote Loom provisioned for OpenZiti service $SERVICE_NAME"
echo "Restart Recoder; remote monitor and steer will use $REMOTE_DIR/loom-remote.sock"
