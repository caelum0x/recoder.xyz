import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Repo-built ts/* engine resolution.
 *
 * The customized engines under `ts/*` (opencode, oh-my-codex, oh-my-openagent,
 * dmux, recodergit, …) are OURS — they are forked/patched and should be PREFERRED
 * over whatever happens to be on the global PATH. This module maps a CLI binary
 * name to the repo-built entrypoint of the corresponding engine, when that build
 * is present on disk.
 *
 * This is strictly additive and degrade-safe: if the repo build is absent (no
 * checkout, engine not built), every lookup returns `{ found: false }` and the
 * caller falls back to its normal PATH resolution. It NEVER fabricates a path —
 * each candidate is `existsSync`-verified before being returned.
 */

/** A repo marker that uniquely identifies the recoder monorepo root. */
const REPO_MARKERS = ['pnpm-workspace.yaml', 'AGENTS.md'] as const;

/** Directory (relative to repo root) that holds the customized engines. */
const TS_ENGINES_DIR = 'ts';

/**
 * Maps a CLI binary name to candidate repo-built entrypoints (relative to repo
 * root), in preference order. The first candidate that exists on disk wins.
 *
 * Multiple candidates per binary make the map resilient to layout/build drift
 * across engines without coupling the locator to a single hard-coded path.
 */
export const REPO_ENGINE_CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  // @recoder/opencode — forked opencode CLI (executable node shim with shebang).
  opencode: [
    'ts/opencode/packages/opencode/bin/opencode',
    'ts/opencode/packages/core/bin/opencode',
  ],
  // @recoder/codex-runtime (oh-my-codex) — built `omx` CLI used by the codex surface.
  codex: ['ts/oh-my-codex/dist/cli/omx.js'],
  // @recoder/opencode-harness (oh-my-openagent) — `oh-my-opencode` harness bin.
  'oh-my-opencode': ['ts/oh-my-openagent/bin/oh-my-opencode.js'],
  'recoder-opencode': ['ts/oh-my-openagent/bin/oh-my-opencode.js'],
  // @recoder/dmux — tmux orchestrator CLI (executable node shim).
  dmux: ['ts/dmux/dmux'],
  'recoder-dmux': ['ts/dmux/dmux'],
  // @recoder/recodergit-engine — recodergit CLI.
  recodergit: ['ts/recodergit/recodergit/dist/cli/index.js'],
} as const;

export type RepoEngineLocation = {
  found: boolean;
  resolvedPath?: string;
};

/**
 * Env flag that forces resolution back to PATH (disables the ts/* engine
 * preference). Lets operators and tests opt out without code changes.
 */
export const DISABLE_REPO_ENGINE_ENV = 'RECODER_DISABLE_REPO_ENGINE';

/**
 * Resolve whether the repo-engine preference is enabled, given a child env.
 * Defaults to `true` (prefer OUR engines); `RECODER_DISABLE_REPO_ENGINE=1|true`
 * turns it off. Reads only the provided env (no implicit `process.env`).
 */
export function repoEnginePreferenceEnabled(
  env: Readonly<Record<string, string | undefined>> | undefined,
): boolean {
  const raw = env?.[DISABLE_REPO_ENGINE_ENV]?.trim().toLowerCase();
  return !(raw === '1' || raw === 'true' || raw === 'yes');
}

/**
 * Walk up from `startDir` to find the recoder monorepo root, identified by a
 * marker file co-located with a `ts/` engines directory. Returns `undefined`
 * when no such root is found (e.g. running outside a checkout) so callers can
 * degrade to PATH.
 */
export function findRepoRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  // Bounded walk to filesystem root; `path.dirname('/') === '/'`.
  for (;;) {
    const hasTsDir = existsSync(path.join(dir, TS_ENGINES_DIR));
    const hasMarker = REPO_MARKERS.some((marker) => existsSync(path.join(dir, marker)));
    if (hasTsDir && hasMarker) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Default search anchors for auto-discovering the repo root, in order. This
 * module lives at `<repo>/packages/runtime/src/drivers/shared/` (or its built
 * `dist/` equivalent), so `__dirname` reliably climbs to the repo root even
 * when `process.cwd()` is a workspace far from the checkout.
 *
 * `__dirname` is shimmed by the bundler for both CJS and ESM output, so this is
 * safe across formats. It is wrapped so a missing global can never throw.
 */
function defaultStartDirs(extra?: string): string[] {
  const dirs: string[] = [];
  if (extra) {
    dirs.push(extra);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof __dirname === 'string' && __dirname) {
      dirs.push(__dirname);
    }
  } catch {
    // __dirname unavailable in this runtime/format — skip silently.
  }
  dirs.push(process.cwd());
  return dirs;
}

export type LocateRepoEngineInput = {
  /** CLI binary name (e.g. `opencode`, `codex`). */
  binary: string;
  /** Explicit repo root; when given, auto-discovery is skipped. */
  repoRoot?: string;
  /** Extra start dir for repo-root auto-discovery (e.g. the run cwd). */
  startDir?: string;
};

/**
 * Resolve the repo-built ts/* engine entrypoint for a binary, if present.
 *
 * Returns `{ found: false }` truthfully when there is no mapping for the binary,
 * when the repo root cannot be located, or when no mapped candidate exists on
 * disk — so the caller falls back to PATH and never green-washes availability.
 */
export function locateRepoEngine(input: LocateRepoEngineInput): RepoEngineLocation {
  const candidates = REPO_ENGINE_CANDIDATES[input.binary];
  if (!candidates || candidates.length === 0) {
    return { found: false };
  }

  const root =
    (input.repoRoot && existsSync(input.repoRoot) ? input.repoRoot : undefined) ??
    firstDefined(defaultStartDirs(input.startDir).map((d) => findRepoRoot(d)));
  if (!root) {
    return { found: false };
  }

  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (existsSync(abs)) {
      return { found: true, resolvedPath: abs };
    }
  }
  return { found: false };
}

function firstDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  for (const v of values) {
    if (v !== undefined) {
      return v;
    }
  }
  return undefined;
}
