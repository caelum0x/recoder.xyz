/**
 * @module scatter-gather.test
 *
 * Test suite for the A2A Scatter-Gather Orchestration Pattern.
 *
 * Covers:
 *  1. registerPattern + getPattern
 *  2. listPatterns
 *  3. removePattern
 *  4. Execute with wait-all strategy (all succeed)
 *  5. Execute with wait-all strategy (some fail -- still completes)
 *  6. Execute with first-n (n=1, first success used)
 *  7. Execute with first-n (n=2, needs 2 successes)
 *  8. Execute with quorum (threshold met)
 *  9. Execute with quorum (threshold not met -- fails)
 * 10. Execute with timeout strategy
 * 11. ScatterResult has correct timing info
 * 12. Parallel execution (multiple agents run concurrently)
 * 13. Custom prompts per target
 * 14. Weights are recorded in results
 * 15. Unknown pattern returns error
 * 16. Aggregated output contains successful outputs
 * 17. Singleton management (get/reset)
 * 18. Empty targets list
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const scatterInstructionMocks = vi.hoisted(() => {
  const compileInstructionBundleForTask = vi.fn(() => ({
    shared_goal: 'Scatter task goal',
    agent_specific_prompt: 'Read AGENTS.md and execute the scatter task.',
    system_context_refs: [{ ref_id: 'AGENTS.md', kind: 'agents_md', path: 'AGENTS.md', sha: 'abc123' }],
    acceptance_criteria: ['Execute scatter task'],
    verification_commands: ['pnpm test'],
    forbidden_actions: ['Do not edit .env*'],
    approval_gates: [],
    memory_used: [],
    provenance: {
      source_files: [{ path: 'AGENTS.md', sha: 'abc123' }],
      compiled_at: '2026-06-06T00:00:00.000Z',
      compiler_version: '0.1.0',
    },
  }));
  return { compileInstructionBundleForTask };
});

vi.mock('../compiled-instructions', () => ({
  compileInstructionBundleForTask: scatterInstructionMocks.compileInstructionBundleForTask,
}));

import {
  ScatterGatherOrchestrator,
  getScatterGatherOrchestrator,
  resetScatterGatherOrchestrator,
  type ScatterGatherDefinition,
  type ScatterGatherExecution,
} from '../orchestration/scatter-gather';

// ---------------------------------------------------------------------------
// Test executors
// ---------------------------------------------------------------------------

const successExecutor = async (agentId: string, _prompt: string): Promise<string> =>
  `Result from ${agentId}`;

const delayedExecutor = async (agentId: string, _prompt: string): Promise<string> => {
  await new Promise((r) => setTimeout(r, 50));
  return `Delayed result from ${agentId}`;
};

const failExecutor = async (): Promise<string> => {
  throw new Error('Agent failed');
};

const mixedExecutor = async (agentId: string, _prompt: string): Promise<string> => {
  if (agentId.includes('fail')) throw new Error('fail');
  return `OK from ${agentId}`;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePattern(overrides: Partial<ScatterGatherDefinition> = {}): ScatterGatherDefinition {
  return {
    patternId: 'test-pattern',
    name: 'Test Pattern',
    targets: [
      { agentId: 'agent-1' },
      { agentId: 'agent-2' },
      { agentId: 'agent-3' },
    ],
    gatherStrategy: 'wait-all',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

let orch: ScatterGatherOrchestrator;

beforeEach(() => {
  resetScatterGatherOrchestrator();
  orch = new ScatterGatherOrchestrator();
});

// ===========================================================================
// Pattern CRUD
// ===========================================================================

describe('Pattern CRUD', () => {
  it('1. registerPattern + getPattern', () => {
    const def = makePattern();
    orch.registerPattern(def);
    const result = orch.getPattern('test-pattern');
    expect(result).toBeDefined();
    expect(result!.patternId).toBe('test-pattern');
    expect(result!.name).toBe('Test Pattern');
    expect(result!.targets).toHaveLength(3);
    expect(result!.gatherStrategy).toBe('wait-all');
  });

  it('2. listPatterns', () => {
    orch.registerPattern(makePattern({ patternId: 'p1', name: 'Pattern 1' }));
    orch.registerPattern(makePattern({ patternId: 'p2', name: 'Pattern 2' }));
    const patterns = orch.listPatterns();
    expect(patterns).toHaveLength(2);
    const ids = patterns.map((p) => p.patternId);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('3. removePattern', () => {
    orch.registerPattern(makePattern());
    expect(orch.getPattern('test-pattern')).toBeDefined();
    const removed = orch.removePattern('test-pattern');
    expect(removed).toBe(true);
    expect(orch.getPattern('test-pattern')).toBeUndefined();
    // Removing non-existent returns false
    expect(orch.removePattern('test-pattern')).toBe(false);
  });
});

// ===========================================================================
// Wait-all strategy
// ===========================================================================

describe('wait-all strategy', () => {
  it('4. Execute with wait-all (all succeed)', async () => {
    orch.registerPattern(makePattern());
    const exec = await orch.execute('test-pattern', 'Hello agents', successExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.successCount).toBe(3);
    expect(exec.failureCount).toBe(0);
    expect(exec.results).toHaveLength(3);
    expect(exec.completedAt).toBeDefined();
    expect(exec.totalDurationMs).toBeDefined();
    expect(exec.totalDurationMs!).toBeGreaterThanOrEqual(0);
    for (const r of exec.results) {
      expect(r.status).toBe('completed');
      expect(r.output).toContain('Result from');
    }
  });

  it('5. Execute with wait-all (some fail -- still completes)', async () => {
    orch.registerPattern(
      makePattern({
        targets: [
          { agentId: 'ok-1' },
          { agentId: 'fail-agent' },
          { agentId: 'ok-2' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Hello', mixedExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.successCount).toBe(2);
    expect(exec.failureCount).toBe(1);

    const failedResult = exec.results.find((r) => r.agentId === 'fail-agent');
    expect(failedResult).toBeDefined();
    expect(failedResult!.status).toBe('failed');
    expect(failedResult!.error).toBe('fail');
  });

  it('passes compiled instruction bundles to structured scatter-gather executors', async () => {
    orch.registerPattern(
      makePattern({
        targets: [{ agentId: 'agent-1' }],
      }),
    );

    const structuredExecutor = vi.fn(async (request: any) => {
      expect(request.patternId).toBe('test-pattern');
      expect(request.agentId).toBe('agent-1');
      expect(request.prompt).toBe('Hello agents');
      expect(request.envelope.payload).toMatchObject({ kind: 'text', text: 'Hello agents' });
      expect(request.instructionBundle).toMatchObject({
        shared_goal: 'Scatter task goal',
        agent_specific_prompt: 'Read AGENTS.md and execute the scatter task.',
      });
      return 'structured scatter result';
    });
    (structuredExecutor as any).__agentOsStructured = true;

    const exec = await orch.execute('test-pattern', 'Hello agents', structuredExecutor as any);

    expect(structuredExecutor).toHaveBeenCalledTimes(1);
    expect(exec.status).toBe('completed');
    expect(exec.aggregatedOutput).toBe('structured scatter result');
  });
});

// ===========================================================================
// First-n strategy
// ===========================================================================

describe('first-n strategy', () => {
  it('6. Execute with first-n (n=1, first success used)', async () => {
    orch.registerPattern(
      makePattern({
        gatherStrategy: 'first-n',
        requiredResults: 1,
        targets: [
          { agentId: 'fail-1' },
          { agentId: 'ok-agent' },
          { agentId: 'fail-2' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Need one', mixedExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.successCount).toBeGreaterThanOrEqual(1);
  });

  it('7. Execute with first-n (n=2, needs 2 successes)', async () => {
    orch.registerPattern(
      makePattern({
        gatherStrategy: 'first-n',
        requiredResults: 2,
        targets: [
          { agentId: 'ok-1' },
          { agentId: 'fail-x' },
          { agentId: 'ok-2' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Need two', mixedExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.successCount).toBe(2);
  });

  it('first-n fails when not enough successes', async () => {
    orch.registerPattern(
      makePattern({
        gatherStrategy: 'first-n',
        requiredResults: 3,
        targets: [
          { agentId: 'ok-1' },
          { agentId: 'fail-x' },
          { agentId: 'fail-y' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Need three', mixedExecutor);

    expect(exec.status).toBe('failed');
    expect(exec.successCount).toBe(1);
  });
});

// ===========================================================================
// Quorum strategy
// ===========================================================================

describe('quorum strategy', () => {
  it('8. Execute with quorum (threshold met)', async () => {
    orch.registerPattern(
      makePattern({
        gatherStrategy: 'quorum',
        quorumThreshold: 0.5,
        targets: [
          { agentId: 'ok-1' },
          { agentId: 'ok-2' },
          { agentId: 'fail-agent' },
          { agentId: 'ok-3' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Quorum test', mixedExecutor);

    // 3/4 = 0.75 >= 0.5
    expect(exec.status).toBe('completed');
    expect(exec.successCount).toBe(3);
  });

  it('9. Execute with quorum (threshold not met -- fails)', async () => {
    orch.registerPattern(
      makePattern({
        gatherStrategy: 'quorum',
        quorumThreshold: 0.8,
        targets: [
          { agentId: 'ok-1' },
          { agentId: 'fail-x' },
          { agentId: 'fail-y' },
          { agentId: 'fail-z' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Quorum test', mixedExecutor);

    // 1/4 = 0.25 < 0.8
    expect(exec.status).toBe('failed');
    expect(exec.successCount).toBe(1);
    expect(exec.failureCount).toBe(3);
  });
});

// ===========================================================================
// Timeout strategy
// ===========================================================================

describe('timeout strategy', () => {
  it('10. Execute with timeout strategy', async () => {
    const slowExecutor = async (agentId: string): Promise<string> => {
      if (agentId === 'slow-agent') {
        await new Promise((r) => setTimeout(r, 500));
        return `Slow result from ${agentId}`;
      }
      return `Fast result from ${agentId}`;
    };

    orch.registerPattern(
      makePattern({
        gatherStrategy: 'timeout',
        timeoutMs: 100,
        targets: [
          { agentId: 'fast-agent' },
          { agentId: 'slow-agent' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Timeout test', slowExecutor);

    expect(exec.status).toBe('completed');
    // Fast agent should succeed, slow agent should timeout
    const fast = exec.results.find((r) => r.agentId === 'fast-agent');
    const slow = exec.results.find((r) => r.agentId === 'slow-agent');
    expect(fast!.status).toBe('completed');
    expect(slow!.status).toBe('timeout');
    expect(exec.successCount).toBeGreaterThanOrEqual(1);
  });

  it('timeout with all agents timing out returns timeout status', async () => {
    const verySlowExecutor = async (): Promise<string> => {
      await new Promise((r) => setTimeout(r, 500));
      return 'never';
    };

    orch.registerPattern(
      makePattern({
        gatherStrategy: 'timeout',
        timeoutMs: 20,
        targets: [
          { agentId: 'slow-1' },
          { agentId: 'slow-2' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'All timeout', verySlowExecutor);

    expect(exec.status).toBe('timeout');
    expect(exec.successCount).toBe(0);
  });
});

// ===========================================================================
// Timing & Parallel execution
// ===========================================================================

describe('timing and parallelism', () => {
  it('11. ScatterResult has correct timing info', async () => {
    orch.registerPattern(makePattern({ targets: [{ agentId: 'agent-1' }] }));
    const exec = await orch.execute('test-pattern', 'Timing', delayedExecutor);

    expect(exec.results).toHaveLength(1);
    const result = exec.results[0];
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.agentId).toBe('agent-1');
    expect(result.status).toBe('completed');
  });

  it('12. Parallel execution (multiple agents run concurrently)', async () => {
    const callTimes: number[] = [];
    const parallelExecutor = async (agentId: string): Promise<string> => {
      callTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return `Result from ${agentId}`;
    };

    orch.registerPattern(
      makePattern({
        targets: [
          { agentId: 'a1' },
          { agentId: 'a2' },
          { agentId: 'a3' },
        ],
      }),
    );

    const start = Date.now();
    const exec = await orch.execute('test-pattern', 'Parallel', parallelExecutor);
    const elapsed = Date.now() - start;

    expect(exec.status).toBe('completed');
    expect(exec.results).toHaveLength(3);
    // If truly parallel, total time should be ~50ms, not ~150ms
    // Use generous margin for CI/slow environments
    expect(elapsed).toBeLessThan(200);
    // All three agents should have started within a small window
    expect(callTimes).toHaveLength(3);
    const spread = Math.max(...callTimes) - Math.min(...callTimes);
    expect(spread).toBeLessThan(50);
  });
});

// ===========================================================================
// Custom prompts & weights
// ===========================================================================

describe('custom prompts and weights', () => {
  it('13. Custom prompts per target', async () => {
    const receivedPrompts: Record<string, string> = {};
    const trackingExecutor = async (agentId: string, prompt: string): Promise<string> => {
      receivedPrompts[agentId] = prompt;
      return `Done: ${agentId}`;
    };

    orch.registerPattern(
      makePattern({
        targets: [
          { agentId: 'agent-a', prompt: 'Custom prompt A' },
          { agentId: 'agent-b' }, // should use base prompt
          { agentId: 'agent-c', prompt: 'Custom prompt C' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Base prompt', trackingExecutor);

    expect(exec.status).toBe('completed');
    expect(receivedPrompts['agent-a']).toBe('Custom prompt A');
    expect(receivedPrompts['agent-b']).toBe('Base prompt');
    expect(receivedPrompts['agent-c']).toBe('Custom prompt C');
  });

  it('14. Weights are recorded in results', async () => {
    orch.registerPattern(
      makePattern({
        targets: [
          { agentId: 'a1', weight: 2.5 },
          { agentId: 'a2', weight: 0.5 },
          { agentId: 'a3' }, // default weight 1.0
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Weights', successExecutor);

    expect(exec.status).toBe('completed');
    const resultA1 = exec.results.find((r) => r.agentId === 'a1');
    const resultA2 = exec.results.find((r) => r.agentId === 'a2');
    const resultA3 = exec.results.find((r) => r.agentId === 'a3');
    expect(resultA1!.weight).toBe(2.5);
    expect(resultA2!.weight).toBe(0.5);
    expect(resultA3!.weight).toBe(1.0);
  });
});

// ===========================================================================
// Error & edge cases
// ===========================================================================

describe('error and edge cases', () => {
  it('15. Unknown pattern returns error', async () => {
    const exec = await orch.execute('nonexistent', 'Hello', successExecutor);

    expect(exec.status).toBe('failed');
    expect(exec.patternId).toBe('nonexistent');
    expect(exec.results).toHaveLength(0);
    expect(exec.aggregatedOutput).toContain('Pattern not found');
    // Execution should still be stored
    const stored = orch.getExecution(exec.executionId);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe('failed');
  });

  it('16. Aggregated output contains successful outputs', async () => {
    orch.registerPattern(
      makePattern({
        targets: [
          { agentId: 'ok-alpha' },
          { agentId: 'fail-beta' },
          { agentId: 'ok-gamma' },
        ],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Aggregate test', mixedExecutor);

    expect(exec.aggregatedOutput).toContain('OK from ok-alpha');
    expect(exec.aggregatedOutput).toContain('OK from ok-gamma');
    expect(exec.aggregatedOutput).not.toContain('fail-beta');
  });

  it('18. Empty targets list', async () => {
    orch.registerPattern(
      makePattern({
        targets: [],
      }),
    );
    const exec = await orch.execute('test-pattern', 'Empty', successExecutor);

    expect(exec.status).toBe('completed');
    expect(exec.results).toHaveLength(0);
    expect(exec.successCount).toBe(0);
    expect(exec.failureCount).toBe(0);
    expect(exec.aggregatedOutput).toBe('');
  });
});

// ===========================================================================
// Singleton
// ===========================================================================

describe('singleton management', () => {
  it('17. getScatterGatherOrchestrator returns same instance', () => {
    const a = getScatterGatherOrchestrator();
    const b = getScatterGatherOrchestrator();
    expect(a).toBe(b);
  });

  it('17b. resetScatterGatherOrchestrator clears the singleton', () => {
    const before = getScatterGatherOrchestrator();
    before.registerPattern(makePattern());
    expect(before.listPatterns()).toHaveLength(1);

    resetScatterGatherOrchestrator();

    const after = getScatterGatherOrchestrator();
    expect(after).not.toBe(before);
    expect(after.listPatterns()).toHaveLength(0);
  });
});

// ===========================================================================
// Execution history
// ===========================================================================

describe('execution history', () => {
  it('getExecution returns stored execution', async () => {
    orch.registerPattern(makePattern());
    const exec = await orch.execute('test-pattern', 'History', successExecutor);

    const stored = orch.getExecution(exec.executionId);
    expect(stored).toBeDefined();
    expect(stored!.executionId).toBe(exec.executionId);
    expect(stored!.prompt).toBe('History');
  });

  it('listExecutions returns all executions', async () => {
    orch.registerPattern(makePattern({ patternId: 'p1' }));
    orch.registerPattern(makePattern({ patternId: 'p2' }));

    await orch.execute('p1', 'First', successExecutor);
    await orch.execute('p2', 'Second', successExecutor);
    await orch.execute('p1', 'Third', successExecutor);

    const all = orch.listExecutions();
    expect(all).toHaveLength(3);

    const p1Only = orch.listExecutions('p1');
    expect(p1Only).toHaveLength(2);

    const p2Only = orch.listExecutions('p2');
    expect(p2Only).toHaveLength(1);
  });

  it('reset clears all state', async () => {
    orch.registerPattern(makePattern());
    await orch.execute('test-pattern', 'Before reset', successExecutor);

    expect(orch.listPatterns()).toHaveLength(1);
    expect(orch.listExecutions()).toHaveLength(1);

    orch.reset();

    expect(orch.listPatterns()).toHaveLength(0);
    expect(orch.listExecutions()).toHaveLength(0);
  });
});
