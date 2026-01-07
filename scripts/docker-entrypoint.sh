#!/usr/bin/env sh
set -e

# Skip install if node_modules exists
if [ -d "node_modules" ]; then
  echo "[entrypoint] node_modules detected, skipping install"
else
  echo "[entrypoint] Installing dependencies (pnpm)"
  corepack enable || true
  corepack prepare pnpm@latest --activate || true
  pnpm install --frozen-lockfile --store=/pnpm-store
fi

exec "$@"
