/**
 * Tests that conductor/bundle.enrichPrompt routes ALL memory recall through the
 * MemoryModule (no inline mem0/beads fusion left) and renders the fused,
 * provenance-tagged result — degrade-safe when recall is empty or throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { recall } = vi.hoisted(() => ({ recall: vi.fn() }));

vi.mock('../modules/memory', () => ({
  getMemoryModule: () => ({ recall }),
}));

// service-container is imported at module load but only used when taskId/repoPath
// are present; a minimal stub keeps the import cheap and side-effect free.
vi.mock('../agent-os/service-container', () => ({
  agentOsContainer: {
    repository: { listTasks: async () => [] },
    brain: { isEnabled: () => false },
  },
}));

import { enrichPrompt } from './bundle.js';

beforeEach(() => {
  recall.mockReset();
});

describe('enrichPrompt: memory via the MemoryModule', () => {
  it('calls memoryModule.recall and renders fused provenance', async () => {
    recall.mockResolvedValue([
      { id: 'b1', text: 'Deploy landmine — swap file', store: 'beads' },
      { id: 'm1', text: 'User prefers manual deploy', store: 'mem0', score: 0.9 },
    ]);
    const out = await enrichPrompt({ prompt: 'how to deploy', userId: 'u1' });

    expect(recall).toHaveBeenCalledWith('how to deploy', undefined, {
      limit: 5,
      userId: 'u1',
      repoPath: undefined,
    });
    expect(out.prompt).toContain('Recalled memory (fused');
    expect(out.prompt).toContain('[beads b1]');
    expect(out.prompt).toContain('[mem0 m1]');
    expect(out.prompt).toContain('(score 0.90)');
    expect(out.sources).toEqual(expect.arrayContaining(['beads-memory', 'mem0']));
  });

  it('omits the memory section when nothing is recalled (never faked)', async () => {
    recall.mockResolvedValue([]);
    const out = await enrichPrompt({ prompt: 'x' });
    expect(out.prompt).not.toContain('Recalled memory');
    expect(out.sources).not.toContain('beads-memory');
  });

  it('degrades (no throw into the launch path) when recall rejects', async () => {
    recall.mockRejectedValue(new Error('boom'));
    const out = await enrichPrompt({ prompt: 'x' });
    expect(out.prompt).toBe('x');
    expect(out.sources).toEqual([]);
  });
});
