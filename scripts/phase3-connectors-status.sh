#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHASE3_DIR="$REPO_ROOT/logs/phase3-gates"
RELEASE_DIR="$REPO_ROOT/logs/release-evidence"

json_mode="false"
if [[ "${1:-}" == "--json" ]]; then
  json_mode="true"
fi

find_latest() {
  local dir="$1"
  local pattern="$2"
  ls -1t "$dir"/$pattern 2>/dev/null | head -n1 || true
}

phase3_json="$(find_latest "$PHASE3_DIR" "*-connectors-support.json")"
phase3_md=""
if [[ -n "$phase3_json" ]]; then
  phase3_md="${phase3_json%.json}.md"
fi

release_json="$(find_latest "$RELEASE_DIR" "*-connectors-support.json")"
release_md=""
if [[ -n "$release_json" ]]; then
  release_md="${release_json%.json}.md"
fi

selected_json=""
selected_md=""
selected_source=""

if [[ -n "$phase3_json" && -f "$phase3_json" ]]; then
  selected_json="$phase3_json"
  selected_md="$phase3_md"
  selected_source="phase3-gates"
elif [[ -n "$release_json" && -f "$release_json" ]]; then
  selected_json="$release_json"
  selected_md="$release_md"
  selected_source="release-evidence"
else
  echo "No connector support artifacts found." >&2
  echo "Run 'pnpm run phase3:gates' or 'pnpm run release:evidence' first." >&2
  exit 1
fi

if [[ "$json_mode" == "true" ]]; then
  cat "$selected_json"
  exit 0
fi

if [[ -n "$selected_md" && -f "$selected_md" ]]; then
  echo "Connector status source: $selected_source"
  echo "Artifact: $selected_md"
  echo ""
  cat "$selected_md"
  exit 0
fi

echo "Connector status source: $selected_source"
echo "Artifact: $selected_json"
echo ""
cat "$selected_json"
