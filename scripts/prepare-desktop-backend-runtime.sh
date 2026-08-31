#!/usr/bin/env bash
# Prepare the self-contained backend copied into the macOS app. In particular,
# native Node addons must target Electron's ABI, not whichever Node happens to
# run pnpm on the release machine.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/desktop/app"

info() { printf '  • %s\n' "$*" >&2; }
die() { printf 'prepare-desktop-backend-runtime: %s\n' "$*" >&2; exit 1; }

electron_version() {
  node -p "require('$APP_DIR/node_modules/electron/package.json').version"
}

electron_binary() {
  printf '%s\n' "$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
}

rebuild_cli() {
  node -e '
    const path = require("path");
    const appDir = process.argv[1];
    const search = [appDir];
    try {
      search.push(path.dirname(require.resolve("app-builder-lib/package.json", { paths: [appDir] })));
    } catch {}
    const main = require.resolve("@electron/rebuild", { paths: search });
    process.stdout.write(path.join(path.dirname(main), "cli.js"));
  ' "$APP_DIR"
}

verify_runtime() {
  local modules="$1"
  local electron
  electron="$(electron_binary)"
  [[ -d "$modules" ]] || die "node_modules not found: $modules"
  [[ -x "$electron" ]] || die "Electron runtime not found: $electron"

  RUNTIME_NODE_MODULES="$modules" node <<'NODE'
const fs = require("fs");
const path = require("path");
const root = fs.realpathSync(process.env.RUNTIME_NODE_MODULES);
const required = ["express", "zod", "better-auth", "pg", "better-sqlite3"];
for (const name of required) require.resolve(name, { paths: [path.dirname(root)] });
const spawnHelpers = [];
for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name === "spawn-helper" && /node-pty.*prebuilds.*darwin-/.test(entry.parentPath || entry.path)) {
    const helper = path.join(entry.parentPath || entry.path, entry.name);
    spawnHelpers.push(helper);
    if ((fs.statSync(helper).mode & 0o111) === 0) throw new Error(`node-pty helper is not executable: ${helper}`);
  }
  if (!entry.isSymbolicLink()) continue;
  const link = path.join(entry.parentPath || entry.path, entry.name);
  const target = fs.realpathSync(link);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`backend dependency escapes packaged runtime: ${link} -> ${target}`);
  }
}
if (spawnHelpers.length !== 2) throw new Error(`expected arm64+x64 node-pty spawn-helper files, found ${spawnHelpers.length}`);
NODE

  RUNTIME_ROOT="$(dirname "$modules")" ELECTRON_RUN_AS_NODE=1 "$electron" -e '
    const path = require("path");
    const root = process.env.RUNTIME_ROOT;
    const Database = require(require.resolve("better-sqlite3", { paths: [root] }));
    const db = new Database(":memory:");
    const ok = db.prepare("select 1 as ok").get().ok;
    db.close();
    if (ok !== 1) throw new Error("Electron SQLite probe failed");
    process.stdout.write(`Electron ABI ${process.versions.modules}; SQLite probe passed\n`);
  '
}

if [[ "${1:-}" == "--verify" ]]; then
  [[ $# -eq 2 ]] || die "usage: $0 --verify /absolute/path/to/node_modules"
  verify_runtime "$2"
  exit 0
fi

[[ $# -eq 1 ]] || die "usage: $0 /absolute/empty/deploy-directory"
TARGET="$1"
[[ "$TARGET" == /* ]] || die "deploy directory must be absolute"
mkdir -p "$TARGET"
[[ -z "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit)" ]] || die "deploy directory must be empty: $TARGET"

info "deploying production backend dependencies"
pnpm --dir "$REPO_ROOT" --config.inject-workspace-packages=true --filter recoder-backend --prod deploy "$TARGET"

VERSION="$(electron_version)"
info "rebuilding better-sqlite3 for Electron $VERSION (${RECODER_MAC_ARCH:-arm64})"
node "$(rebuild_cli)" \
  --version "$VERSION" \
  --arch "${RECODER_MAC_ARCH:-arm64}" \
  --platform darwin \
  --module-dir "$TARGET" \
  --only better-sqlite3 \
  --force \
  --build-from-source \
  --sequential

# pnpm's deploy clone can lose the executable bit on node-pty's extensionless
# helper. Besides breaking terminal creation at runtime, that caused Apple's
# notary service to see electron-builder's non-hardened fallback signature.
find "$TARGET/node_modules" -type f -path '*/node-pty@*/node_modules/node-pty/prebuilds/darwin-*/spawn-helper' -exec chmod 0755 {} +

verify_runtime "$TARGET/node_modules"
printf '%s\n' "$TARGET/node_modules"
