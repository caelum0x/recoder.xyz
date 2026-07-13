/**
 * Tests for the memory WRITE verbs (remember/promote/forget/relate) with mocked
 * engines. Proves routing (beads vs mem0), the durable-gate truthfulness
 * (promote throws on genuine failure — never faked), and degrade-safe deletes.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  rememberDraft,
  promoteDraft,
  forgetMemory,
  relateMemories,
  type RememberEngines,
} from './remember.js';

function baseEngines(over: Partial<RememberEngines> = {}): RememberEngines {
  return {
    rememberCandidate: () => 'bead-1',
    promoteMemory: () => true,
    linkMemories: () => true,
    mem0Add: async () => ({ available: true, memories: [{ id: 'mem-1' }] }),
    mem0Delete: async () => ({ available: true, deleted: true }),
    ...over,
  };
}

describe('rememberDraft: routing', () => {
  it('defaults to a beads candidate and returns its id + provenance', async () => {
    const rememberCandidate = vi.fn(() => 'bead-9');
    const out = await rememberDraft(
      { title: 'fact', body: 'evidence', scope: 'task', discoveredFrom: 'recoder-1' },
      baseEngines({ rememberCandidate }),
    );
    expect(out).toEqual({ id: 'bead-9', store: 'beads' });
    expect(rememberCandidate).toHaveBeenCalledWith({
      title: 'fact',
      body: 'evidence',
      scope: 'task',
      discoveredFrom: 'recoder-1',
    });
  });

  it('route mem0 writes only the semantic layer', async () => {
    const rememberCandidate = vi.fn(() => 'bead-x');
    const mem0Add = vi.fn(async () => ({ available: true, memories: [{ id: 'mem-7' }] }));
    const out = await rememberDraft(
      { title: 'fact', body: 'body', route: 'mem0', userId: 'u1' },
      baseEngines({ rememberCandidate, mem0Add }),
    );
    expect(out).toEqual({ id: 'mem-7', store: 'mem0' });
    expect(rememberCandidate).not.toHaveBeenCalled();
    expect(mem0Add).toHaveBeenCalled();
  });

  it('route mem0 without a userId throws (no silent write)', async () => {
    await expect(rememberDraft({ title: 't', body: 'b', route: 'mem0' }, baseEngines())).rejects.toThrow();
  });

  it('mirrors into mem0 when a userId is present but beads stays authoritative', async () => {
    const mem0Add = vi.fn(async () => ({ available: true, memories: [{ id: 'mem-mirror' }] }));
    const out = await rememberDraft({ title: 't', body: 'b', userId: 'u1' }, baseEngines({ mem0Add }));
    expect(out).toEqual({ id: 'bead-1', store: 'beads' });
    expect(mem0Add).toHaveBeenCalled();
  });

  it('falls back to the mem0 id when beads is down but mem0 accepts', async () => {
    const out = await rememberDraft(
      { title: 't', body: 'b', userId: 'u1' },
      baseEngines({ rememberCandidate: () => undefined }),
    );
    expect(out).toEqual({ id: 'mem-1', store: 'mem0' });
  });

  it('throws when every store is down (never faked)', async () => {
    await expect(
      rememberDraft({ title: 't', body: 'b' }, baseEngines({ rememberCandidate: () => undefined })),
    ).rejects.toThrow();
  });

  it('rejects an empty title or body', async () => {
    await expect(rememberDraft({ title: '', body: 'b' }, baseEngines())).rejects.toThrow();
    await expect(rememberDraft({ title: 't', body: '  ' }, baseEngines())).rejects.toThrow();
  });
});

describe('promoteDraft: the durable gate', () => {
  it('promotes on an accepted review', async () => {
    const promoteMemory = vi.fn(() => true);
    await expect(promoteDraft('w1', { reviewedBy: 'a', accepted: true }, baseEngines({ promoteMemory }))).resolves.toBeUndefined();
    expect(promoteMemory).toHaveBeenCalledWith('w1');
  });

  it('throws when the underlying promote fails (never faked success)', async () => {
    await expect(
      promoteDraft('w1', { reviewedBy: 'a', accepted: true }, baseEngines({ promoteMemory: () => false })),
    ).rejects.toThrow();
  });

  it('does not promote a rejected review', async () => {
    const promoteMemory = vi.fn(() => true);
    await promoteDraft('w1', { reviewedBy: 'a', accepted: false }, baseEngines({ promoteMemory }));
    expect(promoteMemory).not.toHaveBeenCalled();
  });
});

describe('forget + relate', () => {
  it('forget deletes from mem0 when available', async () => {
    const mem0Delete = vi.fn(async () => ({ available: true, deleted: true }));
    await forgetMemory('mem-1', baseEngines({ mem0Delete }));
    expect(mem0Delete).toHaveBeenCalledWith('mem-1');
  });

  it('forget is a no-op (never throws) when mem0 delete is absent', async () => {
    const engines = baseEngines();
    delete engines.mem0Delete;
    await expect(forgetMemory('mem-1', engines)).resolves.toBeUndefined();
  });

  it('relate links two memories with the requested kind', async () => {
    const linkMemories = vi.fn(() => true);
    await relateMemories('a', 'b', 'supersedes', baseEngines({ linkMemories }));
    expect(linkMemories).toHaveBeenCalledWith('a', 'b', 'supersedes');
  });
});
