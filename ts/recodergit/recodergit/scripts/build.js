#!/usr/bin/env node
/**
 * Build script that compiles recodergit and inlines recodergit-shared into the dist.
 *
 * Steps:
 *  1. Build recodergit-shared (tsc)
 *  2. Build recodergit (tsc)
 *  3. Copy recodergit-shared/dist → dist/_shared
 *  4. Rewrite bare 'recodergit-shared' specifiers → relative paths
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHARED_ROOT = path.resolve(ROOT, '..', 'recodergit-shared');
const DIST = path.join(ROOT, 'dist');
const SHARED_DEST = path.join(DIST, '_shared');
const DEFAULT_BUILD_TIMEOUT_MS = 300_000;

function getBuildTimeoutMs() {
  const raw = process.env.GITNEXUS_BUILD_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_BUILD_TIMEOUT_MS;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  console.warn(
    `[build] ignoring invalid GITNEXUS_BUILD_TIMEOUT_MS=${JSON.stringify(raw)}; using ${DEFAULT_BUILD_TIMEOUT_MS}ms`,
  );
  return DEFAULT_BUILD_TIMEOUT_MS;
}

const BUILD_TIMEOUT_MS = getBuildTimeoutMs();

// Published-package guard: when installed from the npm registry the
// monorepo sibling `recodergit-shared` does not exist and `dist/` is
// already pre-built. Skip the build to avoid a misleading ENOENT
// crash (#1795).
if (!fs.existsSync(SHARED_ROOT)) {
  if (fs.existsSync(DIST)) {
    console.log('[build] skipping — dist/ already present (published package).');
    process.exit(0);
  }
  console.error(
    `[build] recodergit-shared not found at ${SHARED_ROOT} and no dist/ exists.\n` +
      'Are you running from the monorepo checkout? Run `npm install` from the repo root first.',
  );
  process.exit(1);
}

// ── 1. Build recodergit-shared ───────────────────────────────────────
console.log('[build] compiling recodergit-shared…');
const tscCmd =
  process.platform === 'win32'
    ? path.join('node_modules', '.bin', 'tsc.cmd')
    : path.join('node_modules', '.bin', 'tsc');
execSync(tscCmd, { cwd: SHARED_ROOT, stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });

// ── 2. Build recodergit ──────────────────────────────────────────────
console.log('[build] compiling recodergit…');
execSync(tscCmd, { cwd: ROOT, stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });

// ── 3. Copy shared dist ────────────────────────────────────────────
console.log('[build] copying shared module into dist/_shared…');
fs.cpSync(path.join(SHARED_ROOT, 'dist'), SHARED_DEST, { recursive: true });

// ── 4. Rewrite imports ─────────────────────────────────────────────
console.log('[build] rewriting recodergit-shared imports…');
let rewritten = 0;

const SHARED_PKG = '@recoder/recodergit-engine-shared';

function rewriteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(SHARED_PKG)) return;

  const relDir = path.relative(path.dirname(filePath), SHARED_DEST);
  // Always use posix separators and point to the package index
  const relImport = relDir.split(path.sep).join('/') + '/index.js';
  const sharedRe = SHARED_PKG.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

  const updated = content
    .replace(new RegExp(`from\\s+['"]${sharedRe}['"]`, 'g'), `from '${relImport}'`)
    .replace(new RegExp(`import\\(\\s*['"]${sharedRe}['"]\\s*\\)`, 'g'), `import('${relImport}')`);

  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    rewritten++;
  }
}

function walk(dir, extensions, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, extensions, cb);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      cb(full);
    }
  }
}

walk(DIST, ['.js', '.d.ts'], rewriteFile);

// ── 5. Make CLI entry executable ────────────────────────────────────
const cliEntry = path.join(DIST, 'cli', 'index.js');
if (fs.existsSync(cliEntry)) fs.chmodSync(cliEntry, 0o755);

// ── 6. Build & copy web UI ──────────────────────────────────────────
// The browser-only web UI (recodergit-web) is out of scope for the Recoder
// engine build (Recoder drives the Node CLI/MCP engine, not the WASM web app).
// `RECODERGIT_SKIP_WEB=1` skips this heavy Vite build so the engine compiles
// self-contained — the published-package guard above already ships a prebuilt
// web/ dir when present.
const WEB_ROOT = path.resolve(ROOT, '..', 'recodergit-web');
const WEB_DEST = path.join(DIST, '..', 'web');

const skipWeb = ['1', 'true', 'yes'].includes(
  (process.env.RECODERGIT_SKIP_WEB ?? '').trim().toLowerCase(),
);

if (skipWeb) {
  console.log('[build] skipping web UI (RECODERGIT_SKIP_WEB set)');
} else if (fs.existsSync(path.join(WEB_ROOT, 'package.json'))) {
  console.log('[build] building recodergit-web…');
  if (!fs.existsSync(path.join(WEB_ROOT, 'node_modules'))) {
    console.log('[build] installing recodergit-web dependencies…');
    execSync('npm ci', { cwd: WEB_ROOT, stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });
  }
  execSync('npm run build', { cwd: WEB_ROOT, stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });

  // Copy dist → recodergit/web/ (shipped in the npm package)
  fs.rmSync(WEB_DEST, { recursive: true, force: true });
  fs.cpSync(path.join(WEB_ROOT, 'dist'), WEB_DEST, { recursive: true });
  console.log('[build] copied web UI → recodergit/web/');
} else {
  console.log('[build] skipping web UI (recodergit-web not found)');
}

console.log(`[build] done — rewrote ${rewritten} files.`);
