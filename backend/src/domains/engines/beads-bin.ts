/**
 * beads-bin — OWNED-binary resolution for the `bd` (beads) CLI.
 *
 * The conductor should not trust whatever `bd` happens to be on PATH
 * (fusion docs §apps/desktop/server/engines/beads: subprocess-cli via PATH → "bundled owned binary").
 * The owned artifact is built from the vendored Go source:
 *
 *   cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd
 *
 * Resolution order (first hit wins):
 *   1. `BEADS_BIN` env — an explicit absolute path. If set but missing, resolve
 *      to undefined (an explicit-but-broken override must not silently fall
 *      through to a different binary).
 *   2. Packaged desktop resources (electron-builder extraResources ships the
 *      owned build to `<resources>/backend/engines/beads/bin/bd`): via
 *      `process.resourcesPath` when present, and dist-relative from this module
 *      (`<resources>/backend/dist/domains/engines` → three ups → `backend/`)
 *      because the ELECTRON_RUN_AS_NODE backend child has no resourcesPath.
 *   3. The owned build output under the repo: `apps/desktop/server/engines/beads/bin/bd` (our build
 *      target), then `apps/desktop/server/engines/beads/bd` (the vendored Makefile's BUILD_DIR=. output).
 *   4. PATH lookup — returns the bare name `bd` only when some PATH dir
 *      actually contains it, preserving prior spawn semantics. This stays LAST:
 *      a PATH bd may be DB-incompatible with the vendored issue graph.
 *
 * DEGRADE-SAFE: returns undefined when nothing is found — callers keep their
 * existing "bd unavailable → skip" behavior; this module never throws and
 * never builds anything (mirrors fleet/manifest.ts makeResolveBinary and
 * conductor/openfang-daemon.ts resolveOpenfangBin).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/** Env var pointing at an explicit prebuilt `bd` binary. */
export const BEADS_BIN_ENV = 'BEADS_BIN';

/** Repo-relative candidates for the owned build output (first hit wins). */
const OWNED_REL_PATHS: readonly string[][] = [
  ['apps', 'desktop', 'server', 'engines', 'beads', 'bin', 'bd'],
  ['apps', 'desktop', 'server', 'engines', 'beads', 'bd'],
];

/** Injectable seams for {@link resolveBeadsBin} (unit tests; defaults are the real ones). */
export type ResolveBeadsBinDeps = {
  existsSync?: (p: string) => boolean;
  /** Overrides Electron's `process.resourcesPath` (absent in plain Node). */
  resourcesPath?: string;
  /** Overrides this module's own directory (`__dirname`). */
  moduleDir?: string;
};

/** The dir this module lives in, resilient across ESM/CJS output. */
function defaultModuleDir(): string {
  try {
    return __dirname;
  } catch {
    return process.cwd();
  }
}

/**
 * Candidates inside a PACKAGED desktop install, where extraResources ships the
 * owned build to `<resources>/backend/engines/beads/bin/bd`. Two routes because
 * the backend child runs with ELECTRON_RUN_AS_NODE=1 (no `process.resourcesPath`):
 * the module dir is `<resources>/backend/dist/domains/engines`, so three ups
 * land on `<resources>/backend` (same shape recodergit-service.ts relies on).
 */
function packagedCandidates(dir: string, resourcesPath: string | undefined): string[] {
  const candidates: string[] = [];
  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'backend', 'engines', 'beads', 'bin', 'bd'));
  }
  candidates.push(join(dir, '..', '..', '..', 'engines', 'beads', 'bin', 'bd'));
  return candidates;
}

/** Bounded walk up to the repo root (dir containing the vendored apps/desktop/server/engines/beads). Never loops. */
function findRepoRoot(startDir: string, exists: (p: string) => boolean): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (exists(join(dir, 'apps', 'desktop', 'server', 'engines', 'beads', 'go.mod'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** True when some dir on PATH contains an entry named `name`. */
function existsOnPath(name: string, env: NodeJS.ProcessEnv, exists: (p: string) => boolean): boolean {
  const path = env.PATH ?? '';
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    if (exists(join(dir, name))) return true;
  }
  return false;
}

/**
 * Resolve the `bd` binary the conductor should shell to, WITHOUT building it.
 * Order: BEADS_BIN env → packaged desktop resources → owned repo build
 * (`apps/desktop/server/engines/beads/bin/bd`) → PATH (`bd`).
 * Returns undefined when none is found (degrade-safe — callers skip cleanly).
 */
export function resolveBeadsBin(
  env: NodeJS.ProcessEnv = process.env,
  deps: ResolveBeadsBinDeps = {},
): string | undefined {
  const exists = deps.existsSync ?? existsSync;
  const explicit = env[BEADS_BIN_ENV]?.trim();
  if (explicit) {
    return exists(explicit) ? explicit : undefined;
  }

  const dir = deps.moduleDir ?? defaultModuleDir();
  const resourcesPath =
    deps.resourcesPath ??
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  for (const candidate of packagedCandidates(dir, resourcesPath)) {
    if (exists(candidate)) return candidate;
  }

  const root = findRepoRoot(dir, exists);
  if (root) {
    for (const rel of OWNED_REL_PATHS) {
      const candidate = join(root, ...rel);
      if (exists(candidate)) return candidate;
    }
  }

  return existsOnPath('bd', env, exists) ? 'bd' : undefined;
}

/**
 * Binary used to shell out to beads. Explicit env overrides win, then the OWNED
 * repo build / PATH via {@link resolveBeadsBin}. Falls back to the bare name
 * `bd` so the availability probe (not this resolver) stays the single truthful
 * "is bd usable" gate — behavior is unchanged when nothing is installed.
 */
export function beadsBin(): string {
  return (
    process.env.CONDUCTOR_BD_BIN?.trim() ||
    process.env.BD_BIN?.trim() ||
    resolveBeadsBin() ||
    'bd'
  );
}

export type BeadsAvailability = {
  available: boolean;
  bin: string;
  version?: string;
  reason?: string;
};

/**
 * Truthful availability of the `bd` CLI. Runs `bd --version` as a subprocess and
 * reports whether it succeeded — never throws. When this returns
 * `available: false`, every sync entry point cleanly skips.
 */
export function beadsAvailability(): BeadsAvailability {
  const bin = beadsBin();
  try {
    const out = execFileSync(bin, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    });
    return { available: true, bin, version: out.trim() || undefined };
  } catch (err) {
    return {
      available: false,
      bin,
      reason: err instanceof Error ? err.message : 'bd not available',
    };
  }
}
