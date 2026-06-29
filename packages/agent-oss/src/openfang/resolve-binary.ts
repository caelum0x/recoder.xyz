import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Result of attempting to locate the `openfang` CLI binary (crates/openfang,
 * the Rust autonomous-agent Agent OS). The Rust engine is never built here —
 * we only resolve a binary that already exists on PATH, in an env override,
 * or in a conventional repo `target/` directory.
 */
export type OpenFangBinaryResolution =
  | { available: true; binaryPath: string; source: 'env' | 'path' | 'repo' }
  | { available: false; reason: string; searched: string[] };

const BINARY_NAME = 'openfang';

/** Env var an operator can set to point at a specific openfang binary. */
export const OPENFANG_BINARY_ENV = 'OPENFANG_BINARY';
/** Env var pointing at a checkout of the openfang Rust workspace (crates/openfang). */
export const OPENFANG_HOME_ENV = 'OPENFANG_HOME';

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function platformBinaryNames(): readonly string[] {
  return process.platform === 'win32' ? [`${BINARY_NAME}.exe`, BINARY_NAME] : [BINARY_NAME];
}

function envValue(name: string): string | undefined {
  // process.env is an index signature; read defensively for strict configs.
  const raw = process.env[name];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pathDirectories(): readonly string[] {
  const rawPath = envValue('PATH');
  if (!rawPath) {
    return [];
  }
  return rawPath.split(delimiter).filter((dir) => dir.length > 0);
}

/**
 * Resolve the openfang binary without building anything. Degrade-safe: when the
 * binary cannot be found, returns `{ available: false }` with the searched
 * locations so callers can surface an honest "engine not installed" state.
 */
export function resolveOpenFangBinary(): OpenFangBinaryResolution {
  const searched: string[] = [];

  const explicit = envValue(OPENFANG_BINARY_ENV);
  if (explicit) {
    searched.push(explicit);
    if (isExecutableFile(explicit)) {
      return { available: true, binaryPath: explicit, source: 'env' };
    }
  }

  const names = platformBinaryNames();

  const home = envValue(OPENFANG_HOME_ENV);
  if (home) {
    for (const profile of ['release', 'debug']) {
      for (const name of names) {
        const candidate = join(home, 'target', profile, name);
        searched.push(candidate);
        if (isExecutableFile(candidate)) {
          return { available: true, binaryPath: candidate, source: 'repo' };
        }
      }
    }
  }

  for (const dir of pathDirectories()) {
    for (const name of names) {
      const candidate = join(dir, name);
      searched.push(candidate);
      if (isExecutableFile(candidate)) {
        return { available: true, binaryPath: candidate, source: 'path' };
      }
    }
  }

  return {
    available: false,
    reason:
      `openfang binary not found. Set ${OPENFANG_BINARY_ENV} to an executable, ` +
      `set ${OPENFANG_HOME_ENV} to a built crates/openfang checkout, or place ${BINARY_NAME} on PATH.`,
    searched,
  };
}
