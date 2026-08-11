/**
 * Bounded transcript search over a faked ~/.claude/projects tree.
 *
 * Proves: it globs <slug>/<session>.jsonl, parses+searches each, tags hits with
 * the session id; an empty query returns no hits without touching the fs; a
 * missing base dir is a truthful available:false; a single unreadable session is
 * skipped, not fatal.
 */
import { describe, it, expect } from 'vitest';
import { SessionTranscriptService, type SessionTranscriptFs } from './session-transcript.service.js';
import { makeLogger } from '../__fixtures__/harness.js';

function makeFs(tree: Record<string, string[]>, files: Record<string, string | Error>): SessionTranscriptFs {
  return {
    readdir: async (dir: string) => {
      const entry = tree[dir];
      if (entry == null) throw new Error(`ENOENT ${dir}`);
      return entry;
    },
    readFile: async (path: string) => {
      const f = files[path];
      if (f == null || f instanceof Error) throw f ?? new Error(`ENOENT ${path}`);
      return f;
    },
  };
}

const BASE = '/home/dev/.claude/projects';

function serviceWith(fs: SessionTranscriptFs): SessionTranscriptService {
  return new SessionTranscriptService({ logger: makeLogger(), fs, baseDir: BASE });
}

describe('SessionTranscriptService.search', () => {
  it('finds a message across sessions and tags the hit with its session id', async () => {
    const fs = makeFs(
      { [BASE]: ['proj-a', 'proj-b'], [`${BASE}/proj-a`]: ['s1.jsonl'], [`${BASE}/proj-b`]: ['s2.jsonl', 'notes.txt'] },
      {
        [`${BASE}/proj-a/s1.jsonl`]: '{"type":"user","message":{"role":"user","content":"fix the AUTH bug"}}',
        [`${BASE}/proj-b/s2.jsonl`]: '{"type":"assistant","message":{"role":"assistant","content":"unrelated"}}',
      },
    );
    const view = await serviceWith(fs).search('auth');
    expect(view.available).toBe(true);
    expect(view.filesScanned).toBe(2);
    expect(view.hits).toHaveLength(1);
    expect(view.hits[0].sessionId).toBe('s1');
    expect(view.hits[0].snippet).toContain('AUTH');
  });

  it('returns no hits (and skips the fs) for an empty query', async () => {
    let touched = false;
    const fs: SessionTranscriptFs = {
      readdir: async () => {
        touched = true;
        return [];
      },
      readFile: async () => '',
    };
    const view = await serviceWith(fs).search('   ');
    expect(view).toEqual({ available: true, query: '', hits: [], filesScanned: 0 });
    expect(touched).toBe(false);
  });

  it('reports available:false when there is no sessions directory', async () => {
    const fs = makeFs({}, {}); // readdir(BASE) throws
    const view = await serviceWith(fs).search('auth');
    expect(view.available).toBe(false);
    expect(view.reason).toMatch(/no Claude sessions/);
  });

  it('skips an unreadable session file instead of failing the whole search', async () => {
    const fs = makeFs(
      { [BASE]: ['p'], [`${BASE}/p`]: ['bad.jsonl', 'good.jsonl'] },
      {
        [`${BASE}/p/bad.jsonl`]: new Error('EACCES'),
        [`${BASE}/p/good.jsonl`]: '{"type":"user","message":{"role":"user","content":"needle here"}}',
      },
    );
    const view = await serviceWith(fs).search('needle');
    expect(view.available).toBe(true);
    expect(view.filesScanned).toBe(1);
    expect(view.hits).toHaveLength(1);
    expect(view.hits[0].sessionId).toBe('good');
  });
});

