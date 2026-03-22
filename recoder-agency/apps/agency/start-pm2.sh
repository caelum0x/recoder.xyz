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

exec node .next/standalone/apps/agency/server.js
