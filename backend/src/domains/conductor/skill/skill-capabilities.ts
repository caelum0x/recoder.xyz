/**
 * The BUILT-IN skill capability handlers — the closed set of effects the governed
 * skill model actually runs (recoder-ubyg #3). These are the ONLY things a signed
 * skill action can do; there is NO arbitrary code path. This first set is
 * deliberately READ-ONLY and worktree-bounded — safe to enable by default:
 *
 *  - `workspace.read_file`  — read one text file BY its relative `path`, resolved
 *    strictly INSIDE the action's trusted worktree (a traversal / absolute /
 *    symlink-escape target is refused, never read).
 *  - `workspace.list_files` — list entries under an optional relative `dir`, same
 *    containment rule; returns names + kinds, never contents.
 *
 * Every handler receives ONLY the capability-scoped {@link SkillActionContext}
 * (typed params + the RESOLVED, owned worktree path the service already validated)
 * — never ambient cwd/env/secrets. A path that escapes the worktree, or any fs
 * fault, is a truthful `{ ok:false, error }`, never a fabricated success and never
 * a read outside the sandbox.
 */
import { readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { SkillCapabilityHandler, SkillCapabilityHandlers } from './skill-executor.js';
import type { SkillActionContext } from './skill.types.js';

/** Capability tokens this module implements (stable, greppable). */
export const CAP_WORKSPACE_READ_FILE = 'workspace.read_file';
export const CAP_WORKSPACE_LIST_FILES = 'workspace.list_files';

/** Max bytes a single `read_file` returns — a runaway file is truncated, never OOMs. */
const MAX_READ_BYTES = 256 * 1024;
/** Max entries `list_files` returns. */
const MAX_LIST_ENTRIES = 1000;

function paramString(ctx: SkillActionContext, key: string): string | undefined {
  const value = ctx.params[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Resolve an untrusted relative `rel` strictly INSIDE `root` (the trusted worktree),
 * following symlinks and re-checking containment on the REAL path — so neither
 * `../` nor a symlink can escape the sandbox. Returns the real absolute path, or
 * `null` when it escapes / does not exist.
 */
async function resolveInside(root: string, rel: string): Promise<string | null> {
  // A leading `/` or `..` that climbs out is rejected by the containment check below.
  const candidate = resolve(root, rel);
  const rootReal = await realpath(root).catch(() => null);
  if (rootReal === null) return null;
  const targetReal = await realpath(candidate).catch(() => null);
  if (targetReal === null) return null;
  // Contained iff the real target is the root itself or sits under `root + sep`.
  if (targetReal !== rootReal && !targetReal.startsWith(rootReal + sep)) return null;
  return targetReal;
}

const readFileHandler: SkillCapabilityHandler = {
  async execute(ctx) {
    const rel = paramString(ctx, 'path');
    if (!rel) return { ok: false, error: 'read_file requires a non-empty string param `path`' };
    const abs = await resolveInside(ctx.workspace, rel);
    if (abs === null) {
      return { ok: false, error: `path is outside the workspace or does not exist: ${rel}` };
    }
    try {
      const buf = await readFile(abs);
      const truncated = buf.length > MAX_READ_BYTES;
      const text = buf.subarray(0, MAX_READ_BYTES).toString('utf8');
      return { ok: true, output: { path: rel, bytes: buf.length, truncated, content: text } };
    } catch (err) {
      return { ok: false, error: `read failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

const listFilesHandler: SkillCapabilityHandler = {
  async execute(ctx) {
    const rel = paramString(ctx, 'dir') ?? '.';
    const abs = await resolveInside(ctx.workspace, rel);
    if (abs === null) {
      return { ok: false, error: `dir is outside the workspace or does not exist: ${rel}` };
    }
    try {
      const dirents = await readdir(abs, { withFileTypes: true });
      const entries = dirents.slice(0, MAX_LIST_ENTRIES).map((d) => ({
        name: d.name,
        kind: d.isDirectory() ? 'dir' : d.isFile() ? 'file' : 'other',
      }));
      return { ok: true, output: { dir: rel, truncated: dirents.length > MAX_LIST_ENTRIES, entries } };
    } catch (err) {
      return { ok: false, error: `list failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

/**
 * The default, SAFE-to-enable built-in capability set: read-only, worktree-bounded
 * introspection. A deployment passes these to `createCapabilityDispatchExecutor`;
 * higher-risk write/network capabilities are NOT included here and must be added
 * deliberately (each a reviewed, governance-gated built-in).
 */
export function builtinReadOnlyWorkspaceCapabilities(): SkillCapabilityHandlers {
  return {
    [CAP_WORKSPACE_READ_FILE]: readFileHandler,
    [CAP_WORKSPACE_LIST_FILES]: listFilesHandler,
  };
}
