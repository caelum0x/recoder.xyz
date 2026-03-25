#!/usr/bin/env bash
# Lightweight PM2 startup script for recoder-agency.
# Loads .env.local (skipping PORT/HOSTNAME which PM2 controls),
# then exec's the Next.js standalone server.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"

if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" == \#* ]] && continue
    # Extract key=value
    key="${line%%=*}"
    # Skip PORT and HOSTNAME (controlled by PM2)
    [[ "$key" == "PORT" || "$key" == "HOSTNAME" ]] && continue
    # Export the variable
    export "$line" 2>/dev/null || true
  done < "$ENV_FILE"
fi

# Next.js standalone doesn't serve static files — copy them into the standalone dir
if [ -d ".next/static" ] && [ ! -d ".next/standalone/apps/agency/.next/static" ]; then
  mkdir -p .next/standalone/apps/agency/.next/
  cp -r .next/static .next/standalone/apps/agency/.next/static
fi
if [ -d "public" ] && [ ! -d ".next/standalone/apps/agency/public" ]; then
  cp -r public .next/standalone/apps/agency/public
fi

# Prisma engine: symlink auth-client into standalone so Prisma can find the engine.
# The symlink target must be relative to the symlink's own directory, not the script CWD.
PRISMA_SRC=".next/standalone/node_modules/.pnpm/@recoder+auth@file+..+packages+auth_typescript@5.7.3/node_modules/@recoder/auth/prisma/auth-client"
PRISMA_DST=".next/standalone/apps/agency/prisma/auth-client"
PRISMA_REL="../../../node_modules/.pnpm/@recoder+auth@file+..+packages+auth_typescript@5.7.3/node_modules/@recoder/auth/prisma/auth-client"
if [ -d "$PRISMA_SRC" ]; then
  mkdir -p "$(dirname "$PRISMA_DST")"
  # Remove any existing (possibly broken) symlink, then create with correct relative path
  rm -f "$PRISMA_DST"
  ln -s "$PRISMA_REL" "$PRISMA_DST"
fi

exec node .next/standalone/apps/agency/server.js
