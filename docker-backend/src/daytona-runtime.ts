export function shellQuoteSingle(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export const DAYTONA_WORKSPACE_ROOT = '/workspace';

export function getDaytonaNodeBootstrapCommands(options?: {
  cwd?: string | null;
  includeNpx?: boolean;
}): string[] {
  const lines = [
    'NODE_BIN="$(command -v node 2>/dev/null || true)"',
    'if [ -z "$NODE_BIN" ]; then',
    'for candidate in /usr/local/nvm/versions/node/*/bin/node /usr/local/bin/node /usr/bin/node; do',
    'if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi',
    'done',
    'fi',
    'if [ -z "$NODE_BIN" ]; then echo missing-node; exit 1; fi',
    'export PATH="$(dirname "$NODE_BIN"):$PATH"',
    'NPM_BIN="$(command -v npm 2>/dev/null || true)"',
    'if [ -z "$NPM_BIN" ]; then',
    'for candidate in /usr/local/nvm/versions/node/*/bin/npm /usr/local/bin/npm /usr/bin/npm; do',
    'if [ -x "$candidate" ]; then NPM_BIN="$candidate"; break; fi',
    'done',
    'fi',
    'if [ -z "$NPM_BIN" ]; then echo missing-npm; exit 1; fi',
  ];

  if (options?.includeNpx) {
    lines.push(
      'NPX_BIN="$(command -v npx 2>/dev/null || true)"',
      'if [ -z "$NPX_BIN" ]; then',
      'for candidate in /usr/local/nvm/versions/node/*/bin/npx /usr/local/bin/npx /usr/bin/npx; do',
      'if [ -x "$candidate" ]; then NPX_BIN="$candidate"; break; fi',
      'done',
      'fi',
      'if [ -z "$NPX_BIN" ]; then echo missing-npx; exit 1; fi',
    );
  }

  if (options?.cwd !== null) {
    lines.push(`cd ${shellQuoteSingle(options?.cwd || DAYTONA_WORKSPACE_ROOT)}`);
  }

  return lines;
}

export function buildDaytonaInstallCommand(hasPackageLock: boolean): string {
  const npmPrelude = [
    'rm -rf "$HOME/.npm/_cacache" "$HOME/.npm/_logs" /tmp/npm-cache 2>/dev/null || true',
    'mkdir -p /tmp/npm-cache',
    'mkdir -p /tmp/npm-tmp',
    'export TMPDIR=/tmp/npm-tmp',
    'export npm_config_tmp=/tmp/npm-tmp',
    'export npm_config_cache=/tmp/npm-cache',
    'export npm_config_update_notifier=false',
    'export npm_config_fund=false',
    'export npm_config_audit=false',
    'export npm_config_progress=false',
    'export npm_config_prefer_offline=true',
  ].join(' && ');

  if (hasPackageLock) {
    return `${npmPrelude} && "${'$'}NPM_BIN" ci --no-audit --no-fund --install-strategy=shallow`;
  }

  return `${npmPrelude} && "${'$'}NPM_BIN" install --legacy-peer-deps --no-audit --no-fund --install-strategy=shallow`;
}

export function buildDaytonaCommandScript(
  commandLines: string[],
  options?: { cwd?: string | null; includeNpx?: boolean },
): string {
  return [
    ...getDaytonaNodeBootstrapCommands(options),
    ...commandLines,
  ].join('\n');
}

export function buildDaytonaBackgroundCommand(
  commandLines: string[],
  options?: { cwd?: string | null; includeNpx?: boolean },
): string {
  return `sh -lc ${shellQuoteSingle(buildDaytonaCommandScript(commandLines, options))}`;
}
