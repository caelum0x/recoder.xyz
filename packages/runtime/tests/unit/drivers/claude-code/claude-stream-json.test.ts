import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseClaudeStreamJsonEvent,
  normalizeUsage,
} from '../../../../src/drivers/claude-code/claude-stream-json';
import type { DriverFrame } from '../../../../src/contracts/driver-frame';
import { isTerminalFrame } from '../../../../src/contracts/driver-frame';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, '../../../fixtures/claude-stream-json.jsonl');

function replayFixture(): DriverFrame[] {
  const lines = readFileSync(FIXTURE, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const frames: DriverFrame[] = [];
  for (const line of lines) {
    const event = JSON.parse(line) as Record<string, unknown>;
    frames.push(...parseClaudeStreamJsonEvent(event));
  }
  return frames;
}

test('replays a recorded stream-json run into a coherent frame stream', () => {
  const frames = replayFixture();

  const texts = frames.filter((f) => f.kind === 'text');
  assert.ok(texts.length >= 3, 'emits assistant text frames');

  const thinking = frames.filter((f) => f.kind === 'thinking');
  assert.equal(thinking.length, 1, 'emits the thinking frame');

  const toolCalls = frames.filter((f) => f.kind === 'tool_call');
  assert.equal(toolCalls.length, 2, 'emits both tool_use frames');

  const toolResults = frames.filter((f) => f.kind === 'tool_result');
  assert.equal(toolResults.length, 2, 'emits both tool_result frames');
});

test('emits exactly one terminal done frame (success) at the end', () => {
  const frames = replayFixture();
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1, 'exactly one terminal frame');

  const done = terminals[0];
  assert.equal(done.kind, 'done');
  assert.equal(done.ok, true);
  assert.equal(done.stopReason, 'end_turn');
  assert.equal(done.finalText, 'Done. The port is now 4000.');
  assert.equal(done.usage?.costUsd, 0.021);
  assert.equal(done.usage?.totalTokens, 3996);

  // The terminal frame is the LAST frame.
  assert.ok(isTerminalFrame(frames[frames.length - 1]!));
});

test('the Edit tool_call is classified as write-bearing with a path', () => {
  const frames = replayFixture();
  const editCall = frames.find(
    (f) => f.kind === 'tool_call' && f.toolCall.toolName === 'Edit',
  );
  assert.ok(editCall && editCall.kind === 'tool_call');
  assert.ok(editCall.toolCall.modes.includes('write'));
  assert.deepEqual(editCall.toolCall.paths, ['/repo/config.ts']);
});

test('an error result becomes a failed done with a code, never a fake success', () => {
  const frames = parseClaudeStreamJsonEvent({
    type: 'result',
    subtype: 'error_max_turns',
    is_error: true,
    usage: { input_tokens: 100, output_tokens: 5 },
  });
  assert.equal(frames.length, 1);
  const done = frames[0]!;
  assert.equal(done.kind, 'done');
  assert.equal(done.ok, false);
  assert.equal(done.stopReason, 'max_steps');
  assert.ok(done.code, 'failed done carries a code');
});

test('unknown event types become debug logs, not throws', () => {
  const frames = parseClaudeStreamJsonEvent({ type: 'mystery_event', foo: 1 });
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.kind, 'log');
});

test('normalizeUsage returns undefined for empty usage and folds cost', () => {
  assert.equal(normalizeUsage(undefined), undefined);
  assert.equal(normalizeUsage({}), undefined);
  const usage = normalizeUsage({ input_tokens: 10, output_tokens: 4 }, 0.5);
  assert.equal(usage?.totalTokens, 14);
  assert.equal(usage?.costUsd, 0.5);
});

test('stream_event passthrough yields no framing', () => {
  const frames = parseClaudeStreamJsonEvent({ type: 'stream_event', event: { type: 'x' } });
  assert.equal(frames.length, 0);
});
