#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOOM_ZIG_DEFAULT="$REPO_ROOT/.cache/zig-0.15.2/zig-aarch64-macos-0.15.2/zig"

pnpm -C "$REPO_ROOT/apps/desktop/engines/dmux" run build
pnpm -C "$REPO_ROOT/apps/desktop/engines/openclaw" run build
pnpm -C "$REPO_ROOT/apps/desktop/engines/recodergit/recodergit" run build

if [[ -x "$LOOM_ZIG_DEFAULT" ]]; then
  ZIG="$LOOM_ZIG_DEFAULT" cargo build --manifest-path "$REPO_ROOT/apps/desktop/engines/loom/Cargo.toml" --release
else
  cargo build --manifest-path "$REPO_ROOT/apps/desktop/engines/loom/Cargo.toml" --release
fi
