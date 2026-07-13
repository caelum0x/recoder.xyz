/**
 * Tests for the composed MemoryModule: delegation to the fusion/write engines,
 * agent-os store attach + asMemoryStore, truthful health, and the singleton seam.
 */
import { describe, it, expect, vi } from 'vitest';
import type { MemoryStore } from '@recoder/agent-memory';
import { createMemoryModule, getMemoryModule, __setMemoryModuleForTest } from './index.js';

function noopStore(): MemoryStore {
  return {
    async createCandidate(c) {
      return c;
    },
    async listCandidates() {
      return [];
    },
    async upsertMemory(i) {
      return i;
    },
    async search() {
      return [];
    },
  };
}

describe('MemoryModule: composition', () => {
  it('recall delegates to the injected engines and includes the attached store', async () => {
    const search = vi.fn(async () => [
      {
        memoryId: 'a1',
        scope: 'repo' as const,
        title: 'Reviewed',
        body: 'fact',
        status: 'active' as const,
        evidence: { taskId: 't', artifactId: 'art' },
        createdAt: '2026-01-01T00:00:00Z',
        acceptedBy: 'rev',
      },
    ]);
    const store: MemoryStore = { ...noopStore(), search };
    const module = createMemoryModule({
      recall: { queryMemories: async () => [], mem0Search: async () => ({ available: false, results: [] }) },
    });
    module.attachAgentOsStore(store);
    const out = await module.recall('reviewed', undefined, { limit: 5 });
    expect(search).toHaveBeenCalled();
    expect(out.map((m) => m.store)).toEqual(['agent-os']);
    expect(module.asMemoryStore()).toBe(store);
  });

  it('remember delegates to the injected write engine', async () => {
    const rememberCandidate = vi.fn(() => 'bead-42');
    const module = createMemoryModule({ remember: { rememberCandidate } });
    const out = await module.remember({ title: 'fact', body: 'evidence', scope: 'task' });
    expect(out).toEqual({ id: 'bead-42', store: 'beads' });
    expect(rememberCandidate).toHaveBeenCalled();
  });

  it('asMemoryStore returns a degrade-safe empty store before any attach', async () => {
    const module = createMemoryModule();
    const store = module.asMemoryStore();
    await expect(store.search('x')).resolves.toEqual([]);
    await expect(store.listCandidates()).resolves.toEqual([]);
  });
});

describe('MemoryModule: health', () => {
  it('reports each engine truthfully and derives overall', async () => {
    const module = createMemoryModule({
      mem0HealthProbe: async () => ({ available: true, mode: 'oss', vectorStore: 'qdrant:local' }),
      beadsCliProbe: () => true,
    });
    const health = await module.health();
    expect(health.mem0.status).toBe('up');
    expect(health.mem0.mode).toBe('oss');
    expect(health.beadsCli.status).toBe('up');
    // No dolt port + no attached agent-os store in the test env → not fully healthy.
    expect(['degraded', 'down']).toContain(health.overall);
  });

  it('marks mem0 + cli down when both probes fail', async () => {
    const module = createMemoryModule({
      mem0HealthProbe: async () => ({ available: false, mode: 'none', reason: 'unconfigured' }),
      beadsCliProbe: () => false,
    });
    const health = await module.health();
    expect(health.mem0.status).toBe('down');
    expect(health.beadsCli.status).toBe('down');
    expect(health.overall).toBe('down');
  });
});

describe('MemoryModule: singleton seam', () => {
  it('getMemoryModule returns a stable instance overridable in tests', () => {
    const a = getMemoryModule();
    expect(getMemoryModule()).toBe(a);
    const fake = createMemoryModule();
    __setMemoryModuleForTest(fake);
    expect(getMemoryModule()).toBe(fake);
    __setMemoryModuleForTest(undefined);
  });
});
