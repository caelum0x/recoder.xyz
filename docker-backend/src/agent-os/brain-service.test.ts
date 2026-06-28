import { describe, expect, it, vi } from 'vitest';
import {
  createBrain,
  type Brain,
  type BrainContext,
  type BrainDoc,
  type BrainMemory,
  type DocsPort,
  type MemoryPort,
} from '@recoder/brain';
import { BrainService } from './brain-service';

// Real port implementations returning substantive content. They satisfy the same
// contracts the production adapters (mem0/context7) do, so the Brain genuinely
// assembles a non-empty context whose REUSE on a cache HIT saves real tokens.
// This is the live cache engine, not a stubbed Brain.
function contentMemory(): MemoryPort {
  return {
    recall: async (_query: string, limit: number): Promise<BrainMemory[]> =>
      Array.from({ length: Math.min(limit, 5) }, (_unused, i) => ({
        id: `mem-${i}`,
        text: `Prior decision ${i}: the team standardized on pnpm with --filter for workspace installs and verifies cross-subdomain auth before any release.`,
        score: 0.9 - i * 0.05,
      })),
    remember: async () => undefined,
  };
}

function contentDocs(): DocsPort {
  return {
    lookup: async (_query: string, limit: number): Promise<BrainDoc[]> =>
      Array.from({ length: Math.min(limit, 3) }, (_unused, i) => ({
        library: 'express',
        title: `Routing ${i}`,
        url: `https://example.test/express/${i}`,
        snippet:
          'Express routers compose middleware and route handlers; mount additively under a shared authentication middleware to avoid shadowing existing routes.',
      })),
  };
}

function fakeContext(): BrainContext {
  return {
    repo: { files: [], symbols: [], summary: '' } as unknown as BrainContext['repo'],
    memories: [],
    docs: [],
    tasks: [],
    activity: { recent: [], profile: null },
    assembledAt: '2026-06-26T00:00:00.000Z',
  };
}

/** A minimal Brain stub — only assemble() is exercised by the service. */
function fakeBrain(impl: () => Promise<BrainContext>): Brain {
  return { assemble: impl, record: async () => undefined } as unknown as Brain;
}

const INPUT = { task: 'do the thing', repoRoot: '/repo' } as const;

