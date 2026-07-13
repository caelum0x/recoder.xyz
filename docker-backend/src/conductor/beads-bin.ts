/**
 * beads-bin — OWNED-binary resolution for the `bd` (beads) CLI.
 *
 * The conductor should not trust whatever `bd` happens to be on PATH
 * (fusion docs §modules/memory/beads: subprocess-cli via PATH → "bundled owned binary").
 * The owned artifact is built from the vendored Go source:
 *
 *   cd modules/memory/beads && go build -o bin/bd ./cmd/bd
 *
 * Resolution order (first hit wins):
 *   1. `BEADS_BIN` env — an explicit absolute path. If set but missing, resolve
 *      to undefined (an explicit-but-broken override must not silently fall
 *      through to a different binary).
 *   2. The owned build output under the repo: `modules/memory/beads/bin/bd` (our build
 *      target), then `modules/memory/beads/bd` (the vendored Makefile's BUILD_DIR=. output).
 *   3. PATH lookup — returns the bare name `bd` only when some PATH dir
 *      actually contains it, preserving prior spawn semantics.
 *
 * DEGRADE-SAFE: returns undefined when nothing is found — callers keep their
 * existing "bd unavailable → skip" behavior; this module never throws and
 * never builds anything (mirrors fleet/manifest.ts makeResolveBinary and
 * conductor/openfang-daemon.ts resolveOpenfangBin).
 */
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/** Env var pointing at an explicit prebuilt `bd` binary. */
export const BEADS_BIN_ENV = 'BEADS_BIN';

/** Repo-relative candidates for the owned build output (first hit wins). */
const OWNED_REL_PATHS: readonly string[][] = [
  ['go', 'beads', 'bin', 'bd'],
  ['go', 'beads', 'bd'],
];

/** The dir this module lives in, resilient across ESM/CJS output. */
function moduleDir(): string {
  try {
    return __dirname;
  } catch {
    return process.cwd();
  }
}

/** Bounded walk up to the repo root (dir containing the vendored modules/memory/beads). Never loops. */
function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'go', 'beads', 'go.mod'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** True when some dir on PATH contains an entry named `name`. */
function existsOnPath(name: string, env: NodeJS.ProcessEnv): boolean {
  const path = env.PATH ?? '';
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, name))) return true;
  }
  return false;
}

/**
 * Resolve the `bd` binary the conductor should shell to, WITHOUT building it.
 * Order: BEADS_BIN env → owned repo build (`modules/memory/beads/bin/bd`) → PATH (`bd`).
 * Returns undefined when none is found (degrade-safe — callers skip cleanly).
 */
export function resolveBeadsBin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[BEADS_BIN_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }

  const root = findRepoRoot(moduleDir());
  if (root) {
    for (const rel of OWNED_REL_PATHS) {
      const candidate = join(root, ...rel);
      if (existsSync(candidate)) return candidate;
    }
  }

  return existsOnPath('bd', env) ? 'bd' : undefined;
}
