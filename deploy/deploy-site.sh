#!/usr/bin/env bash
# Deploy the recoder.xyz marketing site (site/) to the prod box behind nginx.
# CRITICAL: the site co-hosts with the app on recoder.xyz, so it MUST be built
# with SITE_ASSET_PREFIX=/__site or its /_next/* assets collide with the app's
# and 404. This script always builds with the prefix.
set -euo pipefail
SALT_PREFIX="/__site"
# 77.42.23.19 was the Hetzner box deleted 2026-09-02; that IP now belongs to someone else.
SERVER="${RECODER_SERVER:?set RECODER_SERVER to the recoder Oracle box, e.g. ubuntu@92.5.156.133}"
KEY="${RECODER_SSH_KEY:?set RECODER_SSH_KEY to the recoder box key}"
cd "$(dirname "$0")/../site"
# site/ is a STANDALONE package (its own pnpm-lock, next@15/webpack). Without
# --ignore-workspace, npx would resolve the monorepo's next@16 (Turbopack) and the
# build fails with a "workspace root" error. Materialize site/node_modules here.
echo "installing standalone site deps (not workspace) ..."
pnpm install --ignore-workspace --frozen-lockfile
echo "building site with assetPrefix=$SALT_PREFIX ..."
SITE_ASSET_PREFIX="$SALT_PREFIX" npx next build
# fail if any built HTML references a bare /_next (would 404 behind the app)
if grep -rqE '"/_next/static' .next/server/app/*.html 2>/dev/null; then
  echo "ERROR: built HTML has bare /_next refs — assetPrefix not applied. Aborting."; exit 1
fi
# Prod runs the Next standalone bundle from /opt/recoder/run-site under pm2 "recoder".
STAGE="$(mktemp -d)"
cp -R .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next" && cp -R .next/static "$STAGE/.next/static" && cp -R public "$STAGE/public"
echo "rsync -> $SERVER:/opt/recoder/run-site-next ..."
rsync -az --delete -e "ssh -o BatchMode=yes -i $KEY" "$STAGE/" "$SERVER:/opt/recoder/run-site-next/"
rm -rf "$STAGE"
ssh -o BatchMode=yes -i "$KEY" "$SERVER" 'set -e
  TS=$(date +%Y%m%d-%H%M%S)
  mv /opt/recoder/run-site /opt/recoder/run-site.bak-$TS
  mv /opt/recoder/run-site-next /opt/recoder/run-site
  echo "rollback: mv /opt/recoder/run-site.bak-$TS back to /opt/recoder/run-site; pm2 restart recoder"
  pm2 restart recoder --update-env >/dev/null && pm2 save >/dev/null
  sleep 3; curl -fsS -o /dev/null -w "local /download %{http_code}\n" http://127.0.0.1:3000/download'
echo "deployed. Release vars come from site/.env.production.local (gitignored)."
