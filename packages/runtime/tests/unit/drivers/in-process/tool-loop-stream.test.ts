import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapFinishReason,
  normalizeUsage,
  mapStreamPart,
  emptyOutcome,
} from '../../../../src/drivers/in-process/tool-loop-stream';

test('mapFinishReason maps v5 finish reasons onto the unified StopReason', () => {
  assert.equal(mapFinishReason('stop'), 'end_turn');
  assert.equal(mapFinishReason('length'), 'max_steps');
  assert.equal(mapFinishReason('tool-calls'), 'max_steps');
  assert.equal(mapFinishReason('content-filter'), 'refusal');
  assert.equal(mapFinishReason('error'), 'error');
  assert.equal(mapFinishReason('other'), 'unknown');
  assert.equal(mapFinishReason(undefined), 'unknown');
});

test('normalizeUsage tolerates undefined token fields and derives totalTokens', () => {
  assert.deepEqual(normalizeUsage({ inputTokens: 3, outputTokens: 4 }), {
    inputTokens: 3,
    outputTokens: 4,
    totalTokens: 7,
  });
  const withReasoning = normalizeUsage({
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 10,
    reasoningTokens: 5,
    cachedInputTokens: 1,
  });
  assert.equal(withReasoning.totalTokens, 10);
  assert.equal(withReasoning.reasoningTokens, 5);
  assert.equal(withReasoning.cacheReadTokens, 1);
});

test('mapStreamPart drops empty text deltas and accumulates final text', () => {
  const outcome = emptyOutcome();
  assert.deepEqual(mapStreamPart({ type: 'text-delta', id: 't', text: '' } as never, outcome), []);
  const frames = mapStreamPart({ type: 'text-delta', id: 't', text: 'hi' } as never, outcome);
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.kind, 'text');
  assert.equal(outcome.finalText, 'hi');
});

test('mapStreamPart maps tool-call with classified modes and extracted paths', () => {
  const outcome = emptyOutcome();
  const frames = mapStreamPart(
    { type: 'tool-call', toolCallId: 'x', toolName: 'write', input: { filePath: 'a.ts' } } as never,
    outcome,
  );
  assert.equal(frames.length, 1);
  const frame = frames[0] as unknown as { kind: 'tool_call'; toolCall: { modes: string[]; paths?: string[] } };
  assert.equal(frame.kind, 'tool_call');
  assert.deepEqual(frame.toolCall.modes, ['write']);
  assert.deepEqual(frame.toolCall.paths, ['a.ts']);
});

test('mapStreamPart maps tool-error to a failed tool_result plus a warn log', () => {
  const outcome = emptyOutcome();
  const frames = mapStreamPart(
    { type: 'tool-error', toolCallId: 'x', toolName: 'bash', input: {}, error: new Error('boom') } as never,
    outcome,
  );
  assert.equal(frames.length, 2);
  const result = frames[0] as { kind: 'tool_result'; toolResult: { ok: boolean; errorMessage?: string } };
  assert.equal(result.toolResult.ok, false);
  assert.equal(result.toolResult.errorMessage, 'boom');
  assert.equal(frames[1]!.kind, 'log');
});

test('mapStreamPart folds finish usage into the outcome and emits a usage frame', () => {
  const outcome = emptyOutcome();
  const frames = mapStreamPart(
    {
      type: 'finish',
      finishReason: 'stop',
      totalUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    } as never,
    outcome,
  );
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.kind, 'usage');
  assert.equal(outcome.finishReason, 'end_turn');
  assert.equal(outcome.usage.totalTokens, 5);
});

test('mapStreamPart records an error notice and marks the outcome errored', () => {
  const outcome = emptyOutcome();
  const frames = mapStreamPart({ type: 'error', error: 'rate limit' } as never, outcome);
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.kind, 'error');
  assert.equal(outcome.errored, true);
  assert.equal(outcome.finishReason, 'error');
});

test('structural parts produce no frames', () => {
  const outcome = emptyOutcome();
  for (const type of ['start', 'start-step', 'finish-step', 'text-start', 'text-end', 'tool-input-delta']) {
    assert.deepEqual(mapStreamPart({ type, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, finishReason: 'stop' } as never, outcome), []);
  }
});
