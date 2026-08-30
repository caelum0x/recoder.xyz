/**
 * The BUILT-IN skill capability handlers — the closed set of effects the governed
 * skill model actually runs (recoder-ubyg #3). These are the ONLY things a signed
 * skill action can do; there is NO arbitrary code path. This catalog is
 * deliberately READ-ONLY and worktree-bounded — safe to enable by default:
 *
 *  - `workspace.read_file`  — read one text file BY its relative `path`, resolved
 *    strictly INSIDE the action's trusted worktree (a traversal / absolute /
 *    symlink-escape target is refused, never read).
 *  - `workspace.list_files` — list entries under an optional relative `dir`, same
 *    containment rule; returns names + kinds, never contents.
 *  - `workspace.search_text` — bounded text search with file/line evidence.
 *  - `workspace.read_diff` — read a working-tree or staged Git patch, including
 *    deleted paths that no longer exist on disk.
 *
 * Every handler receives ONLY the capability-scoped {@link SkillActionContext}
 * (typed params + the RESOLVED, owned worktree path the service already validated)
 * — never ambient cwd/env/secrets. A path that escapes the worktree, or any fs
 * fault, is a truthful `{ ok:false, error }`, never a fabricated success and never
 * a read outside the sandbox.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { SkillCapabilityHandler, SkillCapabilityHandlers } from './skill-executor.js';
import type { SkillActionContext } from './skill.types.js';

/** Capability tokens this module implements (stable, greppable). */
export const CAP_WORKSPACE_READ_FILE = 'workspace.read_file';
export const CAP_WORKSPACE_LIST_FILES = 'workspace.list_files';
export const CAP_WORKSPACE_SEARCH_TEXT = 'workspace.search_text';
export const CAP_WORKSPACE_READ_DIFF = 'workspace.read_diff';

/** Max bytes a single `read_file` returns — a runaway file is truncated, never OOMs. */
const MAX_READ_BYTES = 256 * 1024;
/** Max entries `list_files` returns. */
const MAX_LIST_ENTRIES = 1000;
const MAX_SEARCH_FILES = 5000;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_RESULTS = 250;
const MAX_DIFF_BYTES = 1024 * 1024;
const execFileAsync = promisify(execFile);
const SKIP_SEARCH_DIRS = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'target']);

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

/**
 * Validate a Git pathspec without requiring the target to exist. Unlike ordinary
 * file reads, a diff must be able to name a deleted file. The returned path is a
 * normalized relative path, never an absolute/escaping path or Git magic pathspec.
 */
function safeGitRelativePath(root: string, rel: string): string | null {
  if (isAbsolute(rel) || rel.includes('\0')) return null;
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, rel);
  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) return null;
  const normalized = relative(rootResolved, candidate) || '.';
  if (normalized.startsWith(':')) return null;
  return normalized;
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

const searchTextHandler: SkillCapabilityHandler = {
  async execute(ctx) {
    const query = paramString(ctx, 'query');
    const dir = paramString(ctx, 'dir') ?? '.';
    const caseSensitive = ctx.params.caseSensitive === true;
    const requestedMax = typeof ctx.params.maxResults === 'number'
      ? Math.floor(ctx.params.maxResults)
      : 100;
    const maxResults = Math.max(1, Math.min(MAX_SEARCH_RESULTS, requestedMax));
    if (!query) return { ok: false, error: 'search_text requires a non-empty string param `query`' };
    const root = await realpath(ctx.workspace).catch(() => null);
    const start = await resolveInside(ctx.workspace, dir);
    if (!root || !start) {
      return { ok: false, error: `dir is outside the workspace or does not exist: ${dir}` };
    }
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const queue = [start];
    const matches: Array<{ path: string; line: number; preview: string }> = [];
    let filesRead = 0;
    while (queue.length > 0 && filesRead < MAX_SEARCH_FILES && matches.length < maxResults) {
      const current = queue.shift()!;
      const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (matches.length >= maxResults || filesRead >= MAX_SEARCH_FILES) break;
        if (entry.isDirectory() && SKIP_SEARCH_DIRS.has(entry.name)) continue;
        const candidate = resolve(current, entry.name);
        const contained = await realpath(candidate).catch(() => null);
        if (!contained || (contained !== root && !contained.startsWith(root + sep))) continue;
        if (entry.isDirectory()) {
          queue.push(contained);
          continue;
        }
        if (!entry.isFile()) continue;
        filesRead += 1;
        const buffer = await readFile(contained).catch(() => null);
        if (!buffer || buffer.length > MAX_SEARCH_FILE_BYTES || buffer.includes(0)) continue;
        const lines = buffer.toString('utf8').split(/\r?\n/);
        for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
          const haystack = caseSensitive ? lines[index] : lines[index].toLocaleLowerCase();
          if (!haystack.includes(needle)) continue;
          matches.push({
            path: relative(root, contained) || '.',
            line: index + 1,
            preview: lines[index].slice(0, 500),
          });
        }
      }
    }
    return {
      ok: true,
      output: {
        query,
        dir,
        filesRead,
        truncated: queue.length > 0 || matches.length >= maxResults,
        matches,
      },
    };
  },
};

const readDiffHandler: SkillCapabilityHandler = {
  async execute(ctx) {
    const path = paramString(ctx, 'path');
    const scope = paramString(ctx, 'scope') ?? 'working';
    const args = ['diff', '--no-ext-diff', '--unified=3'];
    if (scope === 'staged') args.push('--cached');
    if (path) {
      const target = safeGitRelativePath(ctx.workspace, path);
      if (!target) return { ok: false, error: `path is outside the workspace or invalid: ${path}` };
      args.push('--', target);
    }
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: ctx.workspace,
        timeout: 10_000,
        maxBuffer: MAX_DIFF_BYTES,
        encoding: 'utf8',
      });
      return { ok: true, output: { scope, ...(path ? { path } : {}), patch: stdout } };
    } catch (error) {
      return { ok: false, error: `diff failed: ${error instanceof Error ? error.message : String(error)}` };
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
    [CAP_WORKSPACE_SEARCH_TEXT]: searchTextHandler,
    [CAP_WORKSPACE_READ_DIFF]: readDiffHandler,
  };
}
