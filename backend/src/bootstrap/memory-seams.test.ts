/**
 * Composition-root seam tests for the bootstrap → memory wiring
 * (`memory-seams.ts`): the inference embed fallback and the agent-os squad-issue
 * read adapter. The embed fallback must be DEGRADE-TRUTHFUL — an unrouted result
 * or any fault yields `null` so memory falls back to keyword search, never a
 * fabricated vector; the squad-issue adapter is a pure delegation.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IssueGraphService } from '../domains/memory/ports/issue-graph.port.js';
import { createMemoryEmbedFallback, createSquadIssueAdapter } from './memory-seams.js';

describe('createMemoryEmbedFallback (inference embed fallback)', () => {
  it('reports the inference provider and returns routed embeddings', async () => {
    const embed = vi.fn(async () => ({ routed: true, embeddings: [[0.1, 0.2]] }));
    const port = createMemoryEmbedFallback({ embed });

    expect(port.provider).toBe('inference');
    expect(await port.embed(['hello'])).toEqual([[0.1, 0.2]]);
    expect(embed).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: ['hello'] });
  });

  it('degrades to null when the gateway did not route the request', async () => {
    const port = createMemoryEmbedFallback({
      embed: async () => ({ routed: false, embeddings: null }),
    });
    expect(await port.embed(['x'])).toBeNull();
  });

  it('degrades to null (never throws) on a gateway fault', async () => {
    const port = createMemoryEmbedFallback({
      embed: async () => {
        throw new Error('gateway exploded');
      },
    });
    await expect(port.embed(['x'])).resolves.toBeNull();
  });
});

describe('createSquadIssueAdapter (agent-os over memory issue-graph)', () => {
  it('delegates health/ready/show/stale to the issue-graph facet verbatim', async () => {
    const graph = {
      health: vi.fn(async () => ({ available: true })),
      ready: vi.fn(async () => [{ id: 'rec-1' }]),
      show: vi.fn(async () => ({ id: 'rec-1', title: 'x' })),
      stale: vi.fn(async () => [{ id: 'rec-2' }]),
    } as unknown as IssueGraphService;

    const port = createSquadIssueAdapter(graph);

    await port.health();
    await port.ready();
    await port.show('rec-1', { long: true });
    await port.stale();

    expect(graph.health).toHaveBeenCalledOnce();
    expect(graph.ready).toHaveBeenCalledOnce();
    expect(graph.show).toHaveBeenCalledWith('rec-1', { long: true });
    expect(graph.stale).toHaveBeenCalledOnce();
  });
});
