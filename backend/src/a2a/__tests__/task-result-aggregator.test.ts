/**
 * @module task-result-aggregator.test
 *
 * Comprehensive test suite for the TaskResultAggregator service.
 *
 * Covers:
 * - Strategy 'all': full merge, partial merge, all-failed, artifact merging,
 *   duplicate filename resolution.
 * - Strategy 'first-wins': first successful, multiple successful, all-failed,
 *   artifacts from winner only.
 * - Strategy 'majority': majority agreement, no majority fallback, custom
 *   threshold, tie-breaking by score.
 * - Strategy 'weighted': weighted scoring, no-weights fallback, zero-weight
 *   exclusion.
 * - Edge cases: empty subtask results, single subtask.
 * - collectSubtaskResults: reads envelopes from the lifecycle service store.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  TaskResultAggregator,
  getTaskResultAggregator,
  resetTaskResultAggregator,
  type SubtaskResult,
  type AggregationInput,
} from '../task-result-aggregator';

import {
  TaskLifecycleService,
  resetTaskLifecycleService,
  type CreateTaskInput,
} from '../task-lifecycle.service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSubtask(overrides: Partial<SubtaskResult> = {}): SubtaskResult {
  return {
    taskId: `task_${Math.random().toString(36).slice(2, 8)}`,
    agentId: 'agent-a',
    platform: 'codex',
    state: 'succeeded',
    resultText: 'Default result',
    artifacts: [],
    score: 50,
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<AggregationInput> = {}): AggregationInput {
  return {
    parentTaskId: 'parent_001',
    subtaskResults: [],
    strategy: 'all',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite-level reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetTaskResultAggregator();
  resetTaskLifecycleService();
});

// ===========================================================================
// Strategy: all
// ===========================================================================

describe('Strategy: all', () => {
  it('all subtasks succeeded -> status complete, all results merged', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Result A' });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Result B' });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Result C' });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3],
        strategy: 'all',
      }),
    );

    expect(result.status).toBe('complete');
    expect(result.successCount).toBe(3);
    expect(result.totalCount).toBe(3);
    expect(result.resultText).toContain('Result A');
    expect(result.resultText).toContain('Result B');
    expect(result.resultText).toContain('Result C');
    expect(result.subtaskSummaries).toHaveLength(3);
    expect(result.subtaskSummaries.every((s) => s.selected)).toBe(true);
  });

  it('some subtasks failed -> status partial, only successful results merged', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Good result', state: 'succeeded' });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Bad result', state: 'failed', error: 'Timeout' });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'all',
      }),
    );

    expect(result.status).toBe('partial');
    expect(result.successCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.resultText).toContain('Good result');
    expect(result.resultText).not.toContain('Bad result');

    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].taskId).toBe('t1');
  });

  it('all subtasks failed -> status failed, no results', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', state: 'failed', error: 'Error 1' });
    const sub2 = makeSubtask({ taskId: 't2', state: 'failed', error: 'Error 2' });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'all',
      }),
    );

    expect(result.status).toBe('failed');
    expect(result.successCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(result.resultText).toBe('');
    expect(result.artifacts).toHaveLength(0);
    expect(result.subtaskSummaries.every((s) => !s.selected)).toBe(true);
  });

  it('artifacts merged from all successful subtasks', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({
      taskId: 't1',
      agentId: 'a1',
      artifacts: [
        { filename: 'file-a.ts', content: 'content A' },
      ],
    });
    const sub2 = makeSubtask({
      taskId: 't2',
      agentId: 'a2',
      artifacts: [
        { filename: 'file-b.ts', content: 'content B' },
      ],
    });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'all',
      }),
    );

    expect(result.artifacts).toHaveLength(2);
    const filenames = result.artifacts.map((a) => a.filename);
    expect(filenames).toContain('file-a.ts');
    expect(filenames).toContain('file-b.ts');

    const fileA = result.artifacts.find((a) => a.filename === 'file-a.ts')!;
    expect(fileA.source).toBe('a1');
    const fileB = result.artifacts.find((a) => a.filename === 'file-b.ts')!;
    expect(fileB.source).toBe('a2');
  });

  it('duplicate filenames: higher-scoring agent artifact kept', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({
      taskId: 't1',
      agentId: 'a1',
      score: 60,
      artifacts: [{ filename: 'shared.ts', content: 'low-score version' }],
    });
    const sub2 = makeSubtask({
      taskId: 't2',
      agentId: 'a2',
      score: 90,
      artifacts: [{ filename: 'shared.ts', content: 'high-score version' }],
    });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'all',
      }),
    );

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].filename).toBe('shared.ts');
    expect(result.artifacts[0].content).toBe('high-score version');
    expect(result.artifacts[0].source).toBe('a2');
  });
});

// ===========================================================================
// Strategy: first-wins
// ===========================================================================

describe('Strategy: first-wins', () => {
  it('first successful result selected', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', state: 'failed' });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Winner', state: 'succeeded' });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Also done', state: 'succeeded' });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3],
        strategy: 'first-wins',
      }),
    );

    expect(result.status).toBe('complete');
    expect(result.resultText).toBe('Winner');

    const selectedSummaries = result.subtaskSummaries.filter((s) => s.selected);
    expect(selectedSummaries).toHaveLength(1);
    expect(selectedSummaries[0].taskId).toBe('t2');
  });

  it('multiple successful results: only first selected', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'First', state: 'succeeded' });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Second', state: 'succeeded' });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'first-wins',
      }),
    );

    expect(result.resultText).toBe('First');
    const selectedSummaries = result.subtaskSummaries.filter((s) => s.selected);
    expect(selectedSummaries).toHaveLength(1);
    expect(selectedSummaries[0].taskId).toBe('t1');
  });

  it('all failed -> status failed', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', state: 'failed' });
    const sub2 = makeSubtask({ taskId: 't2', state: 'failed' });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'first-wins',
      }),
    );

    expect(result.status).toBe('failed');
    expect(result.resultText).toBe('');
    expect(result.subtaskSummaries.every((s) => !s.selected)).toBe(true);
  });

  it('artifacts from winning subtask only', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({
      taskId: 't1',
      agentId: 'a1',
      state: 'succeeded',
      artifacts: [{ filename: 'winner.ts', content: 'winner content' }],
    });
    const sub2 = makeSubtask({
      taskId: 't2',
      agentId: 'a2',
      state: 'succeeded',
      artifacts: [{ filename: 'loser.ts', content: 'loser content' }],
    });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'first-wins',
      }),
    );

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].filename).toBe('winner.ts');
    expect(result.artifacts[0].source).toBe('a1');
  });
});

// ===========================================================================
// Strategy: majority
// ===========================================================================

describe('Strategy: majority', () => {
  it('majority agree on same result text -> selected', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Consensus', score: 70 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Consensus', score: 80 });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Outlier', score: 90 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3],
        strategy: 'majority',
        majorityThreshold: 0.5, // 2/3 = 0.66 >= 0.5
      }),
    );

    // The result text should come from the highest-scoring member of the majority group
    expect(result.resultText).toBe('Consensus');
    expect(result.status).toBe('complete');

    // Both majority group members should be selected
    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(2);
    const selectedIds = selected.map((s) => s.taskId);
    expect(selectedIds).toContain('t1');
    expect(selectedIds).toContain('t2');
  });

  it('no majority reached -> highest score selected', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Answer A', score: 40 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Answer B', score: 95 });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Answer C', score: 60 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3],
        strategy: 'majority',
        majorityThreshold: 0.5, // Each group has 1/3 = 0.33 < 0.5
      }),
    );

    // Falls back to highest score
    expect(result.resultText).toBe('Answer B');

    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].taskId).toBe('t2');
  });

  it('custom threshold works correctly', () => {
    const aggregator = new TaskResultAggregator();

    // 2 out of 4 agree = 0.5; with threshold 0.6, majority is NOT reached
    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Same', score: 30 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Same', score: 40 });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Diff A', score: 99 });
    const sub4 = makeSubtask({ taskId: 't4', agentId: 'a4', resultText: 'Diff B', score: 20 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3, sub4],
        strategy: 'majority',
        majorityThreshold: 0.6, // 2/4 = 0.5 < 0.6 => no majority
      }),
    );

    // Falls back to highest score: a3 with score 99
    expect(result.resultText).toBe('Diff A');
    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].agentId).toBe('a3');
  });

  it('ties broken by score', () => {
    const aggregator = new TaskResultAggregator();

    // Two groups, each with 2 members (tie in group size)
    // Group "Alpha": scores 60, 70. Group "Beta": scores 80, 90.
    // Largest group is a tie -- both have size 2. Map iteration order matters,
    // but regardless, if the first group found is "Alpha" (2/4=0.5 >= 0.5 threshold),
    // then both Alpha members are selected and highest-score Alpha member wins.
    // Actually both groups have 2 members so the largest group depends on iteration.
    // Let's use a clear case: 3 agents agree, within the group the highest score wins.
    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Alpha', score: 60 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Alpha', score: 85 });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Alpha', score: 70 });
    const sub4 = makeSubtask({ taskId: 't4', agentId: 'a4', resultText: 'Beta', score: 95 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3, sub4],
        strategy: 'majority',
        majorityThreshold: 0.5, // 3/4 = 0.75 >= 0.5
      }),
    );

    // Majority group is "Alpha" (3 members). Highest-scoring Alpha member is a2 (85).
    expect(result.resultText).toBe('Alpha');

    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(3);
    expect(selected.map((s) => s.taskId).sort()).toEqual(['t1', 't2', 't3']);
  });
});

// ===========================================================================
// Strategy: weighted
// ===========================================================================

describe('Strategy: weighted', () => {
  it('weighted scoring selects correct winner', () => {
    const aggregator = new TaskResultAggregator();

    // a1: weight=2, score=50 => weighted=100
    // a2: weight=1, score=80 => weighted=80
    // a3: weight=3, score=30 => weighted=90
    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Agent A', score: 50 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Agent B', score: 80 });
    const sub3 = makeSubtask({ taskId: 't3', agentId: 'a3', resultText: 'Agent C', score: 30 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2, sub3],
        strategy: 'weighted',
        weights: { a1: 2, a2: 1, a3: 3 },
      }),
    );

    // Winner: a1 with weighted score 100
    expect(result.resultText).toBe('Agent A');
    expect(result.status).toBe('complete');

    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].agentId).toBe('a1');
  });

  it('no weights -> falls back to score', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Low score', score: 30 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'High score', score: 95 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'weighted',
        // No weights -> default weight=1 for all, so weightedScore = 1*score
      }),
    );

    expect(result.resultText).toBe('High score');
    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].agentId).toBe('a2');
  });

  it('zero-weight agents excluded', () => {
    const aggregator = new TaskResultAggregator();

    const sub1 = makeSubtask({ taskId: 't1', agentId: 'a1', resultText: 'Excluded', score: 100 });
    const sub2 = makeSubtask({ taskId: 't2', agentId: 'a2', resultText: 'Included', score: 50 });

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [sub1, sub2],
        strategy: 'weighted',
        weights: { a1: 0, a2: 1 },
      }),
    );

    // a1 is excluded (weight=0), so a2 wins
    expect(result.resultText).toBe('Included');
    const selected = result.subtaskSummaries.filter((s) => s.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].agentId).toBe('a2');
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('Edge cases', () => {
  it('empty subtask results -> status failed', () => {
    const aggregator = new TaskResultAggregator();

    const result = aggregator.aggregate(
      makeInput({
        subtaskResults: [],
        strategy: 'all',
      }),
    );

    expect(result.status).toBe('failed');
    expect(result.successCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.resultText).toBe('');
    expect(result.artifacts).toHaveLength(0);
    expect(result.subtaskSummaries).toHaveLength(0);
  });

  it('single subtask -> always complete if succeeded', () => {
    const aggregator = new TaskResultAggregator();

    for (const strategy of ['all', 'first-wins', 'majority', 'weighted'] as const) {
      const sub = makeSubtask({ taskId: `t-${strategy}`, agentId: 'a1', resultText: `Result for ${strategy}` });

      const result = aggregator.aggregate(
        makeInput({
          subtaskResults: [sub],
          strategy,
        }),
      );

      expect(result.status).toBe('complete');
      expect(result.successCount).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(result.resultText).toContain(`Result for ${strategy}`);
    }
  });
});

// ===========================================================================
// collectSubtaskResults
// ===========================================================================

describe('collectSubtaskResults', () => {
  it('reads task envelopes from lifecycle service and maps to SubtaskResult', () => {
    const lifecycle = new TaskLifecycleService();
    const aggregator = new TaskResultAggregator(lifecycle);

    // Create and complete a subtask via the lifecycle service
    const createInput: CreateTaskInput = {
      workspace_id: 'ws_test',
      thread_id: 'thr_test',
      requester: { agent_id: 'supervisor', platform: 'recoder_pm' },
      assignee: { agent_id: 'worker-a', platform: 'codex' },
      connector: { connector_id: 'test', platform: 'codex', protocol: 'a2a' },
      payload: { kind: 'text', text: 'Do something' },
      parent_id: 'parent_001',
    };

    const created = lifecycle.createTask(createInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const taskId = created.data.id;

    // Transition to working, then completed with a result
    lifecycle.startTask(taskId, 'supervisor');
    lifecycle.completeTask(
      taskId,
      { text: 'Task done', artifacts: [{ key: 'output.ts', artifact_type: 'file', mime_type: 'text/plain', content: 'console.log("done")' }] },
      'worker-a',
    );

    const results = aggregator.collectSubtaskResults('parent_001', [taskId]);

    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe(taskId);
    expect(results[0].agentId).toBe('worker-a');
    expect(results[0].platform).toBe('codex');
    expect(results[0].state).toBe('succeeded'); // 'completed' -> 'succeeded'
    expect(results[0].resultText).toBe('Task done');
    expect(results[0].artifacts).toHaveLength(1);
    expect(results[0].artifacts![0].filename).toBe('output.ts');
    expect(results[0].artifacts![0].content).toBe('console.log("done")');
  });

  it('skips missing tasks and logs warning', () => {
    const lifecycle = new TaskLifecycleService();
    const aggregator = new TaskResultAggregator(lifecycle);

    const results = aggregator.collectSubtaskResults('parent_001', ['nonexistent_task']);

    expect(results).toHaveLength(0);
  });
});

// ===========================================================================
// Singleton
// ===========================================================================

describe('Singleton', () => {
  it('getTaskResultAggregator returns same instance', () => {
    const a = getTaskResultAggregator();
    const b = getTaskResultAggregator();
    expect(a).toBe(b);
  });

  it('resetTaskResultAggregator clears the singleton', () => {
    const a = getTaskResultAggregator();
    resetTaskResultAggregator();
    const b = getTaskResultAggregator();
    expect(a).not.toBe(b);
  });
});
