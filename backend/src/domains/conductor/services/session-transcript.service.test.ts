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
