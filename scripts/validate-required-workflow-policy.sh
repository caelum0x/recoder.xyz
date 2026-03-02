#!/usr/bin/env bash
set -euo pipefail

monitored_workflows=(
  ".github/workflows/master-pipeline.yml"
  ".github/workflows/automated-testing.yml"
  ".github/workflows/web-platform.yml"
  ".github/workflows/test.yml"
)

errors=0

for file in "${monitored_workflows[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: monitored workflow missing: $file"
    errors=$((errors + 1))
    continue
  fi

  echo "Checking policy in $file"
  current_job=""

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="$raw_line"

    # Track job id and job name context using indentation under jobs:
    if [[ "$line" =~ ^[[:space:]]{2}[a-zA-Z0-9_-]+:[[:space:]]*$ ]]; then
      current_job="$line"
      current_job="${current_job#  }"
      current_job="${current_job%:}"
    elif [[ "$line" =~ ^[[:space:]]{4}name:[[:space:]]*(.*)$ ]]; then
      current_job="${BASH_REMATCH[1]}"
      current_job="${current_job#\"}"
      current_job="${current_job%\"}"
    fi

    # Rule 1: continue-on-error is allowed only on advisory jobs.
    if [[ "$line" =~ continue-on-error:[[:space:]]*true ]]; then
      if [[ "$current_job" != *"Advisory"* ]]; then
        echo "ERROR: non-advisory continue-on-error in $file (job: ${current_job:-unknown}): $line"
        errors=$((errors + 1))
      fi
    fi

    # Rule 2: forbid fallback masking in required jobs.
    if [[ "$line" =~ \|\|[[:space:]]*(true|echo) ]]; then
      # Allow explicit boolean-expression output patterns (not soft-fail masking).
      if [[ "$line" == *"&& echo"* && "$line" == *"|| echo"* ]]; then
        continue
      fi

      if [[ "$current_job" != *"Advisory"* ]]; then
        echo "ERROR: fallback masking pattern in non-advisory job in $file (job: ${current_job:-unknown}): $line"
        errors=$((errors + 1))
      fi
    fi
  done < "$file"
done

if [[ $errors -gt 0 ]]; then
  echo "Workflow policy validation failed with $errors error(s)."
  exit 1
fi

echo "Workflow policy validation passed."
