/**
 * Tests for completion-loop — bounded retry wrapper around runtime.sendPrompt().
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runWithCompletionLoop,
  defaultCompletionCheck,
} from '../completion-loop';
import type { RuntimeAdapter, SendPromptParams } from '../coding-runtime';
import type { PromptResult } from '../opencode-connector.service';

// ── Test helpers ────────────────────────────────────────────────────

function mkResult(text: string): PromptResult {
  return {
    messageId: `msg_${Date.now()}`,
    parts: [{ type: 'text', content: text }],
  };
}

function mkRuntime(results: PromptResult[]): RuntimeAdapter {
  let callCount = 0;
  return {
    type: 'native',
    async startSession() {
      return {
        id: 'test', projectId: 'p', sandboxId: 's',
        runtimeType: 'native', status: 'ready',
        createdAt: new Date().toISOString(),
      };
    },
    async sendPrompt() {
      const result = results[Math.min(callCount, results.length - 1)];
      callCount++;
      return result;
    },
    getState() { return undefined; },
    async dispose() { /* noop */ },
  };
}

const DEFAULT_PARAMS: SendPromptParams = {
  projectId: 'proj_1',
  prompt: 'Do the task',
  sandboxExecUrl: 'http://test/exec',
  daytonaApiKey: 'key',
};

// ── defaultCompletionCheck ─────────────────────────────────────────

describe('defaultCompletionCheck', () => {
  it('returns true for long, clean text', () => {
    const result = mkResult('I have finished the refactor and all tests pass. The new module is ready for review.');
    expect(defaultCompletionCheck(result)).toBe(true);
  });

  it('returns false for very short text', () => {
    const result = mkResult('ok');
    expect(defaultCompletionCheck(result)).toBe(false);
  });

  it('returns false for text with TODO markers', () => {
    const result = mkResult('Started the work. TODO: finish the remaining cases. TODO: add tests.');
    expect(defaultCompletionCheck(result)).toBe(false);
  });

  it('returns false for text with unchecked checkboxes', () => {
    const result = mkResult('Progress:\n- [x] Create file\n- [ ] Write tests\n- [ ] Push changes');
    expect(defaultCompletionCheck(result)).toBe(false);
  });

  it('returns false when text ends with "let me know if" hedge', () => {
    const result = mkResult('I made the changes to the login flow. Let me know if you want me to add tests too.');
    expect(defaultCompletionCheck(result)).toBe(false);
  });

  it('returns false when text ends with "should I continue" hedge', () => {
    const result = mkResult('I fixed the first two issues. The third is more complex — should I continue?');
    expect(defaultCompletionCheck(result)).toBe(false);
  });

  it('returns false when text ends with "would you like me to" hedge', () => {
    const result = mkResult('The component is ready. Would you like me to add dark mode support?');
    expect(defaultCompletionCheck(result)).toBe(false);
  });

  it('ignores hedge phrases that appear far from the end of long text', () => {
    // Pad the middle so the hedge phrase is NOT in the last 200 chars
    const padding = 'All the work has been completed successfully. '.repeat(10);
    const result = mkResult(
      `The user asked me to let me know if there were any issues. ${padding}Final summary: the refactor is complete and all tests pass.`,
    );
    expect(defaultCompletionCheck(result)).toBe(true);
  });

  it('respects custom minResultLength', () => {
    const result = mkResult('done');
    expect(defaultCompletionCheck(result, 3)).toBe(true);
    expect(defaultCompletionCheck(result, 100)).toBe(false);
  });

  it('handles empty parts gracefully', () => {
    const result: PromptResult = { messageId: 'm', parts: [] };
    expect(defaultCompletionCheck(result)).toBe(false);
  });
});

// ── runWithCompletionLoop ─────────────────────────────────────────

