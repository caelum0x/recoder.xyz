/**
 * herdr-path — OWNED-binary resolution for the vendored `herdr` engine.
 *
 * herdr (vendored under apps/desktop/engines/herdr, Apache-2.0) is a standalone
 * Rust binary with a headless server (`herdr server`) exposing an NDJSON
 * Unix-socket control API. The conductor drives it as a third execution substrate
 * beside `tmux_worktree` and `acp` (docs/HERDR-INTEGRATION.md §Phase 2). Like
 * `tmux-path.ts` and `beads-bin.ts`, we own the binary by vendoring + pinning +
 * driving — never by trusting whatever `herdr` happens to be on PATH.
 *
 * Resolution order (first hit wins):
 *   1. `CONDUCTOR_HERDR_BIN` env — an explicit absolute path. If set but MISSING,
 *      resolve to `{ bin: null }` (an explicit-but-broken override must not
 *      silently fall through to a different binary — the beads-bin precedent).
 *   2. Packaged desktop resources (electron-builder extraResources ships the
 *      built sidecar to `<resources>/backend/engines/herdr/herdr`): via
 *      `process.resourcesPath` when present, and dist-relative from this module
 *      (`<resources>/backend/dist/domains/engines` → three ups → `backend/`)
 *      because the ELECTRON_RUN_AS_NODE backend child has no resourcesPath.
 *   3. The dev build under the repo: `apps/desktop/engines/herdr/target/release/herdr`
 *      (`cargo build --release` output), located by a bounded ancestor-walk.
 *   4. PATH lookup — returns the bare name `herdr` only when some PATH dir
 *      actually contains it, preserving spawn semantics. This stays LAST: a PATH
 *      herdr may be a version/protocol mismatch with the vendored source.
 *
 * TRUTHFUL: returns `{ bin: null, reason }` when nothing resolves — the daemon
 * manager then reports the substrate unavailable with that reason rather than
 * spawning a phantom. This module never throws and never builds anything.
 */
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/** Env var pointing at an explicit prebuilt `herdr` binary. */
export const HERDR_BIN_ENV = 'CONDUCTOR_HERDR_BIN';

/** How a resolved binary was found (for truthful diagnostics). */
export type HerdrBinSource = 'env' | 'packaged' | 'dev' | 'path' | 'none';

/** The truthful result of resolving the herdr binary. */
export interface HerdrBinResolution {
  /** The resolved binary path/name, or `null` when nothing resolved. */
  readonly bin: string | null;
  /** Which candidate satisfied resolution (`'none'` when unresolved). */
  readonly source: HerdrBinSource;
  /** Present only when `bin` is `null`: why nothing resolved. */
  readonly reason?: string;
}

/** Injectable seams for {@link resolveHerdrBin} (unit tests; defaults are real). */
export interface ResolveHerdrBinDeps {
  readonly existsSync?: (p: string) => boolean;
  /** Overrides Electron's `process.resourcesPath` (absent in plain Node). */
  readonly resourcesPath?: string;
  /** Overrides this module's own directory (`__dirname`). */
  readonly moduleDir?: string;
}

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
 * built sidecar to `<resources>/backend/engines/herdr/herdr`. Two routes because
 * the backend child runs with ELECTRON_RUN_AS_NODE=1 (no `process.resourcesPath`):
 * the module dir is `<resources>/backend/dist/domains/engines`, so three ups land
 * on `<resources>/backend` (same shape beads-bin.ts relies on).
 */
function packagedCandidates(
  dir: string,
  resourcesPath: string | undefined
): string[] {
  const candidates: string[] = [];
  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'backend', 'engines', 'herdr', 'herdr'));
  }
  candidates.push(join(dir, '..', '..', '..', 'engines', 'herdr', 'herdr'));
  return candidates;
}

/**
 * Bounded walk up to the repo root (the dir holding the vendored herdr source
 * `apps/desktop/engines/herdr/Cargo.toml`). Never loops; returns undefined when
 * not found within a bounded number of parents.
 */
function findRepoRoot(
  startDir: string,
  exists: (p: string) => boolean
): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (
      exists(join(dir, 'apps', 'desktop', 'engines', 'herdr', 'Cargo.toml'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** True when some dir on PATH contains an entry named `name`. */
function existsOnPath(
  name: string,
  env: NodeJS.ProcessEnv,
  exists: (p: string) => boolean
): boolean {
  const path = env.PATH ?? '';
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    if (exists(join(dir, name))) return true;
  }
  return false;
}

/**
 * Resolve the `herdr` binary the conductor should spawn, WITHOUT building it.
 * Order: `CONDUCTOR_HERDR_BIN` env → packaged desktop resources → dev repo build
 * (`apps/desktop/engines/herdr/target/release/herdr`) → PATH (`herdr`). Returns a
 * truthful `{ bin: null, reason }` when none is found (degrade-safe — the daemon
 * reports the substrate unavailable). Never throws.
 */
export function resolveHerdrBin(
  env: NodeJS.ProcessEnv = process.env,
  deps: ResolveHerdrBinDeps = {}
): HerdrBinResolution {
  const exists = deps.existsSync ?? existsSync;

  const explicit = env[HERDR_BIN_ENV]?.trim();
  if (explicit) {
    return exists(explicit)
      ? { bin: explicit, source: 'env' }
      : {
          bin: null,
          source: 'none',
          reason: `${HERDR_BIN_ENV} set but not found: ${explicit}`,
        };
  }

  const dir = deps.moduleDir ?? defaultModuleDir();
  const resourcesPath =
    deps.resourcesPath ??
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  for (const candidate of packagedCandidates(dir, resourcesPath)) {
    if (exists(candidate)) return { bin: candidate, source: 'packaged' };
  }

  const root = findRepoRoot(dir, exists);
  if (root) {
    const built = join(
      root,
      'apps',
      'desktop',
      'engines',
      'herdr',
      'target',
      'release',
      'herdr'
    );
    if (exists(built)) return { bin: built, source: 'dev' };
  }

  if (existsOnPath('herdr', env, exists)) return { bin: 'herdr', source: 'path' };

  return {
    bin: null,
    source: 'none',
    reason:
      'herdr binary not found (set CONDUCTOR_HERDR_BIN or build apps/desktop/engines/herdr with `cargo build --release`)',
  };
}
