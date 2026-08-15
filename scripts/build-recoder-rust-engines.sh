#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_TARGET_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_TARGET_ROOT"
}
trap cleanup EXIT

build_with_temp_target() {
  local manifest_path="$1"
  local package_name="$2"
  local artifact_name="$3"
  local artifact_dest="$4"
  local workdir="${5:-$REPO_ROOT}"
  local sqlx_offline="${6:-}"
  local target_dir
  target_dir="$(mktemp -d "$TMP_TARGET_ROOT/target.XXXXXX")"

  (
    cd "$workdir"
    CARGO_TARGET_DIR="$target_dir" SQLX_OFFLINE="$sqlx_offline" cargo build --manifest-path "$manifest_path" -p "$package_name" --release
  )

  if [[ -f "$target_dir/release/$artifact_name" ]]; then
    cp -f "$target_dir/release/$artifact_name" "$artifact_dest"
  fi
}

build_with_temp_target \
  "$REPO_ROOT/backend/engines/rust/openfang/Cargo.toml" \
  openfang-napi \
  openfang_napi.node \
  "$REPO_ROOT/backend/engines/rust/openfang/target/release/openfang_napi.node"

build_with_temp_target \
  "$REPO_ROOT/backend/engines/rust/recoder-governance/Cargo.toml" \
  recoder-governance-napi \
  recoder-governance-napi.node \
  "$REPO_ROOT/backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node"

build_with_temp_target \
  "$REPO_ROOT/backend/engines/rust/tensorzero/crates/Cargo.toml" \
  tensorzero-gateway-napi \
  tensorzero_gateway_napi.node \
  "$REPO_ROOT/backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node" \
  "$REPO_ROOT/backend/engines/rust/tensorzero/crates" \
  1
