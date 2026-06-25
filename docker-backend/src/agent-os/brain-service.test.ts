import { describe, expect, it, vi } from 'vitest';
import type { Brain, BrainContext } from '@recoder/brain';
import { BrainService } from './brain-service';

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