describe('BrainService', () => {
  it('flag OFF -> returns null and never constructs/calls the brain (pure no-op)', async () => {
    const brainFactory = vi.fn<[], Brain>(() => {
      throw new Error('brain factory must not be called when disabled');
    });
    const service = new BrainService({ isEnabled: () => false, brainFactory });

    expect(service.isEnabled()).toBe(false);
    await expect(service.assembleForTask(INPUT)).resolves.toBeNull();
    expect(brainFactory).not.toHaveBeenCalled();
  });

  it('flag ON with an injected fake brain -> returns a BrainContext', async () => {
    const context = fakeContext();
    const assemble = vi.fn(async () => context);
    const service = new BrainService({
      isEnabled: () => true,
      brainFactory: () => fakeBrain(assemble),
    });

    const result = await service.assembleForTask({
      task: 'do the thing',
      repoRoot: '/repo',
      focusFiles: ['src/a.ts'],
      limit: 3,
    });

    expect(result).toBe(context);
    expect(assemble).toHaveBeenCalledWith({
      task: 'do the thing',
      repoRoot: '/repo',
      focusFiles: ['src/a.ts'],
      limit: 3,
    });
  });

  it('flag ON but an adapter throws -> fails safe to null (never throws)', async () => {
    const error = vi.fn();
    const service = new BrainService({
      isEnabled: () => true,
      brainFactory: () =>
        fakeBrain(async () => {
          throw new Error('gitnexus exploded');
        }),
      logger: { error },
    });

    await expect(service.assembleForTask(INPUT)).resolves.toBeNull();
    expect(error).toHaveBeenCalledOnce();
  });

  it('builds the brain lazily and reuses it across calls', async () => {
    const assemble = vi.fn(async () => fakeContext());
    const brainFactory = vi.fn<[], Brain>(() => fakeBrain(assemble));
    const service = new BrainService({ isEnabled: () => true, brainFactory });

    await service.assembleForTask(INPUT);
    await service.assembleForTask(INPUT);

    expect(brainFactory).toHaveBeenCalledOnce();
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  describe('cacheReport (live cache accounting surface)', () => {
    it('flag OFF -> { enabled:false, report:null } and never constructs the brain', () => {
      const brainFactory = vi.fn<[], Brain>(() => {
        throw new Error('brain factory must not be called when disabled');
      });
      const service = new BrainService({ isEnabled: () => false, brainFactory });

      expect(service.cacheReport()).toEqual({ enabled: false, report: null });
      expect(brainFactory).not.toHaveBeenCalled();
    });

    it('flag ON, brain never read -> report.available is false (honest, not fake-green)', () => {
      // A REAL Brain with no deps; never assembled, so there is nothing to report.
      const service = new BrainService({
        isEnabled: () => true,
        brainFactory: () => createBrain(),
      });

      const { enabled, report } = service.cacheReport();
      expect(enabled).toBe(true);
      expect(report).not.toBeNull();
      expect(report?.available).toBe(false);
      expect(report?.hits).toBe(0);
      expect(report?.misses).toBe(0);
      expect(report?.tokensSaved).toBe(0);
    });

    it('flag ON, real Brain with a real cache HIT -> live cacheStats (hits>=1, tokensSaved>0)', async () => {
      // Build the SAME real Brain the service surfaces. Inject a deterministic
      // git revision so the two assembles content-address to the same key — the
      // second is a genuine cache HIT (zero source calls), accumulating savings.
      const runGit = async () => 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const brain = createBrain({ runGit, memory: contentMemory(), docs: contentDocs() });
      const service = new BrainService({
        isEnabled: () => true,
        brainFactory: () => brain,
      });

      // First read assembles (MISS); second read for the same key is a HIT.
      await service.assembleForTask({ task: 'surface the metric', repoRoot: '/repo' });
      await service.assembleForTask({ task: 'surface the metric', repoRoot: '/repo' });

      const { enabled, report } = service.cacheReport();
      expect(enabled).toBe(true);
      expect(report).not.toBeNull();
      // The headline value metric is REAL: a hit was served and tokens were saved.
      expect(report?.available).toBe(true);
      expect(report?.hits).toBeGreaterThanOrEqual(1);
      expect(report?.tokensSaved).toBeGreaterThan(0);
      expect(report?.hitRate).toBeGreaterThan(0);
      expect(typeof report?.detail).toBe('string');
      expect(report?.detail.length).toBeGreaterThan(0);

      // The surfaced report matches the live brain's own accounting exactly —
      // proving it reads the SAME instance, not a throwaway snapshot.
      const live = brain.cacheStats();
      expect(report?.hits).toBe(live.hits);
      expect(report?.tokensSaved).toBe(live.tokensSaved);
    });

    it('flag ON but cacheStats throws -> { enabled:true, report:null } (fail-safe, logged)', () => {
      const error = vi.fn();
      const throwingBrain = {
        assemble: async () => fakeContext(),
        cacheStats: () => {
          throw new Error('stats exploded');
        },
      } as unknown as Brain;
      const service = new BrainService({
        isEnabled: () => true,
        brainFactory: () => throwingBrain,
        logger: { error },
      });

      expect(service.cacheReport()).toEqual({ enabled: true, report: null });
      expect(error).toHaveBeenCalledOnce();
    });
  });

  it('default gate reads RECODER_BRAIN_ENABLED (default OFF)', () => {
    const prev = process.env.RECODER_BRAIN_ENABLED;
    try {
      delete process.env.RECODER_BRAIN_ENABLED;
      expect(new BrainService().isEnabled()).toBe(false);
      process.env.RECODER_BRAIN_ENABLED = 'true';
      expect(new BrainService().isEnabled()).toBe(true);
      process.env.RECODER_BRAIN_ENABLED = '0';
      expect(new BrainService().isEnabled()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.RECODER_BRAIN_ENABLED;
      else process.env.RECODER_BRAIN_ENABLED = prev;
    }
  });
});
