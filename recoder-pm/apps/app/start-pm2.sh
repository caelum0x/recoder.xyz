#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"

if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    [[ "$key" == "PORT" || "$key" == "HOSTNAME" ]] && continue
    val="${line#*=}"
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    export "$key=$val" 2>/dev/null || true
  done < "$ENV_FILE"
fi

PRISMA_DST="prisma/auth-client"
PRISMA_REL="../../../packages/backend/prisma/auth-client"

mkdir -p "$(dirname "$PRISMA_DST")"
rm -f "$PRISMA_DST"
ln -s "$PRISMA_REL" "$PRISMA_DST"

exec node_modules/.bin/next start
