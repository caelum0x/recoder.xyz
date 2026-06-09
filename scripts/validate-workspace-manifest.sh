#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_FILE="pnpm-workspace.yaml"

if [[ ! -f "$WORKSPACE_FILE" ]]; then
  echo "ERROR: $WORKSPACE_FILE not found"
  exit 1
fi

extract_list() {
  local section="$1"
  awk -v sec="$section" '
    $0 ~ "^" sec ":" { in_section=1; next }
    in_section && $0 ~ /^[^[:space:]]/ { in_section=0 }
    in_section && $0 ~ /^[[:space:]]*-[[:space:]]*[^[:space:]#]/ {
      line=$0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/["\047]/, "", line)
      sub(/[[:space:]]*(#.*)?$/, "", line)
      print line
    }
  ' "$WORKSPACE_FILE"
}

contains() {
  local needle="$1"
  shift
  local candidate
  for candidate in "$@"; do
    if [[ "$candidate" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

package_entries=()
while IFS= read -r line; do
  package_entries+=("$line")
done < <(extract_list "packages")

exclude_entries=()
while IFS= read -r line; do
  exclude_entries+=("$line")
done < <(extract_list "exclude")

if [[ ${#package_entries[@]} -eq 0 ]]; then
  echo "ERROR: No package entries found under packages: in $WORKSPACE_FILE"
  exit 1
fi

if [[ ${#exclude_entries[@]} -eq 0 ]]; then
  echo "ERROR: No exclude entries found under exclude: in $WORKSPACE_FILE"
  exit 1
fi

legacy_allowed_missing_excludes=(
  "production-engine"
  "recoder-chat"
  "recoder-chat-mobile"
  "recoder-extension"
  "browser-extension"
  "deployment"
)

optional_allowed_missing_excludes=(
  "packages-local-backup"
)

errors=0

echo "Validating packages entries in $WORKSPACE_FILE"
for entry in "${package_entries[@]}"; do
  if [[ "$entry" == *"*"* ]]; then
    if compgen -G "$entry" > /dev/null; then
      echo "OK: wildcard package path '$entry' resolves"
    else
      echo "ERROR: wildcard package path '$entry' matches nothing"
      errors=$((errors + 1))
    fi
    continue
  fi

  if [[ -e "$entry" ]]; then
    echo "OK: package path '$entry' exists"
  else
    echo "ERROR: package path '$entry' does not exist"
    errors=$((errors + 1))
  fi
done

echo "Validating exclude entries in $WORKSPACE_FILE"
for entry in "${exclude_entries[@]}"; do
  if [[ "$entry" == *"*"* ]]; then
    echo "OK: glob exclude '$entry'"
    continue
  fi

  if [[ -e "$entry" ]]; then
    echo "OK: exclude path '$entry' exists"
    continue
  fi

  if contains "$entry" "${legacy_allowed_missing_excludes[@]}"; then
    echo "OK: exclude path '$entry' is documented legacy"
    continue
  fi

  if contains "$entry" "${optional_allowed_missing_excludes[@]}"; then
    echo "OK: exclude path '$entry' is optional"
    continue
  fi

  echo "ERROR: exclude path '$entry' is missing and not in the legacy/optional allowlist"
  errors=$((errors + 1))
done

if [[ $errors -gt 0 ]]; then
  echo "Workspace manifest validation failed with $errors error(s)."
  exit 1
fi

echo "Workspace manifest validation passed."
