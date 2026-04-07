#!/bin/bash
# Setup proxy.recoder.xyz — CORS proxy for the platform
# Run on the Hetzner server after cloning the proxy repo

set -e

PROXY_DIR="/root/proxy"

echo "=== Setting up proxy.recoder.xyz ==="

# 1. Clone/pull proxy repo
if [ -d "$PROXY_DIR" ]; then
  echo "Pulling latest..."
  cd "$PROXY_DIR" && git pull
else
  echo "Cloning proxy repo..."
  git clone --depth 1 https://github.com/caelum0x/proxy.git "$PROXY_DIR"
fi

# 2. Install + build
cd "$PROXY_DIR"
npm install --omit=dev
npm run build

# 3. Start with PM2
pm2 describe recoder-proxy > /dev/null 2>&1 && pm2 delete recoder-proxy
pm2 start dist/backend/server.js \
  --name recoder-proxy \
  --env PORT=3200 \
  --env NODE_ENV=production \
  --env PROXY_TIMEOUT=60000
pm2 save

echo "=== proxy.recoder.xyz running on port 3200 ==="
echo "Add nginx upstream: proxy_pass http://127.0.0.1:3200"
