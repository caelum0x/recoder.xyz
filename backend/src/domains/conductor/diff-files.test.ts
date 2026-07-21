/**
 * Per-file diff edges — the numstat changed-file list + single-file patch reads.
 *
 * Proves:
 *  - the pure parsers (`parseNameStatusZ`, `parseNumstatZ`) tokenize the NUL
 *    streams truthfully, including renames (keyed by NEW path, oldPath captured)
 *    and binary counts (`-` → null, never a fabricated 0);
 *  - `workspaceDiffFiles` joins name-status (authoritative status + oldPath) with
 *    numstat counts across added|modified|deleted|renamed|binary;
 *  - both edges DEGRADE-TRUTHFULLY: no worktree / git-absent exec ⇒
 *    `available:false` with empty/null payload (never a throw, never a 500), while
 *    an unknown workspace REJECTS `/not found/` (the route maps that to 404);
 *  - `resolveReviewBase` centralizes the `main` fallback + strips a poisoned ref;
 *  - PATH-OPTION-INJECTION defense: a `-`-prefixed / empty path never reaches exec,
 *    and a valid path is passed ONLY as a pathspec AFTER a literal `--` fence.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ExecResult, ExecOptions } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  parseNameStatusZ,
  parseNumstatZ,
  resolveReviewBase,
  workspaceDiffFiles,
  workspaceFilePatch,
  type ReviewOpsDeps,
} from './review/workspace-review.ops.js';
import { makeLogger } from './__fixtures__/harness.js';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    branch: 'feat/x',
    worktreePath: '/tmp/wt/ws_1',
    baseRef: 'main',
    ...overrides,
  } as unknown as Workspace;
}

type ExecFn = (bin: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>;

/** Build a ReviewOpsDeps whose unused seams throw if reached (these ops read only). */
function makeDeps(workspace: Workspace | null, exec?: ExecFn): ReviewOpsDeps {
  return {
    getWorkspace: async () => workspace,
    advanceWorkspace: async () => {
      throw new Error('per-file reads must never transition state');
    },
    getSubstrate: () => {
      throw new Error('per-file reads must never touch the substrate registry');
    },
    logger: makeLogger(),
    ...(exec ? { exec: exec as ReviewOpsDeps['exec'] } : {}),
  };
}

const NUL = '\0';

describe('resolveReviewBase', () => {
  it('returns the baseRef when it is a real ref', () => {
    expect(resolveReviewBase({ baseRef: 'develop' })).toBe('develop');
  });

  it('falls back to main for unset / HEAD / a poisoned option-like ref', () => {
    expect(resolveReviewBase({ baseRef: undefined })).toBe('main');
    expect(resolveReviewBase({ baseRef: 'HEAD' })).toBe('main');
    expect(resolveReviewBase({ baseRef: '--upload-pack=evil' })).toBe('main');
  });
});

describe('parseNameStatusZ', () => {
  it('reads A/M/D across multiple files (NUL-delimited)', () => {
    const stdout = `A${NUL}src/a.ts${NUL}M${NUL}src/b.ts${NUL}D${NUL}src/c.ts${NUL}`;
    expect(parseNameStatusZ(stdout)).toEqual([
      { status: 'added', path: 'src/a.ts' },
      { status: 'modified', path: 'src/b.ts' },
      { status: 'deleted', path: 'src/c.ts' },
    ]);
  });

  it('reads an R100 rename as renamed with the new path + captured oldPath', () => {
    const stdout = `R100${NUL}src/old.ts${NUL}src/new.ts${NUL}`;
    expect(parseNameStatusZ(stdout)).toEqual([
      { status: 'renamed', path: 'src/new.ts', oldPath: 'src/old.ts' },
    ]);
  });
});

describe('parseNumstatZ', () => {
  it('reads normal insertion/deletion counts', () => {
    const parsed = parseNumstatZ(`10\t2\tsrc/a.ts${NUL}`);
    expect(parsed.get('src/a.ts')).toEqual({ insertions: 10, deletions: 2 });
  });

  it('reads a binary file (git prints `-`) as null counts, never a fabricated 0', () => {
    const parsed = parseNumstatZ(`-\t-\tassets/logo.png${NUL}`);
    expect(parsed.get('assets/logo.png')).toEqual({ insertions: null, deletions: null });
  });

  it('keys a rename record (empty rest + two path tokens) by the NEW path', () => {
    const parsed = parseNumstatZ(`3\t4\t${NUL}src/old.ts${NUL}src/new.ts${NUL}`);
    expect(parsed.get('src/new.ts')).toEqual({ insertions: 3, deletions: 4 });
    expect(parsed.has('src/old.ts')).toBe(false);
  });
});

