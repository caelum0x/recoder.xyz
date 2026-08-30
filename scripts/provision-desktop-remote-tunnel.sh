#!/usr/bin/env bash
# Provision Recoder's named Cloudflare Tunnel for normal Finder launches.
# The token is read from stdin so it never appears in argv or shell history.

set -euo pipefail

PUBLIC_URL="${1:?usage: $0 https://<device>.remote.recoder.xyz}"
case "$PUBLIC_URL" in
  https://*.remote.recoder.xyz) ;;
  *) echo "public URL must be an https://*.remote.recoder.xyz origin" >&2; exit 2 ;;
esac
case "$PUBLIC_URL" in
  */) PUBLIC_URL="${PUBLIC_URL%/}" ;;
esac

APP_SUPPORT_DIR="${RECODER_APP_SUPPORT_DIR:-$HOME/Library/Application Support/Recoder}"
TUNNEL_DIR="$APP_SUPPORT_DIR/remote-tunnel"
TOKEN_FILE="$TUNNEL_DIR/token"
PROVISION_FILE="$TUNNEL_DIR/provision.json"

umask 077
mkdir -p "$TUNNEL_DIR"
printf 'Paste the named-tunnel token, then press Return: ' >&2
IFS= read -r TUNNEL_VALUE
if [[ -z "$TUNNEL_VALUE" ]]; then
  echo "no token supplied; nothing changed" >&2
  exit 2
fi
printf '%s' "$TUNNEL_VALUE" > "$TOKEN_FILE"
unset TUNNEL_VALUE
printf '{\n  "mode": "named",\n  "publicUrl": "%s",\n  "tokenFile": "token"\n}\n' "$PUBLIC_URL" > "$PROVISION_FILE"
chmod 600 "$TOKEN_FILE" "$PROVISION_FILE"

echo "Recoder remote transport provisioned for $PUBLIC_URL"
echo "Restart Recoder; Remote access will show Connected when the tunnel registers."
