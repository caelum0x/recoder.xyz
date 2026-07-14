import { describe, expect, it, vi } from 'vitest';
import { defaultCompletionCheck, runWithCompletionLoop } from '../completion-loop';
import type { RuntimeAdapter } from '../coding-runtime';

describe('completion-loop', () => {
  it('treats todo markers and hedge phrases as incomplete', () => {
    expect(defaultCompletionCheck({
      messageId: '1',
      parts: [{ type: 'text', content: 'Updated two files. TODO: finish the tests.' }],
    })).toBe(false);

    expect(defaultCompletionCheck({
      messageId: '2',
      parts: [{ type: 'text', content: 'Implemented the feature. Let me know if you want me to continue.' }],
    })).toBe(false);
  });

  it('retries until the result looks complete', async () => {
    const sendPrompt = vi.fn()
      .mockResolvedValueOnce({
        messageId: 'm1',
        parts: [{ type: 'text', content: 'Implemented most of it. TODO: wire tests.' }],
      })
      .mockResolvedValueOnce({
        messageId: 'm2',
        parts: [{ type: 'text', content: 'Implemented the feature, wired tests, and verified the final result successfully.' }],
      });

    const runtime: RuntimeAdapter = {
      type: 'opencode',
      startSession: vi.fn(),
      sendPrompt,
      getState: vi.fn(),
      dispose: vi.fn(),
    } as unknown as RuntimeAdapter;

    const outcome = await runWithCompletionLoop(runtime, {
      projectId: 'proj_1',
      prompt: 'Build the feature',
      sandboxExecUrl: 'http://test/exec',
      daytonaApiKey: 'key',
    }, {
      backoffMs: 0,
      maxIterations: 3,
    });

    expect(outcome.completed).toBe(true);
    expect(outcome.iterations).toBe(2);
    expect(sendPrompt).toHaveBeenCalledTimes(2);
    expect(outcome.history[0]).toContain('TODO');
    expect(outcome.history[1]).toContain('verified');
  });
});
