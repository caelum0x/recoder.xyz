#!/bin/bash
set -e

# Skip install if node_modules exists and package.json hasn't changed
if [ -d "node_modules" ] && [ -f ".package-installed" ]; then
  CURRENT_HASH=$(md5sum package.json 2>/dev/null | cut -d' ' -f1 || echo "none")
  CACHED_HASH=$(cat .package-installed 2>/dev/null || echo "none")
  
  if [ "$CURRENT_HASH" = "$CACHED_HASH" ]; then
    echo "✅ Dependencies already installed, skipping..."
    exec "$@"
  fi
fi

# Install dependencies
if [ -f "package.json" ]; then
  echo "📦 Installing dependencies..."
  if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile --prefer-offline
  elif [ -f "package-lock.json" ]; then
    npm ci --prefer-offline
  else
    npm install --prefer-offline
  fi
  
  # Cache the hash
  md5sum package.json 2>/dev/null | cut -d' ' -f1 > .package-installed || true
fi

exec "$@"
