import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const repoRoot = path.resolve(appRoot, '..');
const authPackageRoot = path.join(repoRoot, 'packages', 'auth');
const authClientSource = path.join(authPackageRoot, 'prisma', 'auth-client');
const authClientDest = path.join(appRoot, 'prisma', 'auth-client');
const trackedFiles = ['next-env.d.ts', 'tsconfig.json'];
const backups = new Map();

const BUILD_DATABASE_URL = (() => {
  const protocol = 'postgresql';
  const user = 'build';
  const password = 'build';
  const host = 'localhost';
  const port = '5432';
  const database = 'build';
  return `${protocol}://${user}:${password}@${host}:${port}/${database}`;
})();
const BUILD_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const BUILD_AUTH_SECRET = 'recoder-build-only-better-auth-secret-2026-08-15';
const BUILD_SESSION_SECRET = 'recoder-build-only-session-sync-secret-2026-08-15';

function ensureEnv(name, value) {
  if (!process.env[name] || process.env[name].trim() === '') {
    process.env[name] = value;
  }
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with status ${result.status ?? 1}`);
  }
}

function stageAuthClient() {
  if (!fs.existsSync(authClientSource)) {
    console.error(`missing generated auth client at ${authClientSource}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(authClientDest), { recursive: true });
  fs.rmSync(authClientDest, { recursive: true, force: true });
  fs.cpSync(authClientSource, authClientDest, { recursive: true });
}

function backupTrackedFiles() {
  for (const relativePath of trackedFiles) {
    const fullPath = path.join(appRoot, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    backups.set(fullPath, fs.readFileSync(fullPath));
  }
}

function restoreTrackedFiles() {
  for (const [fullPath, contents] of backups.entries()) {
    fs.writeFileSync(fullPath, contents);
  }
}

ensureEnv('SKIP_ENV_VALIDATION', 'true');
ensureEnv('DATABASE_URL', BUILD_DATABASE_URL);
ensureEnv('AUTH_DATABASE_URL', process.env.DATABASE_URL || BUILD_DATABASE_URL);
ensureEnv('BETTER_AUTH_SECRET', BUILD_AUTH_SECRET);
ensureEnv('JWT_SECRET', BUILD_AUTH_SECRET);
ensureEnv('NEXTAUTH_SECRET', BUILD_AUTH_SECRET);
ensureEnv('SESSION_SYNC_SECRET', BUILD_SESSION_SECRET);
ensureEnv('ENCRYPTION_KEY', BUILD_ENCRYPTION_KEY);
ensureEnv('API_KEY_ENCRYPTION_SECRET', BUILD_ENCRYPTION_KEY);

try {
  backupTrackedFiles();
  run('pnpm', ['exec', 'prisma', 'generate'], appRoot);
  if (!fs.existsSync(authClientSource)) {
    run('pnpm', ['run', 'build'], authPackageRoot);
  }
  stageAuthClient();
  run('next', ['build'], appRoot);
} finally {
  restoreTrackedFiles();
  fs.rmSync(authClientDest, { recursive: true, force: true });
}
