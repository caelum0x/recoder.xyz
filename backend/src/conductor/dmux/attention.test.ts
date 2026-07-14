/**
 * Tests for the conductor attention classifier (dmux paneAttentionHeuristics
 * fusion).
 *
 * The dmux import is mocked through the injectable `loadAttentionModule` seam,
 * so no real tmux (and no real dmux load) is needed for the logic tests. One
 * integration test exercises the REAL default loader against the vendored
 * ts/dmux dist to prove the lazy file-URL import genuinely works.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  classifyAttention,
  loadDmuxAttentionModule,
  type DmuxAttentionModule,
} from './attention.js';

/** Fake heuristics module with controllable working-indicator answer. */
function fakeAttentionModule(working: boolean): DmuxAttentionModule {
  return {
    hasAgentWorkingIndicators: vi.fn(() => working),
    buildPaneActivityFingerprint: vi.fn((content: string) =>
      content
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim().length > 0)
        .slice(-12)
        .join('\n'),
    ),
  };
}

describe('classifyAttention (mocked dmux seam)', () => {
  it('classifies working when dmux working indicators fire', async () => {
    const heuristics = fakeAttentionModule(true);
    const result = await classifyAttention('✻ Thinking… (esc to interrupt)', {
      agent: 'claude',
      loadAttentionModule: async () => heuristics,
    });

    expect(result?.state).toBe('working');
    expect(result?.fingerprint).toBe('✻ Thinking… (esc to interrupt)');
    expect(heuristics.hasAgentWorkingIndicators).toHaveBeenCalledWith(
      '✻ Thinking… (esc to interrupt)',
      'claude',
    );
  });

  it('working indicators take precedence over needs-you prompts', async () => {
    const result = await classifyAttention('Do you want to proceed? (esc to interrupt)', {
      loadAttentionModule: async () => fakeAttentionModule(true),
    });
    expect(result?.state).toBe('working');
  });

  it('classifies needs-you for a numbered option dialog', async () => {
    const paneText = [
      'Claude needs permission to run this command:',
      '  rm -rf build/',
      '❯ 1. Yes',
      '  2. Yes, and always allow',
      '  3. No, tell Claude what to do differently',
    ].join('\n');

    const result = await classifyAttention(paneText, {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });

    expect(result?.state).toBe('needs-you');
    expect(result?.reason).toContain('option dialog');
  });

  it('classifies needs-you for a y/n confirmation prompt', async () => {
    const result = await classifyAttention('Overwrite existing file? (y/n)', {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });
    expect(result?.state).toBe('needs-you');
    expect(result?.reason).toContain('confirmation prompt');
  });

  it('classifies needs-you when the agent says it is waiting for input', async () => {
    const result = await classifyAttention('The agent is waiting for your input.', {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });
    expect(result?.state).toBe('needs-you');
  });

  it('classifies idle for a settled shell prompt', async () => {
    const result = await classifyAttention('some finished output\n$ ', {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });
    expect(result?.state).toBe('idle');
  });

  it('a single numbered line is NOT an option dialog (conservative)', async () => {
    const result = await classifyAttention('1. First step of the plan', {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });
    expect(result?.state).toBe('idle');
  });

  it('only scans recent lines for needs-you signals (old prompts ignored)', async () => {
    const oldPrompt = 'Do you want to proceed?';
    const filler = Array.from({ length: 30 }, (_, i) => `log line ${i}`);
    const result = await classifyAttention([oldPrompt, ...filler].join('\n'), {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });
    expect(result?.state).toBe('idle');
  });

  it('classifies empty capture as idle with an empty fingerprint', async () => {
    const result = await classifyAttention('   \n\n', {
      loadAttentionModule: async () => fakeAttentionModule(false),
    });
    expect(result?.state).toBe('idle');
    expect(result?.fingerprint).toBe('');
    expect(result?.reason).toBe('no recent pane activity');
  });

  it('returns undefined when dmux is unavailable (loader → null)', async () => {
    const result = await classifyAttention('anything', {
      loadAttentionModule: async () => null,
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined (never throws) when the loader throws', async () => {
    const result = await classifyAttention('anything', {
      loadAttentionModule: async () => {
        throw new Error('dmux exploded');
      },
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined (never throws) when the heuristics throw', async () => {
    const result = await classifyAttention('anything', {
      loadAttentionModule: async () => ({
        hasAgentWorkingIndicators: () => {
          throw new Error('heuristics exploded');
        },
        buildPaneActivityFingerprint: () => '',
      }),
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined when the module is structurally wrong', async () => {
    const result = await classifyAttention('anything', {
      loadAttentionModule: async () =>
        ({ hasAgentWorkingIndicators: 'not-a-fn' } as unknown as DmuxAttentionModule),
    });
    expect(result).toBeUndefined();
  });
});

/** Is the vendored dmux dist actually on disk? Gates the integration test. */
function dmuxAttentionDistPresent(): boolean {
  try {
    const req = createRequire(__filename);
    const root = path.dirname(req.resolve('@recoder/dmux/package.json'));
    return existsSync(path.join(root, 'dist', 'utils', 'paneAttentionHeuristics.js'));
  } catch {
    return false;
  }
}

describe('loadDmuxAttentionModule (real vendored dmux dist)', () => {
  it('lazy-loads the real heuristics and classifies a live working pane', async () => {
    const mod = await loadDmuxAttentionModule();
    if (!dmuxAttentionDistPresent()) {
      // Degrade-safe by contract: environment without the vendored dmux dist.
      // Do not fake success — just assert the truthful null return.
      expect(mod).toBeNull();
      return;
    }
    // The dist IS present — the loader must genuinely load it (a null here
    // would mean the lazy-import seam is broken, which must fail the test).
    expect(mod).not.toBeNull();

    // Verified real-heuristics behavior: "esc to interrupt" is a working signal.
    const working = await classifyAttention('✻ Germinating… (esc to interrupt)', {
      agent: 'claude',
    });
    expect(working?.state).toBe('working');
    expect(working?.fingerprint).toContain('Germinating');

    // A settled numbered option dialog is needs-you under the real fingerprint.
    const needsYou = await classifyAttention(
      ['Pick an option:', '❯ 1. Yes', '  2. No'].join('\n'),
    );
    expect(needsYou?.state).toBe('needs-you');
  });
});
