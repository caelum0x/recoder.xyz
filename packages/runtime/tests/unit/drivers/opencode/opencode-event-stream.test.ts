import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mapOpenCodeEvent,
  extractUsage,
  type OpenCodeJsonEvent,
  type OpenCodeStepPart,
} from '../../../../src/drivers/opencode/opencode-event-stream';
import type { DriverFrame } from '../../../../src/contracts/driver-frame';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../../fixtures/opencode-messages.jsonl');

function loadFixtureEvents(): OpenCodeJsonEvent[] {
  return readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as OpenCodeJsonEvent);
}

function replay(events: OpenCodeJsonEvent[]): DriverFrame[] {
  return events.flatMap((e) => mapOpenCodeEvent(e));
}

test('maps a recorded opencode --format json stream into DriverFrames', () => {
  const frames = replay(loadFixtureEvents());
  const kinds = frames.map((f) => f.kind);

  // thinking, tool_call+tool_result (read), tool_call+tool_result (edit),
  // tool_call+tool_result (bash error), text, usage
  assert.deepEqual(kinds, [
    'thinking',
    'tool_call',
    'tool_result',
    'tool_call',
    'tool_result',
    'tool_call',
    'tool_result',
    'text',
    'usage',
  ]);
});

test('emits NO terminal done frame (process exit owns the terminal)', () => {
  const frames = replay(loadFixtureEvents());
  assert.equal(
    frames.some((f) => f.kind === 'done'),
    false,
  );
});

test('text events with empty text are dropped', () => {
  const frames = mapOpenCodeEvent({
    type: 'text',
    part: { type: 'text', text: '   ', time: { end: 1 } },
  });
  assert.deepEqual(frames, []);
});

test('reasoning maps to thinking with the raw text', () => {
  const frames = mapOpenCodeEvent({
    type: 'reasoning',
    part: { type: 'reasoning', text: 'pondering', time: { end: 1 } },
  });
  assert.deepEqual(frames, [{ kind: 'thinking', text: 'pondering' }]);
});

test('error events become a non-terminal error frame (not done)', () => {
  const frames = mapOpenCodeEvent({
    type: 'error',
    error: { name: 'ProviderError', data: { message: 'rate limited' } },
  });
  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.kind, 'error');
  assert.equal((frames[0] as { message: string }).message, 'rate limited');
});

test('unknown event types are ignored', () => {
  assert.deepEqual(mapOpenCodeEvent({ type: 'permission.asked' }), []);
  assert.deepEqual(mapOpenCodeEvent({ type: 'step_start' }), []);
});

test('extractUsage folds tokens + cost from a step-finish part', () => {
  const part: OpenCodeStepPart = {
    type: 'step-finish',
    tokens: { input: 100, output: 30, cache: { read: 8, write: 2 } },
    cost: 0.005,
  };
  const usage = extractUsage(part);
  assert.deepEqual(usage, {
    inputTokens: 100,
    outputTokens: 30,
    totalTokens: 130,
    cacheReadTokens: 8,
    cacheWriteTokens: 2,
    costUsd: 0.005,
  });
});

test('extractUsage returns undefined when no tokens present', () => {
  assert.equal(extractUsage({ type: 'step-finish' }), undefined);
});
