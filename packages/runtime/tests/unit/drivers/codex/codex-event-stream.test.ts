import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCodexEvent,
  createCodexParseState,
} from '../../../../src/drivers/codex/codex-event-stream';
import { framesFromCodexEvents } from '../../../../src/drivers/codex/codex-driver';
import type { DriverFrame } from '../../../../src/contracts/driver-frame';
import { isTerminalFrame } from '../../../../src/contracts/driver-frame';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, '../../../fixtures/codex-events.jsonl');

function loadEvents(): Record<string, unknown>[] {
  return readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

test('replays the recorded codex --json fixture into a coherent frame stream', () => {
  const state = createCodexParseState();
  const frames: DriverFrame[] = [];
  for (const event of loadEvents()) frames.push(...parseCodexEvent(event, state));

  const thinking = frames.filter((f) => f.kind === 'thinking');
  assert.ok(thinking.length >= 1, 'emits reasoning as thinking frames');

  const toolCalls = frames.filter((f) => f.kind === 'tool_call');
  assert.equal(toolCalls.length, 2, 'emits command_execution + file_change as tool_call');

  const toolResults = frames.filter((f) => f.kind === 'tool_result');
  assert.equal(toolResults.length, 2, 'emits both tool results');

  const text = frames.filter((f) => f.kind === 'text');
  assert.ok(text.length >= 1, 'emits the agent_message as text');

  const usage = frames.filter((f) => f.kind === 'usage');
  assert.equal(usage.length, 1, 'emits a usage frame from turn.completed');
});

test('file_change tool_call carries write mode and its touched paths (policy-load-bearing)', () => {
  const state = createCodexParseState();
  const frames: DriverFrame[] = [];
  for (const event of loadEvents()) frames.push(...parseCodexEvent(event, state));

  const patch = frames.find(
    (f) => f.kind === 'tool_call' && f.toolCall.toolName === 'apply_patch',
  );
  assert.ok(patch && patch.kind === 'tool_call');
  assert.ok(patch.toolCall.modes.includes('write'), 'apply_patch is a write');
  assert.deepEqual(patch.toolCall.paths, ['src/index.ts']);
});

test('command_execution tool_call carries execute mode', () => {
  const state = createCodexParseState();
  const frames: DriverFrame[] = [];
  for (const event of loadEvents()) frames.push(...parseCodexEvent(event, state));
  const cmd = frames.find((f) => f.kind === 'tool_call' && f.toolCall.toolName === 'shell');
  assert.ok(cmd && cmd.kind === 'tool_call');
  assert.ok(cmd.toolCall.modes.includes('execute'));
});

test('framesFromCodexEvents ends with exactly one successful terminal done', () => {
  const frames = framesFromCodexEvents(loadEvents(), { exitCode: 0 });
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1, 'exactly one terminal frame');
  const done = terminals[0]!;
  assert.equal(done.ok, true);
  assert.equal(done.stopReason, 'end_turn');
  assert.match(done.finalText ?? '', /updated src\/index\.ts/);
  assert.equal(done.usage?.inputTokens, 1200);
  assert.equal(done.usage?.cacheReadTokens, 800);
});

test('a turn.failed event produces a failed terminal — never green-washes', () => {
  const events: Record<string, unknown>[] = [
    { type: 'thread.started', thread_id: 'th_1' },
    { type: 'turn.failed', error: { message: 'model refused' } },
  ];
  const frames = framesFromCodexEvents(events, { exitCode: 1 });
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1);
  const done = terminals[0]!;
  assert.equal(done.ok, false);
  assert.equal(done.stopReason, 'error');
  assert.match(done.message ?? '', /model refused/);
});

test('no terminal codex event + nonzero exit yields spawn_failed, not success', () => {
  const events: Record<string, unknown>[] = [
    { type: 'thread.started', thread_id: 'th_1' },
    { type: 'item.completed', item: { id: 'i', item_type: 'agent_message', text: 'partial' } },
  ];
  const frames = framesFromCodexEvents(events, { exitCode: 137 });
  const done = frames.filter(isTerminalFrame)[0]!;
  assert.equal(done.ok, false);
  assert.equal(done.code, 'spawn_failed');
});

test('parses the legacy msg-tagged protocol (agent_message/exec/task_complete)', () => {
  const events: Record<string, unknown>[] = [
    { id: '1', msg: { type: 'agent_reasoning', text: 'thinking...' } },
    { id: '2', msg: { type: 'exec_command_begin', call_id: 'c1', command: ['ls'] } },
    { id: '3', msg: { type: 'exec_command_end', call_id: 'c1', exit_code: 0, stdout: 'a\nb' } },
    { id: '4', msg: { type: 'agent_message', message: 'all done' } },
    { id: '5', msg: { type: 'task_complete', last_agent_message: 'all done' } },
  ];
  const frames = framesFromCodexEvents(events, { exitCode: 0 });
  assert.ok(frames.some((f) => f.kind === 'thinking'));
  assert.ok(frames.some((f) => f.kind === 'tool_call' && f.toolCall.toolName === 'shell'));
  assert.ok(frames.some((f) => f.kind === 'tool_result'));
  const done = frames.filter(isTerminalFrame)[0]!;
  assert.equal(done.ok, true);
  assert.equal(done.finalText, 'all done');
});
