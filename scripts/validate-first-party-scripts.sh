#!/usr/bin/env bash
set -euo pipefail

# First-party surfaces that are required to expose test/lint/typecheck contracts.
required_surfaces=(
  "app"
  "recoder-agents"
  "recoder-pm"
  "apps/mobile"
)

optional_retired_surfaces=(
  "recoder-web"
  "recoder-studio"
)

errors=0

echo "Validating first-party script contracts (test/lint/typecheck-like)..."

for surface in "${required_surfaces[@]}"; do
  if [[ ! -f "$surface/package.json" ]]; then
    echo "ERROR: missing package.json for required surface '$surface'"
    errors=$((errors + 1))
    continue
  fi

  if ! result=$(node - "$surface/package.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const scripts = pkg.scripts || {};
const hasTest = typeof scripts.test === 'string' && scripts.test.trim().length > 0;
const hasLint = typeof scripts.lint === 'string' && scripts.lint.trim().length > 0;
const hasType = (
  (typeof scripts.typecheck === 'string' && scripts.typecheck.trim().length > 0) ||
  (typeof scripts['check-types'] === 'string' && scripts['check-types'].trim().length > 0)
);
const missing = [];
if (!hasTest) missing.push('test');
if (!hasLint) missing.push('lint');
if (!hasType) missing.push('typecheck|check-types');
if (missing.length > 0) {
  console.log(`MISSING:${missing.join(',')}`);
  process.exit(2);
}
console.log('OK');
NODE
  ); then
    echo "ERROR: $surface missing required script(s): ${result#MISSING:}"
    errors=$((errors + 1))
  else
    echo "OK: $surface has test/lint/typecheck-like scripts"
  fi
done

for surface in "${optional_retired_surfaces[@]}"; do
  if [[ ! -f "$surface/package.json" ]]; then
    echo "WARN: optional retired surface '$surface' is absent"
    continue
  fi

  if ! result=$(node - "$surface/package.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const scripts = pkg.scripts || {};
const hasTest = typeof scripts.test === 'string' && scripts.test.trim().length > 0;
const hasLint = typeof scripts.lint === 'string' && scripts.lint.trim().length > 0;
const hasType = (
  (typeof scripts.typecheck === 'string' && scripts.typecheck.trim().length > 0) ||
  (typeof scripts['check-types'] === 'string' && scripts['check-types'].trim().length > 0)
);
const missing = [];
if (!hasTest) missing.push('test');
if (!hasLint) missing.push('lint');
if (!hasType) missing.push('typecheck|check-types');
if (missing.length > 0) {
  console.log(`MISSING:${missing.join(',')}`);
  process.exit(2);
}
console.log('OK');
NODE
  ); then
    echo "WARN: optional retired surface $surface missing script(s): ${result#MISSING:}"
  else
    echo "WARN: optional retired surface $surface still present with test/lint/typecheck-like scripts"
  fi
done

if [[ $errors -gt 0 ]]; then
  echo "First-party script contract validation failed with $errors error(s)."
  exit 1
fi

echo "First-party script contract validation passed."
