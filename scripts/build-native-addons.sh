#!/usr/bin/env bash
# build-native-addons.sh — build the Rust crates as native NAPI .node addons so the
# TS product uses them IN-PROCESS (Cursor-style deep fusion), not via daemon/HTTP/CLI.
#
# For each crate: cargo build --release the *-napi cdylib, then copy the produced
# lib<crate>_napi.<dylib|so|dll> to the exact `<crate>-napi.node` path the TS loader
# probes (see packages/governance/src/napi/napi-loader.ts candidate paths). napi-rs
# .node files ARE just the renamed cdylib (N-API is ABI-stable across Node versions).
#
# Degrade-safe: each crate builds independently; a failure on one (compile/ENOSPC)
# is reported and does NOT abort the others. The TS facades fall back to daemon/TS
# when a .node is absent, so a partial build is always safe.
#
# Usage:  scripts/build-native-addons.sh [governance|tensorzero|openfang|all]
set -uo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Resolve the platform-specific cdylib extension.
case "$(uname -s)" in
  Darwin) EXT=dylib ;;
  Linux)  EXT=so ;;
  *)      EXT=dll ;;
esac

# one: <cargo-workspace-dir> <napi-package-name> <cdylib-basename> <dest-.node-path>
build_one() {
  local ws="$1" pkg="$2" lib="$3" dest="$4"
  echo "── building $pkg → $(basename "$dest") ──"
  if ! (cd "$REPO/$ws" && cargo build --release -p "$pkg"); then
    echo "  ✗ $pkg: cargo build failed (compile or disk) — TS falls back; skipping."
    return 1
  fi
  local out="$REPO/$ws/target/release/${lib}.${EXT}"
  if [[ ! -f "$out" ]]; then
    echo "  ✗ $pkg: expected cdylib not found at $out"
    return 1
  fi
  mkdir -p "$(dirname "$dest")"
  cp -f "$out" "$dest"
  echo "  ✓ $pkg → $dest ($(du -h "$dest" | cut -f1))"
}

target="${1:-all}"

build_governance() {
  build_one "backend/engines/rust/recoder-governance" "recoder-governance-napi" \
    "librecoder_governance_napi" \
    "$REPO/backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node"
}
build_tensorzero() {
  # SQLX_OFFLINE: tensorzero-auth sqlx macros need the committed .sqlx cache
  # (and the ancestor-.env walk must stay dotenvy-parseable — see memory).
  SQLX_OFFLINE=1 build_one "backend/engines/rust/tensorzero/crates" "tensorzero-gateway-napi" \
    "libtensorzero_gateway_napi" \
    "$REPO/backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node"
}
build_openfang() {
  build_one "backend/engines/rust/openfang" "openfang-napi" \
    "libopenfang_napi" \
    "$REPO/backend/engines/rust/openfang/target/release/openfang_napi.node"
}

rc=0
case "$target" in
  governance) build_governance || rc=1 ;;
  tensorzero) build_tensorzero || rc=1 ;;
  openfang)   build_openfang   || rc=1 ;;
  all)        build_governance || rc=1; build_tensorzero || rc=1; build_openfang || rc=1 ;;
  *) echo "usage: $0 [governance|tensorzero|openfang|all]"; exit 2 ;;
esac
echo "done (rc=$rc). Absent .node files degrade to the daemon/TS fallback — always safe."
exit "$rc"
