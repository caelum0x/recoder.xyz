#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ROOT="$REPO_ROOT/apps/desktop/server"
OUT_DIR="$REPO_ROOT/apps/desktop/app/dist/bin"

uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s" in
  Darwin) ext="" ;;
  Linux) ext="" ;;
  MINGW*|MSYS*|CYGWIN*) ext=".exe" ;;
  *) ext="" ;;
esac

case "$uname_m" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) arch="$uname_m" ;;
esac

mkdir -p "$OUT_DIR"

CGO_ENABLED=1 go -C "$SERVER_ROOT" build \
  -tags "osusergo,sqlite_omit_load_extension" \
  -o "$OUT_DIR/recoder-server.${arch}${ext}" \
  ./cmd/server

CGO_ENABLED=1 go -C "$SERVER_ROOT" build \
  -o "$OUT_DIR/wsh${ext}" \
  ./cmd/wsh

echo "built desktop server binaries:"
echo "  $OUT_DIR/recoder-server.${arch}${ext}"
echo "  $OUT_DIR/wsh${ext}"