describe('runWithCompletionLoop', () => {
  it('returns immediately when first result is complete', async () => {
    const completeText = 'Done. The refactor is complete and all tests pass successfully.';
    const runtime = mkRuntime([mkResult(completeText)]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS);

    expect(outcome.completed).toBe(true);
    expect(outcome.iterations).toBe(1);
    expect(outcome.history).toHaveLength(1);
  });

  it('retries when first result has TODO markers', async () => {
    const runtime = mkRuntime([
      mkResult('Started. TODO: finish the rest. TODO: add tests.'),
      mkResult('All done. Every task completed successfully, tests pass, ready for merge.'),
    ]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      backoffMs: 0, // no wait in tests
    });

    expect(outcome.iterations).toBe(2);
    expect(outcome.completed).toBe(true);
    expect(outcome.history).toHaveLength(2);
  });

  it('stops at maxIterations when task never completes', async () => {
    const runtime = mkRuntime([
      mkResult('Partial. TODO: continue.'),
      mkResult('Still partial. TODO: more.'),
      mkResult('Yet more. TODO: almost.'),
      mkResult('Finally done.'), // Should not be reached with maxIterations=3
    ]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      maxIterations: 3,
      backoffMs: 0,
    });

    expect(outcome.iterations).toBe(3);
    expect(outcome.completed).toBe(false);
    expect(outcome.history).toHaveLength(3);
  });

  it('defaults maxIterations to 3', async () => {
    const runtime = mkRuntime([mkResult('TODO'), mkResult('TODO'), mkResult('TODO'), mkResult('TODO')]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      backoffMs: 0,
    });

    expect(outcome.iterations).toBe(3);
  });

  it('hard-caps maxIterations to at least 1', async () => {
    const runtime = mkRuntime([mkResult('Short text, not complete')]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      maxIterations: 0, // should be clamped to 1
      backoffMs: 0,
    });

    expect(outcome.iterations).toBeGreaterThanOrEqual(1);
  });

  it('appends continuation prompt on retries', async () => {
    const sendPrompt = vi.fn().mockImplementation(async (params: SendPromptParams) => {
      return mkResult(params.prompt.includes('Continue') ? 'All done successfully, ready for merge.' : 'Partial. TODO: continue.');
    });

    const runtime: RuntimeAdapter = {
      type: 'native',
      async startSession() {
        return { id: 't', projectId: 'p', sandboxId: 's', runtimeType: 'native', status: 'ready', createdAt: '' };
      },
      sendPrompt,
      getState() { return undefined; },
      async dispose() { /* noop */ },
    };

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      backoffMs: 0,
    });

    expect(outcome.completed).toBe(true);
    expect(outcome.iterations).toBe(2);
    // Second call should have continuation prompt
    expect(sendPrompt.mock.calls[1][0].prompt).toContain('Continue');
  });

  it('uses custom continuation prompt', async () => {
    const sendPrompt = vi.fn()
      .mockResolvedValueOnce(mkResult('TODO: more work'))
      .mockResolvedValueOnce(mkResult('All complete and ready for deployment.'));

    const runtime: RuntimeAdapter = {
      type: 'native',
      async startSession() { return { id: 't', projectId: 'p', sandboxId: 's', runtimeType: 'native', status: 'ready', createdAt: '' }; },
      sendPrompt,
      getState() { return undefined; },
      async dispose() { /* noop */ },
    };

    await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      backoffMs: 0,
      continuationPrompt: 'FINISH THE TASK NOW',
    });

    expect(sendPrompt.mock.calls[1][0].prompt).toContain('FINISH THE TASK NOW');
  });

  it('fires onIteration callback for each iteration', async () => {
    const observer = vi.fn();
    const runtime = mkRuntime([
      mkResult('TODO: a'),
      mkResult('TODO: b'),
      mkResult('All finished cleanly with tests passing.'),
    ]);

    await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      onIteration: observer,
      backoffMs: 0,
    });

    expect(observer).toHaveBeenCalledTimes(3);
    expect(observer).toHaveBeenNthCalledWith(1, 1, expect.anything(), false);
    expect(observer).toHaveBeenNthCalledWith(2, 2, expect.anything(), false);
    expect(observer).toHaveBeenNthCalledWith(3, 3, expect.anything(), true);
  });

  it('respects custom completionCheck override', async () => {
    const runtime = mkRuntime([
      mkResult('This would normally be complete'),
      mkResult('Second iteration output'),
    ]);

    // Force first iteration to be incomplete via custom check
    let callCount = 0;
    const customCheck = () => {
      callCount++;
      return callCount >= 2;
    };

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      completionCheck: customCheck,
      backoffMs: 0,
    });

    expect(outcome.iterations).toBe(2);
    expect(outcome.completed).toBe(true);
  });

  it('applies exponential backoff between iterations', async () => {
    const runtime = mkRuntime([
      mkResult('TODO'),
      mkResult('TODO'),
      mkResult('All complete and ready.'),
    ]);

    const start = Date.now();
    await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      maxIterations: 3,
      backoffMs: 50,
    });
    const elapsed = Date.now() - start;

    // First retry waits 50ms, second waits 100ms = 150ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(140);
  });

  it('skips wait after the last iteration', async () => {
    const runtime = mkRuntime([
      mkResult('TODO a'),
      mkResult('TODO b'),
    ]);

    const start = Date.now();
    await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      maxIterations: 2,
      backoffMs: 100,
    });
    const elapsed = Date.now() - start;

    // Only one wait (between iter 1 and 2) of 100ms. No wait after iter 2.
    expect(elapsed).toBeLessThan(250);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it('history captures text from every iteration', async () => {
    const runtime = mkRuntime([
      mkResult('First response TODO'),
      mkResult('Second response TODO'),
      mkResult('Third response all complete and ready to ship.'),
    ]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      backoffMs: 0,
    });

    expect(outcome.history).toHaveLength(3);
    expect(outcome.history[0]).toContain('First');
    expect(outcome.history[1]).toContain('Second');
    expect(outcome.history[2]).toContain('Third');
  });

  it('returns last result even when not completed', async () => {
    const runtime = mkRuntime([
      mkResult('TODO a'),
      mkResult('TODO b'),
      mkResult('TODO c'),
    ]);

    const outcome = await runWithCompletionLoop(runtime, DEFAULT_PARAMS, {
      maxIterations: 3,
      backoffMs: 0,
    });

    expect(outcome.completed).toBe(false);
    expect(outcome.result).toBeDefined();
    const text = (outcome.result.parts[0] as { content: string }).content;
    expect(text).toContain('TODO c');
  });
});