describe('workspaceDiffFiles', () => {
  const nameStatusOut =
    `A${NUL}f_add.ts${NUL}` +
    `M${NUL}f_mod.ts${NUL}` +
    `D${NUL}f_del.ts${NUL}` +
    `R100${NUL}f_old.ts${NUL}f_new.ts${NUL}` +
    `M${NUL}img.png${NUL}`;
  const numstatOut =
    `10\t0\tf_add.ts${NUL}` +
    `5\t3\tf_mod.ts${NUL}` +
    `0\t8\tf_del.ts${NUL}` +
    `2\t1\t${NUL}f_old.ts${NUL}f_new.ts${NUL}` +
    `-\t-\timg.png${NUL}`;

  it('joins added|modified|deleted|renamed|binary truthfully (happy path)', async () => {
    const exec: ExecFn = async (_bin, args) => {
      if (args.includes('--numstat')) return { stdout: numstatOut, stderr: '', code: 0 };
      if (args.includes('--name-status')) return { stdout: nameStatusOut, stderr: '', code: 0 };
      throw new Error(`unexpected exec: ${args.join(' ')}`);
    };
    const view = await workspaceDiffFiles(makeDeps(makeWorkspace(), exec), 'ws_1');
    expect(view.available).toBe(true);
    expect(view.base).toBe('main');
    expect(view.branch).toBe('feat/x');
    expect(view.files).toEqual([
      { path: 'f_add.ts', status: 'added', insertions: 10, deletions: 0 },
      { path: 'f_mod.ts', status: 'modified', insertions: 5, deletions: 3 },
      { path: 'f_del.ts', status: 'deleted', insertions: 0, deletions: 8 },
      { path: 'f_new.ts', status: 'renamed', insertions: 2, deletions: 1, oldPath: 'f_old.ts' },
      { path: 'img.png', status: 'modified', insertions: null, deletions: null },
    ]);
  });

  it('fences the base before `--` and passes no pathspec', async () => {
    const seen: string[][] = [];
    const exec: ExecFn = async (_bin, args) => {
      seen.push([...args]);
      if (args.includes('--numstat')) return { stdout: '', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    };
    await workspaceDiffFiles(makeDeps(makeWorkspace({ baseRef: 'develop' }), exec), 'ws_1');
    for (const args of seen) {
      const dd = args.indexOf('--');
      expect(dd).toBeGreaterThan(-1);
      // base sits BEFORE the fence; nothing (no pathspec) sits after it.
      expect(args[dd - 1]).toBe('develop');
      expect(args.length).toBe(dd + 1);
    }
  });

  it('degrades to {available:false, files:[]} when the workspace has no worktree (no exec)', async () => {
    const exec = vi.fn<ExecFn>();
    const view = await workspaceDiffFiles(
      makeDeps(makeWorkspace({ worktreePath: undefined }), exec as unknown as ExecFn),
      'ws_1',
    );
    expect(view).toEqual({
      workspaceId: 'ws_1',
      base: 'main',
      branch: 'feat/x',
      available: false,
      files: [],
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('degrades to {available:false, files:[]} when exec throws (git absent / non-repo)', async () => {
    const exec: ExecFn = async () => {
      throw new Error('git: command not found');
    };
    const view = await workspaceDiffFiles(makeDeps(makeWorkspace(), exec), 'ws_1');
    expect(view.available).toBe(false);
    expect(view.files).toEqual([]);
  });

  it('rejects /not found/ for an unknown workspace (route → 404)', async () => {
    await expect(workspaceDiffFiles(makeDeps(null), 'ws_missing')).rejects.toThrow(/not found/);
  });
});

describe('workspaceFilePatch', () => {
  it('returns a unified patch with binary:false, available:true (happy path)', async () => {
    const patch =
      'diff --git a/src/a.ts b/src/a.ts\n' +
      '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n';
    const exec: ExecFn = async () => ({ stdout: patch, stderr: '', code: 0 });
    const view = await workspaceFilePatch(makeDeps(makeWorkspace(), exec), 'ws_1', 'src/a.ts');
    expect(view.available).toBe(true);
    expect(view.binary).toBe(false);
    expect(view.patch).toContain('diff --git');
    expect(view.path).toBe('src/a.ts');
    expect(view.base).toBe('main');
  });

  it('reports a binary file truthfully (binary:true)', async () => {
    const exec: ExecFn = async () => ({
      stdout: 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n',
      stderr: '',
      code: 0,
    });
    const view = await workspaceFilePatch(makeDeps(makeWorkspace(), exec), 'ws_1', 'logo.png');
    expect(view.binary).toBe(true);
    expect(view.available).toBe(true);
  });

  it('returns patch:"" for a computed-but-empty diff', async () => {
    const exec: ExecFn = async () => ({ stdout: '', stderr: '', code: 0 });
    const view = await workspaceFilePatch(makeDeps(makeWorkspace(), exec), 'ws_1', 'src/a.ts');
    expect(view.available).toBe(true);
    expect(view.patch).toBe('');
  });

  it('degrades to patch:null when the workspace has no worktree (no exec)', async () => {
    const exec = vi.fn<ExecFn>();
    const view = await workspaceFilePatch(
      makeDeps(makeWorkspace({ worktreePath: undefined }), exec as unknown as ExecFn),
      'ws_1',
      'src/a.ts',
    );
    expect(view.available).toBe(false);
    expect(view.patch).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('degrades to patch:null when exec throws (incl. an oversize maxBuffer trip)', async () => {
    const exec: ExecFn = async () => {
      throw new Error('stdout maxBuffer exceeded');
    };
    const view = await workspaceFilePatch(makeDeps(makeWorkspace(), exec), 'ws_1', 'src/a.ts');
    expect(view.available).toBe(false);
    expect(view.patch).toBeNull();
  });

  it('rejects /not found/ for an unknown workspace (route → 404)', async () => {
    await expect(
      workspaceFilePatch(makeDeps(null), 'ws_missing', 'src/a.ts'),
    ).rejects.toThrow(/not found/);
  });

  describe('path option-injection defense', () => {
    it('never spawns for a `-`-prefixed path and returns patch:null', async () => {
      const exec = vi.fn<ExecFn>();
      const view = await workspaceFilePatch(
        makeDeps(makeWorkspace(), exec as unknown as ExecFn),
        'ws_1',
        '-x',
      );
      expect(view.available).toBe(false);
      expect(view.patch).toBeNull();
      expect(exec).not.toHaveBeenCalled();
    });

    it('never spawns for an empty path and returns patch:null', async () => {
      const exec = vi.fn<ExecFn>();
      const view = await workspaceFilePatch(
        makeDeps(makeWorkspace(), exec as unknown as ExecFn),
        'ws_1',
        '',
      );
      expect(view.available).toBe(false);
      expect(view.patch).toBeNull();
      expect(exec).not.toHaveBeenCalled();
    });

    it('never spawns for a path containing a NUL byte', async () => {
      const exec = vi.fn<ExecFn>();
      const view = await workspaceFilePatch(
        makeDeps(makeWorkspace(), exec as unknown as ExecFn),
        'ws_1',
        `src/a.ts${NUL}evil`,
      );
      expect(view.available).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    });

    it('passes a valid path ONLY as a pathspec after a literal `--` fence', async () => {
      const seen: string[][] = [];
      const exec: ExecFn = async (_bin, args) => {
        seen.push([...args]);
        return { stdout: '', stderr: '', code: 0 };
      };
      await workspaceFilePatch(makeDeps(makeWorkspace(), exec), 'ws_1', 'src/a.ts');
      expect(seen).toHaveLength(1);
      const args = seen[0];
      const dd = args.indexOf('--');
      const p = args.indexOf('src/a.ts');
      expect(dd).toBeGreaterThan(-1);
      expect(p).toBeGreaterThan(dd); // the path lands AFTER the fence, always a pathspec
      expect(args[dd + 1]).toBe('src/a.ts'); // immediately after `--`, no gap
    });
  });
});
