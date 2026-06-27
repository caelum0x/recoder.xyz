import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateResults,
  type SubtaskResult,
} from '../../../../src/dispatch/orchestration/aggregation';

function result(overrides: Partial<SubtaskResult>): SubtaskResult {
  return {
    taskId: 'st',
    agentId: 'a',
    state: 'succeeded',
    resultText: 'r',
    ...overrides,
  };
}

test('empty input yields a failed aggregate', () => {
  const out = aggregateResults({ parentTaskId: 'p', subtaskResults: [], strategy: 'all' });
  assert.equal(out.status, 'failed');
  assert.equal(out.totalCount, 0);
});

test('all merges every successful result text', () => {
  const out = aggregateResults({
    parentTaskId: 'p',
    strategy: 'all',
    subtaskResults: [
      result({ taskId: 's1', resultText: 'one' }),
      result({ taskId: 's2', resultText: 'two' }),
    ],
  });
  assert.equal(out.status, 'complete');
  assert.equal(out.resultText, 'one\n\ntwo');
  assert.equal(out.successCount, 2);
});

test('first_success takes the first succeeded result only', () => {
  const out = aggregateResults({
    parentTaskId: 'p',
    strategy: 'first_success',
    subtaskResults: [
      result({ taskId: 's1', state: 'failed' }),
      result({ taskId: 's2', resultText: 'winner' }),
      result({ taskId: 's3', resultText: 'late' }),
    ],
  });
  assert.equal(out.resultText, 'winner');
  assert.equal(out.subtaskSummaries.find((s) => s.taskId === 's2')?.selected, true);
});

test('majority selects the largest-agreement group', () => {
  const out = aggregateResults({
    parentTaskId: 'p',
    strategy: 'majority',
    subtaskResults: [
      result({ taskId: 's1', resultText: 'X', score: 1 }),
      result({ taskId: 's2', resultText: 'X', score: 9 }),
      result({ taskId: 's3', resultText: 'Y', score: 5 }),
    ],
  });
  // majority is 'X' (2/3); winner is highest-scoring X
  assert.equal(out.resultText, 'X');
});

test('best_score selects max weight*score', () => {
  const out = aggregateResults({
    parentTaskId: 'p',
    strategy: 'best_score',
    weights: { a: 1, b: 3 },
    subtaskResults: [
      result({ taskId: 's1', agentId: 'a', resultText: 'A', score: 10 }), // 10
      result({ taskId: 's2', agentId: 'b', resultText: 'B', score: 5 }), // 15
    ],
  });
  assert.equal(out.resultText, 'B');
});

test('partial status when some subtasks fail', () => {
  const out = aggregateResults({
    parentTaskId: 'p',
    strategy: 'all',
    subtaskResults: [
      result({ taskId: 's1', state: 'succeeded' }),
      result({ taskId: 's2', state: 'failed' }),
    ],
  });
  assert.equal(out.status, 'partial');
});