// Per-workspace transcript read (the recoder-qj83 durable read edge): derive the
// Claude slug from the worktree path (`/[/.]/g` → `-`), pick the NEWEST session
// file (via the optional stat seam), and parse it — degrade-truthful (no session
// file ⇒ available:false, never a throw).
function makeWorkspaceFs(
  dir: string,
  entries: string[],
  files: Record<string, string | Error>,
  mtimes?: Record<string, number>,
): SessionTranscriptFs {
  const fs: SessionTranscriptFs = {
    readdir: async (d: string) => {
      if (d !== dir) throw new Error(`ENOENT ${d}`);
      return entries;
    },
    readFile: async (path: string) => {
      const f = files[path];
      if (f == null || f instanceof Error) throw f ?? new Error(`ENOENT ${path}`);
      return f;
    },
  };
  if (mtimes != null) {
    fs.stat = async (path: string) => {
      const m = mtimes[path];
      if (m == null) throw new Error(`ENOENT ${path}`);
      return { mtimeMs: m };
    };
  }
  return fs;
}

const WORKTREE = '/home/dev/work/proj';
const WORK_DIR = `${BASE}/-home-dev-work-proj`; // slug = WORKTREE.replace(/[/.]/g, '-')

function userLine(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

describe('SessionTranscriptService.getWorkspaceTranscript', () => {
  it('derives the Claude slug from the worktree path and reads that dir', async () => {
    const fs = makeWorkspaceFs(WORK_DIR, ['s.jsonl'], {
      [`${WORK_DIR}/s.jsonl`]: userLine('hello workspace'),
    });
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(true);
    expect(view.messages.map((m) => m.text)).toEqual(['hello workspace']);
  });

  it('picks the NEWEST .jsonl by the stat seam', async () => {
    const fs = makeWorkspaceFs(
      WORK_DIR,
      ['old.jsonl', 'new.jsonl', 'notes.txt'],
      {
        [`${WORK_DIR}/old.jsonl`]: userLine('OLD turn'),
        [`${WORK_DIR}/new.jsonl`]: userLine('NEW turn'),
      },
      { [`${WORK_DIR}/old.jsonl`]: 100, [`${WORK_DIR}/new.jsonl`]: 200 },
    );
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(true);
    expect(view.messages.map((m) => m.text)).toEqual(['NEW turn']);
  });

  it('falls back to lexical-max basename when no stat seam is present', async () => {
    const fs = makeWorkspaceFs(WORK_DIR, ['a.jsonl', 'b.jsonl'], {
      [`${WORK_DIR}/a.jsonl`]: userLine('from a'),
      [`${WORK_DIR}/b.jsonl`]: userLine('from b'),
    });
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(true);
    expect(view.messages.map((m) => m.text)).toEqual(['from b']);
  });

  it('reports available:false when there is no session dir for this workspace', async () => {
    const fs = makeWorkspaceFs('/some/other/dir', [], {});
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(false);
    expect(view.reason).toMatch(/no session file/);
    expect(view.messages).toEqual([]);
  });

  it('reports available:false when the workspace dir holds no .jsonl', async () => {
    const fs = makeWorkspaceFs(WORK_DIR, ['notes.txt', 'README.md'], {});
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(false);
    expect(view.messages).toEqual([]);
  });

  it('skips an unreadable newest file and falls back to the next newest', async () => {
    const fs = makeWorkspaceFs(
      WORK_DIR,
      ['bad.jsonl', 'good.jsonl'],
      {
        [`${WORK_DIR}/bad.jsonl`]: new Error('EACCES'),
        [`${WORK_DIR}/good.jsonl`]: userLine('recovered turn'),
      },
      { [`${WORK_DIR}/bad.jsonl`]: 200, [`${WORK_DIR}/good.jsonl`]: 100 },
    );
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(true);
    expect(view.messages.map((m) => m.text)).toEqual(['recovered turn']);
  });

  it('bounds the result to the last MAX_MESSAGES turns', async () => {
    const total = 620;
    const content = Array.from({ length: total }, (_v, i) => userLine(`m${i}`)).join('\n');
    const fs = makeWorkspaceFs(WORK_DIR, ['big.jsonl'], { [`${WORK_DIR}/big.jsonl`]: content });
    const view = await serviceWith(fs).getWorkspaceTranscript(WORKTREE);
    expect(view.available).toBe(true);
    expect(view.messages).toHaveLength(500);
    // bound to the LAST 500: first kept turn is m(total-500), last is m(total-1).
    expect(view.messages[0].text).toBe(`m${total - 500}`);
    expect(view.messages[view.messages.length - 1].text).toBe(`m${total - 1}`);
  });
});
