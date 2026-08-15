#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSUNAMI_ROOT="$REPO_ROOT/apps/desktop/tsunami"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

pnpm -C "$TSUNAMI_ROOT/frontend" run build

go -C "$TSUNAMI_ROOT" build ./app
go -C "$TSUNAMI_ROOT" build ./build
go -C "$TSUNAMI_ROOT" build -o "$TMP_DIR/tsunami" ./cmd
go -C "$TSUNAMI_ROOT" build ./engine
go -C "$TSUNAMI_ROOT" build ./rpctypes
go -C "$TSUNAMI_ROOT" build ./tsunamibase
go -C "$TSUNAMI_ROOT" build ./ui
go -C "$TSUNAMI_ROOT" build ./util
go -C "$TSUNAMI_ROOT" build ./vdom
