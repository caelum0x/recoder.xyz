import { existsSync } from 'node:fs';
import path from 'node:path';
import { locateRepoEngine } from './repo-engine-locator';

export type CliLocateInput = {
  /** Binary name to find (e.g. `claude`, `codex`). */
  binary: string;
  /** Explicit override path from RuntimeConfig.cliPaths (wins if present + exists). */
  override?: string;
  /** cwd used to probe `node_modules/.bin` and as a repo-root discovery anchor. */
  cwd?: string;
  /** PATH string to search (defaults to process.env.PATH). */
  pathEnv?: string;
  /** node_modules/.bin name, if different from `binary`. */
  binName?: string;
  /**
   * Explicit recoder monorepo root. When set, the repo-built `ts/*` engine for
   * this binary is preferred over PATH. When omitted, the root is auto-discovered
   * (module-relative + cwd). Set `preferRepoEngine: false` to opt out entirely.
   */
  repoRoot?: string;
  /**
   * Whether to prefer the repo-built `ts/*` engine over PATH (default `true`).
   * The repo engine still loses to `override` and `node_modules/.bin`, and is
   * only used when its build is actually present on disk (degrade-safe).
   */
  preferRepoEngine?: boolean;
};

export type CliLocation = {
  found: boolean;
  resolvedPath?: string;
  /** Where it was found: 'override' | 'local_bin' | 'repo_engine' | 'path' */
  source?: 'override' | 'local_bin' | 'repo_engine' | 'path';
};

/**
 * Find the CLI binary to run without spawning it. Search order:
 *  1. explicit override path
 *  2. node_modules/.bin (local install)
 *  3. repo-built `ts/*` engine (OURS — customized; preferred over global PATH)
 *  4. PATH entries
 *
 * The customized engines under `ts/*` are forked/patched and intentionally take
 * precedence over a global-PATH binary of the same name, but only when their
 * build is present on disk. If the repo build is absent, resolution degrades to
 * the PATH lookup unchanged.
 *
 * Returns `{ found: false }` truthfully when absent — callers must NOT fake availability.
 */
export function locateCli(input: CliLocateInput): CliLocation {
  if (input.override && existsSync(input.override)) {
    return { found: true, resolvedPath: input.override, source: 'override' };
  }

  const binName = input.binName ?? input.binary;
  if (input.cwd) {
    const localBin = path.join(input.cwd, 'node_modules', '.bin', binName);
    if (existsSync(localBin)) {
      return { found: true, resolvedPath: localBin, source: 'local_bin' };
    }
  }

  // Prefer OUR repo-built ts/* engine over a global-PATH binary, when present.
  if (input.preferRepoEngine !== false) {
    const repoEngine = locateRepoEngine({
      binary: input.binary,
      repoRoot: input.repoRoot,
      startDir: input.cwd,
    });
    if (repoEngine.found && repoEngine.resolvedPath) {
      return { found: true, resolvedPath: repoEngine.resolvedPath, source: 'repo_engine' };
    }
  }

  const pathEnv = input.pathEnv ?? process.env['PATH'] ?? '';
  const candidates = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of candidates) {
    const candidate = path.join(dir, input.binary);
    if (existsSync(candidate)) {
      return { found: true, resolvedPath: candidate, source: 'path' };
    }
    if (process.platform === 'win32') {
      const exe = `${candidate}.exe`;
      if (existsSync(exe)) {
        return { found: true, resolvedPath: exe, source: 'path' };
      }
    }
  }

  return { found: false };
}
