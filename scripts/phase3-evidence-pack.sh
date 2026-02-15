#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHASE3_DIR="$REPO_ROOT/logs/phase3-gates"
RELEASE_DIR="$REPO_ROOT/logs/release-evidence"
OUT_ROOT="${OUT_ROOT:-$REPO_ROOT/logs/phase3-evidence}"

mkdir -p "$OUT_ROOT"

scorecard_json="$(ls -1t "$PHASE3_DIR"/*-scorecard.json 2>/dev/null | head -n1 || true)"
if [[ -z "$scorecard_json" || ! -f "$scorecard_json" ]]; then
  echo "No phase3 scorecard found. Run 'pnpm run phase3:gates' first." >&2
  exit 1
fi

run_id="$(basename "$scorecard_json")"
run_id="${run_id%-scorecard.json}"

src_files=(
  "$PHASE3_DIR/$run_id.log"
  "$PHASE3_DIR/$run_id-summary.md"
  "$PHASE3_DIR/$run_id-summary.json"
  "$PHASE3_DIR/$run_id-scorecard.md"
  "$PHASE3_DIR/$run_id-scorecard.json"
)

for f in "${src_files[@]}"; do
  [[ -f "$f" ]] || { echo "Missing required phase3 artifact: $f" >&2; exit 1; }
done

bundle_dir="$OUT_ROOT/$run_id"
mkdir -p "$bundle_dir"

for f in "${src_files[@]}"; do
  cp "$f" "$bundle_dir/"
done

latest_release_summary="$(ls -1t "$RELEASE_DIR"/*-summary.json 2>/dev/null | head -n1 || true)"
if [[ -n "$latest_release_summary" && -f "$latest_release_summary" ]]; then
  latest_release_run="$(basename "$latest_release_summary")"
  latest_release_run="${latest_release_run%-summary.json}"
  for ext in log summary.md summary.json; do
    cand="$RELEASE_DIR/$latest_release_run.$ext"
    if [[ -f "$cand" ]]; then
      cp "$cand" "$bundle_dir/release-evidence-$latest_release_run.$ext"
    fi
  done
fi

sha_cmd=""
if command -v sha256sum >/dev/null 2>&1; then
  sha_cmd="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  sha_cmd="shasum -a 256"
else
  echo "No sha256 command found (need sha256sum or shasum)." >&2
  exit 1
fi

manifest_json="$bundle_dir/manifest.json"
manifest_md="$bundle_dir/MANIFEST.md"

files=()
while IFS= read -r file; do
  files+=("$file")
done < <(cd "$bundle_dir" && ls -1)

{
  echo "{"
  echo "  \"generated_at_utc\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"run_id\": \"$run_id\","
  echo "  \"bundle_dir\": \"$bundle_dir\","
  echo "  \"files\": ["
  first=true
  for file in "${files[@]}"; do
    [[ "$file" == "manifest.json" || "$file" == "MANIFEST.md" ]] && continue
    digest="$(cd "$bundle_dir" && $sha_cmd "$file" | awk '{print $1}')"
    if [[ "$first" == true ]]; then
      first=false
    else
      echo ","
    fi
    echo -n "    { \"name\": \"$file\", \"sha256\": \"$digest\" }"
  done
  echo ""
  echo "  ]"
  echo "}"
} > "$manifest_json"

{
  echo "# Phase 3 Evidence Bundle"
  echo ""
  echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Run ID: $run_id"
  echo "- Bundle Dir: \`$bundle_dir\`"
  echo ""
  echo "## Files"
  for file in "${files[@]}"; do
    [[ "$file" == "manifest.json" || "$file" == "MANIFEST.md" ]] && continue
    digest="$(cd "$bundle_dir" && $sha_cmd "$file" | awk '{print $1}')"
    echo "- \`$file\` sha256=\`$digest\`"
  done
} > "$manifest_md"

tarball="$OUT_ROOT/$run_id-evidence.tgz"
tar -C "$OUT_ROOT" -czf "$tarball" "$run_id"

echo "Phase 3 evidence bundle created"
echo "bundle_dir: $bundle_dir"
echo "manifest_json: $manifest_json"
echo "manifest_md: $manifest_md"
echo "tarball: $tarball"
