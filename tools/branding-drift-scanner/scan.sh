#!/usr/bin/env bash
# ============================================================================
# Branding Drift Scanner (SFA-018)
#
# Scans public-facing files for legacy branding terms that should have been
# replaced during the Kortix -> Recoder migration.
#
# Uses grep -rn for fast bulk scanning, then post-filters exclusions.
#
# Usage:
#   ./tools/branding-drift-scanner/scan.sh [--repo-root <path>] [--verbose]
#
# Exit codes:
#   0  No violations found
#   1  Violations detected (or script error)
# ============================================================================
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
VERBOSE="${VERBOSE:-false}"

# Legacy branding terms to scan for.
# Format: "display_name|grep_extended_regex_pattern"
LEGACY_TERMS=(
  "kortix|[Kk][Oo]?[Rr][Tt][Ii][Xx]"
  "suna|[Ss]una"
  "bolt.new|bolt\.new"
  "bolt-elements|bolt-elements"
  "codecraft|[Cc]ode[Cc]raft"
  "giselle.ai|giselle\.ai"
)

# File extensions to scan (public-facing code and content).
INCLUDE_GLOBS=(
  "*.tsx" "*.jsx" "*.ts" "*.js"
  "*.html" "*.css"
  "*.json"
  "*.md"
  "*.yaml" "*.yml"
)

# Directories to exclude from scanning.
EXCLUDE_DIRS=(
  node_modules .git dist build .next .turbo .cache
  __pycache__ .venv venv coverage .output .nuxt
)

# File name patterns to exclude.
EXCLUDE_FILE_NAMES=(
  "CHANGELOG.md"
  "plan.md"
  "ECOSYSTEM_PRODUCTION_BLUEPRINT.md"
  "pnpm-lock.yaml"
  "package-lock.json"
  "yarn.lock"
  "bun.lockb"
)

# Path prefixes to exclude (relative to repo root).
# These are either self-referential (the scanner itself, CI workflow) or
# internal plan/reference documents that intentionally cite legacy brands.
EXCLUDE_PATH_PREFIXES=(
  ".github/workflows/branding-drift.yml"
  "tools/branding-drift-scanner/"
)

# Filenames that are internal planning/session docs (not public-facing).
EXCLUDE_INTERNAL_DOCS=(
  "session.md"
  "suna-reference-delta.md"
)

# Words containing "suna" that are NOT the legacy brand.
# Includes Italian "nessuna" (meaning "no/none"), Japanese/other language words.
SUNA_ALLOWLIST="tsunami|tsunam|sunart|sunanda|sunair|nessuna|yasuna|asuna"

# ── Helpers ────────────────────────────────────────────────────────────────

log() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo "[branding-scan] $*" >&2
  fi
}

is_excluded_filename() {
  local fname="$1"
  for excl in "${EXCLUDE_FILE_NAMES[@]}"; do
    [[ "$fname" == "$excl" ]] && return 0
  done
  for excl in "${EXCLUDE_INTERNAL_DOCS[@]}"; do
    [[ "$fname" == "$excl" ]] && return 0
  done
  return 1
}

is_excluded_path() {
  local relpath="$1"
  for prefix in "${EXCLUDE_PATH_PREFIXES[@]}"; do
    [[ "$relpath" == "$prefix"* ]] && return 0
  done
  return 1
}

# Determine which legacy term matched a line.
identify_term() {
  local content="$1"
  for term_entry in "${LEGACY_TERMS[@]}"; do
    local display="${term_entry%%|*}"
    local pat="${term_entry##*|}"
    if grep -qE "$pat" <<< "$content" 2>/dev/null; then
      echo "$display"
      return
    fi
  done
  echo "unknown"
}

# Check if "suna" match is actually a benign word like "tsunami".
is_suna_false_positive() {
  local content="$1"
  local lower
  lower="$(tr '[:upper:]' '[:lower:]' <<< "$content")"

  # Extract all words containing "suna"
  local words
  words="$(grep -oEi '[a-z]*suna[a-z]*' <<< "$lower" 2>/dev/null || true)"
  [[ -z "$words" ]] && return 1

  # If every word containing "suna" is in the allowlist, it is a false positive
  while IFS= read -r word; do
    [[ -z "$word" ]] && continue
    if ! grep -qEi "$SUNA_ALLOWLIST" <<< "$word" 2>/dev/null; then
      return 1
    fi
  done <<< "$words"
  return 0
}

