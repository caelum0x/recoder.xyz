#!/usr/bin/env bash
# Deploy the recoder.xyz marketing site (site/) to the prod box behind nginx.
# CRITICAL: the site co-hosts with the app on recoder.xyz, so it MUST be built
# with SITE_ASSET_PREFIX=/__site or its /_next/* assets collide with the app's
# and 404. This script always builds with the prefix.
set -euo pipefail
SALT_PREFIX="/__site"
SERVER="${RECODER_SERVER:-root@77.42.23.19}"
KEY="${RECODER_SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
cd "$(dirname "$0")/../site"
echo "building site with assetPrefix=$SALT_PREFIX ..."
SITE_ASSET_PREFIX="$SALT_PREFIX" npx next build
# fail if any built HTML references a bare /_next (would 404 behind the app)
if grep -rqE '"/_next/static' .next/server/app/*.html 2>/dev/null; then
  echo "ERROR: built HTML has bare /_next refs — assetPrefix not applied. Aborting."; exit 1
fi
echo "rsync -> $SERVER:/root/recoder-site ..."
rsync -az --exclude '.git' -e "ssh -o BatchMode=yes -i $KEY" ./ "$SERVER:/root/recoder-site/"
ssh -o BatchMode=yes -i "$KEY" "$SERVER" \
  'cd /root/recoder-site && pm2 delete recoder-site >/dev/null 2>&1 || true; SITE_ASSET_PREFIX=/__site pm2 start npm --name recoder-site -- start && pm2 save'
echo "deployed. (purge Cloudflare cache separately.)"
