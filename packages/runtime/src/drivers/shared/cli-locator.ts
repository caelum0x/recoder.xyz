import { existsSync } from 'node:fs';
import path from 'node:path';

export type CliLocateInput = {
  /** Binary name to find (e.g. `claude`, `codex`). */
  binary: string;
  /** Explicit override path from RuntimeConfig.cliPaths (wins if present + exists). */
  override?: string;
  /** cwd used to probe `node_modules/.bin`. */
  cwd?: string;
  /** PATH string to search (defaults to process.env.PATH). */
  pathEnv?: string;
  /** node_modules/.bin name, if different from `binary`. */
  binName?: string;
};

export type CliLocation = {
  found: boolean;
  resolvedPath?: string;
  /** Where it was found: 'override' | 'local_bin' | 'path' */
  source?: 'override' | 'local_bin' | 'path';
};

/**
 * Find the user's CLI binary without spawning it. Search order:
 *  1. explicit override path
 *  2. node_modules/.bin (local install)
 *  3. PATH entries
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