# Check if a line in package.json is inside a dependency block.
is_in_dependency_block() {
  local file="$1"
  local line_num="$2"
  local context
  context="$(head -n "$line_num" "$file" 2>/dev/null | tail -n 30 | grep -oE '"(dependencies|devDependencies|peerDependencies|optionalDependencies|overrides|resolutions)"' | tail -n 1 || true)"
  [[ -n "$context" ]]
}

# ── Main ───────────────────────────────────────────────────────────────────

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo-root) REPO_ROOT="$2"; shift 2 ;;
      --verbose)   VERBOSE="true"; shift ;;
      *)           echo "Unknown argument: $1" >&2; exit 1 ;;
    esac
  done

  echo "========================================"
  echo "  Branding Drift Scanner (SFA-018)"
  echo "========================================"
  echo "Repo root: $REPO_ROOT"
  echo ""

  # Build combined regex for single grep pass.
  local combined=""
  for entry in "${LEGACY_TERMS[@]}"; do
    local pat="${entry##*|}"
    combined="${combined:+$combined|}$pat"
  done
  log "Combined pattern: $combined"

  # Build grep arguments.
  local grep_args=(-rnE "$combined")
  for g in "${INCLUDE_GLOBS[@]}"; do
    grep_args+=("--include=$g")
  done
  for d in "${EXCLUDE_DIRS[@]}"; do
    grep_args+=("--exclude-dir=$d")
  done
  grep_args+=("--exclude=*.bak" "--exclude=*.lock"
              "--exclude=pnpm-lock.yaml" "--exclude=package-lock.json"
              "--exclude=yarn.lock" "--exclude=bun.lockb")

  log "Running grep scan..."

  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT

  # Single fast grep pass.
  grep "${grep_args[@]}" "$REPO_ROOT" > "$tmp" 2>/dev/null || true

  local raw
  raw="$(wc -l < "$tmp" | tr -d ' ')"
  log "Raw matches: $raw"

  if [[ "$raw" -eq 0 ]]; then
    echo "========================================"
    echo "  No legacy branding violations found"
    echo "========================================"
    exit 0
  fi

  # Post-filter and classify.
  local violations=0
  local report=""

  while IFS= read -r line; do
    # Parse: /abs/path:linenum:content
    local abs_path line_num content
    abs_path="${line%%:*}"
    local rest="${line#*:}"
    line_num="${rest%%:*}"
    content="${rest#*:}"

    local relpath="${abs_path#"$REPO_ROOT"/}"
    local fname="${relpath##*/}"

    # Exclusion checks (fast string ops, no subshells).
    is_excluded_filename "$fname" && continue
    is_excluded_path "$relpath" && continue
    [[ "$relpath" == *.bak ]] && continue

    # Package.json dependency filter.
    if [[ "$fname" == "package.json" ]]; then
      if is_in_dependency_block "$abs_path" "$line_num"; then
        log "  Skip dep ref: $relpath:$line_num"
        continue
      fi
    fi

    # Identify which term matched.
    local term
    term="$(identify_term "$content")"

    # Suna false-positive filter.
    if [[ "$term" == "suna" ]] && is_suna_false_positive "$content"; then
      log "  Skip suna false positive: $relpath:$line_num"
      continue
    fi

    # Record violation.
    ((violations+=1))
    report+="  $relpath:$line_num  term=\"$term\""$'\n'
    report+="    -> ${content:0:150}"$'\n'

  done < "$tmp"

  # ── Report ─────────────────────────────────────────────────────────────
  echo ""
  if [[ "$violations" -gt 0 ]]; then
    echo "========================================"
    echo "  LEGACY BRANDING VIOLATIONS FOUND: $violations"
    echo "========================================"
    echo ""
    printf '%s' "$report"
    echo ""
    echo "These files contain legacy branding terms that must be replaced"
    echo "with the correct Recoder branding before merging."
    echo ""
    echo "Legacy terms scanned:"
    for entry in "${LEGACY_TERMS[@]}"; do
      echo "  - ${entry%%|*}"
    done
    echo ""
    echo "If a violation is a false positive, add an exclusion to:"
    echo "  tools/branding-drift-scanner/scan.sh"
    echo ""
    exit 1
  else
    echo "========================================"
    echo "  No legacy branding violations found"
    echo "========================================"
    echo ""
    exit 0
  fi
}

main "$@"
