#!/usr/bin/env bash
set -euo pipefail

missing=()
required_vars=(
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  DATABASE_URL
  POSTGRES_URL_NON_POOLING
  POSTGRES_PRISMA_URL
  REDIS_URL
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing env vars: ${missing[*]}"
  exit 1
fi

API_BASE_URL=${API_BASE_URL:-"http://localhost:3004"}
WORKER_HEALTH_URL=${WORKER_HEALTH_URL:-"http://localhost:3006"}

printf "Checking API health at %s...\n" "$API_BASE_URL/health"
if ! curl -fsS "$API_BASE_URL/health" >/dev/null; then
  echo "API health check failed."
  exit 1
fi

printf "Checking worker health at %s...\n" "$WORKER_HEALTH_URL"
if ! curl -fsS "$WORKER_HEALTH_URL" >/dev/null; then
  echo "Worker health check failed."
  exit 1
fi

echo "Health checks passed."
