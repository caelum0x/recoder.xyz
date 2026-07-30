/**
 * Committed per-repo config — `.recoder/settings.json`, checked INTO the repo.
 *
 * Conductor uses `.conductor/settings.toml`; Recoder uses JSON to avoid a TOML
 * dependency while giving the same win: a tracked file that makes a fresh
 * worktree runnable without out-of-band setup. It declares the repo's setup and
 * run scripts and the dev-server port window:
 *
 *   {
 *     "scripts": { "setup": "pnpm install", "run": "pnpm dev -p $RECODER_PORT" },
 *     "port":    { "base": 4300, "span": 200 }
 *   }
 *
 * A committed file lets teammates and CI share one definition instead of each
 * dev re-configuring the governed store. Because it comes from repo contents
 * (untrusted), parsing is degrade-truthful: `parseRepoConfigFile` coerces every
 * field with a safe default and NEVER throws, and `readRepoConfigFile` maps an
 * absent / unreadable / malformed file onto the defaults rather than failing the
 * launch. The governed store still wins where it is set (see resolveRepoScripts
 * callers); this file is the tracked baseline.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_PORT_BASE, DEFAULT_PORT_SPAN } from './workspace-port.js';

/** Repo-relative path of the committed config file. */
export const REPO_CONFIG_FILENAME = '.recoder/settings.json';

export interface RepoConfigScripts {
  /** Shell run once per fresh worktree (deps/env). Empty = none. */
  readonly setup: string;
  /** Shell that runs the app's dev server (may reference `$RECODER_PORT`). Empty = none. */
  readonly run: string;
}

export interface RepoConfigPort {
  readonly base: number;
  readonly span: number;
}

export interface RepoConfigFile {
  readonly scripts: RepoConfigScripts;
  readonly port: RepoConfigPort;
}

/** The all-defaults config — the shape every degrade path returns. */
export function defaultRepoConfigFile(): RepoConfigFile {
  return {
    scripts: { setup: '', run: '' },
    port: { base: DEFAULT_PORT_BASE, span: DEFAULT_PORT_SPAN },
  };
}

function coerceScript(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coercePositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Coerce untrusted JSON into a {@link RepoConfigFile}. Every field falls back to
 * its default when absent or the wrong type; a non-object payload yields the full
 * default. NEVER throws — malformed repo contents degrade, they don't break a run.
 */
export function parseRepoConfigFile(data: unknown): RepoConfigFile {
  if (data == null || typeof data !== 'object') {
    return defaultRepoConfigFile();
  }
  const d = data as Record<string, unknown>;
  const scripts = d.scripts != null && typeof d.scripts === 'object' ? (d.scripts as Record<string, unknown>) : {};
  const port = d.port != null && typeof d.port === 'object' ? (d.port as Record<string, unknown>) : {};
  return {
    scripts: {
      setup: coerceScript(scripts.setup),
      run: coerceScript(scripts.run),
    },
    port: {
      base: coercePositiveInt(port.base, DEFAULT_PORT_BASE),
      span: coercePositiveInt(port.span, DEFAULT_PORT_SPAN),
    },
  };
}

/** Injectable fs seam (tests pass fakes; default = real node fs). */
export interface RepoConfigFs {
  readFile(path: string): Promise<string>;
}

const defaultFs: RepoConfigFs = {
  readFile: (p) => readFile(p, 'utf8'),
};

/**
 * Read `.recoder/settings.json` from a worktree and parse it. An absent file,
 * an unreadable file, or invalid JSON all degrade to {@link defaultRepoConfigFile}
 * — never a throw, so a missing/broken config never fails the agent launch.
 */
export async function readRepoConfigFile(
  worktreePath: string,
  fs: RepoConfigFs = defaultFs,
): Promise<RepoConfigFile> {
  let raw: string;
  try {
    raw = await fs.readFile(join(worktreePath, REPO_CONFIG_FILENAME));
  } catch {
    return defaultRepoConfigFile();
  }
  try {
    return parseRepoConfigFile(JSON.parse(raw));
  } catch {
    return defaultRepoConfigFile();
  }
}
