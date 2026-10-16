#!/usr/bin/env bash
# Last-mile deploy for the recoder.xyz production app (app/) — the piece that
# never existed before 2026-10-16. Builds app/ exactly like
# .github/workflows/app-build.yml (or downloads that workflow's artifact),
# ships it to the Oracle box, keeps the previously-running build as a
# rollback copy (there is no git checkout on the box — the live run-app/
# directory IS the only rollback artifact), and reloads pm2.
#
# Usage:
#   RECODER_SERVER=ubuntu@92.5.156.133 RECODER_SSH_KEY=~/.ssh/vcpeer_newbox_ed25519 \
#     app/deploy.sh                 # build locally with pnpm, then ship
#   app/deploy.sh --from-artifact app-standalone.tar.gz   # ship an already-built tarball
#     (e.g. one downloaded via: gh run download <run-id> --name app-standalone)
#
# Review the commit you're about to ship first — this script does not run
# tests or check for migrations. Do that (pnpm exec tsc --noEmit, pnpm exec
# vitest run, check `git diff <last-deployed-sha>..HEAD -- app/prisma`)
# BEFORE running this, per plans/recoder-connect.md's 2026-10-16 entry.
set -euo pipefail

SERVER="${RECODER_SERVER:?set RECODER_SERVER, e.g. ubuntu@92.5.156.133}"
KEY="${RECODER_SSH_KEY:?set RECODER_SSH_KEY to the recoder box SSH key, e.g. ~/.ssh/vcpeer_newbox_ed25519}"
REMOTE_BASE="/opt/recoder"
REMOTE_APP="$REMOTE_BASE/run-app"
PM2_NAME="recoder-app"
SSH="ssh -o BatchMode=yes -i $KEY"

cd "$(dirname "$0")/.."   # repo root

ARTIFACT=""
if [[ "${1:-}" == "--from-artifact" ]]; then
  ARTIFACT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
  echo "using prebuilt artifact: $ARTIFACT"
else
  echo "building app-standalone.tar.gz locally (mirrors .github/workflows/app-build.yml) ..."
  pnpm install --filter "recoder-main-app..." --no-frozen-lockfile
  (
    cd app
    NODE_OPTIONS="--max-old-space-size=6144" NEXT_TELEMETRY_DISABLED=1 \
      NEXT_PUBLIC_APP_URL="https://recoder.xyz" pnpm build
    test -d .next/standalone || { echo "NO standalone output"; ls -la .next; exit 1; }
    SA=.next/standalone
    # Turbopack's standalone output copies EVERY pnpm-workspace member
    # verbatim, not just the 3 @recoder/* packages app/ actually depends on
    # (workspace:* in package.json) — it has no dependency on apps/desktop
    # (apps/mobile, apps/frontend, etc. don't exist in this checkout, but if
    # they ever do, strip them too). apps/desktop alone is ~1.9G (the
    # Electron app + its bundled engine binaries: tmux/cloudflared/dmux/loom)
    # and is only referenced as inert string-literal paths in
    # lib/subagent-workflow.ts, never actually required at runtime. Dropping
    # it cuts the artifact from ~2.5G to ~600M. See plans/recoder.md 2026-10-16.
    rm -rf "$SA/apps"
    SRV="$(find "$SA" -maxdepth 3 -name server.js | head -1)"
    APPDIR="$(dirname "$SRV")"
    mkdir -p "$APPDIR/.next"
    cp -r .next/static "$APPDIR/.next/static"
    [ -d public ] && cp -r public "$APPDIR/public" || true
    printf '%s' "${APPDIR#$SA/}" > "$SA/.server-subdir"
    tar czf ../app-standalone.tar.gz -C "$SA" .
  )
  ARTIFACT="$(pwd)/app-standalone.tar.gz"
fi

ls -lh "$ARTIFACT"

echo "copying artifact to $SERVER:/tmp/ ..."
scp -o BatchMode=yes -i "$KEY" "$ARTIFACT" "$SERVER:/tmp/app-standalone-new.tar.gz"

echo "swapping in on the box (keeping the previous run-app/ as rollback) ..."
$SSH "$SERVER" bash -s <<REMOTE
set -euo pipefail
TS=\$(date +%Y%m%dT%H%M%S)
mkdir -p "$REMOTE_BASE/backups"
# Keep BOTH a tarball (long-term rollback artifact) and the raw previous
# directory (fast rollback: mv back, no untar needed) — there's no git ref
# for what's running, so the live files are the only source of truth.
tar czf "$REMOTE_BASE/backups/run-app.bak-\$TS.tar.gz" -C "$REMOTE_APP" .
mkdir -p /tmp/newapp-\$TS
tar xzf /tmp/app-standalone-new.tar.gz -C /tmp/newapp-\$TS
mv "$REMOTE_APP" "$REMOTE_BASE/run-app.prev-\$TS"
mv /tmp/newapp-\$TS "$REMOTE_APP"
rm -f /tmp/app-standalone-new.tar.gz
echo "rollback (fast):   mv $REMOTE_BASE/run-app.prev-\$TS $REMOTE_APP && pm2 reload $PM2_NAME"
echo "rollback (tarball): $REMOTE_BASE/backups/run-app.bak-\$TS.tar.gz"
pm2 reload "$REMOTE_BASE/ecosystem.app.config.cjs" --only "$PM2_NAME"
sleep 3
pm2 list
curl -fsS -o /dev/null -w "local /api/health -> %{http_code}\n" http://127.0.0.1:3001/api/health
REMOTE

echo "deployed. Verify live: curl -s https://recoder.xyz/api/health"
echo "Old builds accumulate under $REMOTE_BASE/run-app.prev-* and $REMOTE_BASE/backups/ — prune manually once a release is confirmed good (disk is not unlimited on this box)."
