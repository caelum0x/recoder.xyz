import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapSessionEvent,
  summarizeAgentEnd,
  mapUsage,
  mapStopReason,
  classifyToolCall,
} from '../../../../src/drivers/pi/pi-event-mapper';
import type { PiAgentSessionEvent } from '../../../../src/drivers/pi/pi-wire-types';

test('text_delta maps to a text frame; thinking_delta maps to a thinking frame', () => {
  const text = mapSessionEvent({
    type: 'message_update',
    message: { role: 'assistant', content: [], usage: blankUsage(), stopReason: 'stop', timestamp: 1 },
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'hello', partial: partial() },
  });
  assert.deepEqual(text, [{ kind: 'text', text: 'hello' }]);

  const thinking = mapSessionEvent({
    type: 'message_update',
    message: { role: 'assistant', content: [], usage: blankUsage(), stopReason: 'stop', timestamp: 1 },
    assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'reason', partial: partial() },
  });
  assert.deepEqual(thinking, [{ kind: 'thinking', text: 'reason' }]);
});

test('empty deltas produce no frames', () => {
  const frames = mapSessionEvent({
    type: 'message_update',
    message: { role: 'assistant', content: [], usage: blankUsage(), stopReason: 'stop', timestamp: 1 },
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '', partial: partial() },
  });
  assert.deepEqual(frames, []);
});

test('tool_execution_start maps to a classified tool_call; write tool is write-bearing', () => {
  const frames = mapSessionEvent({
    type: 'tool_execution_start',
    toolCallId: 'c1',
    toolName: 'write_file',
    args: { path: 'src/a.ts', content: 'x' },
  });
  assert.equal(frames.length, 1);
  const frame = frames[0];
  assert.equal(frame.kind, 'tool_call');
  if (frame.kind === 'tool_call') {
    assert.equal(frame.toolCall.toolCallId, 'c1');
    assert.ok(frame.toolCall.modes.includes('write'));
    assert.deepEqual(frame.toolCall.paths, ['src/a.ts']);
  }
});

test('tool_execution_end maps to a tool_result with ok reflecting isError', () => {
  const ok = mapSessionEvent({
    type: 'tool_execution_end',
    toolCallId: 'c1',
    toolName: 'read_file',
    result: 'contents',
    isError: false,
  });
  assert.equal(ok[0]?.kind, 'tool_result');
  if (ok[0]?.kind === 'tool_result') assert.equal(ok[0].toolResult.ok, true);

  const failed = mapSessionEvent({
    type: 'tool_execution_end',
    toolCallId: 'c2',
    toolName: 'bash',
    result: 'boom',
    isError: true,
  });
  if (failed[0]?.kind === 'tool_result') {
    assert.equal(failed[0].toolResult.ok, false);
    assert.equal(failed[0].toolResult.errorMessage, 'boom');
  }
});

test('agent_start maps to a running state frame; agent_end emits no frame', () => {
  assert.deepEqual(mapSessionEvent({ type: 'agent_start' }), [{ kind: 'state', state: 'running' }]);
  const end: PiAgentSessionEvent = { type: 'agent_end', willRetry: false, messages: [] };
  assert.deepEqual(mapSessionEvent(end), []);
});

test('classifyToolCall buckets common pi tools into policy modes', () => {
  assert.deepEqual(classifyToolCall('read_file', {}).modes, ['read']);
  assert.deepEqual(classifyToolCall('edit_file', {}).modes, ['write']);
  assert.deepEqual(classifyToolCall('bash', {}).modes, ['execute']);
  assert.deepEqual(classifyToolCall('web_fetch', {}).modes, ['network']);
  assert.deepEqual(classifyToolCall('mystery', {}).modes, ['custom']);
});

test('mapUsage folds pi-ai Usage into normalized TokenUsage', () => {
  const usage = mapUsage({
    input: 100,
    output: 50,
    cacheRead: 10,
    cacheWrite: 5,
    reasoning: 8,
    totalTokens: 150,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
  });
  assert.deepEqual(usage, {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    reasoningTokens: 8,
    costUsd: 0.01,
  });
});

test('mapStopReason maps pi-ai reasons to the unified set', () => {
  assert.equal(mapStopReason('stop'), 'end_turn');
  assert.equal(mapStopReason('length'), 'max_steps');
  assert.equal(mapStopReason('aborted'), 'aborted');
  assert.equal(mapStopReason('error'), 'error');
  assert.equal(mapStopReason('toolUse'), 'end_turn');
  assert.equal(mapStopReason(undefined), 'unknown');
});

test('summarizeAgentEnd derives ok/stopReason/usage/finalText from the final assistant message', () => {
  const summary = summarizeAgentEnd({
    type: 'agent_end',
    willRetry: false,
    messages: [
      { role: 'user', content: 'hi', timestamp: 0 },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'all done' },
        ],
        usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3 },
        stopReason: 'stop',
        timestamp: 1,
      },
    ],
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.stopReason, 'end_turn');
  assert.equal(summary.finalText, 'all done');
  assert.equal(summary.usage?.totalTokens, 3);
  assert.equal(summary.willRetry, false);
});

test('summarizeAgentEnd reports failure for an error stopReason (truthful, never green-washed)', () => {
  const summary = summarizeAgentEnd({
    type: 'agent_end',
    willRetry: false,
    messages: [
      {
        role: 'assistant',
        content: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        stopReason: 'error',
        errorMessage: 'provider exploded',
        timestamp: 1,
      },
    ],
  });
  assert.equal(summary.ok, false);
  assert.equal(summary.stopReason, 'error');
  assert.equal(summary.message, 'provider exploded');
  assert.equal(summary.code, 'unknown');
});

test('summarizeAgentEnd maps an aborted final message to cancelled', () => {
  const summary = summarizeAgentEnd({
    type: 'agent_end',
    willRetry: false,
    messages: [
      {
        role: 'assistant',
        content: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        stopReason: 'aborted',
        timestamp: 1,
      },
    ],
  });
  assert.equal(summary.ok, false);
  assert.equal(summary.stopReason, 'aborted');
  assert.equal(summary.code, 'cancelled');
});

function blankUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}
function partial() {
  return { role: 'assistant' as const, content: [], usage: blankUsage(), stopReason: 'stop' as const, timestamp: 1 };
}
