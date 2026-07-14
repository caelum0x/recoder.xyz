/**
 * Tests for beads-memory — the shared memory layer over the bd issue graph.
 *
 * These prove (with an injected runner, no real bd needed):
 *   1. remember creates an EPHEMERAL wisp labeled `memory` (candidate, not durable).
 *   2. recall searches label=memory across all statuses with a bounded limit.
 *   3. promote/note map to the right bd invocations.
 *   4. Every function degrades truthfully when bd fails (undefined/[]/false —
 *      never throws, never fakes a memory).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  rememberCandidate,
  recallMemories,
  promoteMemory,
  appendMemoryNote,
  __setBeadsMemoryRunnerForTest,
} from './beads-memory.js';

afterEach(() => __setBeadsMemoryRunnerForTest(undefined));

function captureRunner(response: string): { calls: string[][]; runner: (args: string[]) => string } {
  const calls: string[][] = [];
  return {
    calls,
    runner: (args: string[]) => {
      calls.push(args);
      return response;
    },
  };
}

describe('beads-memory: rememberCandidate', () => {
  it('creates an ephemeral wisp labeled memory with evidence body', () => {
    const { calls, runner } = captureRunner(JSON.stringify({ id: 'recoder-wisp-abc' }));
    __setBeadsMemoryRunnerForTest(runner);
    const id = rememberCandidate({ title: 'fact', body: 'evidence', scope: 'task' });
    expect(id).toBe('recoder-wisp-abc');
    const args = calls[0];
    expect(args[0]).toBe('create');
    expect(args).toContain('--ephemeral');
    const labelIdx = args.indexOf('-l');
    expect(args[labelIdx + 1]).toBe('memory,memory-scope:task');
    expect(args).toContain('--json');
  });

  it('links discovered-from when given', () => {
    const { calls, runner } = captureRunner(JSON.stringify({ id: 'w1' }));
    __setBeadsMemoryRunnerForTest(runner);
    rememberCandidate({ title: 't', body: 'b', discoveredFrom: 'recoder-9bqf' });
    expect(calls[0]).toContain('--deps');
    expect(calls[0][calls[0].indexOf('--deps') + 1]).toBe('discovered-from:recoder-9bqf');
  });

  it('returns undefined on empty input or bd failure (degrade-safe)', () => {
    expect(rememberCandidate({ title: '', body: 'x' })).toBeUndefined();
    __setBeadsMemoryRunnerForTest(() => {
      throw new Error('bd exploded');
    });
    expect(rememberCandidate({ title: 't', body: 'b' })).toBeUndefined();
  });
});

describe('beads-memory: recallMemories', () => {
  it('searches label=memory across all statuses with bounded limit', () => {
    const { calls, runner } = captureRunner(
      JSON.stringify([{ id: 'w1', title: 'fact', description: 'evidence', status: 'open', labels: ['memory'] }]),
    );
    __setBeadsMemoryRunnerForTest(runner);
    const found = recallMemories('deploy landmine', { limit: 500 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'w1', title: 'fact' });
    const args = calls[0];
    expect(args[0]).toBe('search');
    expect(args).toContain('memory');
    expect(args).toContain('all');
    expect(args[args.indexOf('-n') + 1]).toBe('50'); // capped
  });

  it('adds the scope label filter', () => {
    const { calls, runner } = captureRunner('[]');
    __setBeadsMemoryRunnerForTest(runner);
    recallMemories('x', { scope: 'repo' });
    const labelIdxs = calls[0].map((a, i) => (a === '--label' ? i : -1)).filter((i) => i >= 0);
    expect(labelIdxs).toHaveLength(2);
    expect(calls[0][labelIdxs[1] + 1]).toBe('memory-scope:repo');
  });

  it('returns [] on failure / non-array / empty query (degrade-safe)', () => {
    expect(recallMemories('')).toEqual([]);
    __setBeadsMemoryRunnerForTest(() => {
      throw new Error('ENOENT');
    });
    expect(recallMemories('anything')).toEqual([]);
    __setBeadsMemoryRunnerForTest(() => '"not an array"');
    expect(recallMemories('anything')).toEqual([]);
  });
});

describe('beads-memory: promote + note', () => {
  it('promote maps to bd promote and reports truthfully', () => {
    const { calls, runner } = captureRunner('{}');
    __setBeadsMemoryRunnerForTest(runner);
    expect(promoteMemory('w1')).toBe(true);
    expect(calls[0]).toEqual(['promote', 'w1', '--json']);
    __setBeadsMemoryRunnerForTest(() => {
      throw new Error('no such wisp');
    });
    expect(promoteMemory('w1')).toBe(false);
  });

  it('note appends and degrades truthfully', () => {
    const { calls, runner } = captureRunner('{}');
    __setBeadsMemoryRunnerForTest(runner);
    expect(appendMemoryNote('w1', 'more evidence')).toBe(true);
    expect(calls[0]).toEqual(['note', 'w1', 'more evidence', '--json']);
    expect(appendMemoryNote('', 'x')).toBe(false);
  });
});
